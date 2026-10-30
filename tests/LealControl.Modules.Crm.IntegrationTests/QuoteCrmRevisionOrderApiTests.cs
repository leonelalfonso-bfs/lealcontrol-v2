using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>
/// Presupuesto hecho desde Ventas: abre la oportunidad en el CRM, cada cambio sube la revisión (guardar sin cambios no),
/// y el pedido lo deja como "Pedido de venta" y gana la oportunidad.
/// </summary>
public sealed class QuoteCrmRevisionOrderApiTests : IAsyncLifetime
{
    private readonly CrmWebApplicationFactory _factory = new();
    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, body);
        return JsonDocument.Parse(body).RootElement.Clone();
    }

    [Fact]
    public async Task Quote_outside_crm_opens_opportunity_revises_on_change_and_order_wins_it()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var customer = (await Json(await client.PostAsJsonAsync("/api/v1/crm/customers", new
        {
            legalName = "Areneras del Sur SA", documentType = "Cuit", documentNumber = "20123456786",
            taxCondition = "ResponsableInscripto", iibbRegime = "Local", isCustomer = true, isSupplier = false
        }))).GetProperty("id").GetGuid();

        object Body(decimal price) => new
        {
            customerId = customer, locationId = (Guid?)null, contactId = (Guid?)null, opportunityId = (Guid?)null, currency = "USD_BILLETE",
            exchangeRateUsdBillete = 1500m, exchangeRateUsdDivisa = 1480m, discountPercent = 0m, validDays = 15, paymentTerms = "Contado",
            paymentMethod = (string?)null, deliveryTimeDays = (int?)null, transportation = (string?)null, warranty = (string?)null, notes = (string?)null,
            ownerName = "Vendedor", lines = new[] { new { description = "Calibración de báscula", quantity = 1m, unitPrice = price, discountPercent = 0m, taxRate = 21m, isOptional = false, currencyCode = "ARS" } }
        };
        var quote = await Json(await client.PostAsJsonAsync("/api/v1/sales/quotes", Body(100000m)));
        var id = quote.GetProperty("id").GetGuid();
        Assert.Equal(1, quote.GetProperty("revision").GetInt32());
        var opportunityId = quote.GetProperty("opportunityId").GetGuid();

        var opportunity = (await Json(await client.GetAsync($"/api/v1/crm/customers/{customer}/opportunities"))).EnumerateArray().Single();
        Assert.Equal(opportunityId, opportunity.GetProperty("id").GetGuid());
        Assert.Equal("Proposal", opportunity.GetProperty("stage").GetString());
        Assert.Equal("USD", opportunity.GetProperty("currency").GetString());

        // Guardar sin cambios no es revisión nueva; cambiar el precio sí.
        Assert.Equal(1, (await Json(await client.PutAsJsonAsync($"/api/v1/sales/quotes/{id}", Body(100000m)))).GetProperty("revision").GetInt32());
        Assert.Equal(2, (await Json(await client.PutAsJsonAsync($"/api/v1/sales/quotes/{id}", Body(110000m)))).GetProperty("revision").GetInt32());

        await Json(await client.PostAsJsonAsync($"/api/v1/sales/orders/from-quote/{id}", new { includeOptionalLineIds = Array.Empty<Guid>() }));
        Assert.Equal("Ordered", (await Json(await client.GetAsync($"/api/v1/sales/quotes/{id}"))).GetProperty("status").GetString());
        Assert.Equal("Won", (await Json(await client.GetAsync($"/api/v1/crm/customers/{customer}/opportunities"))).EnumerateArray().Single().GetProperty("stage").GetString());
    }
}
