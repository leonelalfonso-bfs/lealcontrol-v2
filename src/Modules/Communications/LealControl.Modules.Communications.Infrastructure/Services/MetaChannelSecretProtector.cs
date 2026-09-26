using LealControl.Modules.Communications.Infrastructure.Domain;
using Microsoft.AspNetCore.DataProtection;

namespace LealControl.Modules.Communications.Infrastructure.Services;

public sealed class MetaChannelSecretProtector(IDataProtectionProvider provider)
{
    private const string Prefix = "dp:v1:";
    private const string Purpose = "LealControl.Communications.MetaChannelToken.v1";

    public string Protect(Guid tenantId, string token) =>
        Prefix + ForTenant(tenantId).Protect(token);

    // Legacy connections stored a plaintext token. Upgrade tracked records when they are used.
    public string ReadAndUpgrade(MetaChannelConnection connection)
    {
        var stored = connection.PageAccessToken;
        if (string.IsNullOrWhiteSpace(stored))
            throw new InvalidOperationException("El canal no tiene un token configurado.");

        if (stored.StartsWith(Prefix, StringComparison.Ordinal))
            return ForTenant(connection.TenantId).Unprotect(stored[Prefix.Length..]);

        connection.PageAccessToken = Protect(connection.TenantId, stored);
        return stored;
    }

    private IDataProtector ForTenant(Guid tenantId) =>
        provider.CreateProtector(Purpose).CreateProtector(tenantId.ToString("N"));
}
