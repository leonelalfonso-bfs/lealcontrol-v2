using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using LealControl.Modules.Communications.Infrastructure.Domain;
using LealControl.Modules.Communications.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Communications.Infrastructure.Services;

public sealed class ConversationService
{
    public async Task<Conversation> EnsureForMessageAsync(
        CommunicationsDbContext db,
        Guid tenantId,
        string channelType,
        string threadKey,
        string participantId,
        string? participantName,
        string? participantEmail,
        string? participantPhone,
        EmailDirection direction,
        string messagePreview,
        DateTime occurredAtUtc,
        CancellationToken ct = default)
    {
        var normalizedPreview = messagePreview.Length > 400 ? messagePreview[..400] : messagePreview;
        var displayName = string.IsNullOrWhiteSpace(participantName) ? participantId : participantName;

        var conversation = db.Conversations.Local
            .FirstOrDefault(x => x.TenantId == tenantId && x.ThreadKey == threadKey)
            ?? await db.Conversations
                .FirstOrDefaultAsync(x => x.TenantId == tenantId && x.ThreadKey == threadKey, ct);

        if (conversation is null)
        {
            conversation = Conversation.Create(
                tenantId,
                channelType,
                threadKey,
                participantId,
                displayName,
                participantEmail,
                participantPhone,
                normalizedPreview,
                occurredAtUtc,
                direction);
            db.Conversations.Add(conversation);
        }
        else
        {
            conversation.RecordMessage(direction, normalizedPreview, occurredAtUtc, displayName);
            conversation.UpdateParticipantContact(participantEmail, participantPhone);
        }

        return conversation;
    }

    public async Task BackfillTenantAsync(CommunicationsDbContext db, Guid tenantId, CancellationToken ct = default)
    {
        var needsBackfill = await db.EmailMessages
            .AnyAsync(x => x.TenantId == tenantId && x.ConversationId == null, ct);
        if (!needsBackfill) return;

        var messages = await db.EmailMessages
            .Where(x => x.TenantId == tenantId && x.ConversationId == null)
            .OrderBy(x => x.OccurredAtUtc)
            .ToListAsync(ct);

        foreach (var group in messages.GroupBy(x => x.ThreadKey))
        {
            var threadKey = group.Key;
            var firstMsg = group.First();
            var lastMsg = group.Last();

            var channelType = string.IsNullOrWhiteSpace(firstMsg.ChannelType)
                ? CommunicationChannelHelper.InferChannelFromThreadKey(threadKey, firstMsg.InternetMessageId)
                : firstMsg.ChannelType;

            var participantId = ExtractParticipantId(channelType, threadKey, firstMsg.FromAddress, firstMsg.ToAddresses, firstMsg.Direction);
            var participantName = ExtractParticipantName(firstMsg.Subject, channelType, participantId, firstMsg.FromAddress, firstMsg.ToAddresses, firstMsg.Direction);
            var (email, phone) = ExtractContactFields(channelType, participantId, firstMsg.FromAddress, firstMsg.ToAddresses, firstMsg.Direction);

            var conversation = db.Conversations.Local
                .FirstOrDefault(x => x.TenantId == tenantId && x.ThreadKey == threadKey)
                ?? await db.Conversations
                    .FirstOrDefaultAsync(x => x.TenantId == tenantId && x.ThreadKey == threadKey, ct);

            if (conversation is null)
            {
                conversation = Conversation.Create(
                    tenantId,
                    channelType,
                    threadKey,
                    participantId,
                    string.IsNullOrWhiteSpace(participantName) ? participantId : participantName,
                    email,
                    phone,
                    lastMsg.BodyPreview,
                    lastMsg.OccurredAtUtc,
                    lastMsg.Direction);
                db.Conversations.Add(conversation);
            }
            else
            {
                conversation.RecordMessage(lastMsg.Direction, lastMsg.BodyPreview, lastMsg.OccurredAtUtc, participantName);
                conversation.UpdateParticipantContact(email, phone);
            }

            foreach (var message in group)
            {
                message.SetConversationId(conversation.Id);
            }
        }

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // If already committed or partially conflicted, retry individually or ignore
        }
    }

    public static string ExtractParticipantId(
        string channelType,
        string threadKey,
        string fromAddress,
        string toAddresses,
        EmailDirection direction)
    {
        if (channelType == CommunicationChannelHelper.WhatsApp && threadKey.StartsWith("wa_", StringComparison.Ordinal))
            return threadKey["wa_".Length..];

        if (channelType == CommunicationChannelHelper.Instagram && threadKey.StartsWith("ig_", StringComparison.Ordinal))
            return threadKey["ig_".Length..];

        if (channelType == CommunicationChannelHelper.Facebook && threadKey.StartsWith("fb_", StringComparison.Ordinal))
            return threadKey["fb_".Length..];

        if (channelType == CommunicationChannelHelper.Email)
        {
            var address = direction == EmailDirection.Incoming ? fromAddress : toAddresses.Split(',')[0].Trim();
            return address.ToLowerInvariant();
        }

        return threadKey;
    }

    public static string ExtractParticipantName(
        string subject,
        string channelType,
        string participantId,
        string fromAddress,
        string toAddresses,
        EmailDirection direction)
    {
        if (subject.StartsWith("WhatsApp: ", StringComparison.Ordinal))
            return subject["WhatsApp: ".Length..].Trim();

        if (subject.StartsWith("Instagram DM: ", StringComparison.Ordinal))
            return subject["Instagram DM: ".Length..].Trim();

        if (subject.StartsWith("Messenger: ", StringComparison.Ordinal))
            return subject["Messenger: ".Length..].Trim();

        if (channelType == CommunicationChannelHelper.Email)
        {
            var address = direction == EmailDirection.Incoming ? fromAddress : toAddresses.Split(',')[0].Trim();
            return address;
        }

        return participantId;
    }

    public static (string? Email, string? Phone) ExtractContactFields(
        string channelType,
        string participantId,
        string fromAddress,
        string toAddresses,
        EmailDirection direction)
    {
        if (channelType == CommunicationChannelHelper.WhatsApp)
            return (null, participantId.Replace("lid_", "", StringComparison.Ordinal));

        if (channelType == CommunicationChannelHelper.Email)
        {
            var address = direction == EmailDirection.Incoming ? fromAddress : toAddresses.Split(',')[0].Trim();
            return (address, null);
        }

        return (null, null);
    }
}
