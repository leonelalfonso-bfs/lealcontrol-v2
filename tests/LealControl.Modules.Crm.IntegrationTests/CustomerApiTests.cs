using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class CustomerApiTests : IClassFixture<CrmWebApplicationFactory>
{
    private readonly HttpClient _client;

    public CustomerApiTests(CrmWebApplicationFactory factory) => _client = factory.CreateClient();

    [Fact]
    public async Task Register_and_get_customer()
    {
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

        var created = await _client.PostAsJsonAsync("/api/v1/crm/customers", payload);
        created.StatusCode.Should().Be(HttpStatusCode.Created);

        var body = await created.Content.ReadFromJsonAsync<CustomerResponse>();
        body.Should().NotBeNull();
        body!.LegalName.Should().Be("Acme SA");
        body.DocumentNumber.Should().Be("20123456786");

        var fetched = await _client.GetAsync($"/api/v1/crm/customers/{body.Id}");
        fetched.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Duplicate_cuit_is_conflict()
    {
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

        (await _client.PostAsJsonAsync("/api/v1/crm/customers", payload)).StatusCode.Should().Be(HttpStatusCode.Created);
        (await _client.PostAsJsonAsync("/api/v1/crm/customers", payload)).StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    private sealed record CustomerResponse(Guid Id, string LegalName, string DocumentNumber);
}
