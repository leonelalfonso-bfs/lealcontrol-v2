using System;

namespace LealControl.Modules.Communications.Infrastructure.Domain;

public sealed class StoredMedia
{
    private StoredMedia() { }

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public string FileName { get; private set; } = string.Empty;
    public string ContentType { get; private set; } = string.Empty;
    public byte[] Data { get; private set; } = [];
    public DateTime CreatedAtUtc { get; private set; }

    public static StoredMedia Create(Guid tenantId, string fileName, string contentType, byte[] data) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        FileName = string.IsNullOrWhiteSpace(fileName) ? "media" : fileName.Trim(),
        ContentType = string.IsNullOrWhiteSpace(contentType) ? "application/octet-stream" : contentType.Trim(),
        Data = data,
        CreatedAtUtc = DateTime.UtcNow
    };
}
