using System;
using System.Collections.Generic;
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
    string? MediaBase64 = null,
    string? MimeType = null,
    string? RelatedEntityType = null,
    Guid? RelatedEntityId = null
);
public sealed record ConfigureMetaChannelRequest(string ChannelType, string PageAccessToken);
public sealed record DisconnectMetaChannelRequest(string ChannelType);
public sealed record SendMetaMessageRequest(
    string ChannelType,
    string RecipientId,
    string Message,
    string? MediaUrl = null,
    string? MediaType = null,
    string? RelatedEntityType = null,
    Guid? RelatedEntityId = null
);
public sealed record LinkConversationRequest(Guid? LeadId, Guid? CustomerId);
public sealed record AssignConversationRequest(Guid? UserId);
public sealed record UpdateConversationStatusRequest(string Status);
public sealed record SaveReplyTemplateRequest(Guid? Id, string Name, string Body, string? ChannelType);

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

        group.MapPost("/accounts/{id:guid}/send", async (Guid id, SendEmailRequest request, CommunicationsDbContext db, ITenantContext tenant, MailTransportService transport, ConversationService conversationService, CancellationToken ct) => {
            var account = await db.MailAccounts.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenant.TenantId.Value && x.IsActive, ct);
            if (account is null) return Results.NotFound();
            MimeMessage mime;
            try { mime = await transport.SendAsync(account, request, ct); }
            catch (Exception ex) { return Results.BadRequest(new { detail = FriendlyMailError(account, ex) }); }
            var cleanPreview = !string.IsNullOrWhiteSpace(request.TextBody) ? request.TextBody.Trim() : StripHtml(request.HtmlBody ?? "");
            if (cleanPreview.Length > 500) cleanPreview = cleanPreview[..500];
            var stored = EmailMessage.Create(tenant.TenantId.Value, account.Id, mime.MessageId ?? $"sent-{Guid.NewGuid():N}", mime.InReplyTo, MailTransportService.ThreadKey(mime), EmailDirection.Outgoing, mime.Subject ?? request.Subject, account.EmailAddress, string.Join(",", request.To), cleanPreview, DateTime.UtcNow, request.RelatedEntityType, request.RelatedEntityId, request.HtmlBody, CommunicationChannelHelper.Email);
            await AttachMessageToConversationAsync(db, conversationService, stored, ct: ct);
            db.Add(stored); await db.SaveChangesAsync(ct); return Results.Ok(new { stored.Id, mime.MessageId });
        });

        group.MapPost("/accounts/{id:guid}/sync", async (Guid id, CommunicationsDbContext db, ITenantContext tenant, MailSyncService mailSync, ConversationService conversationService, CancellationToken ct) => {
            var account = await db.MailAccounts.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenant.TenantId.Value && x.IsActive, ct);
            if (account is null) return Results.NotFound();
            try
            {
                var added = await mailSync.SyncAccountAsync(db, conversationService, account, ct);
                return Results.Ok(new { received = added });
            }
            catch (Exception ex)
            {
                var detail = FriendlyMailError(account, ex);
                account.RecordError(detail, DateTime.UtcNow);
                await db.SaveChangesAsync(ct);
                return Results.BadRequest(new { detail });
            }
        });

        group.MapGet("/messages", async (string? entityType, Guid? entityId, CommunicationsDbContext db, ITenantContext tenant, CancellationToken ct) => {
            var query = db.EmailMessages.AsNoTracking().Where(x => x.TenantId == tenant.TenantId.Value);
            if (!string.IsNullOrWhiteSpace(entityType)) query = query.Where(x => x.RelatedEntityType == entityType);
            if (entityId.HasValue) query = query.Where(x => x.RelatedEntityId == entityId);

            var msgs = await query.Include(x => x.Attachments).OrderByDescending(x => x.OccurredAtUtc).Take(200).ToListAsync(ct);
            return Results.Ok(msgs.Select(MapMessageDto).ToList());
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

        group.MapGet("/conversations", async (string? channel, string? folder, string? search, Guid? customerId, Guid? assignedTo, string? status, CommunicationsDbContext db, ITenantContext tenant, ConversationService conversationService, CancellationToken ct) => {
            var tenantId = tenant.TenantId.Value;
            if (tenantId == Guid.Empty) return Results.Unauthorized();

            await conversationService.BackfillTenantAsync(db, tenantId, ct);

            var query = db.Conversations.AsNoTracking().Where(x => x.TenantId == tenantId);
            if (!string.IsNullOrWhiteSpace(channel) && !channel.Equals("all", StringComparison.OrdinalIgnoreCase))
            {
                query = query.Where(x => x.ChannelType == channel);
            }

            if (customerId.HasValue) query = query.Where(x => x.RelatedCustomerId == customerId);
            if (assignedTo.HasValue) query = query.Where(x => x.AssignedToUserId == assignedTo);
            if (!string.IsNullOrWhiteSpace(status) && !status.Equals("all", StringComparison.OrdinalIgnoreCase))
                query = query.Where(x => x.Status == status);

            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim().ToLowerInvariant();
                query = query.Where(x =>
                    x.ParticipantName.ToLower().Contains(term) ||
                    x.ParticipantId.ToLower().Contains(term) ||
                    (x.ParticipantEmail != null && x.ParticipantEmail.ToLower().Contains(term)) ||
                    (x.ParticipantPhone != null && x.ParticipantPhone.Contains(term)) ||
                    (x.LastMessagePreview != null && x.LastMessagePreview.ToLower().Contains(term)));
            }

            if (string.Equals(folder, "Incoming", StringComparison.OrdinalIgnoreCase))
                query = query.Where(c => db.EmailMessages.Any(m => m.ConversationId == c.Id && m.Direction == EmailDirection.Incoming));
            else if (string.Equals(folder, "Outgoing", StringComparison.OrdinalIgnoreCase))
                query = query.Where(c => db.EmailMessages.Any(m => m.ConversationId == c.Id && m.Direction == EmailDirection.Outgoing));
            else if (string.Equals(folder, "Unassigned", StringComparison.OrdinalIgnoreCase))
                query = query.Where(c => c.AssignedToUserId == null);
            else if (string.Equals(folder, "NeedsResponse", StringComparison.OrdinalIgnoreCase))
            {
                var slaCutoff = DateTime.UtcNow.AddHours(-2);
                query = query.Where(c => c.LastIncomingAtUtc != null && c.LastIncomingAtUtc < slaCutoff && c.Status != "resolved" && c.Status != "archived");
            }

            var conversations = await query
                .OrderByDescending(x => x.LastMessageAtUtc)
                .Take(200)
                .Select(x => new {
                    x.Id,
                    x.ChannelType,
                    x.ThreadKey,
                    x.ParticipantId,
                    x.ParticipantName,
                    x.ParticipantEmail,
                    x.ParticipantPhone,
                    x.LastMessagePreview,
                    x.LastMessageAtUtc,
                    x.UnreadCount,
                    x.RelatedLeadId,
                    x.RelatedCustomerId,
                    x.Status,
                    x.AssignedToUserId,
                    x.SuggestionDismissed,
                    x.LastIncomingAtUtc,
                    NeedsResponse = x.LastIncomingAtUtc != null && x.LastIncomingAtUtc < DateTime.UtcNow.AddHours(-2) && x.Status != "resolved" && x.Status != "archived",
                    HasIncoming = db.EmailMessages.Any(m => m.ConversationId == x.Id && m.Direction == EmailDirection.Incoming),
                    HasOutgoing = db.EmailMessages.Any(m => m.ConversationId == x.Id && m.Direction == EmailDirection.Outgoing)
                })
                .ToListAsync(ct);

            return Results.Ok(conversations);
        });

        group.MapGet("/conversations/{id:guid}/messages", async (Guid id, CommunicationsDbContext db, ITenantContext tenant, CancellationToken ct) => {
            var tenantId = tenant.TenantId.Value;
            if (tenantId == Guid.Empty) return Results.Unauthorized();

            var conversation = await db.Conversations.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            if (conversation is null) return Results.NotFound();

            conversation.MarkRead();
            await db.SaveChangesAsync(ct);

            var msgs = await db.EmailMessages.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.ConversationId == id)
                .Include(x => x.Attachments)
                .OrderBy(x => x.OccurredAtUtc)
                .ToListAsync(ct);

            return Results.Ok(msgs.Select(MapMessageDto).ToList());
        });

        group.MapPost("/conversations/{id:guid}/link", async (Guid id, LinkConversationRequest request, CommunicationsDbContext db, ITenantContext tenant, CancellationToken ct) => {
            var tenantId = tenant.TenantId.Value;
            if (tenantId == Guid.Empty) return Results.Unauthorized();

            var conversation = await db.Conversations.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            if (conversation is null) return Results.NotFound();

            if (request.LeadId.HasValue) conversation.LinkLead(request.LeadId.Value);
            if (request.CustomerId.HasValue) conversation.LinkCustomer(request.CustomerId.Value);
            await db.SaveChangesAsync(ct);

            return Results.Ok(new { success = true, relatedLeadId = conversation.RelatedLeadId, relatedCustomerId = conversation.RelatedCustomerId });
        });

        group.MapPost("/conversations/{id:guid}/assign", async (Guid id, AssignConversationRequest request, CommunicationsDbContext db, ITenantContext tenant, CancellationToken ct) => {
            var conversation = await db.Conversations.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenant.TenantId.Value, ct);
            if (conversation is null) return Results.NotFound();
            conversation.AssignTo(request.UserId);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { success = true, assignedToUserId = conversation.AssignedToUserId });
        });

        group.MapPost("/conversations/{id:guid}/status", async (Guid id, UpdateConversationStatusRequest request, CommunicationsDbContext db, ITenantContext tenant, CancellationToken ct) => {
            var conversation = await db.Conversations.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenant.TenantId.Value, ct);
            if (conversation is null) return Results.NotFound();
            conversation.SetStatus(request.Status);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { success = true, status = conversation.Status });
        });

        group.MapPost("/conversations/{id:guid}/dismiss-suggestion", async (Guid id, CommunicationsDbContext db, ITenantContext tenant, CancellationToken ct) => {
            var conversation = await db.Conversations.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenant.TenantId.Value, ct);
            if (conversation is null) return Results.NotFound();
            conversation.DismissSuggestion();
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { success = true });
        });

        group.MapGet("/conversations/{id:guid}/suggested-matches", async (Guid id, CommunicationsDbContext db, ITenantContext tenant, CancellationToken ct) => {
            var tenantId = tenant.TenantId.Value;
            var conversation = await db.Conversations.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            if (conversation is null) return Results.NotFound();

            var phone = conversation.ParticipantPhone ?? (conversation.ChannelType == "whatsapp" ? conversation.ParticipantId.Replace("lid_", "") : null);
            var email = conversation.ParticipantEmail;

            if (string.IsNullOrWhiteSpace(phone) && string.IsNullOrWhiteSpace(email))
                return Results.Ok(Array.Empty<object>());

            var matches = await db.Database.SqlQueryRaw<CustomerMatchRow>(
                """
                SELECT c."Id", c."LegalName", c."TradeName", c.email AS "Email", c.phone AS "Phone", c.whatsapp AS "WhatsApp"
                FROM crm.customers c
                WHERE c."TenantId" = {0} AND c."IsCustomer" = true
                AND (
                    ({1} IS NOT NULL AND ({1} <> '' AND (c.phone = {1} OR c.whatsapp = {1} OR c.phone LIKE '%' || RIGHT({1}, 8) OR c.whatsapp LIKE '%' || RIGHT({1}, 8))))
                    OR ({2} IS NOT NULL AND {2} <> '' AND LOWER(c.email) = LOWER({2}))
                )
                LIMIT 5
                """,
                tenantId, phone ?? "", email ?? "").ToListAsync(ct);

            return Results.Ok(matches);
        });

        group.MapGet("/notifications/summary", async (CommunicationsDbContext db, ITenantContext tenant, CancellationToken ct) => {
            var tenantId = tenant.TenantId.Value;
            if (tenantId == Guid.Empty) return Results.Unauthorized();

            var slaCutoff = DateTime.UtcNow.AddHours(-2);
            var unreadTotal = await db.Conversations.Where(x => x.TenantId == tenantId).SumAsync(x => x.UnreadCount, ct);
            var needsResponseCount = await db.Conversations.CountAsync(x =>
                x.TenantId == tenantId &&
                x.LastIncomingAtUtc != null &&
                x.LastIncomingAtUtc < slaCutoff &&
                x.Status != "resolved" &&
                x.Status != "archived", ct);

            var recent = await db.Conversations.AsNoTracking()
                .Where(x => x.TenantId == tenantId && (x.UnreadCount > 0 ||
                    (x.LastIncomingAtUtc != null && x.LastIncomingAtUtc < slaCutoff && x.Status != "resolved" && x.Status != "archived")))
                .OrderByDescending(x => x.LastMessageAtUtc)
                .Take(8)
                .Select(x => new {
                    x.Id,
                    x.ParticipantName,
                    x.ParticipantId,
                    x.ChannelType,
                    x.LastMessagePreview,
                    x.UnreadCount,
                    x.LastMessageAtUtc,
                    NeedsResponse = x.LastIncomingAtUtc != null && x.LastIncomingAtUtc < slaCutoff && x.Status != "resolved" && x.Status != "archived"
                })
                .ToListAsync(ct);

            return Results.Ok(new { unreadTotal, needsResponseCount, recent });
        });

        group.MapGet("/templates", async (CommunicationsDbContext db, ITenantContext tenant, CancellationToken ct) =>
            Results.Ok(await db.ReplyTemplates.AsNoTracking().Where(x => x.TenantId == tenant.TenantId.Value).OrderBy(x => x.Name).ToListAsync(ct)));

        group.MapPost("/templates", async (SaveReplyTemplateRequest request, CommunicationsDbContext db, ITenantContext tenant, CancellationToken ct) => {
            if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Body))
                return Results.BadRequest(new { detail = "Nombre y contenido son obligatorios." });

            MessageReplyTemplate template;
            if (request.Id.HasValue)
            {
                var existing = await db.ReplyTemplates.FirstOrDefaultAsync(x => x.Id == request.Id && x.TenantId == tenant.TenantId.Value, ct);
                if (existing is null) return Results.NotFound();
                existing.Update(request.Name, request.Body, request.ChannelType);
                await db.SaveChangesAsync(ct);
                return Results.Ok(new { existing.Id });
            }

            template = MessageReplyTemplate.Create(tenant.TenantId.Value, request.Name, request.Body, request.ChannelType);
            db.ReplyTemplates.Add(template);

            await db.SaveChangesAsync(ct);
            return Results.Ok(new { template.Id });
        });

        group.MapDelete("/templates/{id:guid}", async (Guid id, CommunicationsDbContext db, ITenantContext tenant, CancellationToken ct) => {
            var template = await db.ReplyTemplates.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenant.TenantId.Value, ct);
            if (template is null) return Results.NotFound();
            db.ReplyTemplates.Remove(template);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        group.MapPost("/media/upload", async (HttpRequest request, CommunicationsDbContext db, ITenantContext tenant, CancellationToken ct) => {
            if (!request.HasFormContentType) return Results.BadRequest(new { detail = "Se requiere multipart/form-data." });
            var form = await request.ReadFormAsync(ct);
            var file = form.Files.FirstOrDefault();
            if (file is null || file.Length == 0) return Results.BadRequest(new { detail = "Archivo vacío." });

            using var ms = new MemoryStream();
            await file.CopyToAsync(ms, ct);
            var stored = StoredMedia.Create(tenant.TenantId.Value, file.FileName, file.ContentType ?? "application/octet-stream", ms.ToArray());
            db.StoredMedia.Add(stored);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { mediaId = stored.Id, publicUrl = $"/api/communications/public/media/{stored.Id}" });
        }).DisableAntiforgery();

        group.MapPost("/conversations/{id:guid}/mark-read", async (Guid id, CommunicationsDbContext db, ITenantContext tenant, CancellationToken ct) => {
            var tenantId = tenant.TenantId.Value;
            if (tenantId == Guid.Empty) return Results.Unauthorized();

            var conversation = await db.Conversations.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            if (conversation is null) return Results.NotFound();

            conversation.MarkRead();
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { success = true });
        });

        group.MapDelete("/conversations/{id:guid}", async (Guid id, CommunicationsDbContext db, ITenantContext tenant, CancellationToken ct) => {
            var tenantId = tenant.TenantId.Value;
            if (tenantId == Guid.Empty) return Results.Unauthorized();

            var conversation = await db.Conversations.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            if (conversation is null) return Results.NotFound();

            var messages = await db.EmailMessages.Where(x => x.TenantId == tenantId && x.ConversationId == id).ToListAsync(ct);
            db.EmailMessages.RemoveRange(messages);
            db.Conversations.Remove(conversation);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
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

        group.MapPost("/whatsapp/sync", async (WhatsAppGatewayService waService, CommunicationsDbContext db, ITenantContext tenant, ConversationService conversationService, CancellationToken ct) => {
            var tenantId = tenant.TenantId.Value;
            if (tenantId == Guid.Empty) return Results.Unauthorized();
            var instance = WhatsAppGatewayService.GetTenantInstanceName(tenantId);

            await waService.ConfigureInstanceWebhookAsync(instance, ct);
            var contactsMap = await waService.FetchContactsMapAsync(instance, ct);
            var messages = await waService.FetchRecentMessagesAsync(instance, contactsMap, ct);
            var addedCount = 0;

            var defaultAcc = await db.MailAccounts.FirstOrDefaultAsync(x => x.TenantId == tenantId, ct);
            var accId = defaultAcc?.Id ?? Guid.Empty;

            foreach (var m in messages)
            {
                var participantId = CommunicationChannelHelper.ExtractWhatsAppParticipantId(m.RemoteJid);
                if (string.IsNullOrWhiteSpace(participantId)) continue;

                var internetId = CommunicationChannelHelper.WhatsAppInternetId(m.MessageId);
                var exists = await db.EmailMessages.AnyAsync(x => x.TenantId == tenantId && x.InternetMessageId == internetId, ct);
                if (exists) continue;

                var contactName = !string.IsNullOrWhiteSpace(m.PushName) ? m.PushName : (contactsMap.TryGetValue(participantId, out var cn) ? cn : null);
                var contactDisplay = CommunicationChannelHelper.FormatWhatsAppContactDisplay(contactName, participantId);
                var threadKey = CommunicationChannelHelper.WhatsAppThreadKey(participantId);
                var html = $"<div style=\"font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; white-space: pre-wrap;\">{System.Net.WebUtility.HtmlEncode(m.Text)}</div>";

                var email = EmailMessage.Create(
                    tenantId,
                    accId,
                    internetId,
                    null,
                    threadKey,
                    m.FromMe ? EmailDirection.Outgoing : EmailDirection.Incoming,
                    $"WhatsApp: {contactDisplay}",
                    m.FromMe ? "WhatsApp Oficial" : participantId,
                    m.FromMe ? participantId : "WhatsApp Oficial",
                    m.Text.Length > 400 ? m.Text[..400] : m.Text,
                    m.TimestampUtc,
                    "Customer",
                    null,
                    html,
                    CommunicationChannelHelper.WhatsApp
                );

                await AddTrackedMessageAsync(db, conversationService, email, contactDisplay, ct);
                addedCount++;
            }

            if (addedCount > 0)
            {
                await db.SaveChangesAsync(ct);
            }

            return Results.Ok(new { synced = addedCount, total = messages.Count });
        });

        group.MapPost("/whatsapp/send", async (SendWhatsAppRequest req, WhatsAppGatewayService waService, CommunicationsDbContext db, ITenantContext tenant, ConversationService conversationService, CancellationToken ct) => {
            var tenantId = tenant.TenantId.Value;
            if (tenantId == Guid.Empty) return Results.Unauthorized();
            if (string.IsNullOrWhiteSpace(req.To)) return Results.BadRequest("El número de destinatario es obligatorio.");
            if (string.IsNullOrWhiteSpace(req.Message) && string.IsNullOrWhiteSpace(req.MediaUrl) && string.IsNullOrWhiteSpace(req.MediaBase64))
                return Results.BadRequest("El mensaje o archivo es obligatorio.");

            var instance = WhatsAppGatewayService.GetTenantInstanceName(tenantId);
            WhatsAppSendResult sendResult;
            var mediaType = req.MediaType ?? "document";
            var fileName = req.FileName ?? "archivo";
            var mimeType = req.MimeType ?? (mediaType == "audio" ? "audio/ogg; codecs=opus" : "application/octet-stream");

            if (!string.IsNullOrWhiteSpace(req.MediaBase64))
            {
                sendResult = await waService.SendMediaBase64Async(instance, req.To, req.MediaBase64, mediaType, mimeType, fileName, req.Message ?? "", ct);
            }
            else if (!string.IsNullOrWhiteSpace(req.MediaUrl))
            {
                sendResult = await waService.SendMediaMessageAsync(instance, req.To, req.MediaUrl, mediaType, fileName, req.Message ?? "", ct);
            }
            else
            {
                sendResult = await waService.SendTextMessageAsync(instance, req.To, req.Message, ct);
            }

            if (sendResult.Success)
            {
                var participantId = CommunicationChannelHelper.NormalizeWhatsAppPhone(req.To);
                var preview = string.IsNullOrWhiteSpace(req.Message)
                    ? CommunicationMediaHelper.MediaPreviewLabel(mediaType, fileName)
                    : req.Message;
                var html = $"<div style=\"font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; white-space: pre-wrap;\">{System.Net.WebUtility.HtmlEncode(preview)}</div>";

                var defaultAcc = await db.MailAccounts.FirstOrDefaultAsync(x => x.TenantId == tenant.TenantId.Value, ct);
                var accId = defaultAcc?.Id ?? Guid.Empty;

                var email = EmailMessage.Create(
                    tenant.TenantId.Value,
                    accId,
                    CommunicationChannelHelper.WhatsAppInternetId(sendResult.MessageId ?? Guid.NewGuid().ToString("N")),
                    null,
                    CommunicationChannelHelper.WhatsAppThreadKey(participantId),
                    EmailDirection.Outgoing,
                    $"WhatsApp: {CommunicationChannelHelper.FormatWhatsAppContactDisplay(req.To, participantId)}",
                    "WhatsApp Oficial",
                    participantId,
                    preview.Length > 400 ? preview[..400] : preview,
                    DateTime.UtcNow,
                    req.RelatedEntityType,
                    req.RelatedEntityId,
                    html,
                    CommunicationChannelHelper.WhatsApp
                );

                await AddTrackedMessageAsync(db, conversationService, email, CommunicationChannelHelper.FormatWhatsAppContactDisplay(req.To, participantId), ct);

                if (!string.IsNullOrWhiteSpace(req.MediaBase64))
                {
                    var raw = req.MediaBase64.Contains("base64,") ? req.MediaBase64[(req.MediaBase64.IndexOf("base64,", StringComparison.Ordinal) + 7)..] : req.MediaBase64;
                    var bytes = Convert.FromBase64String(raw);
                    db.EmailAttachments.Add(EmailAttachment.Create(tenantId, email.Id, fileName, mimeType, bytes.Length, bytes));
                }

                await db.SaveChangesAsync(ct);
            }

            return Results.Ok(new { success = sendResult.Success, messageId = sendResult.MessageId, error = sendResult.Error });
        });

        // Webhook (AllowAnonymous)
        endpoints.MapPost("/api/communications/whatsapp/webhook", async (HttpRequest request, CommunicationsDbContext db, WhatsAppGatewayService waService, ConversationService conversationService, CancellationToken ct) => {
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

                    var participantId = CommunicationChannelHelper.ExtractWhatsAppParticipantId(remoteJid);
                    if (string.IsNullOrWhiteSpace(participantId))
                    {
                        return Results.Ok(new { status = "ignored_invalid_jid" });
                    }

                    var internetId = CommunicationChannelHelper.WhatsAppInternetId(msgId);
                    var exists = await db.EmailMessages.AnyAsync(x => x.TenantId == tenantId && x.InternetMessageId == internetId, ct);
                    if (exists) return Results.Ok(new { status = "already_processed" });

                    var text = "";
                    ParsedChannelMessage? parsed = null;
                    if (dataObj.TryGetProperty("message", out var msgObj))
                    {
                        parsed = WhatsAppGatewayService.ParseMessageContent(msgObj);
                        text = parsed.Text;
                    }

                    if (string.IsNullOrWhiteSpace(text)) text = "[Mensaje de WhatsApp]";

                    var defaultAcc = await db.MailAccounts.FirstOrDefaultAsync(x => x.TenantId == tenantId, ct);
                    var accId = defaultAcc?.Id ?? Guid.Empty;
                    var contactDisplay = CommunicationChannelHelper.FormatWhatsAppContactDisplay(pushName, participantId);
                    var threadKey = CommunicationChannelHelper.WhatsAppThreadKey(participantId);
                    var html = $"<div style=\"font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; white-space: pre-wrap;\">{System.Net.WebUtility.HtmlEncode(text)}</div>";

                    var email = EmailMessage.Create(
                        tenantId,
                        accId,
                        internetId,
                        null,
                        threadKey,
                        fromMe ? EmailDirection.Outgoing : EmailDirection.Incoming,
                        $"WhatsApp: {contactDisplay}",
                        fromMe ? "WhatsApp Oficial" : participantId,
                        fromMe ? participantId : "WhatsApp Oficial",
                        text.Length > 400 ? text[..400] : text,
                        DateTime.UtcNow,
                        "Customer",
                        null,
                        html,
                        CommunicationChannelHelper.WhatsApp
                    );

                    await AddTrackedMessageAsync(db, conversationService, email, contactDisplay, ct);

                    if (parsed?.MediaType != null && !string.IsNullOrWhiteSpace(msgId))
                    {
                        var media = await waService.DownloadMediaAsync(instance, remoteJid, fromMe, msgId, ct);
                        if (media != null)
                        {
                            var fn = media.FileName ?? $"media.{CommunicationMediaHelper.GuessExtension(media.MimeType, media.MediaType)}";
                            db.EmailAttachments.Add(EmailAttachment.Create(tenantId, email.Id, fn, media.MimeType, media.Data.Length, media.Data));
                        }
                    }

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
                    connectedAtUtc = fb?.ConnectedAtUtc,
                    lastSyncAtUtc = fb?.LastSyncAtUtc,
                    lastError = fb?.LastError
                },
                instagram = new
                {
                    isConnected = ig?.IsConnected == true,
                    pageId = ig?.PageId,
                    pageName = ig?.PageName,
                    instagramAccountId = ig?.InstagramAccountId,
                    instagramUsername = ig?.InstagramUsername,
                    verifyToken = ig?.VerifyToken ?? "lealcontrol_meta_verify_2026",
                    connectedAtUtc = ig?.ConnectedAtUtc,
                    lastSyncAtUtc = ig?.LastSyncAtUtc,
                    lastError = ig?.LastError
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
            conn.PageAccessToken = pageInfo.ResolvedPageAccessToken ?? req.PageAccessToken;
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

        group.MapPost("/meta/sync", async (MetaGraphApiService metaService, CommunicationsDbContext db, ITenantContext tenant, ConversationService conversationService, CancellationToken ct) => {
            var tenantId = tenant.TenantId.Value;
            if (tenantId == Guid.Empty) return Results.Unauthorized();

            var connections = await db.MetaConnections
                .Where(x => x.TenantId == tenantId && x.IsConnected && !string.IsNullOrWhiteSpace(x.PageAccessToken))
                .ToListAsync(ct);

            var defaultAcc = await db.MailAccounts.FirstOrDefaultAsync(x => x.TenantId == tenantId, ct);
            var accId = defaultAcc?.Id ?? Guid.Empty;
            var addedCount = 0;
            var channelResults = new List<object>();

            foreach (var conn in connections)
            {
                var isIg = conn.ChannelType == CommunicationChannelHelper.Instagram;
                var channelType = isIg ? CommunicationChannelHelper.Instagram : CommunicationChannelHelper.Facebook;
                var senderOfficial = isIg
                    ? (conn.InstagramUsername != null ? $"@{conn.InstagramUsername}" : "Instagram Oficial")
                    : (conn.PageName ?? "Página Oficial");

                var fetch = await metaService.FetchRecentConversationsAsync(
                    conn.PageAccessToken!, conn.ChannelType, conn.PageName, conn.PageId, conn.InstagramAccountId, ct);

                conn.LastSyncAtUtc = DateTime.UtcNow;
                if (!fetch.Success)
                {
                    conn.LastError = fetch.Error;
                    channelResults.Add(new { channel = conn.ChannelType, synced = 0, error = fetch.Error });
                    continue;
                }

                conn.LastError = null;
                var channelAdded = 0;

                foreach (var m in fetch.Messages)
                {
                    var internetId = CommunicationChannelHelper.MetaInternetId(channelType, m.MessageId);
                    var isOutgoing = m.FromName.Equals(conn.PageName, StringComparison.OrdinalIgnoreCase)
                        || (conn.InstagramUsername != null && m.FromName.Equals(conn.InstagramUsername, StringComparison.OrdinalIgnoreCase));
                    var contactTitle = !string.IsNullOrWhiteSpace(m.ParticipantName)
                        ? m.ParticipantName
                        : (isIg ? $"Contacto Instagram ({m.ParticipantId[..Math.Min(6, m.ParticipantId.Length)]})" : $"Contacto Facebook ({m.ParticipantId[..Math.Min(6, m.ParticipantId.Length)]})");
                    var threadKey = CommunicationChannelHelper.MetaThreadKey(channelType, m.ParticipantId);

                    var existing = await db.EmailMessages.FirstOrDefaultAsync(x => x.TenantId == tenantId && x.InternetMessageId == internetId, ct);
                    if (existing != null)
                    {
                        if (existing.ThreadKey != threadKey || existing.ChannelType != channelType)
                        {
                            existing.UpdateMetadata(
                                threadKey,
                                isIg ? $"Instagram DM: {contactTitle}" : $"Messenger: {contactTitle}",
                                isOutgoing ? senderOfficial : m.ParticipantId,
                                isOutgoing ? m.ParticipantId : senderOfficial
                            );
                        }
                        continue;
                    }

                    var html = $"<div style=\"font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; white-space: pre-wrap;\">{System.Net.WebUtility.HtmlEncode(m.Text)}</div>";

                    var email = EmailMessage.Create(
                        tenantId,
                        accId,
                        internetId,
                        null,
                        threadKey,
                        isOutgoing ? EmailDirection.Outgoing : EmailDirection.Incoming,
                        isIg ? $"Instagram DM: {contactTitle}" : $"Messenger: {contactTitle}",
                        isOutgoing ? senderOfficial : m.ParticipantId,
                        isOutgoing ? m.ParticipantId : senderOfficial,
                        m.Text.Length > 400 ? m.Text[..400] : m.Text,
                        m.CreatedAtUtc,
                        "Customer",
                        null,
                        html,
                        channelType
                    );

                    await AddTrackedMessageAsync(db, conversationService, email, contactTitle, ct);

                    if (!string.IsNullOrWhiteSpace(m.AttachmentUrl) && !string.IsNullOrWhiteSpace(m.AttachmentType))
                    {
                        var bytes = await metaService.DownloadAttachmentAsync(m.AttachmentUrl, ct);
                        if (bytes != null && bytes.Length > 0)
                        {
                            var mime = m.AttachmentType == "audio" ? "audio/mpeg" : m.AttachmentType == "image" ? "image/jpeg" : "application/octet-stream";
                            var fn = $"{m.AttachmentType}.{CommunicationMediaHelper.GuessExtension(mime, m.AttachmentType)}";
                            db.EmailAttachments.Add(EmailAttachment.Create(tenantId, email.Id, fn, mime, bytes.Length, bytes));
                        }
                    }

                    channelAdded++;
                    addedCount++;
                }

                channelResults.Add(new { channel = conn.ChannelType, synced = channelAdded, error = (string?)null });
            }

            await db.SaveChangesAsync(ct);

            return Results.Ok(new { synced = addedCount, channels = channelResults });
        });

        group.MapPost("/meta/send", async (SendMetaMessageRequest req, MetaGraphApiService metaService, CommunicationsDbContext db, ITenantContext tenant, ConversationService conversationService, CancellationToken ct) => {
            var tenantId = tenant.TenantId.Value;
            if (tenantId == Guid.Empty) return Results.Unauthorized();
            if (string.IsNullOrWhiteSpace(req.RecipientId)) return Results.BadRequest("Destinatario obligatorio.");
            if (string.IsNullOrWhiteSpace(req.Message) && string.IsNullOrWhiteSpace(req.MediaUrl))
                return Results.BadRequest("Mensaje o archivo obligatorio.");

            var channelType = (req.ChannelType ?? "facebook").ToLowerInvariant();
            var conn = await db.MetaConnections.FirstOrDefaultAsync(x => x.TenantId == tenantId && x.ChannelType == channelType, ct);
            if (conn is null || !conn.IsConnected || string.IsNullOrWhiteSpace(conn.PageAccessToken))
                return Results.BadRequest("El canal seleccionado no está conectado.");

            MetaSendResult sendRes;
            if (!string.IsNullOrWhiteSpace(req.MediaUrl))
            {
                sendRes = await metaService.SendAttachmentAsync(conn.PageAccessToken, req.RecipientId, req.MediaType ?? "audio", req.MediaUrl, ct);
            }
            else
            {
                sendRes = await metaService.SendMessageAsync(conn.PageAccessToken, req.RecipientId, req.Message, ct);
            }

            if (!sendRes.Success) return Results.BadRequest(new { error = sendRes.Error });

            var defaultAcc = await db.MailAccounts.FirstOrDefaultAsync(x => x.TenantId == tenantId, ct);
            var accId = defaultAcc?.Id ?? Guid.Empty;

            var isIg = channelType == CommunicationChannelHelper.Instagram;
            var metaChannel = isIg ? CommunicationChannelHelper.Instagram : CommunicationChannelHelper.Facebook;
            var senderTitle = isIg ? (conn.InstagramUsername != null ? $"@{conn.InstagramUsername}" : "Instagram Oficial") : (conn.PageName ?? "Página Oficial");
            var recipientTitle = isIg
                ? (conn.InstagramUsername != null ? $"@{conn.InstagramUsername}" : "Instagram")
                : (conn.PageName ?? "Facebook");

            var preview = !string.IsNullOrWhiteSpace(req.Message)
                ? req.Message
                : CommunicationMediaHelper.MediaPreviewLabel(req.MediaType, null);

            var email = EmailMessage.Create(
                tenantId,
                accId,
                CommunicationChannelHelper.MetaInternetId(metaChannel, sendRes.MessageId ?? Guid.NewGuid().ToString("N")),
                null,
                CommunicationChannelHelper.MetaThreadKey(metaChannel, req.RecipientId),
                EmailDirection.Outgoing,
                isIg ? $"Instagram DM: {req.RecipientId}" : $"Messenger: {req.RecipientId}",
                senderTitle,
                req.RecipientId,
                preview.Length > 400 ? preview[..400] : preview,
                DateTime.UtcNow,
                req.RelatedEntityType,
                req.RelatedEntityId,
                $"<div style=\"font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; white-space: pre-wrap;\">{System.Net.WebUtility.HtmlEncode(preview)}</div>",
                metaChannel
            );

            await AddTrackedMessageAsync(db, conversationService, email, req.RecipientId, ct);
            await db.SaveChangesAsync(ct);

            return Results.Ok(new { success = true, messageId = sendRes.MessageId });
        });

        endpoints.MapGet("/api/communications/public/media/{id:guid}", async (Guid id, CommunicationsDbContext db, CancellationToken ct) => {
            var media = await db.StoredMedia.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
            if (media is null) return Results.NotFound();
            return Results.File(media.Data, media.ContentType, media.FileName);
        }).AllowAnonymous();

        // Meta Webhook Verification (Handshake)
        endpoints.MapGet("/api/communications/meta/webhook", async (HttpContext context, CommunicationsDbContext db, CancellationToken ct) => {
            var mode = context.Request.Query["hub.mode"].ToString();
            var token = context.Request.Query["hub.verify_token"].ToString();
            var challenge = context.Request.Query["hub.challenge"].ToString();

            if (mode != "subscribe" || string.IsNullOrWhiteSpace(challenge))
            {
                return Results.Forbid();
            }

            var tokenValid = token == "lealcontrol_meta_verify_2026"
                || await db.MetaConnections.AnyAsync(x => x.IsConnected && x.VerifyToken == token, ct);

            if (!tokenValid)
            {
                return Results.Forbid();
            }

            return Results.Content(challenge, "text/plain");
        }).AllowAnonymous();

        // Meta Webhook Events (Messages received)
        endpoints.MapPost("/api/communications/meta/webhook", async (HttpRequest request, CommunicationsDbContext db, MetaGraphApiService metaService, ConversationService conversationService, CancellationToken ct) => {
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

                        var conn = objType == "instagram"
                            ? await db.MetaConnections.FirstOrDefaultAsync(x =>
                                x.IsConnected
                                && x.ChannelType == CommunicationChannelHelper.Instagram
                                && (x.InstagramAccountId == entryId || x.PageId == entryId), ct)
                            : await db.MetaConnections.FirstOrDefaultAsync(x =>
                                x.IsConnected
                                && x.ChannelType == CommunicationChannelHelper.Facebook
                                && x.PageId == entryId, ct);
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

                                    var text = mObj.TryGetProperty("text", out var tProp) ? tProp.GetString() : null;
                                    string? attachmentType = null;
                                    string? attachmentUrl = null;
                                    if (mObj.TryGetProperty("attachments", out var attArr) && attArr.ValueKind == JsonValueKind.Array && attArr.GetArrayLength() > 0)
                                    {
                                        var firstAtt = attArr[0];
                                        attachmentType = firstAtt.TryGetProperty("type", out var atProp) ? atProp.GetString() : null;
                                        if (firstAtt.TryGetProperty("payload", out var payload) && payload.TryGetProperty("url", out var urlProp))
                                            attachmentUrl = urlProp.GetString();
                                    }
                                    if (string.IsNullOrWhiteSpace(text))
                                        text = CommunicationMediaHelper.MediaPreviewLabel(attachmentType, null);
                                    if (string.IsNullOrWhiteSpace(text)) text = "[Mensaje de Meta]";

                                    var isIg = objType == "instagram" || conn.ChannelType == CommunicationChannelHelper.Instagram || conn.InstagramAccountId == entryId;
                                    var metaChannel = isIg ? CommunicationChannelHelper.Instagram : CommunicationChannelHelper.Facebook;
                                    var internetId = CommunicationChannelHelper.MetaInternetId(metaChannel, mid!);
                                    var threadKey = CommunicationChannelHelper.MetaThreadKey(metaChannel, senderId);

                                    var exists = await db.EmailMessages.AnyAsync(x => x.TenantId == conn.TenantId && x.InternetMessageId == internetId, ct);
                                    if (exists) continue;

                                    var defaultAcc = await db.MailAccounts.FirstOrDefaultAsync(x => x.TenantId == conn.TenantId, ct);
                                    var accId = defaultAcc?.Id ?? Guid.Empty;

                                    var senderTitle = isIg
                                        ? (conn.InstagramUsername != null ? $"@{conn.InstagramUsername}" : "Instagram")
                                        : (conn.PageName ?? "Facebook");
                                    var contactTitle = isIg ? $"Contacto Instagram ({senderId[..Math.Min(6, senderId.Length)]})" : $"Contacto Facebook ({senderId[..Math.Min(6, senderId.Length)]})";

                                    var email = EmailMessage.Create(
                                        conn.TenantId,
                                        accId,
                                        internetId,
                                        null,
                                        threadKey,
                                        EmailDirection.Incoming,
                                        isIg ? $"Instagram DM: {contactTitle}" : $"Messenger: {contactTitle}",
                                        senderId,
                                        senderTitle,
                                        text.Length > 400 ? text[..400] : text,
                                        DateTime.UtcNow,
                                        "Customer",
                                        null,
                                        $"<div style=\"font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; white-space: pre-wrap;\">{System.Net.WebUtility.HtmlEncode(text)}</div>",
                                        metaChannel
                                    );

                                    await AddTrackedMessageAsync(db, conversationService, email, contactTitle, ct);

                                    if (!string.IsNullOrWhiteSpace(attachmentUrl) && !string.IsNullOrWhiteSpace(attachmentType))
                                    {
                                        var bytes = await metaService.DownloadAttachmentAsync(attachmentUrl, ct);
                                        if (bytes != null && bytes.Length > 0)
                                        {
                                            var mime = attachmentType == "audio" ? "audio/mpeg" : attachmentType == "image" ? "image/jpeg" : "application/octet-stream";
                                            var fn = $"{attachmentType}.{CommunicationMediaHelper.GuessExtension(mime, attachmentType)}";
                                            db.EmailAttachments.Add(EmailAttachment.Create(conn.TenantId, email.Id, fn, mime, bytes.Length, bytes));
                                        }
                                    }

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

    private static object MapMessageDto(EmailMessage x)
    {
        var rawPreview = x.BodyPreview ?? "";
        var isPreviewHtml = rawPreview.StartsWith("<!DOCTYPE", StringComparison.OrdinalIgnoreCase) || rawPreview.StartsWith("<html", StringComparison.OrdinalIgnoreCase) || rawPreview.Contains("<table") || rawPreview.Contains("<div");
        var html = x.BodyHtml;
        if (string.IsNullOrWhiteSpace(html) && isPreviewHtml) html = rawPreview;
        var cleanPreview = isPreviewHtml ? StripHtml(rawPreview) : rawPreview;

        return new {
            x.Id,
            x.TenantId,
            x.MailAccountId,
            x.ConversationId,
            x.InternetMessageId,
            x.InReplyTo,
            x.ThreadKey,
            ChannelType = string.IsNullOrWhiteSpace(x.ChannelType)
                ? CommunicationChannelHelper.InferChannelFromThreadKey(x.ThreadKey, x.InternetMessageId)
                : x.ChannelType,
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
    }

    private static async Task AttachMessageToConversationAsync(
        CommunicationsDbContext db,
        ConversationService conversationService,
        EmailMessage message,
        string? participantNameOverride = null,
        CancellationToken ct = default)
    {
        var channelType = string.IsNullOrWhiteSpace(message.ChannelType)
            ? CommunicationChannelHelper.InferChannelFromThreadKey(message.ThreadKey, message.InternetMessageId)
            : message.ChannelType;

        var participantId = ConversationService.ExtractParticipantId(
            channelType, message.ThreadKey, message.FromAddress, message.ToAddresses, message.Direction);
        var participantName = participantNameOverride ?? ConversationService.ExtractParticipantName(
            message.Subject, channelType, participantId, message.FromAddress, message.ToAddresses, message.Direction);
        var (email, phone) = ConversationService.ExtractContactFields(
            channelType, participantId, message.FromAddress, message.ToAddresses, message.Direction);

        var conversation = await conversationService.EnsureForMessageAsync(
            db,
            message.TenantId,
            channelType,
            message.ThreadKey,
            participantId,
            participantName,
            email,
            phone,
            message.Direction,
            message.BodyPreview,
            message.OccurredAtUtc,
            ct);

        message.SetConversationId(conversation.Id);
    }

    private static async Task AddTrackedMessageAsync(
        CommunicationsDbContext db,
        ConversationService conversationService,
        EmailMessage message,
        string? participantNameOverride = null,
        CancellationToken ct = default)
    {
        await AttachMessageToConversationAsync(db, conversationService, message, participantNameOverride, ct);
        db.EmailMessages.Add(message);
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

public sealed class CustomerMatchRow
{
    public Guid Id { get; set; }
    public string LegalName { get; set; } = "";
    public string? TradeName { get; set; }
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public string? WhatsApp { get; set; }
}
