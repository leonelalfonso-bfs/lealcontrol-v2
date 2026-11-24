using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Npgsql;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>Reinicio de Compras y Ventas sin CAE: borra lo operativo y deja el stock como si no hubiera pasado.</summary>
public sealed class OperationalResetApiTests : IAsyncLifetime
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

    private static async Task<decimal> StockAsync(HttpClient client, Guid productId) =>
        (await Json(await client.GetAsync("/api/v1/sales/inventory"))).EnumerateArray()
            .Where(s => s.GetProperty("productId").GetGuid() == productId).Sum(s => s.GetProperty("physicalStock").GetDecimal());

    [Fact]
    public async Task Reset_removes_purchases_and_unauthorized_sales_and_restores_stock()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var productId = (await Json(await client.PostAsJsonAsync("/api/v1/sales/products", new
        {
            code = "RST-1", name = "Producto reinicio", type = "Product", saleCurrency = "ARS", basePrice = 100m, purchaseCurrency = "ARS",
            costPrice = 50m, taxRate = 21m, trackStock = true, minStock = 0m, baseUnit = "UN", hasSerialNumber = false, trackLot = false
        }))).GetProperty("id").GetGuid();
        await Json(await client.PostAsJsonAsync("/api/v1/sales/inventory/adjust", new { productId, newPhysicalStock = 10m, minimumStock = 0m }));

        var supplierId = Guid.NewGuid();
        await Json(await client.PostAsJsonAsync("/api/v1/purchases/receptions", new
        {
            supplierId, supplierName = "Proveedor Ficticio", receptionDate = "2026-11-02T00:00:00Z", warehouseLocation = "Depósito Central",
            items = new[] { new { productId, code = "RST-1", description = "Producto reinicio", quantity = 5m } }
        }));
        await Json(await client.PostAsJsonAsync("/api/v1/purchases/invoices", new
        {
            invoiceType = "A", pointOfSale = 1, invoiceNumber = 10, supplierId, supplierName = "Proveedor Ficticio",
            supplierDocument = "30111222333", supplierTaxCondition = "ResponsableInscripto",
            issueDate = "2026-11-02T00:00:00Z", dueDate = "2026-11-02T00:00:00Z", currency = "ARS", exchangeRate = 1m,
            iibbPerception = 0m, ivaPerception = 0m, otherTaxes = 0m,
            items = new[] { new { code = "RST-1", description = "Producto", quantity = 5m, unitPrice = 50m, vatRate = 21m } }
        }));

        object Sale(decimal quantity) => new
        {
            invoiceType = "B", pointOfSale = 3, customerId = Guid.NewGuid(), customerName = "Cliente Ficticio", customerDocument = "20123456786",
            customerTaxCondition = "ConsumidorFinal", issueDate = "2026-11-03", dueDate = "2026-11-03", fiscalConcept = 1, currency = "ARS",
            exchangeRate = 1m, restockItems = false,
            items = new[] { new { productId, code = "RST-1", description = "Producto", quantity, unitPrice = 100m, vatRate = 21m } }
        };
        var authorized = (await Json(await client.PostAsJsonAsync("/api/v1/sales/invoices", Sale(1m)))).GetProperty("id").GetGuid();
        await using (var db = new NpgsqlConnection(_factory.DatabaseConnectionString))
        {
            await db.OpenAsync();
            await using var cmd = new NpgsqlCommand("""UPDATE sales.invoices SET "Status" = 'Authorized', "Cae" = '76000000000009' WHERE "Id" = @id""", db);
            cmd.Parameters.AddWithValue("id", authorized);
            await cmd.ExecuteNonQueryAsync();
        }
        await Json(await client.PostAsJsonAsync("/api/v1/sales/invoices", Sale(3m))); // borrador: descontó 3
        Assert.Equal(10m + 5m - 1m - 3m, await StockAsync(client, productId));

        var preview = await Json(await client.GetAsync("/api/v1/purchases/operational-reset"));
        Assert.Equal(1, preview.GetProperty("salesDrafts").GetInt32());
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/v1/purchases/operational-reset", new { confirm = "no" })).StatusCode);
        await Json(await client.PostAsJsonAsync("/api/v1/purchases/operational-reset", new { confirm = "BORRAR COMPRAS Y FINANZAS" }));

        // Queda solo la venta con CAE: el stock es el inicial menos lo que se vendió de verdad.
        Assert.Equal(10m - 1m, await StockAsync(client, productId));
        Assert.Empty((await Json(await client.GetAsync("/api/v1/purchases/invoices"))).EnumerateArray());
        var after = await Json(await client.GetAsync("/api/v1/purchases/operational-reset"));
        Assert.Equal(0, after.GetProperty("receptions").GetInt32());
        Assert.Equal(0, after.GetProperty("salesDrafts").GetInt32());
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/v1/sales/invoices/{authorized}")).StatusCode);
    }
}
