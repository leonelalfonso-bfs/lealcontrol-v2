using System;

namespace LealControl.Modules.Communications.Infrastructure.Domain;

public sealed class ConversationActivity
{
    private ConversationActivity() { }

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid ConversationId { get; private set; }
    public Guid ActorUserId { get; private set; }
    public string Kind { get; private set; } = string.Empty;
    public string? PreviousValue { get; private set; }
    public string? CurrentValue { get; private set; }
    public DateTime OccurredAtUtc { get; private set; }

    public static ConversationActivity Create(Guid tenantId, Guid conversationId, Guid actorUserId,
        string kind, string? previousValue, string? currentValue) => new()
    {
        Id = Guid.NewGuid(), TenantId = tenantId, ConversationId = conversationId,
        ActorUserId = actorUserId, Kind = kind, PreviousValue = previousValue,
        CurrentValue = currentValue, OccurredAtUtc = DateTime.UtcNow
    };
}
