using System.Security.Cryptography;
using LealControl.Modules.Communications.Infrastructure.Domain;
using LealControl.Modules.Communications.Infrastructure.Services;
using Microsoft.AspNetCore.DataProtection;
using Xunit;

namespace LealControl.Modules.Communications.Tests;

public sealed class MetaChannelSecretProtectorTests
{
    private readonly MetaChannelSecretProtector _secrets = new(new EphemeralDataProtectionProvider());

    [Fact]
    public void New_token_is_not_stored_as_plaintext()
    {
        var tenantId = Guid.NewGuid();
        var stored = _secrets.Protect(tenantId, "meta-access-token");
        var connection = MetaChannelConnection.Create(tenantId, "facebook");
        connection.PageAccessToken = stored;

        Assert.DoesNotContain("meta-access-token", stored);
        Assert.Equal("meta-access-token", _secrets.ReadAndUpgrade(connection));
        Assert.Equal(stored, connection.PageAccessToken);
    }

    [Fact]
    public void Existing_plaintext_token_is_upgraded_without_reconnecting()
    {
        var connection = MetaChannelConnection.Create(Guid.NewGuid(), "instagram");
        connection.PageAccessToken = "legacy-token";

        Assert.Equal("legacy-token", _secrets.ReadAndUpgrade(connection));
        Assert.NotEqual("legacy-token", connection.PageAccessToken);
        Assert.Equal("legacy-token", _secrets.ReadAndUpgrade(connection));
    }

    [Fact]
    public void Token_from_another_tenant_cannot_be_read()
    {
        var stored = _secrets.Protect(Guid.NewGuid(), "private-token");
        var connection = MetaChannelConnection.Create(Guid.NewGuid(), "facebook");
        connection.PageAccessToken = stored;

        Assert.Throws<CryptographicException>(() => _secrets.ReadAndUpgrade(connection));
    }
}
