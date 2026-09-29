using System.Security.Cryptography;
using System.Text;
using LealControl.Modules.Communications.Infrastructure.Domain;
using MailKit;
using MailKit.Net.Imap;
using MailKit.Net.Smtp;
using MailKit.Search;
using MailKit.Security;
using Microsoft.AspNetCore.DataProtection;
using MimeKit;

namespace LealControl.Modules.Communications.Infrastructure.Services;

public sealed class MailSecretProtector(IDataProtectionProvider provider)
{
    private readonly IDataProtector _protector = provider.CreateProtector("LealControl.Communications.MailSecrets.v1");
    public string Protect(string value) => _protector.Protect(value);
    public string Unprotect(string value) => _protector.Unprotect(value);
}

public sealed record OutgoingEmailAttachment(string FileName, string ContentType, string ContentBase64);

public sealed record SendEmailRequest(string[] To, string Subject, string HtmlBody, string? TextBody,
    string? RelatedEntityType, Guid? RelatedEntityId, string? InReplyTo, OutgoingEmailAttachment[]? Attachments = null);

public sealed class MailTransportService(MailSecretProtector secrets)
{
    private static SecureSocketOptions SocketOption(bool ssl, int port) => ssl
        ? (port == 587 ? SecureSocketOptions.StartTls : SecureSocketOptions.SslOnConnect)
        : SecureSocketOptions.StartTlsWhenAvailable;

    private static void Authenticate(MailAccount account, string secret, MailService client)
    {
        if (account.AuthMode == MailAuthMode.OAuth2) client.Authenticate(new SaslMechanismOAuth2(account.Username, secret));
        else client.Authenticate(account.Username, secret);
    }

    public async Task TestAsync(MailAccount account, CancellationToken cancellationToken)
    {
        var secret = secrets.Unprotect(account.ProtectedSecret);
        using var imap = new ImapClient();
        await imap.ConnectAsync(account.ImapHost, account.ImapPort, SocketOption(account.ImapUseSsl, account.ImapPort), cancellationToken);
        Authenticate(account, secret, imap); await imap.DisconnectAsync(true, cancellationToken);
        using var smtp = new SmtpClient();
        await smtp.ConnectAsync(account.SmtpHost, account.SmtpPort, SocketOption(account.SmtpUseSsl, account.SmtpPort), cancellationToken);
        Authenticate(account, secret, smtp); await smtp.DisconnectAsync(true, cancellationToken);
    }

    public async Task<MimeMessage> SendAsync(MailAccount account, SendEmailRequest request, CancellationToken cancellationToken)
    {
        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(account.DisplayName, account.EmailAddress));
        foreach (var address in request.To.Where(x => !string.IsNullOrWhiteSpace(x))) message.To.Add(MailboxAddress.Parse(address));
        message.Subject = request.Subject.Trim();
        if (!string.IsNullOrWhiteSpace(request.InReplyTo)) { message.InReplyTo = request.InReplyTo; message.References.Add(request.InReplyTo); }
        var builder = new BodyBuilder { HtmlBody = request.HtmlBody, TextBody = request.TextBody };
        const long maxAttachmentBytes = 10 * 1024 * 1024;
        long totalBytes = 0;
        foreach (var attachment in request.Attachments ?? Array.Empty<OutgoingEmailAttachment>())
        {
            if (string.IsNullOrWhiteSpace(attachment.ContentBase64) || string.IsNullOrWhiteSpace(attachment.FileName)) continue;
            byte[] bytes;
            try { bytes = Convert.FromBase64String(attachment.ContentBase64); }
            catch (FormatException) { throw new InvalidOperationException($"El adjunto «{attachment.FileName}» no es válido."); }
            totalBytes += bytes.LongLength;
            if (totalBytes > maxAttachmentBytes)
                throw new InvalidOperationException("Los adjuntos superan el tope de 10 MB.");
            var contentType = string.IsNullOrWhiteSpace(attachment.ContentType) ? "application/octet-stream" : attachment.ContentType;
            builder.Attachments.Add(attachment.FileName.Trim(), bytes, ContentType.Parse(contentType));
        }
        message.Body = builder.ToMessageBody();
        using var smtp = new SmtpClient();
        await smtp.ConnectAsync(account.SmtpHost, account.SmtpPort, SocketOption(account.SmtpUseSsl, account.SmtpPort), cancellationToken);
        Authenticate(account, secrets.Unprotect(account.ProtectedSecret), smtp);
        await smtp.SendAsync(message, cancellationToken); await smtp.DisconnectAsync(true, cancellationToken);
        return message;
    }

    public async Task<IReadOnlyList<MimeMessage>> ReceiveRecentAsync(MailAccount account, DateTime? sinceUtc, CancellationToken cancellationToken)
    {
        using var imap = new ImapClient();
        await imap.ConnectAsync(account.ImapHost, account.ImapPort, SocketOption(account.ImapUseSsl, account.ImapPort), cancellationToken);
        Authenticate(account, secrets.Unprotect(account.ProtectedSecret), imap);
        await imap.Inbox.OpenAsync(FolderAccess.ReadOnly, cancellationToken);
        var query = sinceUtc.HasValue ? SearchQuery.DeliveredAfter(sinceUtc.Value.Date) : SearchQuery.All;
        var ids = await imap.Inbox.SearchAsync(query, cancellationToken);
        var recent = ids.TakeLast(100).ToArray();
        var messages = new List<MimeMessage>(recent.Length);
        foreach (var id in recent) messages.Add(await imap.Inbox.GetMessageAsync(id, cancellationToken));
        await imap.DisconnectAsync(true, cancellationToken);
        return messages;
    }

    public static string ThreadKey(MimeMessage message)
    {
        var root = message.References.FirstOrDefault() ?? message.InReplyTo ?? message.MessageId ?? message.Subject ?? Guid.NewGuid().ToString("N");
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(root.Trim().ToLowerInvariant())));
    }
}
