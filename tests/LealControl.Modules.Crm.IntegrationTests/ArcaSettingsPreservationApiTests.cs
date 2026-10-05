using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class ArcaSettingsPreservationApiTests : IAsyncLifetime
{
    private readonly CrmWebApplicationFactory _factory = new();
    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    [Theory]
    [InlineData("omitted", true)]
    [InlineData("blank", true)]
    [InlineData("same-certificate", true)]
    [InlineData("replace-pair", true)]
    [InlineData("invalid-certificate", false)]
    [InlineData("mismatched-certificate", false)]
    [InlineData("invalid-key", false)]
    public async Task Saving_environment_preserves_omitted_credentials_and_rejects_invalid_replacements(
        string scenario, bool accepted)
    {
        using var client = _factory.CreateAuthenticatedClient();
        var original = CreatePair();
        using var seed = await client.PostAsJsonAsync("/api/v1/company/settings/arca-certificate", new
        {
            certificateCrt = original.Certificate, certificateKey = original.Key,
            environment = "Homologacion", signerCuit = "30715489629"
        });
        Assert.Equal(HttpStatusCode.OK, seed.StatusCode);
        var before = await ReadStored();
        var replacement = CreatePair();
        var payload = new Dictionary<string, string>
        {
            ["environment"] = "Produccion", ["signerCuit"] = "30715489629"
        };
        switch (scenario)
        {
            case "blank":
                payload["certificateCrt"] = " "; payload["certificateKey"] = " "; break;
            case "same-certificate":
                payload["certificateCrt"] = original.Certificate; break;
            case "replace-pair":
                payload["certificateCrt"] = replacement.Certificate;
                payload["certificateKey"] = replacement.Key; break;
            case "invalid-certificate":
                payload["certificateCrt"] = "invalid pem"; break;
            case "mismatched-certificate":
                payload["certificateCrt"] = replacement.Certificate; break;
            case "invalid-key":
                payload["certificateKey"] = "invalid pem"; break;
        }
        using var response = await client.PostAsJsonAsync("/api/v1/company/settings/arca-certificate", payload);
        Assert.Equal(accepted ? HttpStatusCode.OK : HttpStatusCode.BadRequest, response.StatusCode);
        var after = await ReadStored();
        if (!accepted)
        {
            Assert.Equal(before, after);
            return;
        }
        Assert.Equal("Produccion", after.Environment);
        Assert.Equal(scenario == "replace-pair" ? replacement.Certificate : original.Certificate, after.Certificate);
        Assert.Equal(scenario == "replace-pair" ? replacement.Key : original.Key, after.Key);
        using var reloaded = await client.GetAsync("/api/v1/company/settings");
        Assert.Equal(HttpStatusCode.OK, reloaded.StatusCode);
        using var body = System.Text.Json.JsonDocument.Parse(await reloaded.Content.ReadAsStringAsync());
        Assert.Equal("Produccion", body.RootElement.GetProperty("arcaEnvironment").GetString());
    }

    [Fact]
    public async Task Saving_without_any_stored_certificate_is_rejected()
    {
        using var client = _factory.CreateAuthenticatedClient();
        using var response = await client.PostAsJsonAsync("/api/v1/company/settings/arca-certificate", new
        {
            environment = "Produccion", signerCuit = "30715489629"
        });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var stored = await ReadStored();
        Assert.True(string.IsNullOrWhiteSpace(stored.Certificate));
        Assert.True(string.IsNullOrWhiteSpace(stored.Key));
        Assert.NotEqual("Produccion", stored.Environment);
    }

    private async Task<Stored> ReadStored()
    {
        var connection = _factory.Services.GetRequiredService<IConfiguration>().GetConnectionString("Database");
        await using var db = new NpgsqlConnection(connection);
        await db.OpenAsync();
        await using var query = new NpgsqlCommand("""
            SELECT "ArcaCertificateCrt", "ArcaCertificateKey", "ArcaEnvironment", "UpdatedAtUtc"
            FROM public.tenant_settings WHERE "TenantId" = @tenant
            """, db);
        query.Parameters.AddWithValue("tenant", CrmWebApplicationFactory.DemoTenantId);
        await using var reader = await query.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        return new(reader.IsDBNull(0) ? null : reader.GetString(0),
            reader.IsDBNull(1) ? null : reader.GetString(1), reader.GetString(2), reader.GetDateTime(3));
    }

    private static Pair CreatePair()
    {
        using var rsa = RSA.Create(2048);
        var request = new CertificateRequest("CN=ARCA configuration test", rsa,
            HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        using var certificate = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1), DateTimeOffset.UtcNow.AddDays(2));
        return new(certificate.ExportCertificatePem(), rsa.ExportRSAPrivateKeyPem());
    }

    private sealed record Pair(string Certificate, string Key);
    private sealed record Stored(string? Certificate, string? Key, string Environment, DateTime UpdatedAt);
}
