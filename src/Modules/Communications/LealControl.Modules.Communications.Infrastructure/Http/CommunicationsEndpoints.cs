using System;
using System.IO;
using System.Linq;
using System.Text.Json;
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
public sealed record SendWhatsAppRequest(
    string To,
    string Message,
    string? MediaUrl = null,
    string? MediaType = null,
    string? FileName = null,
    string? RelatedEntityType = null,
    Guid? RelatedEntityId = null
);
public sealed record ConfigureMetaChannelRequest(string ChannelType, string PageAccessToken);
public sealed record DisconnectMetaChannelRequest(string ChannelType);
public sealed record SendMetaMessageRequest(string ChannelType, string RecipientId, string Message, string? RelatedEntityType = null, Guid? RelatedEntityId = null);

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

        // WhatsApp Gateway Endpoints (Evolution API)
        group.MapGet("/whatsapp/status", async (WhatsAppGatewayService waService, ITenantContext tenant, CancellationToken ct) => {
            var tenantId = tenant.TenantId.Value;
            if (tenantId == Guid.Empty) return Results.Unauthorized();
            var instance = WhatsAppGatewayService.GetTenantInstanceName(tenantId);
            var status = await waService.GetStatusAsync(instance, ct);
            return Results.Ok(status);
        });

        group.MapPost("/whatsapp/connect", async (WhatsAppGatewayService waService, ITenantContext tenant, CancellationToken ct) => {
            var tenantId = tenant.TenantId.Value;
            if (tenantId == Guid.Empty) return Results.Unauthorized();
            var instance = WhatsAppGatewayService.GetTenantInstanceName(tenantId);
            var result = await waService.ConnectQrAsync(instance, ct);
            return Results.Ok(result);
        });

        group.MapPost("/whatsapp/disconnect", async (WhatsAppGatewayService waService, ITenantContext tenant, CancellationToken ct) => {
            var tenantId = tenant.TenantId.Value;
            if (tenantId == Guid.Empty) return Results.Unauthorized();
            var instance = WhatsAppGatewayService.GetTenantInstanceName(tenantId);
            var ok = await waService.DisconnectAsync(instance, ct);
            return Results.Ok(new { success = ok });
        });

        group.MapPost("/whatsapp/send", async (SendWhatsAppRequest req, WhatsAppGatewayService waService, CommunicationsDbContext db, ITenantContext tenant, CancellationToken ct) => {
            var tenantId = tenant.TenantId.Value;
            if (tenantId == Guid.Empty) return Results.Unauthorized();
            if (string.IsNullOrWhiteSpace(req.To)) return Results.BadRequest("El número de destinatario es obligatorio.");
            if (string.IsNullOrWhiteSpace(req.Message) && string.IsNullOrWhiteSpace(req.MediaUrl)) return Results.BadRequest("El mensaje o archivo es obligatorio.");

            var instance = WhatsAppGatewayService.GetTenantInstanceName(tenantId);
            WhatsAppSendResult sendResult;
            if (!string.IsNullOrWhiteSpace(req.MediaUrl))
            {
                sendResult = await waService.SendMediaMessageAsync(instance, req.To, req.MediaUrl, req.MediaType ?? "document", req.FileName ?? "documento.pdf", req.Message ?? "", ct);
            }
            else
            {
                sendResult = await waService.SendTextMessageAsync(instance, req.To, req.Message, ct);
            }

            if (sendResult.Success)
            {
                var cleanPhone = Regex.Replace(req.To, @"[^\d]", "");
                var preview = string.IsNullOrWhiteSpace(req.Message) ? $"[Archivo: {req.FileName ?? "Documento"}]" : req.Message;
                var html = $"<div style=\"font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; white-space: pre-wrap;\">{System.Net.WebUtility.HtmlEncode(preview)}</div>";

                var defaultAcc = await db.MailAccounts.FirstOrDefaultAsync(x => x.TenantId == tenant.TenantId.Value, ct);
                var accId = defaultAcc?.Id ?? Guid.Empty;

                var email = EmailMessage.Create(
                    tenant.TenantId.Value,
                    accId,
                    $"wa_{sendResult.MessageId ?? Guid.NewGuid().ToString("N")}",
                    null,
                    $"wa_{cleanPhone}",
                    EmailDirection.Outgoing,
                    $"WhatsApp: {req.To}",
                    "WhatsApp Oficial",
                    req.To,
                    preview.Length > 400 ? preview[..400] : preview,
                    DateTime.UtcNow,
                    req.RelatedEntityType,
                    req.RelatedEntityId,
                    html
                );

                db.EmailMessages.Add(email);
                await db.SaveChangesAsync(ct);
            }

            return Results.Ok(new { success = sendResult.Success, messageId = sendResult.MessageId, error = sendResult.Error });
        });

        // Webhook (AllowAnonymous)
        endpoints.MapPost("/api/communications/whatsapp/webhook", async (HttpRequest request, CommunicationsDbContext db, CancellationToken ct) => {
            try
            {
                using var reader = new StreamReader(request.Body);
                var body = await reader.ReadToEndAsync(ct);
                if (string.IsNullOrWhiteSpace(body)) return Results.Ok(new { status = "empty" });

                using var doc = JsonDocument.Parse(body);
                var root = doc.RootElement;

                var eventType = root.TryGetProperty("event", out var evProp) ? evProp.GetString() : "";
                var instance = root.TryGetProperty("instance", out var instProp) ? instProp.GetString() : "";

                if (string.IsNullOrWhiteSpace(instance) || !instance.StartsWith("tenant_"))
                {
                    return Results.Ok(new { status = "ignored_no_instance" });
                }

                var tenantHex = instance["tenant_".Length..];
                if (!Guid.TryParseExact(tenantHex, "N", out var tenantId))
                {
                    return Results.Ok(new { status = "invalid_tenant_guid" });
                }

                if (eventType == "messages.upsert" && root.TryGetProperty("data", out var dataObj))
                {
                    var key = dataObj.TryGetProperty("key", out var kObj) ? kObj : default;
                    var msgId = key.TryGetProperty("id", out var idProp) ? idProp.GetString() : "";
                    var remoteJid = key.TryGetProperty("remoteJid", out var rjProp) ? rjProp.GetString() : "";
                    var fromMe = key.TryGetProperty("fromMe", out var fmProp) && fmProp.GetBoolean();
                    var pushName = dataObj.TryGetProperty("pushName", out var pnProp) ? pnProp.GetString() : "";

                    if (string.IsNullOrWhiteSpace(msgId) || string.IsNullOrWhiteSpace(remoteJid) || remoteJid.EndsWith("@g.us"))
                    {
                        return Results.Ok(new { status = "ignored_group_or_empty" });
                    }

                    var cleanPhone = Regex.Replace(remoteJid.Split('@')[0], @"[^\d]", "");
                    var internetId = $"wa_{msgId}";

                    var exists = await db.EmailMessages.AnyAsync(x => x.TenantId == tenantId && x.InternetMessageId == internetId, ct);
                    if (exists) return Results.Ok(new { status = "already_processed" });

                    var text = "";
                    if (dataObj.TryGetProperty("message", out var msgObj))
                    {
                        if (msgObj.TryGetProperty("conversation", out var convProp)) text = convProp.GetString() ?? "";
                        else if (msgObj.TryGetProperty("extendedTextMessage", out var extObj) && extObj.TryGetProperty("text", out var extText)) text = extText.GetString() ?? "";
                        else if (msgObj.TryGetProperty("imageMessage", out var imgObj) && imgObj.TryGetProperty("caption", out var imgCap)) text = imgCap.GetString() ?? "[Imagen de WhatsApp]";
                        else if (msgObj.TryGetProperty("documentMessage", out var docObj) && docObj.TryGetProperty("fileName", out var docFn)) text = $"[Documento: {docFn.GetString()}]";
                        else text = "[Mensaje multimedia]";
                    }

                    if (string.IsNullOrWhiteSpace(text)) text = "[Mensaje de WhatsApp]";

                    var defaultAcc = await db.MailAccounts.FirstOrDefaultAsync(x => x.TenantId == tenantId, ct);
                    var accId = defaultAcc?.Id ?? Guid.Empty;

                    var html = $"<div style=\"font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; white-space: pre-wrap;\">{System.Net.WebUtility.HtmlEncode(text)}</div>";

                    var email = EmailMessage.Create(
                        tenantId,
                        accId,
                        internetId,
                        null,
                        $"wa_{cleanPhone}",
                        fromMe ? EmailDirection.Outgoing : EmailDirection.Incoming,
                        !string.IsNullOrWhiteSpace(pushName) ? $"WhatsApp: {pushName} (+{cleanPhone})" : $"WhatsApp: +{cleanPhone}",
                        fromMe ? "WhatsApp Oficial" : $"+{cleanPhone}",
                        fromMe ? $"+{cleanPhone}" : "WhatsApp Oficial",
                        text.Length > 400 ? text[..400] : text,
                        DateTime.UtcNow,
                        "Customer",
                        null,
                        html
                    );

                    db.EmailMessages.Add(email);
                    await db.SaveChangesAsync(ct);
                }

                return Results.Ok(new { status = "processed" });
            }
            catch (Exception ex)
            {
                return Results.Ok(new { status = "error", message = ex.Message });
            }
        }).AllowAnonymous();

        // Meta (Instagram Direct & Facebook Messenger) Endpoints
        group.MapGet("/meta/status", async (CommunicationsDbContext db, ITenantContext tenant, CancellationToken ct) => {
            var tenantId = tenant.TenantId.Value;
            if (tenantId == Guid.Empty) return Results.Unauthorized();

            var connections = await db.MetaConnections.AsNoTracking()
                .Where(x => x.TenantId == tenantId)
                .ToListAsync(ct);

            var fb = connections.FirstOrDefault(x => x.ChannelType == "facebook");
            var ig = connections.FirstOrDefault(x => x.ChannelType == "instagram");

            return Results.Ok(new
            {
                facebook = new
                {
                    isConnected = fb?.IsConnected == true,
                    pageId = fb?.PageId,
                    pageName = fb?.PageName,
                    verifyToken = fb?.VerifyToken ?? "lealcontrol_meta_verify_2026",
                    connectedAtUtc = fb?.ConnectedAtUtc
                },
                instagram = new
                {
                    isConnected = ig?.IsConnected == true,
                    pageId = ig?.PageId,
                    pageName = ig?.PageName,
                    instagramAccountId = ig?.InstagramAccountId,
                    instagramUsername = ig?.InstagramUsername,
                    verifyToken = ig?.VerifyToken ?? "lealcontrol_meta_verify_2026",
                    connectedAtUtc = ig?.ConnectedAtUtc
                }
            });
        });

        group.MapPost("/meta/config", async (ConfigureMetaChannelRequest req, MetaGraphApiService metaService, CommunicationsDbContext db, ITenantContext tenant, CancellationToken ct) => {
            var tenantId = tenant.TenantId.Value;
            if (tenantId == Guid.Empty) return Results.Unauthorized();
            if (string.IsNullOrWhiteSpace(req.PageAccessToken)) return Results.BadRequest("El token de acceso de página es obligatorio.");

            var channelType = (req.ChannelType ?? "facebook").ToLowerInvariant();
            var pageInfo = await metaService.GetPageInfoAsync(req.PageAccessToken, ct);
            if (!pageInfo.Success)
            {
                return Results.BadRequest(new { error = pageInfo.Error });
            }

            var conn = await db.MetaConnections.FirstOrDefaultAsync(x => x.TenantId == tenantId && x.ChannelType == channelType, ct);
            if (conn is null)
            {
                conn = MetaChannelConnection.Create(tenantId, channelType);
                db.MetaConnections.Add(conn);
            }

            conn.PageId = pageInfo.PageId;
            conn.PageName = pageInfo.PageName;
            conn.InstagramAccountId = pageInfo.InstagramAccountId;
            conn.InstagramUsername = pageInfo.InstagramUsername;
            conn.PageAccessToken = req.PageAccessToken;
            conn.IsConnected = true;
            conn.ConnectedAtUtc = DateTime.UtcNow;
            conn.UpdatedAtUtc = DateTime.UtcNow;

            await db.SaveChangesAsync(ct);

            return Results.Ok(new
            {
                success = true,
                pageId = conn.PageId,
                pageName = conn.PageName,
                instagramAccountId = conn.InstagramAccountId,
                instagramUsername = conn.InstagramUsername
            });
        });

        group.MapPost("/meta/disconnect", async (DisconnectMetaChannelRequest req, CommunicationsDbContext db, ITenantContext tenant, CancellationToken ct) => {
            var tenantId = tenant.TenantId.Value;
            if (tenantId == Guid.Empty) return Results.Unauthorized();

            var channelType = (req.ChannelType ?? "facebook").ToLowerInvariant();
            var conn = await db.MetaConnections.FirstOrDefaultAsync(x => x.TenantId == tenantId && x.ChannelType == channelType, ct);
            if (conn is not null)
            {
                conn.IsConnected = false;
                conn.PageAccessToken = null;
                conn.UpdatedAtUtc = DateTime.UtcNow;
                await db.SaveChangesAsync(ct);
            }

            return Results.Ok(new { success = true });
        });

        group.MapPost("/meta/send", async (SendMetaMessageRequest req, MetaGraphApiService metaService, CommunicationsDbContext db, ITenantContext tenant, CancellationToken ct) => {
            var tenantId = tenant.TenantId.Value;
            if (tenantId == Guid.Empty) return Results.Unauthorized();
            if (string.IsNullOrWhiteSpace(req.RecipientId) || string.IsNullOrWhiteSpace(req.Message))
            {
                return Results.BadRequest("Destinatario y mensaje son obligatorios.");
            }

            var channelType = (req.ChannelType ?? "facebook").ToLowerInvariant();
            var conn = await db.MetaConnections.FirstOrDefaultAsync(x => x.TenantId == tenantId && x.ChannelType == channelType, ct);
            if (conn is null || !conn.IsConnected || string.IsNullOrWhiteSpace(conn.PageAccessToken))
            {
                return Results.BadRequest("El canal seleccionado no está conectado.");
            }

            var sendRes = await metaService.SendMessageAsync(conn.PageAccessToken, req.RecipientId, req.Message, ct);
            if (!sendRes.Success)
            {
                return Results.BadRequest(new { error = sendRes.Error });
            }

            var defaultAcc = await db.MailAccounts.FirstOrDefaultAsync(x => x.TenantId == tenantId, ct);
            var accId = defaultAcc?.Id ?? Guid.Empty;

            var isIg = channelType == "instagram";
            var prefix = isIg ? "ig" : "fb";
            var senderTitle = isIg ? (conn.InstagramUsername != null ? $"@{conn.InstagramUsername}" : "Instagram Oficial") : (conn.PageName ?? "Página Oficial");
            var recipientTitle = isIg ? $"@{req.RecipientId}" : $"Usuario FB {req.RecipientId}";

            var email = EmailMessage.Create(
                tenantId,
                accId,
                $"{prefix}_{sendRes.MessageId ?? Guid.NewGuid().ToString("N")}",
                null,
                $"{prefix}_{req.RecipientId}",
                EmailDirection.Outgoing,
                isIg ? $"Instagram DM: {recipientTitle}" : $"Messenger: {recipientTitle}",
                senderTitle,
                recipientTitle,
                req.Message.Length > 400 ? req.Message[..400] : req.Message,
                DateTime.UtcNow,
                req.RelatedEntityType,
                req.RelatedEntityId,
                $"<div style=\"font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; white-space: pre-wrap;\">{System.Net.WebUtility.HtmlEncode(req.Message)}</div>"
            );

            db.EmailMessages.Add(email);
            await db.SaveChangesAsync(ct);

            return Results.Ok(new { success = true, messageId = sendRes.MessageId });
        });

        // Meta Webhook Verification (Handshake)
        endpoints.MapGet("/api/communications/meta/webhook", (HttpContext context) => {
            var mode = context.Request.Query["hub.mode"].ToString();
            var token = context.Request.Query["hub.verify_token"].ToString();
            var challenge = context.Request.Query["hub.challenge"].ToString();

            if (mode == "subscribe" && !string.IsNullOrWhiteSpace(token) && !string.IsNullOrWhiteSpace(challenge))
            {
                return Results.Content(challenge, "text/plain");
            }

            return Results.Forbid();
        }).AllowAnonymous();

        // Meta Webhook Events (Messages received)
        endpoints.MapPost("/api/communications/meta/webhook", async (HttpRequest request, CommunicationsDbContext db, CancellationToken ct) => {
            try
            {
                using var reader = new StreamReader(request.Body);
                var body = await reader.ReadToEndAsync(ct);
                if (string.IsNullOrWhiteSpace(body)) return Results.Ok("EMPTY");

                using var doc = JsonDocument.Parse(body);
                var root = doc.RootElement;

                var objType = root.TryGetProperty("object", out var oProp) ? oProp.GetString() : "";
                if (objType != "page" && objType != "instagram") return Results.Ok("IGNORED_OBJECT");

                if (root.TryGetProperty("entry", out var entryArray) && entryArray.ValueKind == JsonValueKind.Array)
                {
                    foreach (var entry in entryArray.EnumerateArray())
                    {
                        var entryId = entry.TryGetProperty("id", out var idProp) ? idProp.GetString() : "";
                        if (string.IsNullOrWhiteSpace(entryId)) continue;

                        var conn = await db.MetaConnections.FirstOrDefaultAsync(x => x.IsConnected && (x.PageId == entryId || x.InstagramAccountId == entryId), ct);
                        if (conn is null) continue;

                        if (entry.TryGetProperty("messaging", out var messagingArray) && messagingArray.ValueKind == JsonValueKind.Array)
                        {
                            foreach (var msg in messagingArray.EnumerateArray())
                            {
                                var senderId = msg.TryGetProperty("sender", out var sObj) && sObj.TryGetProperty("id", out var sId) ? sId.GetString() : "";
                                var recipientId = msg.TryGetProperty("recipient", out var rObj) && rObj.TryGetProperty("id", out var rId) ? rId.GetString() : "";

                                if (string.IsNullOrWhiteSpace(senderId) || senderId == entryId) continue; // skip echo / self

                                if (msg.TryGetProperty("message", out var mObj))
                                {
                                    var mid = mObj.TryGetProperty("mid", out var midProp) ? midProp.GetString() : Guid.NewGuid().ToString("N");
                                    var isEcho = mObj.TryGetProperty("is_echo", out var echoProp) && echoProp.GetBoolean();
                                    if (isEcho) continue;

                                    var text = mObj.TryGetProperty("text", out var tProp) ? tProp.GetString() : "[Archivo adjunto / multimedia]";
                                    if (string.IsNullOrWhiteSpace(text)) text = "[Mensaje de Meta]";

                                    var isIg = objType == "instagram" || conn.InstagramAccountId == entryId;
                                    var prefix = isIg ? "ig" : "fb";
                                    var internetId = $"meta_{prefix}_{mid}";

                                    var exists = await db.EmailMessages.AnyAsync(x => x.TenantId == conn.TenantId && x.InternetMessageId == internetId, ct);
                                    if (exists) continue;

                                    var defaultAcc = await db.MailAccounts.FirstOrDefaultAsync(x => x.TenantId == conn.TenantId, ct);
                                    var accId = defaultAcc?.Id ?? Guid.Empty;

                                    var senderName = isIg ? $"@{senderId}" : $"Usuario Facebook {senderId}";
                                    var targetName = isIg ? (conn.InstagramUsername != null ? $"@{conn.InstagramUsername}" : "Instagram") : (conn.PageName ?? "Facebook");

                                    var email = EmailMessage.Create(
                                        conn.TenantId,
                                        accId,
                                        internetId,
                                        null,
                                        $"{prefix}_{senderId}",
                                        EmailDirection.Incoming,
                                        isIg ? $"Instagram DM: {senderName}" : $"Messenger: {senderName}",
                                        senderName,
                                        targetName,
                                        text.Length > 400 ? text[..400] : text,
                                        DateTime.UtcNow,
                                        "Customer",
                                        null,
                                        $"<div style=\"font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; white-space: pre-wrap;\">{System.Net.WebUtility.HtmlEncode(text)}</div>"
                                    );

                                    db.EmailMessages.Add(email);
                                    await db.SaveChangesAsync(ct);
                                }
                            }
                        }
                    }
                }

                return Results.Ok("EVENT_RECEIVED");
            }
            catch
            {
                return Results.Ok("ERROR_HANDLED");
            }
        }).AllowAnonymous();

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
