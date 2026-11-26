namespace LealControl.Modules.Communications.Infrastructure.Domain;

public enum MailProvider { Custom, Gmail, Microsoft, Yahoo }
public enum MailAuthMode { Password, AppPassword, OAuth2 }

public sealed class MailAccount
{
    private MailAccount() { }

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public string DisplayName { get; private set; } = string.Empty;
    public string EmailAddress { get; private set; } = string.Empty;
    public MailProvider Provider { get; private set; }
    public MailAuthMode AuthMode { get; private set; }
    public string ImapHost { get; private set; } = string.Empty;
    public int ImapPort { get; private set; }
    public bool ImapUseSsl { get; private set; }
    public string SmtpHost { get; private set; } = string.Empty;
    public int SmtpPort { get; private set; }
    public bool SmtpUseSsl { get; private set; }
    public string Username { get; private set; } = string.Empty;
    public string ProtectedSecret { get; private set; } = string.Empty;
    public string? ProtectedRefreshToken { get; private set; }
    public DateTime? OAuthAccessTokenExpiresAtUtc { get; private set; }
    public DateTime? OAuthConnectedAtUtc { get; private set; }
    public string? Signature { get; private set; }
    public string? SignatureLogoUrl { get; private set; }
    /// <summary>Carpetas IMAP de entrada a leer, separadas por coma (por defecto la bandeja de entrada).</summary>
    public string IncomingFolders { get; private set; } = DefaultIncomingFolder;
    /// <summary>Carpeta de enviados; vacía = se detecta sola. Sirve para saber qué mails ya se respondieron.</summary>
    public string? SentFolder { get; private set; }

    public const string DefaultIncomingFolder = "INBOX";

    public IReadOnlyList<string> IncomingFolderList =>
        IncomingFolders.Split([',', ';'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries) is { Length: > 0 } folders
            ? folders : [DefaultIncomingFolder];
    public bool IsActive { get; private set; }
    public bool AutoSyncEnabled { get; private set; }
    public bool IsDefaultSender { get; private set; }
    public DateTime? LastSyncAtUtc { get; private set; }
    public string? LastError { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }

    public bool IsOAuthConnected =>
        AuthMode == MailAuthMode.OAuth2 &&
        OAuthConnectedAtUtc.HasValue &&
        !string.IsNullOrWhiteSpace(ProtectedSecret);

    public static MailAccount Create(Guid tenantId, MailAccountSettings settings, string protectedSecret, DateTime utcNow)
    {
        var account = new MailAccount { Id = Guid.NewGuid(), TenantId = tenantId, CreatedAtUtc = utcNow };
        account.Update(settings, protectedSecret, utcNow);
        return account;
    }

    public void Update(MailAccountSettings settings, string? protectedSecret, DateTime utcNow)
    {
        DisplayName = settings.DisplayName.Trim();
        EmailAddress = settings.EmailAddress.Trim().ToLowerInvariant();
        Provider = settings.Provider;
        AuthMode = settings.AuthMode;
        ImapHost = settings.ImapHost.Trim();
        ImapPort = settings.ImapPort;
        ImapUseSsl = settings.ImapUseSsl;
        SmtpHost = settings.SmtpHost.Trim();
        SmtpPort = settings.SmtpPort;
        SmtpUseSsl = settings.SmtpUseSsl;
        Username = string.IsNullOrWhiteSpace(settings.Username) ? EmailAddress : settings.Username.Trim();
        if (!string.IsNullOrWhiteSpace(protectedSecret)) ProtectedSecret = protectedSecret;
        Signature = string.IsNullOrWhiteSpace(settings.Signature) ? null : settings.Signature.Trim();
        SignatureLogoUrl = string.IsNullOrWhiteSpace(settings.SignatureLogoUrl) ? null : settings.SignatureLogoUrl.Trim();
        IncomingFolders = string.IsNullOrWhiteSpace(settings.IncomingFolders) ? DefaultIncomingFolder : settings.IncomingFolders.Trim();
        SentFolder = string.IsNullOrWhiteSpace(settings.SentFolder) ? null : settings.SentFolder.Trim();
        IsActive = settings.IsActive;
        IsDefaultSender = settings.IsDefaultSender;
        UpdatedAtUtc = utcNow;
    }

    public void ConnectOAuth(string protectedAccessToken, string? protectedRefreshToken, DateTime? expiresAtUtc, DateTime utcNow)
    {
        ProtectedSecret = protectedAccessToken;
        ProtectedRefreshToken = protectedRefreshToken;
        OAuthAccessTokenExpiresAtUtc = expiresAtUtc;
        OAuthConnectedAtUtc = utcNow;
        AuthMode = MailAuthMode.OAuth2;
        LastError = null;
        UpdatedAtUtc = utcNow;
    }

    public void RefreshOAuthAccessToken(string protectedAccessToken, string? protectedRefreshToken, DateTime? expiresAtUtc, DateTime utcNow)
    {
        ProtectedSecret = protectedAccessToken;
        if (!string.IsNullOrWhiteSpace(protectedRefreshToken))
            ProtectedRefreshToken = protectedRefreshToken;
        OAuthAccessTokenExpiresAtUtc = expiresAtUtc;
        UpdatedAtUtc = utcNow;
    }

    public void DisconnectOAuth(DateTime utcNow)
    {
        ProtectedSecret = string.Empty;
        ProtectedRefreshToken = null;
        OAuthAccessTokenExpiresAtUtc = null;
        OAuthConnectedAtUtc = null;
        UpdatedAtUtc = utcNow;
    }

    public void SetAutoSyncEnabled(bool enabled, DateTime utcNow)
    {
        AutoSyncEnabled = enabled;
        UpdatedAtUtc = utcNow;
    }

    public void RecordSync(DateTime utcNow) { LastSyncAtUtc = utcNow; LastError = null; UpdatedAtUtc = utcNow; }
    public void RecordError(string error, DateTime utcNow) { LastError = error; UpdatedAtUtc = utcNow; }
}

public sealed record MailAccountSettings(
    string DisplayName, string EmailAddress, MailProvider Provider, MailAuthMode AuthMode,
    string ImapHost, int ImapPort, bool ImapUseSsl,
    string SmtpHost, int SmtpPort, bool SmtpUseSsl,
    string? Username, bool IsActive, bool IsDefaultSender, string? Signature = null,
    string? IncomingFolders = null, string? SentFolder = null, string? SignatureLogoUrl = null);
