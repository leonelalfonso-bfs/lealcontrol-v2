using System;

namespace LealControl.Modules.Communications.Infrastructure.Domain;

public sealed class EmailAttachment
{
    private EmailAttachment() { }

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid EmailMessageId { get; private set; }
    public string FileName { get; private set; } = string.Empty;
    public string ContentType { get; private set; } = string.Empty;
    public long SizeBytes { get; private set; }
    public string? ContentId { get; private set; }
    public bool IsInline { get; private set; }
    public byte[] Data { get; private set; } = [];

    public static EmailAttachment Create(
        Guid tenantId,
        Guid emailMessageId,
        string fileName,
        string contentType,
        long sizeBytes,
        byte[] data,
        string? contentId = null,
        bool isInline = false) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        EmailMessageId = emailMessageId,
        FileName = string.IsNullOrWhiteSpace(fileName) ? "adjunto" : fileName.Trim(),
        ContentType = string.IsNullOrWhiteSpace(contentType) ? "application/octet-stream" : contentType.Trim(),
        SizeBytes = sizeBytes,
        Data = data,
        ContentId = contentId,
        IsInline = isInline
    };
}
