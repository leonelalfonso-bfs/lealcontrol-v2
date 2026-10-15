using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>
/// Contabilidad C5: costo de ventas por diferencia de inventario (existencias al último costo de compra
/// contra Mercaderías) y bienes de uso con amortización mensual en línea recta.
/// </summary>
public sealed class AccountingInventoryAndAssetsApiTests : IAsyncLifetime
{
    private readonly CrmWebApplicationFactory _factory = new();
    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, body);
        using var doc = JsonDocument.Parse(body);
        return doc.RootElement.Clone();
    }

    private static async Task<string> Rejected(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.BadRequest, body);
        return body;
    }

    private static async Task<Guid> ProductAsync(HttpClient client, string code, decimal cost, decimal stock)
    {
        var product = await Json(await client.PostAsJsonAsync("/api/v1/sales/products", new
        {
            code, name = $"Producto {code}", type = "Product", saleCurrency = "ARS", basePrice = 500m, purchaseCurrency = "ARS",
            costPrice = cost, taxRate = 21m, trackStock = true, minStock = 0m, baseUnit = "UN", hasSerialNumber = false, trackLot = false
        }));
        var id = product.GetProperty("id").GetGuid();
        await Json(await client.PostAsJsonAsync("/api/v1/sales/inventory/adjust", new { productId = id, newPhysicalStock = stock, minimumStock = 0m }));
        return id;
    }

    private static decimal Side(JsonElement entry, string accountCode, string side) =>
        entry.GetProperty("lines").EnumerateArray().Where(l => l.GetProperty("accountCode").GetString() == accountCode)
            .Sum(l => l.GetProperty(side).GetDecimal());

    private static async Task<JsonElement> EntryAsync(HttpClient client, JsonElement created)
    {
        var id = created.GetProperty("id").GetString();
        return (await Json(await client.GetAsync("/api/v1/accounting/journal-entries"))).EnumerateArray()
            .Single(e => e.GetProperty("id").GetString() == id);
    }

    [Fact]
    public async Task Month_end_inventory_is_valued_at_last_purchase_cost_and_adjusts_cost_of_sales()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var withCost = await ProductAsync(client, "A", 50m, 10m);   // sin compras: costo del producto
        var purchased = await ProductAsync(client, "B", 0m, 4m);    // costo de la última compra
        await ProductAsync(client, "C", 0m, 2m);                    // sin costo: vale cero y se avisa
        await Json(await client.PostAsJsonAsync("/api/v1/purchases/invoices", new
        {
            invoiceType = "A", pointOfSale = 9, invoiceNumber = 77L, supplierId = Guid.NewGuid(), supplierName = "Proveedor",
            supplierDocument = "30111222333", supplierTaxCondition = "ResponsableInscripto", issueDate = "2026-09-15", dueDate = "2026-09-30",
            currency = "ARS", exchangeRate = 1m, iibbPerception = 0m, ivaPerception = 0m, otherTaxes = 0m,
            items = new[] { new { productId = purchased, code = "B", description = "Producto B", quantity = 1m, unitPrice = 80m, vatRate = 21m } }
        }));

        // Fecha posterior a todos los movimientos de la prueba (el stock se reconstruye hacia atrás desde hoy).
        var request = new { date = "2030-12-31" };
        var preview = await Json(await client.PostAsJsonAsync("/api/v1/accounting/inventory-valuation/preview", request));
        Assert.Equal(820m, preview.GetProperty("inventoryValue").GetDecimal()); // 10 × 50 + 4 × 80
        Assert.Equal(0m, preview.GetProperty("bookBalance").GetDecimal());
        Assert.Equal(1, preview.GetProperty("withoutCost").GetInt32());
        Assert.Equal("LastPurchase", preview.GetProperty("lines").EnumerateArray().Single(l => l.GetProperty("code").GetString() == "B").GetProperty("costSource").GetString());

        var first = await EntryAsync(client, await Json(await client.PostAsJsonAsync("/api/v1/accounting/inventory-valuation", request)));
        Assert.Equal(820m, Side(first, "1.1.04.001", "debit"));
        Assert.Equal(820m, Side(first, "5.1.01", "credit"));
        Assert.Contains("ya tiene ajuste", await Rejected(await client.PostAsJsonAsync("/api/v1/accounting/inventory-valuation", request)));

        // Se venden 4 de A: al mes siguiente las existencias bajan y el CMV sube.
        await Json(await client.PostAsJsonAsync("/api/v1/sales/inventory/adjust", new { productId = withCost, newPhysicalStock = 6m, minimumStock = 0m }));
        var second = await EntryAsync(client, await Json(await client.PostAsJsonAsync("/api/v1/accounting/inventory-valuation", new { date = "2031-01-31" })));
        Assert.Equal(200m, Side(second, "5.1.01", "debit"));
        Assert.Equal(200m, Side(second, "1.1.04.001", "credit"));
    }

    [Fact]
    public async Task Fixed_assets_depreciate_monthly_in_straight_line_until_disposed()
    {
        using var client = _factory.CreateAuthenticatedClient();
        object Asset(string code, decimal cost, decimal residual, string accumulated = "1.2.01.005") => new
        {
            code, name = "Balanza de camiones", acquisitionDate = "2026-01-15", cost, residualValue = residual, usefulLifeMonths = 12,
            assetAccountCode = "1.2.01.002", accumulatedAccountCode = accumulated, expenseAccountCode = "5.2.08"
        };
        Assert.Contains("valor residual", await Rejected(await client.PostAsJsonAsync("/api/v1/accounting/fixed-assets", Asset("M1", 1000m, 1000m))));
        Assert.Contains("no existen", await Rejected(await client.PostAsJsonAsync("/api/v1/accounting/fixed-assets", Asset("M1", 1000m, 0m, "9.9.99"))));
        var asset = await Json(await client.PostAsJsonAsync("/api/v1/accounting/fixed-assets", Asset("M1", 12000m, 0m)));
        Assert.Equal(1000m, asset.GetProperty("monthlyDepreciation").GetDecimal());
        Assert.Contains("Ya hay un bien", await Rejected(await client.PostAsJsonAsync("/api/v1/accounting/fixed-assets", Asset("M1", 500m, 0m))));

        Assert.Contains("último día", await Rejected(await client.PostAsJsonAsync("/api/v1/accounting/fixed-assets/depreciation/preview", new { date = "2026-03-15" })));
        // Enero (mes de alta, entero), febrero y marzo.
        var preview = await Json(await client.PostAsJsonAsync("/api/v1/accounting/fixed-assets/depreciation/preview", new { date = "2026-03-31" }));
        Assert.Equal(3000m, preview.GetProperty("total").GetDecimal());
        var entry = await EntryAsync(client, await Json(await client.PostAsJsonAsync("/api/v1/accounting/fixed-assets/depreciation", new { date = "2026-03-31" })));
        Assert.Equal(3000m, Side(entry, "5.2.08", "debit"));
        Assert.Equal(3000m, Side(entry, "1.2.01.005", "credit"));
        Assert.Contains("ya tiene amortización", await Rejected(await client.PostAsJsonAsync("/api/v1/accounting/fixed-assets/depreciation", new { date = "2026-03-31" })));

        var id = asset.GetProperty("id").GetGuid();
        Assert.Contains("ya tiene amortizaciones", await Rejected(await client.PutAsJsonAsync($"/api/v1/accounting/fixed-assets/{id}", Asset("M1", 15000m, 0m))));

        // Baja en abril: abril se amortiza; mayo y junio, no.
        await Json(await client.PostAsJsonAsync($"/api/v1/accounting/fixed-assets/{id}/dispose", new { date = "2026-04-10" }));
        var june = await Json(await client.PostAsJsonAsync("/api/v1/accounting/fixed-assets/depreciation/preview", new { date = "2026-06-30" }));
        Assert.Equal(1000m, june.GetProperty("total").GetDecimal());
        await Json(await client.PostAsJsonAsync("/api/v1/accounting/fixed-assets/depreciation", new { date = "2026-06-30" }));
        var list = await Json(await client.GetAsync("/api/v1/accounting/fixed-assets"));
        Assert.Equal(4000m, list[0].GetProperty("accumulatedDepreciation").GetDecimal());
        Assert.Equal(8000m, list[0].GetProperty("bookValue").GetDecimal());
    }
}
