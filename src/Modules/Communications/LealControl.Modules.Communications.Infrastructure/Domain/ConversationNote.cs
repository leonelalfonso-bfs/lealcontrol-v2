using System;

namespace LealControl.Modules.Communications.Infrastructure.Domain;

public sealed class ConversationNote
{
    private ConversationNote() { }

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid ConversationId { get; private set; }
    public Guid AuthorUserId { get; private set; }
    public string Body { get; private set; } = string.Empty;
    public DateTime CreatedAtUtc { get; private set; }

    public static ConversationNote Create(Guid tenantId, Guid conversationId, Guid authorUserId, string body) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        ConversationId = conversationId,
        AuthorUserId = authorUserId,
        Body = body.Trim(),
        CreatedAtUtc = DateTime.UtcNow
    };
}
