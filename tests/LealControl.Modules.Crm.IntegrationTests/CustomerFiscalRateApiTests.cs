using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class CustomerFiscalRateApiTests : IAsyncLifetime
{
    private readonly CrmWebApplicationFactory _factory = new();

    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    [Fact]
    public async Task Invalid_or_incomplete_rate_cannot_replace_an_existing_exclusion()
    {
        using var client = _factory.CreateAuthenticatedClient();
        using var created = await client.PostAsJsonAsync("/api/v1/crm/customers", new
        {
            legalName = "Cliente fiscal de prueba",
            documentType = "Cuit",
            documentNumber = "20123456786",
            taxCondition = "ResponsableInscripto",
            iibbRegime = "Local",
            isCustomer = true,
            isSupplier = false
        });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        using var customer = JsonDocument.Parse(await created.Content.ReadAsStringAsync());
        var url = $"/api/v1/crm/customers/{customer.RootElement.GetProperty("id").GetGuid()}/fiscal-rates";

        using var saved = await client.PutAsJsonAsync(url, new
        {
            jurisdiction = "Arba",
            perceptionRate = 3m,
            retentionRate = 1.5m,
            hasPerceptionExclusion = true,
            perceptionExclusionExpiresOn = "2026-12-31",
            hasRetentionExclusion = false,
            retentionExclusionExpiresOn = (string?)null,
            exclusionCertificateNumber = "CERT-TEST"
        });
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);

        using var updated = await client.PutAsJsonAsync(url, new
        {
            jurisdiction = "Arba",
            perceptionRate = 4m,
            retentionRate = 1.5m,
            hasPerceptionExclusion = true,
            perceptionExclusionExpiresOn = "2026-12-31",
            hasRetentionExclusion = false,
            retentionExclusionExpiresOn = (string?)null,
            exclusionCertificateNumber = "CERT-TEST"
        });
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);

        foreach (var invalid in new string?[] { null, "NoExiste", "999", "Arba, Agip" })
        {
            using var rejected = await client.PutAsJsonAsync(url, new
            {
                jurisdiction = invalid,
                perceptionRate = 9m,
                retentionRate = 9m,
                hasPerceptionExclusion = false,
                hasRetentionExclusion = false
            });
            Assert.Equal(HttpStatusCode.BadRequest, rejected.StatusCode);
        }

        using var incomplete = await client.PutAsJsonAsync(url, new
        {
            jurisdiction = "Arba", perceptionRate = 9m, retentionRate = 9m
        });
        Assert.Equal(HttpStatusCode.BadRequest, incomplete.StatusCode);

        using var fetched = await client.GetAsync(url.Replace("/fiscal-rates", string.Empty));
        Assert.Equal(HttpStatusCode.OK, fetched.StatusCode);
        using var body = JsonDocument.Parse(await fetched.Content.ReadAsStringAsync());
        var rate = Assert.Single(body.RootElement.GetProperty("fiscalRates").EnumerateArray());
        Assert.Equal("Arba", rate.GetProperty("jurisdiction").GetString());
        Assert.Equal(4m, rate.GetProperty("perceptionRate").GetDecimal());
        Assert.True(rate.GetProperty("hasPerceptionExclusion").GetBoolean());
        Assert.Equal("2026-12-31", rate.GetProperty("perceptionExclusionExpiresOn").GetString());
        Assert.Equal("CERT-TEST", rate.GetProperty("exclusionCertificateNumber").GetString());
    }
}
