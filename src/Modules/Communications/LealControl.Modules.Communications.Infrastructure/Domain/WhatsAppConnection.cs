using System;

namespace LealControl.Modules.Communications.Infrastructure.Domain;

public sealed class WhatsAppConnection
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public Guid? UserId { get; set; }
    public string? UserName { get; set; }
    public string InstanceName { get; set; } = string.Empty;
    public string? PhoneNumber { get; set; }
    public string State { get; set; } = "disconnected"; // "disconnected" | "connecting" | "connected"
    public bool IsConnected { get; set; }
    public DateTime? ConnectedAtUtc { get; set; }
    public DateTime? LastSyncAtUtc { get; set; }
    public string? LastError { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

    public static WhatsAppConnection Create(Guid tenantId, Guid? userId, string? userName, string instanceName)
    {
        return new WhatsAppConnection
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            UserId = userId,
            UserName = userName,
            InstanceName = instanceName,
            State = "disconnected",
            IsConnected = false,
            CreatedAtUtc = DateTime.UtcNow,
            UpdatedAtUtc = DateTime.UtcNow
        };
    }
}
