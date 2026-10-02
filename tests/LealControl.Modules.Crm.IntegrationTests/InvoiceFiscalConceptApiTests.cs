using System;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.Tasks;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class InvoiceFiscalConceptApiTests : IClassFixture<CrmWebApplicationFactory>
{
    private readonly CrmWebApplicationFactory _factory;
    public InvoiceFiscalConceptApiTests(CrmWebApplicationFactory factory) => _factory = factory;

    private static object Payload(int concept, string? from, string? to, string due = "2026-10-12") => new
    {
        invoiceType = "A", pointOfSale = 1, orderId = (Guid?)null, remitoId = (Guid?)null,
        customerId = Guid.NewGuid(), customerName = "Cliente de integración",
        customerDocument = "20123456789", customerTaxCondition = "ResponsableInscripto",
        customerAddress = "", issueDate = "2026-10-02", dueDate = due,
        fiscalConcept = concept, serviceFrom = from, serviceTo = to,
        currency = "ARS", exchangeRate = 1m, notes = "Prueba sin ARCA",
        items = new[] { new { productId = (Guid?)null, remitoItemId = (Guid?)null,
            code = "SERV-TEST", description = "Servicio de integración", quantity = 1m,
            unitPrice = 1m, vatRate = 21m } }
    };

    [Fact]
    public async Task Service_period_is_persisted_and_returned_without_cae()
    {
        using var client = _factory.CreateAuthenticatedClient();
        using var created = await client.PostAsJsonAsync("/api/v1/sales/invoices", Payload(2, "2026-10-01", "2026-10-02"));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        using var response = await JsonDocument.ParseAsync(await created.Content.ReadAsStreamAsync());
        var id = response.RootElement.GetProperty("id").GetGuid();
        Assert.Equal(2, response.RootElement.GetProperty("fiscalConcept").GetInt32());
        Assert.Equal("Draft", response.RootElement.GetProperty("status").GetString());
        Assert.Equal(JsonValueKind.Null, response.RootElement.GetProperty("cae").ValueKind);

        using var fetched = await client.GetAsync($"/api/v1/sales/invoices/{id}");
        Assert.Equal(HttpStatusCode.OK, fetched.StatusCode);
        using var persisted = await JsonDocument.ParseAsync(await fetched.Content.ReadAsStreamAsync());
        Assert.Equal(2, persisted.RootElement.GetProperty("fiscalConcept").GetInt32());
        Assert.StartsWith("2026-10-01", persisted.RootElement.GetProperty("serviceFrom").GetString());
        Assert.StartsWith("2026-10-02", persisted.RootElement.GetProperty("serviceTo").GetString());
    }

    [Theory]
    [InlineData(2, null, "2026-10-02", "2026-10-12")]
    [InlineData(2, "2026-10-03", "2026-10-02", "2026-10-12")]
    [InlineData(2, "2026-10-01", "2026-10-02", "2026-10-01")]
    [InlineData(1, "2026-10-01", "2026-10-02", "2026-10-12")]
    public async Task Invalid_period_is_rejected(int concept, string? from, string? to, string due)
    {
        using var client = _factory.CreateAuthenticatedClient();
        using var response = await client.PostAsJsonAsync("/api/v1/sales/invoices", Payload(concept, from, to, due));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
