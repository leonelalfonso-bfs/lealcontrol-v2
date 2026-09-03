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

internal static class CommunicationsWhatsAppEndpoints
{
    public static RouteGroupBuilder MapCommunicationsWhatsAppEndpoints(this RouteGroupBuilder group, IEndpointRouteBuilder endpoints)
    {
        // WhatsApp Gateway Endpoints (Evolution API - Multi-Usuario por Empleado)
        group.MapGet("/whatsapp/status", async (Guid? userId, HttpContext http, WhatsAppGatewayService waService, CommunicationsDbContext db, ITenantContext tenant, CancellationToken ct) => {
            var tenantId = tenant.TenantId.Value;
            if (tenantId == Guid.Empty) return Results.Unauthorized();
            var effectiveUserId = userId ?? CommunicationsEndpointHelpers.GetCurrentUserId(http);
            var instance = WhatsAppGatewayService.GetInstanceName(tenantId, effectiveUserId);
            var status = await waService.GetStatusAsync(instance, ct);

            var conn = await db.WhatsAppConnections.FirstOrDefaultAsync(x => x.TenantId == tenantId && x.InstanceName == instance, ct);
            if (conn is null)
            {
                conn = WhatsAppConnection.Create(tenantId, effectiveUserId, null, instance);
                db.WhatsAppConnections.Add(conn);
            }
            conn.State = status.State;
            conn.IsConnected = status.State.Equals("open", StringComparison.OrdinalIgnoreCase) || status.State.Equals("connected", StringComparison.OrdinalIgnoreCase);
            if (!string.IsNullOrWhiteSpace(status.PhoneNumber)) conn.PhoneNumber = status.PhoneNumber;
            if (conn.IsConnected && conn.ConnectedAtUtc == null) conn.ConnectedAtUtc = DateTime.UtcNow;
            conn.UpdatedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);

            return Results.Ok(new
            {
                status.Available,
                status.State,
                status.PhoneNumber,
                status.Error,
                instanceName = instance,
                userId = effectiveUserId,
                isConnected = conn.IsConnected
            });
        });

        group.MapPost("/whatsapp/connect", async (Guid? userId, string? userName, HttpContext http, WhatsAppGatewayService waService, CommunicationsDbContext db, ITenantContext tenant, CancellationToken ct) => {
            var tenantId = tenant.TenantId.Value;
            if (tenantId == Guid.Empty) return Results.Unauthorized();
            var effectiveUserId = userId ?? CommunicationsEndpointHelpers.GetCurrentUserId(http);
            var instance = WhatsAppGatewayService.GetInstanceName(tenantId, effectiveUserId);
            var result = await waService.ConnectQrAsync(instance, ct);

            var conn = await db.WhatsAppConnections.FirstOrDefaultAsync(x => x.TenantId == tenantId && x.InstanceName == instance, ct);
            if (conn is null)
            {
                conn = WhatsAppConnection.Create(tenantId, effectiveUserId, userName, instance);
                db.WhatsAppConnections.Add(conn);
            }
            if (!string.IsNullOrWhiteSpace(userName)) conn.UserName = userName;
            conn.State = result.State;
            conn.UpdatedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);

            return Results.Ok(new
            {
                result.Success,
                result.State,
                result.QrCodeBase64,
                result.Error,
                instanceName = instance,
                userId = effectiveUserId
            });
        });

        group.MapPost("/whatsapp/disconnect", async (Guid? userId, HttpContext http, WhatsAppGatewayService waService, CommunicationsDbContext db, ITenantContext tenant, CancellationToken ct) => {
            var tenantId = tenant.TenantId.Value;
            if (tenantId == Guid.Empty) return Results.Unauthorized();
            var effectiveUserId = userId ?? CommunicationsEndpointHelpers.GetCurrentUserId(http);
            var instance = WhatsAppGatewayService.GetInstanceName(tenantId, effectiveUserId);
            var ok = await waService.DisconnectAsync(instance, ct);

            var conn = await db.WhatsAppConnections.FirstOrDefaultAsync(x => x.TenantId == tenantId && x.InstanceName == instance, ct);
            if (conn is not null)
            {
                conn.State = "disconnected";
                conn.IsConnected = false;
                conn.UpdatedAtUtc = DateTime.UtcNow;
                await db.SaveChangesAsync(ct);
            }

            return Results.Ok(new { success = ok, instanceName = instance, userId = effectiveUserId });
        });

        group.MapGet("/whatsapp/team-lines", async (CommunicationsDbContext db, ITenantContext tenant, CancellationToken ct) => {
            var tenantId = tenant.TenantId.Value;
            if (tenantId == Guid.Empty) return Results.Unauthorized();

            var lines = await db.WhatsAppConnections.AsNoTracking()
                .Where(x => x.TenantId == tenantId)
                .OrderBy(x => x.CreatedAtUtc)
                .ToListAsync(ct);

            return Results.Ok(lines);
        });

        group.MapPost("/whatsapp/sync", async (Guid? userId, HttpContext http, WhatsAppGatewayService waService, CommunicationsDbContext db, ITenantContext tenant, ConversationService conversationService, CancellationToken ct) => {
            var tenantId = tenant.TenantId.Value;
            if (tenantId == Guid.Empty) return Results.Unauthorized();
            var effectiveUserId = userId ?? CommunicationsEndpointHelpers.GetCurrentUserId(http);
            var instance = WhatsAppGatewayService.GetInstanceName(tenantId, effectiveUserId);

            await waService.ConfigureInstanceWebhookAsync(instance, ct);
            var contactsMap = await waService.FetchContactsMapAsync(instance, ct);
            var messages = await waService.FetchRecentMessagesAsync(instance, contactsMap, ct);
            var addedCount = 0;

            var defaultAcc = await db.MailAccounts.FirstOrDefaultAsync(x => x.TenantId == tenantId, ct);
            var accId = defaultAcc?.Id ?? Guid.Empty;

            var userConn = await db.WhatsAppConnections.FirstOrDefaultAsync(x => x.TenantId == tenantId && x.InstanceName == instance, ct);
            var lineName = userConn?.UserName != null ? $"WhatsApp ({userConn.UserName})" : "WhatsApp";

            foreach (var m in messages)
            {
                var participantId = CommunicationChannelHelper.ExtractWhatsAppParticipantId(m.RemoteJid);
                if (string.IsNullOrWhiteSpace(participantId)) continue;

                var internetId = CommunicationChannelHelper.WhatsAppInternetId(m.MessageId);
                var existing = await db.EmailMessages
                    .Include(x => x.Attachments)
                    .FirstOrDefaultAsync(x => x.TenantId == tenantId && x.InternetMessageId == internetId, ct);

                if (existing != null)
                {
                    if (!string.IsNullOrWhiteSpace(m.MediaType) && existing.Attachments.Count == 0)
                    {
                        var media = await waService.DownloadMediaAsync(instance, m.RemoteJid, m.FromMe, m.MessageId, ct);
                        if (media != null && media.Data.Length > 0)
                        {
                            var fn = media.FileName ?? m.FileName ?? $"media.{CommunicationMediaHelper.GuessExtension(media.MimeType, media.MediaType)}";
                            var mime = media.MimeType ?? m.MimeType ?? "application/octet-stream";
                            db.EmailAttachments.Add(EmailAttachment.Create(tenantId, existing.Id, fn, mime, media.Data.Length, media.Data));
                            addedCount++;
                        }
                    }
                    continue;
                }

                var contactName = !string.IsNullOrWhiteSpace(m.PushName) ? m.PushName : (contactsMap.TryGetValue(participantId, out var cn) ? cn : null);
                var contactDisplay = CommunicationChannelHelper.FormatWhatsAppContactDisplay(contactName, participantId);
                var threadKey = CommunicationChannelHelper.WhatsAppThreadKey(participantId, effectiveUserId);
                var html = $"<div style=\"font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; white-space: pre-wrap;\">{System.Net.WebUtility.HtmlEncode(m.Text)}</div>";

                var email = EmailMessage.Create(
                    tenantId,
                    accId,
                    internetId,
                    null,
                    threadKey,
                    m.FromMe ? EmailDirection.Outgoing : EmailDirection.Incoming,
                    $"WhatsApp: {contactDisplay}",
                    m.FromMe ? lineName : participantId,
                    m.FromMe ? participantId : lineName,
                    m.Text.Length > 400 ? m.Text[..400] : m.Text,
                    m.TimestampUtc,
                    "Customer",
                    null,
                    html,
                    CommunicationChannelHelper.WhatsApp
                );

                await CommunicationsEndpointHelpers.AddTrackedMessageAsync(db, conversationService, email, contactDisplay, ct);

                if (effectiveUserId.HasValue && email.ConversationId.HasValue)
                {
                    var conv = await db.Conversations.FirstOrDefaultAsync(x => x.Id == email.ConversationId.Value, ct);
                    if (conv != null && conv.AssignedToUserId == null)
                    {
                        conv.AssignTo(effectiveUserId.Value);
                    }
                }

                if (!string.IsNullOrWhiteSpace(m.MediaType))
                {
                    var media = await waService.DownloadMediaAsync(instance, m.RemoteJid, m.FromMe, m.MessageId, ct);
                    if (media != null && media.Data.Length > 0)
                    {
                        var fn = media.FileName ?? m.FileName ?? $"media.{CommunicationMediaHelper.GuessExtension(media.MimeType, media.MediaType)}";
                        var mime = media.MimeType ?? m.MimeType ?? "application/octet-stream";
                        db.EmailAttachments.Add(EmailAttachment.Create(tenantId, email.Id, fn, mime, media.Data.Length, media.Data));
                    }
                }

                addedCount++;
            }

            if (userConn != null)
            {
                userConn.LastSyncAtUtc = DateTime.UtcNow;
            }

            if (addedCount > 0)
            {
                await db.SaveChangesAsync(ct);
            }

            return Results.Ok(new { synced = addedCount, total = messages.Count });
        });

        group.MapPost("/whatsapp/send", async (SendWhatsAppRequest req, HttpContext http, WhatsAppGatewayService waService, CommunicationsDbContext db, ITenantContext tenant, ConversationService conversationService, CancellationToken ct) => {
            var tenantId = tenant.TenantId.Value;
            if (tenantId == Guid.Empty) return Results.Unauthorized();
            if (string.IsNullOrWhiteSpace(req.To)) return Results.BadRequest("El número de destinatario es obligatorio.");
            if (string.IsNullOrWhiteSpace(req.Message) && string.IsNullOrWhiteSpace(req.MediaUrl) && string.IsNullOrWhiteSpace(req.MediaBase64))
                return Results.BadRequest("El mensaje o archivo es obligatorio.");

            var effectiveUserId = req.UserId ?? CommunicationsEndpointHelpers.GetCurrentUserId(http);
            string instance;
            if (!string.IsNullOrWhiteSpace(req.InstanceName))
            {
                instance = req.InstanceName;
            }
            else if (effectiveUserId.HasValue)
            {
                var userInstance = WhatsAppGatewayService.GetUserInstanceName(tenantId, effectiveUserId.Value);
                var userStatus = await waService.GetStatusAsync(userInstance, ct);
                if (userStatus.State.Equals("open", StringComparison.OrdinalIgnoreCase) || userStatus.State.Equals("connected", StringComparison.OrdinalIgnoreCase))
                {
                    instance = userInstance;
                }
                else
                {
                    var genInstance = WhatsAppGatewayService.GetTenantInstanceName(tenantId);
                    var genStatus = await waService.GetStatusAsync(genInstance, ct);
                    if (genStatus.State.Equals("open", StringComparison.OrdinalIgnoreCase) || genStatus.State.Equals("connected", StringComparison.OrdinalIgnoreCase))
                    {
                        instance = genInstance;
                    }
                    else
                    {
                        instance = userInstance;
                    }
                }
            }
            else
            {
                instance = WhatsAppGatewayService.GetTenantInstanceName(tenantId);
            }

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

                var userConn = await db.WhatsAppConnections.FirstOrDefaultAsync(x => x.TenantId == tenantId && x.InstanceName == instance, ct);
                var senderTitle = userConn?.UserName != null ? $"WhatsApp ({userConn.UserName})" : "WhatsApp Oficial";

                var email = EmailMessage.Create(
                    tenant.TenantId.Value,
                    accId,
                    CommunicationChannelHelper.WhatsAppInternetId(sendResult.MessageId ?? Guid.NewGuid().ToString("N")),
                    null,
                    CommunicationChannelHelper.WhatsAppThreadKey(participantId, effectiveUserId),
                    EmailDirection.Outgoing,
                    $"WhatsApp: {CommunicationChannelHelper.FormatWhatsAppContactDisplay(req.To, participantId)}",
                    senderTitle,
                    participantId,
                    preview.Length > 400 ? preview[..400] : preview,
                    DateTime.UtcNow,
                    req.RelatedEntityType,
                    req.RelatedEntityId,
                    html,
                    CommunicationChannelHelper.WhatsApp
                );

                await CommunicationsEndpointHelpers.AddTrackedMessageAsync(db, conversationService, email, CommunicationChannelHelper.FormatWhatsAppContactDisplay(req.To, participantId), ct);

                if (!string.IsNullOrWhiteSpace(req.MediaBase64))
                {
                    var raw = req.MediaBase64.Contains("base64,") ? req.MediaBase64[(req.MediaBase64.IndexOf("base64,", StringComparison.Ordinal) + 7)..] : req.MediaBase64;
                    var bytes = Convert.FromBase64String(raw);
                    db.EmailAttachments.Add(EmailAttachment.Create(tenantId, email.Id, fileName, mimeType, bytes.Length, bytes));
                }

                await db.SaveChangesAsync(ct);
            }

            return Results.Ok(new { success = sendResult.Success, messageId = sendResult.MessageId, error = sendResult.Error, instanceUsed = instance });
        });

        // Webhook (AllowAnonymous)
        endpoints.MapPost("/api/communications/whatsapp/webhook", async (HttpRequest request, CommunicationsDbContext db, WhatsAppGatewayService waService, ConversationService conversationService, IConfiguration configuration, CancellationToken ct) => {
            try
            {
                var expectedKey = configuration["WhatsAppGateway:WebhookSecret"]
                    ?? Environment.GetEnvironmentVariable("WHATSAPP_WEBHOOK_SECRET")
                    ?? configuration["WhatsAppGateway:ApiKey"]
                    ?? Environment.GetEnvironmentVariable("WHATSAPP_GATEWAY_APIKEY");
                var receivedKey = request.Headers["apikey"].ToString();
                if (string.IsNullOrWhiteSpace(receivedKey)) receivedKey = request.Headers["x-api-key"].ToString();
                if (string.IsNullOrWhiteSpace(receivedKey)) receivedKey = request.Headers["X-Webhook-Secret"].ToString();
                if (string.IsNullOrWhiteSpace(receivedKey)) receivedKey = request.Query["apikey"].ToString();

                if (string.IsNullOrWhiteSpace(expectedKey) || string.IsNullOrWhiteSpace(receivedKey) || !CommunicationsEndpointHelpers.SecretsEqual(expectedKey, receivedKey))
                {
                    return Results.Unauthorized();
                }

                using var reader = new StreamReader(request.Body);
                var body = await reader.ReadToEndAsync(ct);
                if (string.IsNullOrWhiteSpace(body)) return Results.Ok(new { status = "empty" });

                using var doc = JsonDocument.Parse(body);
                var root = doc.RootElement;

                var eventType = root.TryGetProperty("event", out var evProp) ? evProp.GetString() : "";
                var instance = root.TryGetProperty("instance", out var instProp) ? instProp.GetString() : "";

                if (string.IsNullOrWhiteSpace(instance) || !WhatsAppGatewayService.TryParseInstance(instance, out var tenantId, out var userId))
                {
                    return Results.Ok(new { status = "ignored_invalid_instance" });
                }

                // Handle connection update event
                if (string.Equals(eventType, "connection.update", StringComparison.OrdinalIgnoreCase))
                {
                    var conn = await db.WhatsAppConnections.FirstOrDefaultAsync(x => x.TenantId == tenantId && x.InstanceName == instance, ct);
                    if (conn != null)
                    {
                        var st = root.TryGetProperty("data", out var d) && d.TryGetProperty("state", out var sp) ? sp.GetString() : "connecting";
                        conn.State = st ?? "connecting";
                        conn.IsConnected = string.Equals(conn.State, "open", StringComparison.OrdinalIgnoreCase);
                        if (conn.IsConnected && conn.ConnectedAtUtc == null) conn.ConnectedAtUtc = DateTime.UtcNow;
                        conn.UpdatedAtUtc = DateTime.UtcNow;
                        await db.SaveChangesAsync(ct);
                    }
                    return Results.Ok(new { status = "connection_updated" });
                }

                if (string.Equals(eventType, "messages.upsert", StringComparison.OrdinalIgnoreCase) && root.TryGetProperty("data", out var dataObj))
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

                    var userConn = await db.WhatsAppConnections.FirstOrDefaultAsync(x => x.TenantId == tenantId && x.InstanceName == instance, ct);
                    var lineTitle = userConn?.UserName != null ? $"WhatsApp ({userConn.UserName})" : "WhatsApp Oficial";
                    var contactDisplay = CommunicationChannelHelper.FormatWhatsAppContactDisplay(pushName, participantId);
                    var threadKey = CommunicationChannelHelper.WhatsAppThreadKey(participantId, userId);
                    var html = $"<div style=\"font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; white-space: pre-wrap;\">{System.Net.WebUtility.HtmlEncode(text)}</div>";

                    var email = EmailMessage.Create(
                        tenantId,
                        accId,
                        internetId,
                        null,
                        threadKey,
                        fromMe ? EmailDirection.Outgoing : EmailDirection.Incoming,
                        $"WhatsApp: {contactDisplay}",
                        fromMe ? lineTitle : participantId,
                        fromMe ? participantId : lineTitle,
                        text.Length > 400 ? text[..400] : text,
                        DateTime.UtcNow,
                        "Customer",
                        null,
                        html,
                        CommunicationChannelHelper.WhatsApp
                    );

                    await CommunicationsEndpointHelpers.AddTrackedMessageAsync(db, conversationService, email, contactDisplay, ct);

                    // Auto-assign to userId if received on employee's line
                    if (userId.HasValue && email.ConversationId.HasValue)
                    {
                        var conv = await db.Conversations.FirstOrDefaultAsync(x => x.Id == email.ConversationId.Value, ct);
                        if (conv != null && conv.AssignedToUserId == null)
                        {
                            conv.AssignTo(userId.Value);
                        }
                    }

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

        return group;
    }
}
