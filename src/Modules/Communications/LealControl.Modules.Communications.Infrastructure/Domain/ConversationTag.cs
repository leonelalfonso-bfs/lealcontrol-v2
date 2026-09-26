using System;

namespace LealControl.Modules.Communications.Infrastructure.Domain;

public sealed class ConversationTag
{
    private ConversationTag() { }

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid ConversationId { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public string NormalizedName { get; private set; } = string.Empty;
    public DateTime CreatedAtUtc { get; private set; }

    public static ConversationTag Create(Guid tenantId, Guid conversationId, string name, string normalizedName) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        ConversationId = conversationId,
        Name = name,
        NormalizedName = normalizedName,
        CreatedAtUtc = DateTime.UtcNow
    };
}
