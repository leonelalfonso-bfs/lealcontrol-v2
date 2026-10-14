using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>
/// Flota 4a: repuestos de la orden de servicio y remito generado desde la orden. El stock se
/// descuenta una sola vez: por el remito (lo que está en el pedido) o como consumo (el resto).
/// </summary>
public sealed class FleetServiceOrderRemitoApiTests : IAsyncLifetime
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

    private static async Task<Guid> ProductAsync(HttpClient client, string code, string name, string type, bool trackStock, decimal stock)
    {
        var id = (await Json(await client.PostAsJsonAsync("/api/v1/sales/products", new
        {
            code, name, type, saleCurrency = "ARS", basePrice = 1000m, purchaseCurrency = "ARS", costPrice = 500m, taxRate = 21m,
            trackStock, minStock = 0m, baseUnit = "UN", hasSerialNumber = false, trackLot = false
        }))).GetProperty("id").GetGuid();
        if (trackStock)
            await Json(await client.PostAsJsonAsync("/api/v1/sales/inventory/adjust", new { productId = id, newPhysicalStock = stock, minimumStock = 0m }));
        return id;
    }

    private static async Task<decimal> StockAsync(HttpClient client, Guid productId) =>
        (await Json(await client.GetAsync("/api/v1/sales/inventory"))).EnumerateArray()
            .Where(s => s.GetProperty("productId").GetGuid() == productId).Sum(s => s.GetProperty("physicalStock").GetDecimal());

    private static async Task<Guid> CustomerAsync(HttpClient client) =>
        (await Json(await client.PostAsJsonAsync("/api/v1/crm/customers", new
        {
            legalName = "Molinos del Sur SA", documentType = "Cuit", documentNumber = "20123456786",
            taxCondition = "ResponsableInscripto", iibbRegime = "Local", isCustomer = true, isSupplier = false
        }))).GetProperty("id").GetGuid();

    private static async Task<Guid> ServiceOrderAsync(HttpClient client, object body) =>
        (await Json(await client.PostAsJsonAsync("/api/v1/fleet/service-orders", body))).GetProperty("id").GetGuid();

    [Fact]
    public async Task Order_parts_go_in_the_remito_and_the_rest_is_consumed_once()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var customer = await CustomerAsync(client);
        var calibration = await ProductAsync(client, "CAL", "Calibración de balanza", "Service", false, 0);
        var loadCell = await ProductAsync(client, "CEL", "Celda de carga", "Product", true, 5);
        var filter = await ProductAsync(client, "FIL", "Filtro", "Product", true, 10);

        var order = await Json(await client.PostAsJsonAsync("/api/v1/sales/orders", new
        {
            customerId = customer, currency = "ARS", exchangeRateUsdBillete = 1m, exchangeRateUsdDivisa = 1m, discountPercent = 0m,
            lines = new object[]
            {
                new { productId = calibration, description = "Calibración de balanza", quantity = 2m, unitPrice = 1000m, currencyCode = "ARS", discountPercent = 0m, taxRate = 21m, isOptional = false },
                new { productId = loadCell, description = "Celda de carga", quantity = 1m, unitPrice = 1000m, currencyCode = "ARS", discountPercent = 0m, taxRate = 21m, isOptional = false }
            }
        }));
        var orderId = order.GetProperty("id").GetGuid();
        var calibrationLine = order.GetProperty("lines").EnumerateArray().Single(l => l.GetProperty("productId").GetGuid() == calibration).GetProperty("id").GetGuid();

        var os = await ServiceOrderAsync(client, new
        {
            salesOrderId = orderId, description = "Calibración en planta", start = "2026-10-05T08:00:00-03:00", end = "2026-10-05T18:00:00-03:00"
        });
        var items = $"/api/v1/fleet/service-orders/{os}/items";
        await Json(await client.PutAsJsonAsync(items, new
        {
            items = new object[]
            {
                new { productId = loadCell, quantity = 1m, serialNumbers = "SN-001" },
                new { productId = filter, quantity = 2m },
                new { description = "Cinta aisladora", quantity = 1m }
            }
        }));
        Assert.Equal("Celda de carga", (await Json(await client.GetAsync(items)))[0].GetProperty("description").GetString());

        var preview = await Json(await client.GetAsync($"/api/v1/fleet/service-orders/{os}/remito-preview"));
        Assert.True(preview.GetProperty("ready").GetBoolean());
        var destinations = preview.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("destination").GetString()!).ToArray();
        Assert.Equal(["remito", "consumption", "none"], destinations);
        Assert.Equal(2m, preview.GetProperty("orderLines").EnumerateArray().Single(l => l.GetProperty("id").GetGuid() == calibrationLine).GetProperty("pending").GetDecimal());

        using (var tooMuch = await client.PostAsJsonAsync($"/api/v1/fleet/service-orders/{os}/remito", new { lines = new[] { new { orderLineId = calibrationLine, quantity = 3m } } }))
            Assert.Equal(HttpStatusCode.BadRequest, tooMuch.StatusCode);

        var remito = await Json(await client.PostAsJsonAsync($"/api/v1/fleet/service-orders/{os}/remito", new { lines = new[] { new { orderLineId = calibrationLine, quantity = 1m } } }));
        var remitoId = remito.GetProperty("remitoId").GetGuid();
        Assert.Equal(1, remito.GetProperty("consumed").GetInt32());

        // El remito lleva la línea del pedido y la celda (con su número de serie), vinculado al pedido.
        var saved = await Json(await client.GetAsync($"/api/v1/sales/remitos/{remitoId}"));
        Assert.Equal(orderId, saved.GetProperty("orderId").GetGuid());
        var descriptions = saved.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("description").GetString()).ToArray();
        Assert.Contains("Celda de carga (S/N: SN-001)", descriptions);
        Assert.DoesNotContain(descriptions, d => d!.Contains("Filtro"));

        // Stock: la celda sale por el remito y el filtro por consumo, cada uno una sola vez.
        Assert.Equal(4m, await StockAsync(client, loadCell));
        Assert.Equal(8m, await StockAsync(client, filter));
        var kardex = await Json(await client.GetAsync($"/api/v1/sales/inventory/kardex?productId={filter}"));
        Assert.Contains(kardex.EnumerateArray(), m => m.GetProperty("movementType").GetString() == "Consumption" && m.GetProperty("quantity").GetDecimal() == -2m);

        // Ya no se puede repetir ni cambiar los repuestos.
        using (var again = await client.PostAsJsonAsync($"/api/v1/fleet/service-orders/{os}/remito", new { lines = new[] { new { orderLineId = calibrationLine, quantity = 1m } } }))
            Assert.Equal(HttpStatusCode.BadRequest, again.StatusCode);
        using (var edit = await client.PutAsJsonAsync(items, new { items = Array.Empty<object>() }))
            Assert.Equal(HttpStatusCode.BadRequest, edit.StatusCode);
        Assert.Equal(8m, await StockAsync(client, filter));
        var view = await Json(await client.GetAsync($"/api/v1/fleet/service-orders/{os}"));
        Assert.Equal(saved.GetProperty("remitoNumber").GetString(), view.GetProperty("remitoNumber").GetString());
    }

    [Fact]
    public async Task Without_a_sales_order_the_remito_has_the_service_and_every_part()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var customer = await CustomerAsync(client);
        var filter = await ProductAsync(client, "FIL", "Filtro", "Product", true, 10);

        // Sin cliente de la base no hay remito.
        var loose = await ServiceOrderAsync(client, new { customerName = "Cliente suelto", description = "Visita", start = "2026-10-05T08:00:00-03:00", end = "2026-10-05T10:00:00-03:00" });
        Assert.False((await Json(await client.GetAsync($"/api/v1/fleet/service-orders/{loose}/remito-preview"))).GetProperty("ready").GetBoolean());

        var os = await ServiceOrderAsync(client, new { customerId = customer, description = "Cambio de filtros", start = "2026-10-05T08:00:00-03:00", end = "2026-10-05T10:00:00-03:00" });
        await Json(await client.PutAsJsonAsync($"/api/v1/fleet/service-orders/{os}/items", new { items = new[] { new { productId = filter, quantity = 3m } } }));
        var remito = await Json(await client.PostAsJsonAsync($"/api/v1/fleet/service-orders/{os}/remito", new { lines = Array.Empty<object>() }));
        Assert.Equal(0, remito.GetProperty("consumed").GetInt32());

        var saved = await Json(await client.GetAsync($"/api/v1/sales/remitos/{remito.GetProperty("remitoId").GetGuid()}"));
        Assert.Equal(JsonValueKind.Null, saved.GetProperty("orderId").ValueKind);
        Assert.Equal("20123456786", saved.GetProperty("customerDocument").GetString());
        // El orden de los ítems no está garantizado: se busca la línea del servicio entre todas.
        Assert.Contains(saved.GetProperty("items").EnumerateArray(), i => i.GetProperty("description").GetString()!.StartsWith("Servicio OS-"));
        Assert.Equal(7m, await StockAsync(client, filter));
    }
}
