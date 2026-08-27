using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using LealControl.Modules.Communications.Infrastructure.Domain;
using LealControl.Modules.Communications.Infrastructure.Persistence;
using LealControl.Modules.Communications.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using MimeKit;

namespace LealControl.Modules.Communications.Infrastructure.Services;

public sealed class MailSyncService
{
    private readonly MailTransportService _transport;

    public MailSyncService(MailTransportService transport) => _transport = transport;

    public async Task<int> SyncAccountAsync(
        CommunicationsDbContext db,
        ConversationService conversationService,
        MailAccount account,
        CancellationToken ct = default)
    {
        IReadOnlyList<MimeMessage> messages;
        try
        {
            messages = await _transport.ReceiveRecentAsync(account, account.LastSyncAtUtc, ct);
        }
        catch
        {
            throw;
        }

        var added = 0;
        foreach (var mime in messages)
        {
            var messageId = mime.MessageId ?? $"generated-{Guid.NewGuid():N}";
            if (await db.EmailMessages.AnyAsync(x => x.TenantId == account.TenantId && x.InternetMessageId == messageId, ct))
                continue;

            var cleanPreview = MailSyncHelper.ExtractCleanPreview(mime);
            var htmlBody = MailSyncHelper.ExtractProcessedHtml(mime);
            var threadKey = MailTransportService.ThreadKey(mime);
            var related = await db.EmailMessages.AsNoTracking()
                .Where(x => x.TenantId == account.TenantId && x.ThreadKey == threadKey && x.RelatedEntityId != null)
                .OrderByDescending(x => x.OccurredAtUtc)
                .Select(x => new { x.RelatedEntityType, x.RelatedEntityId })
                .FirstOrDefaultAsync(ct);

            var email = EmailMessage.Create(
                account.TenantId,
                account.Id,
                messageId,
                mime.InReplyTo,
                threadKey,
                EmailDirection.Incoming,
                mime.Subject ?? "(sin asunto)",
                mime.From.Mailboxes.FirstOrDefault()?.Address ?? "",
                string.Join(",", mime.To.Mailboxes.Select(x => x.Address)),
                cleanPreview,
                mime.Date.UtcDateTime,
                related?.RelatedEntityType,
                related?.RelatedEntityId,
                htmlBody,
                CommunicationChannelHelper.Email);

            await ConversationServiceHelper.AttachMessageToConversationAsync(db, conversationService, email, ct: ct);
            db.EmailMessages.Add(email);

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
                    db.EmailAttachments.Add(EmailAttachment.Create(account.TenantId, email.Id, fileName, contentType, bytes.Length, bytes, mimePart.ContentId, isInline));
                }
            }

            added++;
        }

        account.RecordSync(DateTime.UtcNow);
        await db.SaveChangesAsync(ct);
        return added;
    }
}

internal static class MailSyncHelper
{
    public static string ExtractCleanPreview(MimeMessage mime)
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

    public static string? ExtractProcessedHtml(MimeMessage mime) =>
        string.IsNullOrWhiteSpace(mime.HtmlBody) ? null : mime.HtmlBody;

    private static string StripHtml(string html) =>
        System.Text.RegularExpressions.Regex.Replace(html, "<[^>]+>", " ").Trim();
}

internal static class ConversationServiceHelper
{
    public static async Task AttachMessageToConversationAsync(
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
}
