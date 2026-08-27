using System;

namespace LealControl.Modules.Communications.Infrastructure.Domain;

public sealed class MetaChannelConnection
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string ChannelType { get; set; } = "facebook"; // "facebook" | "instagram"
    public string? PageId { get; set; }
    public string? PageName { get; set; }
    public string? InstagramAccountId { get; set; }
    public string? InstagramUsername { get; set; }
    public string? PageAccessToken { get; set; }
    public string VerifyToken { get; set; } = Guid.NewGuid().ToString("N");
    public bool IsConnected { get; set; }
    public DateTime? ConnectedAtUtc { get; set; }
    public DateTime? LastSyncAtUtc { get; set; }
    public string? LastError { get; set; }
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

    public static MetaChannelConnection Create(Guid tenantId, string channelType)
    {
        return new MetaChannelConnection
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ChannelType = channelType,
            VerifyToken = Guid.NewGuid().ToString("N"),
            IsConnected = false,
            UpdatedAtUtc = DateTime.UtcNow
        };
    }
}
