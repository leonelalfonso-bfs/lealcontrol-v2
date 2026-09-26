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
    public bool IsActive { get; private set; }
    public bool AutoSyncEnabled { get; private set; }
    public bool IsDefaultSender { get; private set; }
    public DateTime? LastSyncAtUtc { get; private set; }
    public string? LastError { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }

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
        IsActive = settings.IsActive;
        IsDefaultSender = settings.IsDefaultSender;
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
    string? Username, bool IsActive, bool IsDefaultSender);
