using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class CustomerApiTests : IClassFixture<CrmWebApplicationFactory>
{
    private readonly CrmWebApplicationFactory _factory;

    public CustomerApiTests(CrmWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task Customers_without_token_are_unauthorized()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/v1/crm/customers");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task All_flag_returns_whole_directory_in_one_response()
    {
        var client = _factory.CreateAuthenticatedClient();
        for (var i = 0; i < 3; i++)
        {
            var dni = Random.Shared.Next(10_000_000, 99_999_999).ToString();
            (await client.PostAsJsonAsync("/api/v1/crm/customers", new
            {
                legalName = $"Directorio {dni}", documentType = "Dni", documentNumber = dni, taxCondition = "ConsumidorFinal",
                iibbRegime = "NoInscripto", isCustomer = true, isSupplier = false
            })).IsSuccessStatusCode.Should().BeTrue();
        }

        var paged = await client.GetFromJsonAsync<System.Text.Json.JsonElement>("/api/v1/crm/customers?pageSize=1&role=");
        var all = await client.GetFromJsonAsync<System.Text.Json.JsonElement>("/api/v1/crm/customers?all=true&role=");
        var total = paged.GetProperty("total").GetInt32();
        total.Should().BeGreaterThanOrEqualTo(3);
        all.GetProperty("items").GetArrayLength().Should().Be(total);
        all.GetProperty("total").GetInt32().Should().Be(total);
    }

    [Fact]
    public async Task Register_and_get_customer()
    {
        var client = _factory.CreateAuthenticatedClient();
        var payload = new
        {
            legalName = "Acme SA",
            tradeName = "Acme",
            documentType = "Cuit",
            documentNumber = "20123456786",
            taxCondition = "ResponsableInscripto",
            iibbRegime = "ConvenioMultilateral",
            isCustomer = true,
            isSupplier = false,
            email = "ventas@acme.com",
            phone = "3415551234",
            fiscalStreet = "Mitre 800",
            fiscalCity = "Rosario",
            fiscalProvince = "SantaFe",
            fiscalPostalCode = "2000",
            creditLimit = 1500000,
            paymentTermsDays = 30
        };

        var created = await client.PostAsJsonAsync("/api/v1/crm/customers", payload);
        if (!created.IsSuccessStatusCode)
        {
            var err = await created.Content.ReadAsStringAsync();
            throw new HttpRequestException($"Expected Created, got {(int)created.StatusCode}: {err}");
        }
        created.StatusCode.Should().Be(HttpStatusCode.Created);

        var body = await created.Content.ReadFromJsonAsync<CustomerResponse>();
        body.Should().NotBeNull();
        body!.LegalName.Should().Be("Acme SA");
        body.DocumentNumber.Should().Be("20123456786");

        var fetched = await client.GetAsync($"/api/v1/crm/customers/{body.Id}");
        fetched.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Fiscal_address_without_province_is_rejected()
    {
        var client = _factory.CreateAuthenticatedClient();
        var payload = new
        {
            legalName = "Prueba Provincia SA",
            documentType = "Cuit",
            documentNumber = "20123456786",
            taxCondition = "ResponsableInscripto",
            iibbRegime = "Local",
            isCustomer = true,
            isSupplier = false,
            fiscalStreet = "Mitre 800",
            fiscalCity = "Córdoba",
            fiscalPostalCode = "5000"
        };

        var response = await client.PostAsJsonAsync("/api/v1/crm/customers", payload);
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Duplicate_cuit_is_conflict()
    {
        var client = _factory.CreateAuthenticatedClient();
        var payload = new
        {
            legalName = "Duplicado SA",
            documentType = "Cuit",
            documentNumber = "27123456780",
            taxCondition = "ResponsableInscripto",
            iibbRegime = "Local",
            isCustomer = true,
            isSupplier = false
        };

        (await client.PostAsJsonAsync("/api/v1/crm/customers", payload)).StatusCode.Should().Be(HttpStatusCode.Created);
        (await client.PostAsJsonAsync("/api/v1/crm/customers", payload)).StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    private sealed record CustomerResponse(Guid Id, string LegalName, string DocumentNumber);
}
