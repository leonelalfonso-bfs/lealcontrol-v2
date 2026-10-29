using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>Billetera de viáticos y rendición de gastos (planilla FS 7.1 901 R2) con RRHH, Flota y Compras reales.</summary>
public sealed class ExpenseReportsApiTests : IAsyncLifetime
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

    [Fact]
    public async Task Wallet_receives_advances_and_the_approved_report_spends_it_paying_factura_a_through_purchases()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var employee = (await Json(await client.PostAsJsonAsync("/api/v1/hr/employees", new
        {
            firstName = "Pedro", lastName = "Ojeda", documentNumber = "30111222", cuil = "20301112220", hireDate = "2020-01-01T00:00:00Z"
        }))).GetProperty("id").GetGuid();
        var vehicle = (await Json(await client.PostAsJsonAsync("/api/v1/fleet/vehicles", new
        {
            type = "Pickup", plate = "AE456FG", brand = "Toyota", model = "Hilux", year = 2022, meterType = "Kilometers", initialKilometers = 1000
        }))).GetProperty("id").GetGuid();
        var bank = (await Json(await client.PostAsJsonAsync("/api/v1/finance/accounts", new { name = "Banco Galicia", currency = "ARS", type = "Bank", openingBalance = 1000000m, bookingMode = "Manual" })))
            .GetProperty("id").GetGuid();

        var wallet = (await Json(await client.PostAsJsonAsync("/api/v1/finance/expense-reports/wallets", new { employeeId = employee, openingBalance = 20000m }))).GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/v1/finance/expense-reports/wallets", new { employeeId = employee, openingBalance = 0m })).StatusCode);
        // El depósito de viáticos es una transferencia entre cuentas, como ya existía.
        await Json(await client.PostAsJsonAsync("/api/v1/finance/transfers", new { fromAccountId = bank, toAccountId = wallet, amount = 100000m, currency = "ARS", operationDateUtc = "2026-10-19T00:00:00Z", description = "Viáticos Ojeda" }));

        // Factura A del hotel a nombre de la empresa, registrada en Compras.
        var hotel = (await Json(await client.PostAsJsonAsync("/api/v1/purchases/invoices", new
        {
            invoiceType = "A", pointOfSale = 1, invoiceNumber = 10647L, supplierId = Guid.NewGuid(), supplierName = "CNV S.R.L.", supplierDocument = "30-71234567-1",
            supplierTaxCondition = "ResponsableInscripto", issueDate = "2026-10-21", dueDate = "2026-10-21", currency = "ARS", exchangeRate = 1m,
            iibbPerception = 0m, ivaPerception = 0m, otherTaxes = 0m, items = new[] { new { code = "H", description = "Hotel", quantity = 1m, unitPrice = 34710.74m, vatRate = 21m } }
        })));
        var hotelId = hotel.GetProperty("id").GetGuid();
        var hotelTotal = hotel.GetProperty("total").GetDecimal();

        // La rendición arranca el lunes de la semana aunque se indique otro día.
        var report = await Json(await client.PostAsJsonAsync("/api/v1/finance/expense-reports", new { employeeId = employee, weekStart = "2026-10-22T00:00:00Z", vehicleId = vehicle }));
        var id = report.GetProperty("id").GetGuid();
        Assert.StartsWith("2026-10-19", report.GetProperty("weekStart").GetString());
        Assert.Equal("AE456FG", report.GetProperty("vehiclePlate").GetString());
        Assert.Equal(100000m, report.GetProperty("advancesTotal").GetDecimal());

        object Line(string date, string category, string supplier, string type, string number, decimal amount, Guid? purchase = null, int people = 1) =>
            new { date, category, people, supplierName = supplier, supplierTaxId = (string?)null, voucherType = type, voucherNumber = number, amount, liters = (decimal?)null, detail = (string?)null, purchaseInvoiceId = purchase };
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync($"/api/v1/finance/expense-reports/{id}/lines", Line("2026-10-27", "Meal", "Fuera de semana", "B", "1-1", 100m))).StatusCode);
        await Json(await client.PostAsJsonAsync($"/api/v1/finance/expense-reports/{id}/lines", Line("2026-10-20", "Meal", "Lubre SRL", "B", "122-10827", 14900m)));
        await Json(await client.PostAsJsonAsync($"/api/v1/finance/expense-reports/{id}/lines", Line("2026-10-21", "Fuel", "Sucata S.A.", "B", "26-23178", 30000.05m)));
        var withHotel = await Json(await client.PostAsJsonAsync($"/api/v1/finance/expense-reports/{id}/lines", Line("2026-10-21", "Lodging", "CNV S.R.L.", "A", "1-10647", hotelTotal)));
        Assert.Contains("Compras", withHotel.GetProperty("problems")[0].GetString());
        Assert.Equal(120000m - 14900m - 30000.05m - hotelTotal, withHotel.GetProperty("balanceAfter").GetDecimal());

        // Sin vincular la factura A no se aprueba; se la busca por el CUIT del proveedor.
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync($"/api/v1/finance/expense-reports/{id}/approve", new { usdRate = 1450m })).StatusCode);
        var candidates = await Json(await client.GetAsync("/api/v1/finance/expense-reports/purchase-candidates?supplierTaxId=30712345671"));
        Assert.Equal(hotelId, Assert.Single(candidates.EnumerateArray()).GetProperty("id").GetGuid());
        var hotelLine = withHotel.GetProperty("lines").EnumerateArray().Single(l => l.GetProperty("voucherType").GetString() == "A").GetProperty("id").GetGuid();
        await Json(await client.PutAsJsonAsync($"/api/v1/finance/expense-reports/{id}/lines/{hotelLine}", Line("2026-10-21", "Lodging", "CNV S.R.L.", "A", "1-10647", hotelTotal, hotelId)));

        var approved = await Json(await client.PostAsJsonAsync($"/api/v1/finance/expense-reports/{id}/approve", new { usdRate = 1450m }));
        Assert.Equal("Approved", approved.GetProperty("status").GetString());
        Assert.Equal(120000m - 14900m - 30000.05m - hotelTotal, approved.GetProperty("walletBalance").GetDecimal());
        // La factura A quedó pagada en Compras y ya no aparece para vincular.
        Assert.Equal(0, (await Json(await client.GetAsync("/api/v1/finance/expense-reports/purchase-candidates?supplierTaxId=30712345671"))).GetArrayLength());
        var wallets = await Json(await client.GetAsync("/api/v1/finance/expense-reports/wallets"));
        Assert.Equal("Billetera Ojeda, Pedro", Assert.Single(wallets.EnumerateArray()).GetProperty("name").GetString());

        // La orden de pago de la factura A no se anula suelta: se reabre la rendición.
        var hotelOrder = approved.GetProperty("lines").EnumerateArray().Single(l => l.GetProperty("voucherType").GetString() == "A").GetProperty("paymentOrderId").GetGuid();
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/v1/finance/payments/{hotelOrder}/void", new { reason = "Prueba" })).StatusCode);

        // Reabrirla devuelve el saldo y anula el pago de la factura (que sigue vinculada al renglón).
        var reopened = await Json(await client.PostAsync($"/api/v1/finance/expense-reports/{id}/reopen", null));
        Assert.Equal("Open", reopened.GetProperty("status").GetString());
        Assert.Equal(120000m, reopened.GetProperty("walletBalance").GetDecimal());
        Assert.Empty(reopened.GetProperty("problems").EnumerateArray());
        var orders = await Json(await client.GetAsync("/api/v1/finance/payments"));
        Assert.All(orders.EnumerateArray().Where(o => o.GetProperty("supplierName").GetString() == "CNV S.R.L."), o => Assert.Equal("Voided", o.GetProperty("status").GetString()));
    }
}
