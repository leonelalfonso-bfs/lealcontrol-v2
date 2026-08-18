using System;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Communications.Infrastructure.Domain;
using LealControl.Modules.Communications.Infrastructure.Persistence;
using LealControl.Modules.Communications.Infrastructure.Services;
using MailKit.Security;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using MimeKit;

namespace LealControl.Modules.Communications.Infrastructure.Http;

public sealed record SaveMailAccountRequest(Guid? Id, MailAccountSettings Settings, string? Secret);

public static class CommunicationsEndpoints
{
    public static IEndpointRouteBuilder MapCommunicationsModule(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/communications");
        group.MapGet("/accounts", async (CommunicationsDbContext db, ITenantContext tenant, CancellationToken ct) =>
            Results.Ok(await db.MailAccounts.AsNoTracking().Where(x => x.TenantId == tenant.TenantId.Value)
                .OrderBy(x => x.DisplayName).Select(x => new { x.Id, x.DisplayName, x.EmailAddress, Provider = x.Provider.ToString(), AuthMode = x.AuthMode.ToString(), x.ImapHost, x.ImapPort, x.ImapUseSsl, x.SmtpHost, x.SmtpPort, x.SmtpUseSsl, x.Username, x.IsActive, x.IsDefaultSender, x.LastSyncAtUtc, x.LastError, HasSecret = x.ProtectedSecret != "" }).ToListAsync(ct)));

        group.MapPost("/accounts", async (SaveMailAccountRequest request, CommunicationsDbContext db, ITenantContext tenant, MailSecretProtector protector, CancellationToken ct) => {
            var normalizedEmail = request.Settings.EmailAddress.Trim().ToLowerInvariant();
            var account = request.Id.HasValue
                ? await db.MailAccounts.FirstOrDefaultAsync(x => x.Id == request.Id && x.TenantId == tenant.TenantId.Value, ct)
                : null;
            account ??= await db.MailAccounts.FirstOrDefaultAsync(
                x => x.TenantId == tenant.TenantId.Value && x.EmailAddress.ToLower() == normalizedEmail, ct);
            var protectedSecret = string.IsNullOrWhiteSpace(request.Secret) ? null : protector.Protect(request.Secret);
            if (account is null) { if (protectedSecret is null) return Results.BadRequest(new { detail = "Ingresá una contraseña, contraseña de aplicación o token." }); account = MailAccount.Create(tenant.TenantId.Value, request.Settings, protectedSecret, DateTime.UtcNow); db.Add(account); }
            else account.Update(request.Settings, protectedSecret, DateTime.UtcNow);
            try { await db.SaveChangesAsync(ct); return Results.Ok(new { account.Id }); }
            catch (DbUpdateException ex) when (ex.InnerException is Npgsql.PostgresException { SqlState: "23505" })
            {
                return Results.Conflict(new { detail = "Ya existe una cuenta con ese email. Usá Editar para actualizar sus credenciales." });
            }
        });

        group.MapPost("/accounts/{id:guid}/test", async (Guid id, CommunicationsDbContext db, ITenantContext tenant, MailTransportService transport, CancellationToken ct) => {
            var account = await db.MailAccounts.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenant.TenantId.Value, ct);
            if (account is null) return Results.NotFound();
            try { await transport.TestAsync(account, ct); account.RecordError(string.Empty, DateTime.UtcNow); await db.SaveChangesAsync(ct); return Results.Ok(new { connected = true }); }
            catch (Exception ex) { var detail = FriendlyMailError(account, ex); account.RecordError(detail, DateTime.UtcNow); await db.SaveChangesAsync(ct); return Results.BadRequest(new { detail }); }
        });

        group.MapPost("/accounts/{id:guid}/send", async (Guid id, SendEmailRequest request, CommunicationsDbContext db, ITenantContext tenant, MailTransportService transport, CancellationToken ct) => {
            var account = await db.MailAccounts.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenant.TenantId.Value && x.IsActive, ct);
            if (account is null) return Results.NotFound();
            MimeMessage mime;
            try { mime = await transport.SendAsync(account, request, ct); }
            catch (Exception ex) { return Results.BadRequest(new { detail = FriendlyMailError(account, ex) }); }
            var cleanPreview = !string.IsNullOrWhiteSpace(request.TextBody) ? request.TextBody.Trim() : StripHtml(request.HtmlBody ?? "");
            if (cleanPreview.Length > 500) cleanPreview = cleanPreview[..500];
            var stored = EmailMessage.Create(tenant.TenantId.Value, account.Id, mime.MessageId ?? $"sent-{Guid.NewGuid():N}", mime.InReplyTo, MailTransportService.ThreadKey(mime), EmailDirection.Outgoing, mime.Subject ?? request.Subject, account.EmailAddress, string.Join(",", request.To), cleanPreview, DateTime.UtcNow, request.RelatedEntityType, request.RelatedEntityId, request.HtmlBody);
            db.Add(stored); await db.SaveChangesAsync(ct); return Results.Ok(new { stored.Id, mime.MessageId });
        });

        group.MapPost("/accounts/{id:guid}/sync", async (Guid id, CommunicationsDbContext db, ITenantContext tenant, MailTransportService transport, CancellationToken ct) => {
            var account = await db.MailAccounts.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenant.TenantId.Value && x.IsActive, ct);
            if (account is null) return Results.NotFound();
            IReadOnlyList<MimeMessage> messages;
            try { messages = await transport.ReceiveRecentAsync(account, account.LastSyncAtUtc, ct); }
            catch (Exception ex) { var detail = FriendlyMailError(account, ex); account.RecordError(detail, DateTime.UtcNow); await db.SaveChangesAsync(ct); return Results.BadRequest(new { detail }); }
            var added = 0;
            foreach (var mime in messages) {
                var messageId = mime.MessageId ?? $"generated-{Guid.NewGuid():N}";
                if (await db.EmailMessages.AnyAsync(x => x.TenantId == tenant.TenantId.Value && x.InternetMessageId == messageId, ct)) continue;

                var cleanPreview = ExtractCleanPreview(mime);
                var htmlBody = ExtractProcessedHtml(mime);
                var threadKey = MailTransportService.ThreadKey(mime);
                var related = await db.EmailMessages.AsNoTracking()
                    .Where(x => x.TenantId == tenant.TenantId.Value && x.ThreadKey == threadKey && x.RelatedEntityId != null)
                    .OrderByDescending(x => x.OccurredAtUtc)
                    .Select(x => new { x.RelatedEntityType, x.RelatedEntityId })
                    .FirstOrDefaultAsync(ct);

                var email = EmailMessage.Create(tenant.TenantId.Value, account.Id, messageId, mime.InReplyTo, threadKey, EmailDirection.Incoming, mime.Subject ?? "(sin asunto)", mime.From.Mailboxes.FirstOrDefault()?.Address ?? "", string.Join(",", mime.To.Mailboxes.Select(x => x.Address)), cleanPreview, mime.Date.UtcDateTime, related?.RelatedEntityType, related?.RelatedEntityId, htmlBody);
                db.EmailMessages.Add(email);

                // Process and save attachments
                foreach (var part in mime.Attachments)
                {
                    if (part is MimePart mimePart && mimePart.Content is not null)
                    {
                        using var ms = new MemoryStream();
                        await mimePart.Content.DecodeToAsync(ms, ct);
                        var bytes = ms.ToArray();
                        var isInline = mimePart.ContentDisposition?.Disposition.Equals("inline", StringComparison.OrdinalIgnoreCase) == true;
                        var fileName = mimePart.FileName ?? mimePart.ContentDisposition?.FileName ?? "adjunto";
                        var contentType = mimePart.ContentType?.MimeType ?? "application/octet-stream";
                        var att = EmailAttachment.Create(tenant.TenantId.Value, email.Id, fileName, contentType, bytes.Length, bytes, mimePart.ContentId, isInline);
                        db.EmailAttachments.Add(att);
                    }
                }

                added++;
            }
            account.RecordSync(DateTime.UtcNow); await db.SaveChangesAsync(ct); return Results.Ok(new { received = added });
        });

        group.MapGet("/messages", async (string? entityType, Guid? entityId, CommunicationsDbContext db, ITenantContext tenant, CancellationToken ct) => {
            var query = db.EmailMessages.AsNoTracking().Where(x => x.TenantId == tenant.TenantId.Value);
            if (!string.IsNullOrWhiteSpace(entityType)) query = query.Where(x => x.RelatedEntityType == entityType);
            if (entityId.HasValue) query = query.Where(x => x.RelatedEntityId == entityId);

            var msgs = await query.Include(x => x.Attachments).OrderByDescending(x => x.OccurredAtUtc).Take(200).ToListAsync(ct);
            var dtos = msgs.Select(x => {
                var rawPreview = x.BodyPreview ?? "";
                var isPreviewHtml = rawPreview.StartsWith("<!DOCTYPE", StringComparison.OrdinalIgnoreCase) || rawPreview.StartsWith("<html", StringComparison.OrdinalIgnoreCase) || rawPreview.Contains("<table") || rawPreview.Contains("<div");
                
                var html = x.BodyHtml;
                if (string.IsNullOrWhiteSpace(html) && isPreviewHtml)
                {
                    html = rawPreview;
                }

                var cleanPreview = rawPreview;
                if (isPreviewHtml)
                {
                    cleanPreview = StripHtml(rawPreview);
                }

                return new {
                    x.Id,
                    x.TenantId,
                    x.MailAccountId,
                    x.InternetMessageId,
                    x.InReplyTo,
                    x.ThreadKey,
                    Direction = x.Direction.ToString(),
                    x.Subject,
                    x.FromAddress,
                    x.ToAddresses,
                    BodyPreview = cleanPreview,
                    BodyHtml = html,
                    x.OccurredAtUtc,
                    x.RelatedEntityType,
                    x.RelatedEntityId,
                    Attachments = x.Attachments.Select(a => new {
                        a.Id,
                        a.FileName,
                        a.ContentType,
                        a.SizeBytes,
                        a.IsInline
                    }).ToList()
                };
            }).ToList();

            return Results.Ok(dtos);
        });

        group.MapGet("/messages/{messageId:guid}/attachments/{attachmentId:guid}/download", async (Guid messageId, Guid attachmentId, CommunicationsDbContext db, ITenantContext tenant, CancellationToken ct) => {
            var att = await db.EmailAttachments.AsNoTracking().FirstOrDefaultAsync(x => x.Id == attachmentId && x.EmailMessageId == messageId && x.TenantId == tenant.TenantId.Value, ct);
            if (att is null) return Results.NotFound();
            return Results.File(att.Data, att.ContentType, att.FileName);
        });

        group.MapDelete("/messages/{id:guid}", async (Guid id, CommunicationsDbContext db, ITenantContext tenant, CancellationToken ct) => {
            var message = await db.EmailMessages.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenant.TenantId.Value, ct);
            if (message is null) return Results.NotFound();
            db.Remove(message); await db.SaveChangesAsync(ct); return Results.NoContent();
        });

        return endpoints;
    }

    private static string ExtractCleanPreview(MimeMessage mime)
    {
        if (!string.IsNullOrWhiteSpace(mime.TextBody))
        {
            var clean = mime.TextBody.Trim();
            return clean.Length > 400 ? clean[..400] : clean;
        }

        if (!string.IsNullOrWhiteSpace(mime.HtmlBody))
        {
            var stripped = StripHtml(mime.HtmlBody);
            return stripped.Length > 400 ? stripped[..400] : stripped;
        }

        return "(Sin contenido)";
    }

    private static string? ExtractProcessedHtml(MimeMessage mime)
    {
        var html = mime.HtmlBody;
        if (string.IsNullOrWhiteSpace(html) && !string.IsNullOrWhiteSpace(mime.TextBody))
        {
            var trimmed = mime.TextBody.Trim();
            if (trimmed.StartsWith("<!DOCTYPE", StringComparison.OrdinalIgnoreCase) || trimmed.StartsWith("<html", StringComparison.OrdinalIgnoreCase) || trimmed.Contains("<table") || trimmed.Contains("<div"))
            {
                html = trimmed;
            }
        }

        if (string.IsNullOrWhiteSpace(html)) return null;

        // Inline images embedded with CID:
        try
        {
            foreach (var part in mime.BodyParts.OfType<MimePart>())
            {
                if (!string.IsNullOrWhiteSpace(part.ContentId) && part.Content is not null && part.ContentType?.MediaType?.Equals("image", StringComparison.OrdinalIgnoreCase) == true)
                {
                    using var ms = new MemoryStream();
                    part.Content.DecodeTo(ms);
                    var b64 = Convert.ToBase64String(ms.ToArray());
                    var cidClean = part.ContentId.Trim('<', '>');
                    html = html.Replace($"cid:{cidClean}", $"data:{part.ContentType.MimeType};base64,{b64}", StringComparison.OrdinalIgnoreCase);
                }
            }
        }
        catch
        {
            // fallback gracefully
        }

        return html;
    }

    private static string StripHtml(string html)
    {
        if (string.IsNullOrWhiteSpace(html)) return string.Empty;
        var s = Regex.Replace(html, "<style[^>]*>.*?</style>", "", RegexOptions.Singleline | RegexOptions.IgnoreCase);
        s = Regex.Replace(s, "<script[^>]*>.*?</script>", "", RegexOptions.Singleline | RegexOptions.IgnoreCase);
        s = Regex.Replace(s, "<xml[^>]*>.*?</xml>", "", RegexOptions.Singleline | RegexOptions.IgnoreCase);
        s = Regex.Replace(s, "<[^>]+>", " ");
        s = System.Net.WebUtility.HtmlDecode(s);
        s = Regex.Replace(s, @"\s+", " ").Trim();
        return s;
    }

    private static string FriendlyMailError(MailAccount account, Exception exception)
    {
        if (exception is AuthenticationException)
            return account.Provider == MailProvider.Gmail
                ? "Gmail rechazó el acceso. Usá una contraseña de aplicación de 16 caracteres; la contraseña normal de Google no funciona con IMAP/SMTP."
                : "El proveedor rechazó las credenciales. Revisá el usuario y el método de autenticación configurado.";
        return "No se pudo conectar con el servidor de correo. Revisá los servidores, puertos, conexión segura y disponibilidad de la cuenta.";
    }
}
