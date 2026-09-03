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

internal static class CommunicationsMetaEndpoints
{
    public static RouteGroupBuilder MapCommunicationsMetaEndpoints(this RouteGroupBuilder group, IEndpointRouteBuilder endpoints)
    {
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
                    verifyToken = fb?.VerifyToken ?? "",
                    connectedAtUtc = fb?.ConnectedAtUtc,
                    lastSyncAtUtc = fb?.LastSyncAtUtc,
                    lastError = MetaGraphApiService.ShortenMetaError(fb?.LastError)
                },
                instagram = new
                {
                    isConnected = ig?.IsConnected == true,
                    pageId = ig?.PageId,
                    pageName = ig?.PageName,
                    instagramAccountId = ig?.InstagramAccountId,
                    instagramUsername = ig?.InstagramUsername,
                    verifyToken = ig?.VerifyToken ?? "",
                    connectedAtUtc = ig?.ConnectedAtUtc,
                    lastSyncAtUtc = ig?.LastSyncAtUtc,
                    lastError = MetaGraphApiService.ShortenMetaError(ig?.LastError)
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

            if (channelType == CommunicationChannelHelper.Instagram && string.IsNullOrWhiteSpace(pageInfo.InstagramAccountId))
            {
                return Results.BadRequest(new
                {
                    error = "No hay cuenta de Instagram Business vinculada a esta página. Vinculá una cuenta comercial de IG desde Meta Business Suite y volvé a intentar."
                });
            }

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
                if (isIg && string.IsNullOrWhiteSpace(conn.InstagramAccountId))
                {
                    channelResults.Add(new
                    {
                        channel = conn.ChannelType,
                        synced = 0,
                        error = "No hay cuenta de Instagram Business vinculada. Conectá Instagram desde una Página de Facebook con cuenta comercial de IG."
                    });
                    continue;
                }

                var channelType = isIg ? CommunicationChannelHelper.Instagram : CommunicationChannelHelper.Facebook;
                var senderOfficial = isIg
                    ? (conn.InstagramUsername != null ? $"@{conn.InstagramUsername}" : "Instagram Oficial")
                    : (conn.PageName ?? "Página Oficial");

                var fetch = await metaService.FetchRecentConversationsAsync(
                    conn.PageAccessToken!, conn.ChannelType, conn.PageName, conn.PageId, conn.InstagramAccountId, ct);

                conn.LastSyncAtUtc = DateTime.UtcNow;
                if (!fetch.Success)
                {
                    conn.LastError = MetaGraphApiService.ShortenMetaError(fetch.Error);
                    if (MetaGraphApiService.IsTokenExpiredError(fetch.Error))
                    {
                        conn.IsConnected = false;
                    }
                    channelResults.Add(new { channel = conn.ChannelType, synced = 0, error = conn.LastError });
                    await db.SaveChangesAsync(ct);
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
                    var altFbId = CommunicationChannelHelper.MetaInternetId(CommunicationChannelHelper.Facebook, m.MessageId);
                    var altIgId = CommunicationChannelHelper.MetaInternetId(CommunicationChannelHelper.Instagram, m.MessageId);

                    var existing = await db.EmailMessages.FirstOrDefaultAsync(x =>
                        x.TenantId == tenantId &&
                        (x.InternetMessageId == internetId || x.InternetMessageId == altFbId || x.InternetMessageId == altIgId), ct);
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

                    await CommunicationsEndpointHelpers.AddTrackedMessageAsync(db, conversationService, email, contactTitle, ct);

                    if (!string.IsNullOrWhiteSpace(m.AttachmentUrl) && !string.IsNullOrWhiteSpace(m.AttachmentType))
                    {
                        var bytes = await metaService.DownloadAttachmentAsync(m.AttachmentUrl, conn.PageAccessToken, ct);
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

            await CommunicationsEndpointHelpers.AddTrackedMessageAsync(db, conversationService, email, req.RecipientId, ct);
            await db.SaveChangesAsync(ct);

            return Results.Ok(new { success = true, messageId = sendRes.MessageId });
        });

        endpoints.MapGet("/api/communications/public/media/{id:guid}", async (Guid id, HttpContext context, CommunicationsDbContext db, IConfiguration configuration, CancellationToken ct) => {
            var secret = configuration["Jwt:Secret"] ?? configuration["JWT_SECRET"] ?? Environment.GetEnvironmentVariable("JWT_SECRET") ?? "";
            var queryToken = context.Request.Query["token"].ToString();
            var authenticated = context.User?.Identity?.IsAuthenticated == true;
            if (!authenticated && !MediaAccessTokens.TryValidate(id, queryToken, secret))
            {
                return Results.Unauthorized();
            }

            var media = await db.StoredMedia.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
            if (media is null) return Results.NotFound();

            context.Response.Headers.Append("X-Content-Type-Options", "nosniff");
            context.Response.Headers.Append("Content-Security-Policy", "sandbox");

            var ctSafe = media.ContentType.ToLowerInvariant();
            var isSafeInline = ctSafe.StartsWith("image/") || ctSafe.StartsWith("audio/") || ctSafe.StartsWith("video/") || ctSafe == "application/pdf";
            if (!isSafeInline)
            {
                context.Response.Headers.Append("Content-Disposition", $"attachment; filename=\"{Uri.EscapeDataString(media.FileName)}\"");
            }

            return Results.File(media.Data, media.ContentType, media.FileName);
        }).AllowAnonymous();

        // Meta Webhook Verification (Handshake)
        endpoints.MapGet("/api/communications/meta/webhook", async (HttpContext context, CommunicationsDbContext db, IConfiguration configuration, CancellationToken ct) => {
            var mode = context.Request.Query["hub.mode"].ToString();
            var token = context.Request.Query["hub.verify_token"].ToString();
            var challenge = context.Request.Query["hub.challenge"].ToString();

            if (mode != "subscribe" || string.IsNullOrWhiteSpace(challenge))
            {
                return Results.Forbid();
            }

            var configured = configuration["Meta:VerifyToken"] ?? Environment.GetEnvironmentVariable("META_VERIFY_TOKEN");
            var tokenValid = (!string.IsNullOrWhiteSpace(configured) && CommunicationsEndpointHelpers.SecretsEqual(configured, token))
                || await db.MetaConnections.AnyAsync(x => x.IsConnected && x.VerifyToken == token, ct);

            if (!tokenValid)
            {
                return Results.Forbid();
            }

            return Results.Content(challenge, "text/plain");
        }).AllowAnonymous();

        // Meta Webhook Events (Messages received)
        endpoints.MapPost("/api/communications/meta/webhook", async (HttpRequest request, CommunicationsDbContext db, MetaGraphApiService metaService, ConversationService conversationService, IConfiguration configuration, IHostEnvironment env, CancellationToken ct) => {
            try
            {
                using var reader = new StreamReader(request.Body);
                var body = await reader.ReadToEndAsync(ct);
                if (string.IsNullOrWhiteSpace(body)) return Results.Ok("EMPTY");

                var appSecret = configuration["Meta:AppSecret"] ?? Environment.GetEnvironmentVariable("META_APP_SECRET");
                var sigHeader = request.Headers["X-Hub-Signature-256"].ToString();
                if (env.IsProduction() && string.IsNullOrWhiteSpace(appSecret))
                {
                    return Results.Unauthorized();
                }

                if (!string.IsNullOrWhiteSpace(appSecret))
                {
                    if (string.IsNullOrWhiteSpace(sigHeader))
                    {
                        return Results.Unauthorized();
                    }

                    using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(appSecret));
                    var hash = "sha256=" + Convert.ToHexString(hmac.ComputeHash(Encoding.UTF8.GetBytes(body))).ToLowerInvariant();
                    if (!CommunicationsEndpointHelpers.SecretsEqual(hash, sigHeader))
                    {
                        return Results.Unauthorized();
                    }
                }

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

                                    var isIg = objType == "instagram";
                                    var metaChannel = isIg ? CommunicationChannelHelper.Instagram : CommunicationChannelHelper.Facebook;
                                    var internetId = CommunicationChannelHelper.MetaInternetId(metaChannel, mid!);
                                    var altFbId = CommunicationChannelHelper.MetaInternetId(CommunicationChannelHelper.Facebook, mid!);
                                    var altIgId = CommunicationChannelHelper.MetaInternetId(CommunicationChannelHelper.Instagram, mid!);
                                    var threadKey = CommunicationChannelHelper.MetaThreadKey(metaChannel, senderId);

                                    var exists = await db.EmailMessages.AnyAsync(x =>
                                        x.TenantId == conn.TenantId &&
                                        (x.InternetMessageId == internetId || x.InternetMessageId == altFbId || x.InternetMessageId == altIgId), ct);
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

                                    await CommunicationsEndpointHelpers.AddTrackedMessageAsync(db, conversationService, email, contactTitle, ct);

                                    if (!string.IsNullOrWhiteSpace(attachmentUrl) && !string.IsNullOrWhiteSpace(attachmentType))
                                    {
                                        var bytes = await metaService.DownloadAttachmentAsync(attachmentUrl, conn.PageAccessToken, ct);
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

        return group;
    }
}
