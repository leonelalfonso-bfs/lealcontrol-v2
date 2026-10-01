using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;
using FluentAssertions;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class CompanySettingsSecretsTests : IAsyncLifetime
{
    private readonly CrmWebApplicationFactory _factory = new();

    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    [Fact]
    public async Task Settings_hide_private_key_and_certificate_after_csr_and_upload()
    {
        var admin = _factory.CreateAuthenticatedClient(role: "Admin");
        var csrResponse = await admin.PostAsJsonAsync("/api/v1/company/settings/arca-csr", new
        {
            signerCuit = "20323249017",
            environment = "Homologacion",
            organizationName = "Prueba Integracion",
            commonName = "Prueba"
        });
        csrResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        using var csrJson = JsonDocument.Parse(await csrResponse.Content.ReadAsStringAsync());
        var keyPem = csrJson.RootElement.GetProperty("privateKeyPem").GetString();
        keyPem.Should().NotBeNullOrWhiteSpace();

        await AssertSettingsHideSecrets(admin, hasCertificate: false);
        var commercial = _factory.CreateAuthenticatedClient(role: "Comercial");
        await AssertSettingsHideSecrets(commercial, hasCertificate: false);

        using var rsa = RSA.Create();
        rsa.ImportFromPem(keyPem);
        var request = new CertificateRequest("CN=Prueba Integracion", rsa,
            HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        using var certificate = request.CreateSelfSigned(
            DateTimeOffset.UtcNow.AddMinutes(-5), DateTimeOffset.UtcNow.AddDays(1));
        var certificatePem = certificate.ExportCertificatePem();

        // Empty key means reuse the private key generated and saved with the CSR.
        var upload = await admin.PostAsJsonAsync("/api/v1/company/settings/arca-certificate", new
        {
            certificateCrt = certificatePem,
            certificateKey = "",
            environment = "Homologacion",
            signerCuit = "20323249017"
        });
        upload.StatusCode.Should().Be(HttpStatusCode.OK);

        await AssertSettingsHideSecrets(admin, hasCertificate: true);
        await AssertSettingsHideSecrets(commercial, hasCertificate: true);
    }

    private static async Task AssertSettingsHideSecrets(HttpClient client, bool hasCertificate)
    {
        var response = await client.GetAsync("/api/v1/company/settings");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var settings = json.RootElement;
        settings.GetProperty("arcaCertificateKey").ValueKind.Should().Be(JsonValueKind.Null);
        settings.GetProperty("arcaCertificateCrt").ValueKind.Should().Be(JsonValueKind.Null);
        settings.GetProperty("hasArcaCertificateKey").GetBoolean().Should().BeTrue();
        settings.GetProperty("hasArcaCertificateCrt").GetBoolean().Should().Be(hasCertificate);
    }
}
