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

    /// <summary>Un mail leído por IMAP y si es nuestro (de la carpeta de enviados) o recibido.</summary>
    public sealed record ReceivedMail(MimeMessage Message, bool Outgoing, DateTimeOffset? ServerDate);

    /// <summary>Nombres habituales de la carpeta de enviados cuando el servidor no la marca (DonWeb usa "INBOX.Sent").</summary>
    internal static readonly string[] SentFolderNames = ["Sent", "INBOX.Sent", "Enviados", "INBOX.Enviados", "Sent Items", "Elementos enviados", "Sent Messages"];

    /// <summary>
    /// Los últimos mails de las carpetas de entrada configuradas y de la carpeta de enviados (para saber qué se
    /// respondió, también desde Thunderbird u otro programa). Todo en modo lectura: no marca ni mueve nada.
    /// </summary>
    public async Task<IReadOnlyList<ReceivedMail>> ReceiveRecentAsync(MailAccount account, DateTime? sinceUtc, CancellationToken cancellationToken)
    {
        using var imap = new ImapClient();
        await imap.ConnectAsync(account.ImapHost, account.ImapPort, SocketOption(account.ImapUseSsl, account.ImapPort), cancellationToken);
        Authenticate(account, secrets.Unprotect(account.ProtectedSecret), imap);
        var query = sinceUtc.HasValue ? SearchQuery.DeliveredAfter(sinceUtc.Value.Date) : SearchQuery.All;
        var messages = new List<ReceivedMail>();

        foreach (var name in account.IncomingFolderList)
        {
            var folder = string.Equals(name, MailAccount.DefaultIncomingFolder, StringComparison.OrdinalIgnoreCase)
                ? imap.Inbox
                : await TryGetFolderAsync(imap, name, cancellationToken);
            if (folder is not null) await ReadAsync(folder, query, outgoing: false, messages, cancellationToken);
        }

        var sent = await FindSentFolderAsync(imap, account.SentFolder, cancellationToken);
        if (sent is not null) await ReadAsync(sent, query, outgoing: true, messages, cancellationToken);

        await imap.DisconnectAsync(true, cancellationToken);
        return messages;
    }

    private static async Task ReadAsync(IMailFolder folder, SearchQuery query, bool outgoing, List<ReceivedMail> into, CancellationToken ct)
    {
        await folder.OpenAsync(FolderAccess.ReadOnly, ct);
        var ids = (await folder.SearchAsync(query, ct)).TakeLast(100).ToList();
        if (ids.Count == 0) { await folder.CloseAsync(false, ct); return; }
        // La fecha en que el servidor recibió cada mail: respaldo cuando el mail no trae fecha o trae una del futuro.
        var summaries = await folder.FetchAsync(ids, MessageSummaryItems.UniqueId | MessageSummaryItems.InternalDate, ct);
        foreach (var summary in summaries)
            into.Add(new ReceivedMail(await folder.GetMessageAsync(summary.UniqueId, ct), outgoing, summary.InternalDate));
        await folder.CloseAsync(false, ct);
    }

    private static async Task<IMailFolder?> TryGetFolderAsync(ImapClient imap, string name, CancellationToken ct)
    {
        try { return await imap.GetFolderAsync(name, ct); }
        catch (FolderNotFoundException) { return null; }
    }

    /// <summary>La configurada; si no, la que el servidor marca como enviados; si no, la primera con un nombre habitual.</summary>
    private static async Task<IMailFolder?> FindSentFolderAsync(ImapClient imap, string? configured, CancellationToken ct)
    {
        if (!string.IsNullOrWhiteSpace(configured)) return await TryGetFolderAsync(imap, configured, ct);
        if ((imap.Capabilities & (ImapCapabilities.SpecialUse | ImapCapabilities.XList)) != 0)
        {
            try { if (imap.GetFolder(SpecialFolder.Sent) is { } special) return special; }
            catch (NotSupportedException) { }
        }
        foreach (var name in SentFolderNames)
            if (await TryGetFolderAsync(imap, name, ct) is { } folder) return folder;
        return null;
    }

    public static string ThreadKey(MimeMessage message)
    {
        var root = message.References.FirstOrDefault() ?? message.InReplyTo ?? message.MessageId ?? message.Subject ?? Guid.NewGuid().ToString("N");
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(root.Trim().ToLowerInvariant())));
    }
}
