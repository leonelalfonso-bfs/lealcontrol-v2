using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Communications.Infrastructure.Domain;
using LealControl.Modules.Communications.Infrastructure.Persistence;
using LealControl.Modules.Communications.Infrastructure.Services;
using MailKit.Security;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using MimeKit;

namespace LealControl.Modules.Communications.Infrastructure.Http;

internal static class CommunicationsEndpointHelpers
{
    internal static object MapMessageDto(EmailMessage x)
    {
        var rawPreview = x.BodyPreview ?? "";
        var isPreviewHtml = rawPreview.StartsWith("<!DOCTYPE", StringComparison.OrdinalIgnoreCase) || rawPreview.StartsWith("<html", StringComparison.OrdinalIgnoreCase) || rawPreview.Contains("<table") || rawPreview.Contains("<div");
        var html = x.BodyHtml;
        if (string.IsNullOrWhiteSpace(html) && isPreviewHtml) html = rawPreview;
        var cleanPreview = isPreviewHtml ? StripHtml(rawPreview) : rawPreview;

        return new {
            x.Id,
            x.TenantId,
            x.MailAccountId,
            x.ConversationId,
            x.InternetMessageId,
            x.InReplyTo,
            x.ThreadKey,
            ChannelType = string.IsNullOrWhiteSpace(x.ChannelType)
                ? CommunicationChannelHelper.InferChannelFromThreadKey(x.ThreadKey, x.InternetMessageId)
                : x.ChannelType,
            Direction = x.Direction.ToString(),
            x.Subject,
            x.FromAddress,
            x.ToAddresses,
            BodyPreview = cleanPreview,
            BodyHtml = html,
            x.OccurredAtUtc,
            x.RelatedEntityType,
            x.RelatedEntityId,
            Attachments = x.Attachments.Select(a => new {
                a.Id,
                a.FileName,
                a.ContentType,
                a.SizeBytes,
                a.IsInline
            }).ToList()
        };
    }

    internal static async Task AttachMessageToConversationAsync(
        CommunicationsDbContext db,
        ConversationService conversationService,
        EmailMessage message,
        string? participantNameOverride = null,
        CancellationToken ct = default)
    {
        var channelType = string.IsNullOrWhiteSpace(message.ChannelType)
            ? CommunicationChannelHelper.InferChannelFromThreadKey(message.ThreadKey, message.InternetMessageId)
            : message.ChannelType;

        var participantId = ConversationService.ExtractParticipantId(
            channelType, message.ThreadKey, message.FromAddress, message.ToAddresses, message.Direction);
        var participantName = participantNameOverride ?? ConversationService.ExtractParticipantName(
            message.Subject, channelType, participantId, message.FromAddress, message.ToAddresses, message.Direction);
        var (email, phone) = ConversationService.ExtractContactFields(
            channelType, participantId, message.FromAddress, message.ToAddresses, message.Direction);

        var conversation = await conversationService.EnsureForMessageAsync(
            db,
            message.TenantId,
            channelType,
            message.ThreadKey,
            participantId,
            participantName,
            email,
            phone,
            message.Direction,
            message.BodyPreview,
            message.OccurredAtUtc,
            ct);

        message.SetConversationId(conversation.Id);
        // Conversación descartada que sigue descartada: se guarda solo la marca, sin contenido.
        if (conversation.IsDiscarded) message.Redact();
    }

    internal static async Task AddTrackedMessageAsync(
        CommunicationsDbContext db,
        ConversationService conversationService,
        EmailMessage message,
        string? participantNameOverride = null,
        CancellationToken ct = default)
    {
        await AttachMessageToConversationAsync(db, conversationService, message, participantNameOverride, ct);
        db.EmailMessages.Add(message);
    }

    internal static string ExtractCleanPreview(MimeMessage mime)
    {
        if (!string.IsNullOrWhiteSpace(mime.TextBody))
        {
            var clean = mime.TextBody.Trim();
            return clean.Length > 400 ? clean[..400] : clean;
        }

        if (!string.IsNullOrWhiteSpace(mime.HtmlBody))
        {
            var stripped = StripHtml(mime.HtmlBody);
            return stripped.Length > 400 ? stripped[..400] : stripped;
        }

        return "(Sin contenido)";
    }

    internal static string? ExtractProcessedHtml(MimeMessage mime)
    {
        var html = mime.HtmlBody;
        if (string.IsNullOrWhiteSpace(html) && !string.IsNullOrWhiteSpace(mime.TextBody))
        {
            var trimmed = mime.TextBody.Trim();
            if (trimmed.StartsWith("<!DOCTYPE", StringComparison.OrdinalIgnoreCase) || trimmed.StartsWith("<html", StringComparison.OrdinalIgnoreCase) || trimmed.Contains("<table") || trimmed.Contains("<div"))
            {
                html = trimmed;
            }
        }

        if (string.IsNullOrWhiteSpace(html)) return null;

        // Inline images embedded with CID or Content-Location (incluye firmas enviadas como octet-stream con extensión de imagen):
        try
        {
            var parts = mime.BodyParts.OfType<MimePart>().Concat(mime.Attachments.OfType<MimePart>()).Distinct();
            foreach (var part in parts)
            {
                if (part.Content is null) continue;
                var mimeType = ResolveImageMimeType(part);
                if (mimeType is null) continue;

                var hasCid = !string.IsNullOrWhiteSpace(part.ContentId);
                var hasLoc = part.ContentLocation is not null;
                if (!hasCid && !hasLoc) continue;

                using var ms = new MemoryStream();
                part.Content.DecodeTo(ms);
                if (ms.Length == 0 || ms.Length > 4 * 1024 * 1024) continue;
                var dataUri = $"data:{mimeType};base64,{Convert.ToBase64String(ms.ToArray())}";

                if (hasCid)
                {
                    var cidClean = part.ContentId!.Trim('<', '>');
                    html = html.Replace($"cid:{cidClean}", dataUri, StringComparison.OrdinalIgnoreCase);
                    var unescaped = Uri.UnescapeDataString(cidClean);
                    if (!string.Equals(unescaped, cidClean, StringComparison.Ordinal))
                        html = html.Replace($"cid:{unescaped}", dataUri, StringComparison.OrdinalIgnoreCase);
                }

                if (hasLoc)
                {
                    var loc = part.ContentLocation!.ToString();
                    if (!string.IsNullOrWhiteSpace(loc))
                        html = html.Replace(loc, dataUri, StringComparison.OrdinalIgnoreCase);
                }
            }
        }
        catch
        {
            // fallback gracefully
        }

        return html;
    }

    private static string? ResolveImageMimeType(MimePart part)
    {
        if (part.ContentType?.MediaType?.Equals("image", StringComparison.OrdinalIgnoreCase) == true)
            return part.ContentType.MimeType;

        var fileName = part.FileName ?? part.ContentType?.Name ?? part.ContentLocation?.ToString() ?? "";
        var ext = Path.GetExtension(fileName).ToLowerInvariant();
        return ext switch
        {
            ".png" => "image/png",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".gif" => "image/gif",
            ".webp" => "image/webp",
            ".svg" => "image/svg+xml",
            ".bmp" => "image/bmp",
            _ => null
        };
    }

    internal static string StripHtml(string html)
    {
        if (string.IsNullOrWhiteSpace(html)) return string.Empty;
        var s = Regex.Replace(html, "<style[^>]*>.*?</style>", "", RegexOptions.Singleline | RegexOptions.IgnoreCase);
        s = Regex.Replace(s, "<script[^>]*>.*?</script>", "", RegexOptions.Singleline | RegexOptions.IgnoreCase);
        s = Regex.Replace(s, "<xml[^>]*>.*?</xml>", "", RegexOptions.Singleline | RegexOptions.IgnoreCase);
        s = Regex.Replace(s, "<[^>]+>", " ");
        s = System.Net.WebUtility.HtmlDecode(s);
        s = Regex.Replace(s, @"\s+", " ").Trim();
        return s;
    }

    internal static string FriendlyMailError(MailAccount account, Exception exception)
    {
        if (exception is InvalidOperationException && !string.IsNullOrWhiteSpace(exception.Message))
            return exception.Message;
        if (exception is AuthenticationException)
            return account.Provider == MailProvider.Gmail
                ? "Gmail rechazó el acceso. Usá una contraseña de aplicación de 16 caracteres; la contraseña normal de Google no funciona con IMAP/SMTP."
                : "El proveedor rechazó las credenciales. Revisá el usuario y el método de autenticación configurado.";
        return "No se pudo conectar con el servidor de correo. Revisá los servidores, puertos, conexión segura y disponibilidad de la cuenta.";
    }

    internal static Guid? GetAuthenticatedUserId(HttpContext http)
    {
        var claim = http.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
            ?? http.User.FindFirst("sub")?.Value
            ?? http.User.FindFirst("id")?.Value;
        return Guid.TryParse(claim, out var userId) && userId != Guid.Empty ? userId : null;
    }

    internal static Guid? GetCurrentUserId(HttpContext http)
    {
        var header = http.Request.Headers["X-User-Id"].ToString();
        if (Guid.TryParse(header, out var fromHeader) && fromHeader != Guid.Empty)
            return fromHeader;

        var claim = http.User?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
            ?? http.User?.FindFirst("sub")?.Value
            ?? http.User?.FindFirst("id")?.Value;

        if (Guid.TryParse(claim, out var fromClaim) && fromClaim != Guid.Empty)
            return fromClaim;

        return null;
    }

    internal static bool SecretsEqual(string expected, string received)
    {
        var a = SHA256.HashData(Encoding.UTF8.GetBytes(expected));
        var b = SHA256.HashData(Encoding.UTF8.GetBytes(received ?? string.Empty));
        return CryptographicOperations.FixedTimeEquals(a, b);
    }
}
