using System;

namespace LealControl.Modules.Communications.Infrastructure.Domain;

public sealed class MessageReplyTemplate
{
    private MessageReplyTemplate() { }

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public string Body { get; private set; } = string.Empty;
    public string? ChannelType { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }

    public static MessageReplyTemplate Create(Guid tenantId, string name, string body, string? channelType)
    {
        var now = DateTime.UtcNow;
        return new MessageReplyTemplate
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Name = name.Trim(),
            Body = body,
            ChannelType = string.IsNullOrWhiteSpace(channelType) ? null : channelType.Trim().ToLowerInvariant(),
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };
    }

    public void Update(string name, string body, string? channelType)
    {
        Name = name.Trim();
        Body = body;
        ChannelType = string.IsNullOrWhiteSpace(channelType) ? null : channelType.Trim().ToLowerInvariant();
        UpdatedAtUtc = DateTime.UtcNow;
    }
}
