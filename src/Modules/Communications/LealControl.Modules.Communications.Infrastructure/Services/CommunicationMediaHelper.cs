using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using LealControl.Modules.Communications.Infrastructure.Domain;
using LealControl.Modules.Communications.Infrastructure.Persistence;

namespace LealControl.Modules.Communications.Infrastructure.Services;

public sealed record ParsedChannelMessage(
    string Text,
    string? MediaType,
    string? MimeType,
    string? FileName,
    byte[]? MediaData);

public static class CommunicationMediaHelper
{
    public static async Task AddAttachmentAsync(
        CommunicationsDbContext db,
        Guid tenantId,
        Guid messageId,
        string fileName,
        string contentType,
        byte[] data,
        CancellationToken ct = default)
    {
        if (data.Length == 0) return;
        db.EmailAttachments.Add(EmailAttachment.Create(tenantId, messageId, fileName, contentType, data.Length, data));
        await db.SaveChangesAsync(ct);
    }

    public static async Task<byte[]?> DownloadUrlAsync(HttpClient httpClient, string url, CancellationToken ct = default)
    {
        try
        {
            using var response = await httpClient.GetAsync(url, ct);
            if (!response.IsSuccessStatusCode) return null;
            return await response.Content.ReadAsByteArrayAsync(ct);
        }
        catch
        {
            return null;
        }
    }

    public static string MediaPreviewLabel(string? mediaType, string? fileName)
    {
        return mediaType switch
        {
            "audio" => "🎤 Nota de voz",
            "image" => "📷 Imagen",
            "video" => "🎬 Video",
            "document" => $"📎 {fileName ?? "Documento"}",
            _ => "[Archivo multimedia]"
        };
    }

    public static bool IsAudioContentType(string? contentType) =>
        !string.IsNullOrWhiteSpace(contentType) &&
        (contentType.StartsWith("audio/", StringComparison.OrdinalIgnoreCase) ||
         contentType.Contains("ogg", StringComparison.OrdinalIgnoreCase));

    public static string GuessExtension(string? mimeType, string mediaType)
    {
        if (IsAudioContentType(mimeType)) return mimeType?.Contains("mpeg", StringComparison.OrdinalIgnoreCase) == true ? "mp3" : "ogg";
        if (mediaType == "image") return "jpg";
        if (mediaType == "video") return "mp4";
        return "bin";
    }
}
