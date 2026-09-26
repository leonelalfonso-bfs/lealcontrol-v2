using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
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
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using MimeKit;

namespace LealControl.Modules.Communications.Infrastructure.Http;

internal static class CommunicationsMailEndpoints
{
    public static RouteGroupBuilder MapCommunicationsMailEndpoints(this RouteGroupBuilder group)
    {
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
            catch (Exception ex) { var detail = CommunicationsEndpointHelpers.FriendlyMailError(account, ex); account.RecordError(detail, DateTime.UtcNow); await db.SaveChangesAsync(ct); return Results.BadRequest(new { detail }); }
        });

        group.MapPost("/accounts/{id:guid}/send", async (Guid id, SendEmailRequest request, CommunicationsDbContext db, ITenantContext tenant, MailTransportService transport, ConversationService conversationService, CancellationToken ct) => {
            var account = await db.MailAccounts.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenant.TenantId.Value && x.IsActive, ct);
            if (account is null) return Results.NotFound();
            MimeMessage mime;
            try { mime = await transport.SendAsync(account, request, ct); }
            catch (Exception ex) { return Results.BadRequest(new { detail = CommunicationsEndpointHelpers.FriendlyMailError(account, ex) }); }
            var cleanPreview = !string.IsNullOrWhiteSpace(request.TextBody) ? request.TextBody.Trim() : CommunicationsEndpointHelpers.StripHtml(request.HtmlBody ?? "");
            if (cleanPreview.Length > 500) cleanPreview = cleanPreview[..500];
            var stored = EmailMessage.Create(tenant.TenantId.Value, account.Id, mime.MessageId ?? $"sent-{Guid.NewGuid():N}", mime.InReplyTo, MailTransportService.ThreadKey(mime), EmailDirection.Outgoing, mime.Subject ?? request.Subject, account.EmailAddress, string.Join(",", request.To), cleanPreview, DateTime.UtcNow, request.RelatedEntityType, request.RelatedEntityId, request.HtmlBody, CommunicationChannelHelper.Email);
            await CommunicationsEndpointHelpers.AttachMessageToConversationAsync(db, conversationService, stored, ct: ct);
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
                var detail = CommunicationsEndpointHelpers.FriendlyMailError(account, ex);
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
            return Results.Ok(msgs.Select(CommunicationsEndpointHelpers.MapMessageDto).ToList());
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

            try
            {
                await conversationService.BackfillTenantAsync(db, tenantId, ct);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Communications] Error en backfill: {ex.Message}");
            }

            var slaCutoff = DateTime.UtcNow.AddHours(-2);
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
                    (x.LastMessagePreview != null && x.LastMessagePreview.ToLower().Contains(term)) ||
                    db.ConversationTags.Any(t => t.TenantId == tenantId && t.ConversationId == x.Id && t.NormalizedName.Contains(term)));
            }

            if (string.Equals(folder, "Incoming", StringComparison.OrdinalIgnoreCase))
                query = query.Where(c => db.EmailMessages.Any(m => m.ConversationId == c.Id && m.Direction == EmailDirection.Incoming));
            else if (string.Equals(folder, "Outgoing", StringComparison.OrdinalIgnoreCase))
                query = query.Where(c => db.EmailMessages.Any(m => m.ConversationId == c.Id && m.Direction == EmailDirection.Outgoing));
            else if (string.Equals(folder, "Unassigned", StringComparison.OrdinalIgnoreCase))
                query = query.Where(c => c.AssignedToUserId == null);
            else if (string.Equals(folder, "NeedsResponse", StringComparison.OrdinalIgnoreCase))
                query = query.Where(c => c.LastIncomingAtUtc != null && c.LastIncomingAtUtc < slaCutoff && c.Status != "resolved" && c.Status != "archived");

            var conversations = await query
                .OrderByDescending(x => x.LastMessageAtUtc)
                .Take(200)
                .ToListAsync(ct);

            if (conversations.Count == 0)
            {
                return Results.Ok(Array.Empty<object>());
            }

            var conversationIds = conversations.Select(x => x.Id).ToList();
            var messageFlags = await db.EmailMessages.AsNoTracking()
                .Where(m => m.ConversationId != null && conversationIds.Contains(m.ConversationId.Value))
                .GroupBy(m => m.ConversationId!.Value)
                .Select(g => new
                {
                    ConversationId = g.Key,
                    HasIncoming = g.Any(m => m.Direction == EmailDirection.Incoming),
                    HasOutgoing = g.Any(m => m.Direction == EmailDirection.Outgoing)
                })
                .ToListAsync(ct);

            var flagsById = messageFlags.ToDictionary(x => x.ConversationId);
            var tags = await db.ConversationTags.AsNoTracking()
                .Where(x => x.TenantId == tenantId && conversationIds.Contains(x.ConversationId))
                .Select(x => new { x.ConversationId, x.Name })
                .ToListAsync(ct);
            var tagsById = tags.GroupBy(x => x.ConversationId)
                .ToDictionary(x => x.Key, x => x.Select(tag => tag.Name).OrderBy(name => name).ToArray());

            var result = conversations.Select(x =>
            {
                flagsById.TryGetValue(x.Id, out var flags);
                return new
                {
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
                    Tags = tagsById.TryGetValue(x.Id, out var conversationTags) ? conversationTags : Array.Empty<string>(),
                    NeedsResponse = x.LastIncomingAtUtc != null && x.LastIncomingAtUtc < slaCutoff && x.Status != "resolved" && x.Status != "archived",
                    HasIncoming = flags?.HasIncoming ?? false,
                    HasOutgoing = flags?.HasOutgoing ?? false
                };
            }).ToList();

            return Results.Ok(result);
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

            return Results.Ok(msgs.Select(CommunicationsEndpointHelpers.MapMessageDto).ToList());
        });

        group.MapGet("/conversations/{id:guid}/notes", async (Guid id, CommunicationsDbContext db, ITenantContext tenant, CancellationToken ct) => {
            var tenantId = tenant.TenantId.Value;
            if (tenantId == Guid.Empty) return Results.Unauthorized();
            if (!await db.Conversations.AnyAsync(x => x.Id == id && x.TenantId == tenantId, ct)) return Results.NotFound();
            var notes = await db.ConversationNotes.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.ConversationId == id)
                .OrderBy(x => x.CreatedAtUtc).ThenBy(x => x.Id)
                .Select(x => new { x.Id, x.Body, x.AuthorUserId, x.CreatedAtUtc })
                .ToListAsync(ct);
            return Results.Ok(notes);
        });

        group.MapPost("/conversations/{id:guid}/notes", async (Guid id, AddConversationNoteRequest request, HttpContext http, CommunicationsDbContext db, ITenantContext tenant, CancellationToken ct) => {
            var tenantId = tenant.TenantId.Value;
            if (tenantId == Guid.Empty) return Results.Unauthorized();
            var authorUserId = CommunicationsEndpointHelpers.GetAuthenticatedUserId(http);
            if (authorUserId is null) return Results.Unauthorized();
            if (string.IsNullOrWhiteSpace(request.Body) || request.Body.Trim().Length > 4000)
                return Results.BadRequest(new { detail = "La nota debe tener entre 1 y 4000 caracteres." });
            if (!await db.Conversations.AnyAsync(x => x.Id == id && x.TenantId == tenantId, ct)) return Results.NotFound();
            var note = ConversationNote.Create(tenantId, id, authorUserId.Value, request.Body);
            db.ConversationNotes.Add(note);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { note.Id, note.Body, note.AuthorUserId, note.CreatedAtUtc });
        });

        group.MapGet("/conversations/{id:guid}/tags", async (Guid id, CommunicationsDbContext db, ITenantContext tenant, CancellationToken ct) => {
            var tenantId = tenant.TenantId.Value;
            if (tenantId == Guid.Empty) return Results.Unauthorized();
            if (!await db.Conversations.AnyAsync(x => x.Id == id && x.TenantId == tenantId, ct)) return Results.NotFound();
            var tags = await db.ConversationTags.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.ConversationId == id)
                .OrderBy(x => x.Name)
                .Select(x => new { x.Id, x.Name })
                .ToListAsync(ct);
            return Results.Ok(tags);
        });

        group.MapPost("/conversations/{id:guid}/tags", async (Guid id, AddConversationTagRequest request, CommunicationsDbContext db, ITenantContext tenant, CancellationToken ct) => {
            var tenantId = tenant.TenantId.Value;
            if (tenantId == Guid.Empty) return Results.Unauthorized();
            if (request.Name is null || ConversationTagService.Normalize(request.Name).Length is < 1 or > 32)
                return Results.BadRequest(new { detail = "La etiqueta debe tener entre 1 y 32 caracteres." });
            if (!await db.Conversations.AnyAsync(x => x.Id == id && x.TenantId == tenantId, ct)) return Results.NotFound();
            var tag = await ConversationTagService.AddAsync(db, tenantId, id, request.Name, ct);
            return Results.Ok(new { tag.Id, tag.Name });
        });

        group.MapDelete("/conversations/{id:guid}/tags/{tagId:guid}", async (Guid id, Guid tagId, CommunicationsDbContext db, ITenantContext tenant, CancellationToken ct) => {
            var tenantId = tenant.TenantId.Value;
            if (tenantId == Guid.Empty) return Results.Unauthorized();
            var tag = await db.ConversationTags.FirstOrDefaultAsync(x =>
                x.Id == tagId && x.ConversationId == id && x.TenantId == tenantId, ct);
            if (tag is null) return Results.NotFound();
            db.ConversationTags.Remove(tag);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
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

        group.MapGet("/conversations/{id:guid}/activities", async (Guid id, CommunicationsDbContext db, ITenantContext tenant, CancellationToken ct) => {
            var tenantId = tenant.TenantId.Value;
            if (tenantId == Guid.Empty) return Results.Unauthorized();
            if (!await db.Conversations.AnyAsync(x => x.Id == id && x.TenantId == tenantId, ct)) return Results.NotFound();
            var activities = await db.ConversationActivities.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.ConversationId == id)
                .OrderBy(x => x.OccurredAtUtc).ThenBy(x => x.Id)
                .Select(x => new { x.Id, x.ActorUserId, x.Kind, x.PreviousValue, x.CurrentValue, x.OccurredAtUtc })
                .ToListAsync(ct);
            return Results.Ok(activities);
        });

        group.MapPost("/conversations/{id:guid}/assign", async (Guid id, AssignConversationRequest request, HttpContext http, CommunicationsDbContext db, ITenantContext tenant, CancellationToken ct) => {
            var tenantId = tenant.TenantId.Value;
            if (tenantId == Guid.Empty) return Results.Unauthorized();
            var actorUserId = CommunicationsEndpointHelpers.GetAuthenticatedUserId(http);
            if (actorUserId is null) return Results.Unauthorized();
            var conversation = await ConversationWorkflowService.AssignAsync(db, tenantId, id, actorUserId.Value, request.UserId, ct);
            if (conversation is null) return Results.NotFound();
            return Results.Ok(new { success = true, assignedToUserId = conversation.AssignedToUserId });
        });

        group.MapPost("/conversations/{id:guid}/status", async (Guid id, UpdateConversationStatusRequest request, HttpContext http, CommunicationsDbContext db, ITenantContext tenant, CancellationToken ct) => {
            var tenantId = tenant.TenantId.Value;
            if (tenantId == Guid.Empty) return Results.Unauthorized();
            var actorUserId = CommunicationsEndpointHelpers.GetAuthenticatedUserId(http);
            if (actorUserId is null) return Results.Unauthorized();
            var status = request.Status?.Trim().ToLowerInvariant();
            if (status is not ("open" or "pending" or "resolved" or "archived"))
                return Results.BadRequest(new { detail = "Estado de conversación inválido." });
            var conversation = await ConversationWorkflowService.SetStatusAsync(db, tenantId, id, actorUserId.Value, status, ct);
            if (conversation is null) return Results.NotFound();
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

        group.MapPost("/media/upload", async (HttpRequest request, CommunicationsDbContext db, ITenantContext tenant, IConfiguration configuration, CancellationToken ct) => {
            if (!request.HasFormContentType) return Results.BadRequest(new { detail = "Se requiere multipart/form-data." });
            var form = await request.ReadFormAsync(ct);
            var file = form.Files.FirstOrDefault();
            if (file is null || file.Length == 0) return Results.BadRequest(new { detail = "Archivo vacío." });

            using var ms = new MemoryStream();
            await file.CopyToAsync(ms, ct);
            var stored = StoredMedia.Create(tenant.TenantId.Value, file.FileName, file.ContentType ?? "application/octet-stream", ms.ToArray());
            db.StoredMedia.Add(stored);
            await db.SaveChangesAsync(ct);
            var secret = configuration["Jwt:Secret"] ?? configuration["JWT_SECRET"] ?? Environment.GetEnvironmentVariable("JWT_SECRET") ?? "";
            var access = MediaAccessTokens.Create(stored.Id, secret, TimeSpan.FromHours(12));
            return Results.Ok(new { mediaId = stored.Id, publicUrl = $"/api/communications/public/media/{stored.Id}?token={access}" });
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

        return group;
    }
}
