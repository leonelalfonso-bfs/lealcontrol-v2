using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>
/// Regla común de búsqueda: sin acentos ni mayúsculas, varias palabras en cualquier orden
/// y CUIT o teléfono por dígitos, con o sin guiones.
/// </summary>
public sealed class CustomerSearchNormalizationTests : IAsyncLifetime
{
    private readonly CrmWebApplicationFactory _factory = new();

    public async Task InitializeAsync()
    {
        await _factory.InitializeAsync();
        var client = _factory.CreateAuthenticatedClient();
        await CreateAsync(client, "Metalúrgica del Sur SA", "Metalsur", "30712345671", "+54 341 555-1234");
        await CreateAsync(client, "Metales del Norte SRL", null, "30709876542", "3416667777");
        await CreateAsync(client, "Panificadora Ñandú SA", null, "30711223343", "3418889999");
    }

    public Task DisposeAsync() => _factory.DisposeAsync();

    [Theory]
    [InlineData("metalurgica", "Metalúrgica del Sur SA")]
    [InlineData("METALÚRGICA", "Metalúrgica del Sur SA")]
    [InlineData("sur metal", "Metalúrgica del Sur SA")]
    [InlineData("metalsur", "Metalúrgica del Sur SA")]
    [InlineData("30-71234567-1", "Metalúrgica del Sur SA")]
    [InlineData("71234", "Metalúrgica del Sur SA")]
    [InlineData("555-1234", "Metalúrgica del Sur SA")]
    [InlineData("nandu", "Panificadora Ñandú SA")]
    [InlineData("norte", "Metales del Norte SRL")]
    public async Task Search_matches_regardless_of_accents_order_and_separators(string search, string expected)
    {
        var names = await SearchAsync(search);
        names.Should().ContainSingle().Which.Should().Be(expected);
    }

    [Fact]
    public async Task Every_word_must_match()
    {
        (await SearchAsync("metal")).Should().HaveCount(2);
        (await SearchAsync("metal norte")).Should().ContainSingle().Which.Should().Be("Metales del Norte SRL");
        (await SearchAsync("metal panificadora")).Should().BeEmpty();
    }

    private async Task<List<string>> SearchAsync(string search)
    {
        var client = _factory.CreateAuthenticatedClient();
        var page = await client.GetFromJsonAsync<PageEnvelope>(
            $"/api/v1/crm/customers?page=1&pageSize=50&role=all&search={Uri.EscapeDataString(search)}");
        return page!.Items.Select(i => i.LegalName).ToList();
    }

    private static async Task CreateAsync(HttpClient client, string legalName, string? tradeName, string cuit, string phone)
    {
        var response = await client.PostAsJsonAsync("/api/v1/crm/customers", new
        {
            legalName,
            tradeName,
            documentType = "Cuit",
            documentNumber = cuit,
            taxCondition = "ResponsableInscripto",
            iibbRegime = "Local",
            isCustomer = true,
            isSupplier = false,
            phone,
            fiscalStreet = "Mitre 800",
            fiscalCity = "Rosario",
            fiscalProvince = "SantaFe",
            fiscalPostalCode = "2000"
        });
        response.StatusCode.Should().Be(HttpStatusCode.Created, await response.Content.ReadAsStringAsync());
    }

    private sealed record PageEnvelope(List<Item> Items);
    private sealed record Item(string LegalName);
}
