using System.Text;
using System.Text.Json;
using LealControl.Modules.Communications.Infrastructure.Domain;
using Microsoft.Extensions.Configuration;

namespace LealControl.Modules.Communications.Infrastructure.Services;

public sealed record MailOAuthProviderStatus(string Provider, bool Configured, string Label);

public sealed record MailOAuthTokenResult(
    string AccessToken,
    string? RefreshToken,
    DateTime? ExpiresAtUtc,
    string? EmailAddress);

public sealed class MailOAuthService(IConfiguration configuration, MailSecretProtector secrets, IHttpClientFactory httpClientFactory)
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    public IReadOnlyList<MailOAuthProviderStatus> ListProviders() =>
    [
        new("Google", IsConfigured("Google"), "Google"),
        new("Microsoft", IsConfigured("Microsoft"), "Microsoft")
    ];

    public bool IsConfigured(string provider) =>
        !string.IsNullOrWhiteSpace(ClientId(provider)) && !string.IsNullOrWhiteSpace(ClientSecret(provider));

    public string BuildAuthorizationUrl(string provider, Guid accountId, Guid tenantId, string returnPath)
    {
        EnsureConfigured(provider);
        var state = EncodeState(new OAuthState(accountId, tenantId, NormalizeProvider(provider), returnPath));
        var redirectUri = RedirectUri();
        return NormalizeProvider(provider) switch
        {
            "Google" =>
                "https://accounts.google.com/o/oauth2/v2/auth"
                + $"?client_id={Uri.EscapeDataString(ClientId("Google")!)}"
                + $"&redirect_uri={Uri.EscapeDataString(redirectUri)}"
                + "&response_type=code"
                + "&access_type=offline"
                + "&prompt=consent"
                + $"&scope={Uri.EscapeDataString("https://mail.google.com/ openid email profile")}"
                + $"&state={Uri.EscapeDataString(state)}",
            "Microsoft" =>
                "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
                + $"?client_id={Uri.EscapeDataString(ClientId("Microsoft")!)}"
                + $"&redirect_uri={Uri.EscapeDataString(redirectUri)}"
                + "&response_type=code"
                + "&response_mode=query"
                + $"&scope={Uri.EscapeDataString("offline_access https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send openid email profile")}"
                + $"&state={Uri.EscapeDataString(state)}",
            _ => throw new InvalidOperationException("Proveedor OAuth no soportado.")
        };
    }

    public OAuthState DecodeState(string state)
    {
        try
        {
            var json = Encoding.UTF8.GetString(Convert.FromBase64String(state));
            return JsonSerializer.Deserialize<OAuthState>(json, JsonOptions)
                   ?? throw new InvalidOperationException("Estado OAuth inválido.");
        }
        catch (Exception ex) when (ex is FormatException or JsonException)
        {
            throw new InvalidOperationException("Estado OAuth inválido.", ex);
        }
    }

    public async Task<MailOAuthTokenResult> ExchangeCodeAsync(string provider, string code, CancellationToken cancellationToken)
    {
        EnsureConfigured(provider);
        var normalized = NormalizeProvider(provider);
        var tokenEndpoint = normalized == "Google"
            ? "https://oauth2.googleapis.com/token"
            : "https://login.microsoftonline.com/common/oauth2/v2.0/token";

        var form = new Dictionary<string, string>
        {
            ["client_id"] = ClientId(normalized)!,
            ["client_secret"] = ClientSecret(normalized)!,
            ["code"] = code,
            ["redirect_uri"] = RedirectUri(),
            ["grant_type"] = "authorization_code"
        };

        var payload = await PostFormAsync(tokenEndpoint, form, cancellationToken);
        return ToTokenResult(payload);
    }

    public async Task EnsureFreshAccessTokenAsync(MailAccount account, CancellationToken cancellationToken)
    {
        if (account.AuthMode != MailAuthMode.OAuth2) return;
        if (string.IsNullOrWhiteSpace(account.ProtectedRefreshToken)) return;
        if (account.OAuthAccessTokenExpiresAtUtc is null) return;
        if (account.OAuthAccessTokenExpiresAtUtc > DateTime.UtcNow.AddMinutes(2)) return;

        var provider = account.Provider == MailProvider.Gmail ? "Google"
            : account.Provider == MailProvider.Microsoft ? "Microsoft"
            : null;
        if (provider is null || !IsConfigured(provider)) return;

        var refreshToken = secrets.Unprotect(account.ProtectedRefreshToken);
        var tokenEndpoint = provider == "Google"
            ? "https://oauth2.googleapis.com/token"
            : "https://login.microsoftonline.com/common/oauth2/v2.0/token";
        var form = new Dictionary<string, string>
        {
            ["client_id"] = ClientId(provider)!,
            ["client_secret"] = ClientSecret(provider)!,
            ["refresh_token"] = refreshToken,
            ["grant_type"] = "refresh_token"
        };
        var payload = await PostFormAsync(tokenEndpoint, form, cancellationToken);
        var result = ToTokenResult(payload);
        account.RefreshOAuthAccessToken(
            secrets.Protect(result.AccessToken),
            string.IsNullOrWhiteSpace(result.RefreshToken) ? null : secrets.Protect(result.RefreshToken),
            result.ExpiresAtUtc,
            DateTime.UtcNow);
    }

    public string ProtectAccessToken(string accessToken) => secrets.Protect(accessToken);
    public string? ProtectRefreshToken(string? refreshToken) =>
        string.IsNullOrWhiteSpace(refreshToken) ? null : secrets.Protect(refreshToken);

    public string ResolveFrontendReturnUrl(string returnPath, string query)
    {
        var frontend = (configuration["FrontendBaseUrl"]
            ?? Environment.GetEnvironmentVariable("FRONTEND_BASE_URL")
            ?? configuration["PublicBaseUrl"]
            ?? Environment.GetEnvironmentVariable("PUBLIC_BASE_URL")
            ?? "https://v2.lealcontrol.com").Trim().TrimEnd('/');
        var path = string.IsNullOrWhiteSpace(returnPath) ? "/configuracion/correo" : returnPath.Trim();
        if (path.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
            path.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            return AppendQuery(path, query);
        if (!path.StartsWith('/')) path = "/" + path;
        return AppendQuery(frontend + path, query);
    }

    private static string AppendQuery(string url, string query)
    {
        if (string.IsNullOrWhiteSpace(query)) return url;
        return url.Contains('?', StringComparison.Ordinal) ? $"{url}&{query}" : $"{url}?{query}";
    }

    private async Task<JsonElement> PostFormAsync(string url, Dictionary<string, string> form, CancellationToken cancellationToken)
    {
        var client = httpClientFactory.CreateClient(nameof(MailOAuthService));
        using var content = new FormUrlEncodedContent(form);
        using var response = await client.PostAsync(url, content, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException($"El proveedor OAuth rechazó la solicitud ({(int)response.StatusCode}).");
        using var doc = JsonDocument.Parse(body);
        return doc.RootElement.Clone();
    }

    private MailOAuthTokenResult ToTokenResult(JsonElement payload)
    {
        var accessToken = payload.GetProperty("access_token").GetString()
            ?? throw new InvalidOperationException("El proveedor no devolvió access_token.");
        var refreshToken = payload.TryGetProperty("refresh_token", out var refreshEl) ? refreshEl.GetString() : null;
        DateTime? expiresAt = null;
        if (payload.TryGetProperty("expires_in", out var expiresEl) && expiresEl.TryGetInt32(out var seconds))
            expiresAt = DateTime.UtcNow.AddSeconds(seconds);
        string? email = null;
        if (payload.TryGetProperty("id_token", out var idTokenEl))
            email = TryReadEmailFromIdToken(idTokenEl.GetString());
        return new MailOAuthTokenResult(accessToken, refreshToken, expiresAt, email);
    }

    private static string? TryReadEmailFromIdToken(string? idToken)
    {
        if (string.IsNullOrWhiteSpace(idToken)) return null;
        var parts = idToken.Split('.');
        if (parts.Length < 2) return null;
        try
        {
            var payload = parts[1].Replace('-', '+').Replace('_', '/');
            switch (payload.Length % 4)
            {
                case 2: payload += "=="; break;
                case 3: payload += "="; break;
            }
            using var doc = JsonDocument.Parse(Encoding.UTF8.GetString(Convert.FromBase64String(payload)));
            if (doc.RootElement.TryGetProperty("email", out var email)) return email.GetString();
        }
        catch
        {
            return null;
        }
        return null;
    }

    private void EnsureConfigured(string provider)
    {
        if (!IsConfigured(provider))
            throw new InvalidOperationException(
                $"OAuth de {NormalizeProvider(provider)} no está configurado. Definí ClientId y ClientSecret en el servidor.");
    }

    private string? ClientId(string provider) =>
        configuration[$"Communications:OAuth:{NormalizeProvider(provider)}:ClientId"]
        ?? Environment.GetEnvironmentVariable($"COMMUNICATIONS_OAUTH_{NormalizeProvider(provider).ToUpperInvariant()}_CLIENT_ID");

    private string? ClientSecret(string provider) =>
        configuration[$"Communications:OAuth:{NormalizeProvider(provider)}:ClientSecret"]
        ?? Environment.GetEnvironmentVariable($"COMMUNICATIONS_OAUTH_{NormalizeProvider(provider).ToUpperInvariant()}_CLIENT_SECRET");

    private string RedirectUri()
    {
        var configured = configuration["Communications:OAuth:RedirectUri"]
            ?? Environment.GetEnvironmentVariable("COMMUNICATIONS_OAUTH_REDIRECT_URI");
        if (!string.IsNullOrWhiteSpace(configured)) return configured.Trim();
        var publicBase = (configuration["PublicBaseUrl"]
            ?? Environment.GetEnvironmentVariable("PUBLIC_BASE_URL")
            ?? "https://erp.lealcontrol.com").Trim().TrimEnd('/');
        return $"{publicBase}/api/v1/communications/accounts/oauth/callback";
    }

    private static string NormalizeProvider(string provider) =>
        provider.Trim().Equals("Gmail", StringComparison.OrdinalIgnoreCase) ? "Google"
        : provider.Trim().Equals("Google", StringComparison.OrdinalIgnoreCase) ? "Google"
        : provider.Trim().Equals("Microsoft", StringComparison.OrdinalIgnoreCase) ? "Microsoft"
        : throw new InvalidOperationException("Proveedor OAuth no soportado.");

    private static string EncodeState(OAuthState state)
    {
        var json = JsonSerializer.Serialize(state);
        return Convert.ToBase64String(Encoding.UTF8.GetBytes(json));
    }

    public sealed record OAuthState(Guid AccountId, Guid TenantId, string Provider, string ReturnPath);
}
