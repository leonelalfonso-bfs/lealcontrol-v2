using System;
using System.Collections.Generic;

namespace LealControl.Modules.Communications.Infrastructure.Domain;

public enum EmailDirection { Incoming, Outgoing }

public sealed class EmailMessage
{
    private EmailMessage() { }
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid MailAccountId { get; private set; }
    public string InternetMessageId { get; private set; } = string.Empty;
    public string? InReplyTo { get; private set; }
    public string ThreadKey { get; private set; } = string.Empty;
    public EmailDirection Direction { get; private set; }
    public string Subject { get; private set; } = string.Empty;
    public string FromAddress { get; private set; } = string.Empty;
    public string ToAddresses { get; private set; } = string.Empty;
    public string BodyPreview { get; private set; } = string.Empty;
    public string? BodyHtml { get; private set; }
    public DateTime OccurredAtUtc { get; private set; }
    public string? RelatedEntityType { get; private set; }
    public Guid? RelatedEntityId { get; private set; }

    public List<EmailAttachment> Attachments { get; private set; } = [];

    public static EmailMessage Create(Guid tenantId, Guid accountId, string messageId, string? inReplyTo,
        string threadKey, EmailDirection direction, string subject, string from, string to, string preview,
        DateTime occurredAtUtc, string? entityType = null, Guid? entityId = null, string? bodyHtml = null) => new()
    {
        Id = Guid.NewGuid(), TenantId = tenantId, MailAccountId = accountId,
        InternetMessageId = messageId, InReplyTo = inReplyTo, ThreadKey = threadKey,
        Direction = direction, Subject = subject, FromAddress = from, ToAddresses = to,
        BodyPreview = preview, OccurredAtUtc = occurredAtUtc,
        RelatedEntityType = entityType, RelatedEntityId = entityId, BodyHtml = bodyHtml
    };

    public void SetBodyHtml(string? html)
    {
        BodyHtml = html;
    }

    public void SetBodyPreview(string preview)
    {
        BodyPreview = preview;
    }
}

