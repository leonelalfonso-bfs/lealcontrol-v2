using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Npgsql;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>
/// Contabilidad C4: ejercicios con mes de cierre por empresa; el cierre genera refundición, cierre y apertura
/// (con la moneda extranjera incluida) y cierra los meses; se reabre en orden; y el Libro Diario numera en
/// orden cronológico dentro de cada ejercicio. Reloj de pruebas: 2/10/2026.
/// </summary>
public sealed class AccountingFiscalYearApiTests : IAsyncLifetime
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

    private sealed record Accounts(JsonElement Cash, JsonElement Capital, JsonElement Income, JsonElement Expense);

    private static async Task<Accounts> LoadAccountsAsync(HttpClient client)
    {
        var all = (await Json(await client.GetAsync("/api/v1/accounting/accounts"))).EnumerateArray().ToList();
        JsonElement Code(string code) => all.Single(a => a.GetProperty("code").GetString() == code);
        return new Accounts(Code("1.1.01.001"), Code("3.1.01"), Code("4.1.01"), Code("5.3.01"));
    }

    private static object Line(JsonElement account, decimal debit, decimal credit, string currency = "ARS", decimal rate = 1m) => new
    {
        accountId = account.GetProperty("id").GetGuid(), accountCode = account.GetProperty("code").GetString(), accountName = "x",
        debit, credit, currency, exchangeRate = rate
    };

    private static Task<HttpResponseMessage> EntryAsync(HttpClient client, string date, params object[] lines) =>
        client.PostAsJsonAsync("/api/v1/accounting/journal-entries", new { date, concept = "Movimiento", entryType = "Standard", lines });

    private static decimal Side(JsonElement entry, string accountCode, string side) =>
        entry.GetProperty("lines").EnumerateArray().Where(l => l.GetProperty("accountCode").GetString() == accountCode)
            .Sum(l => l.GetProperty(side).GetDecimal());

    [Fact]
    public async Task Closing_a_year_posts_result_closing_and_opening_locks_it_and_can_be_reopened()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var a = await LoadAccountsAsync(client);
        var usd = await Json(await client.PostAsJsonAsync("/api/v1/accounting/accounts", new
        {
            code = "1.1.01.010", name = "Banco en Dólares", accountType = "Asset", level = 4, parentCode = "1.1.01",
            isDirectPosting = true, currency = "USD", adjustsForInflation = false
        }));

        await Json(await EntryAsync(client, "2025-03-01", Line(a.Cash, 200000m, 0m), Line(a.Capital, 0m, 200000m)));
        await Json(await EntryAsync(client, "2025-06-10", Line(a.Cash, 500m, 0m), Line(a.Income, 0m, 500m)));
        await Json(await EntryAsync(client, "2025-07-01", Line(a.Expense, 200m, 0m), Line(a.Cash, 0m, 200m)));
        await Json(await EntryAsync(client, "2025-08-01", Line(usd, 105050m, 0m, "USD", 1050.5m), Line(a.Cash, 0m, 105050m)));

        var years = await Json(await client.GetAsync("/api/v1/accounting/fiscal-years"));
        Assert.Equal(12, years.GetProperty("fiscalYearEndMonth").GetInt32());
        var y2025 = years.GetProperty("years").EnumerateArray().Single(y => y.GetProperty("end").GetString()!.StartsWith("2025-12-31"));
        Assert.Equal("Open", y2025.GetProperty("status").GetString());
        Assert.Equal(300m, y2025.GetProperty("result").GetDecimal());

        Assert.Contains("todavía no terminó", await Rejected(await client.PostAsJsonAsync("/api/v1/accounting/fiscal-years/close", new { end = "2026-12-31" })));
        Assert.Contains("no es un cierre", await Rejected(await client.PostAsJsonAsync("/api/v1/accounting/fiscal-years/close", new { end = "2025-06-30" })));

        var closed = await Json(await client.PostAsJsonAsync("/api/v1/accounting/fiscal-years/close", new { end = "2025-12-31" }));
        Assert.Equal(3, closed.GetProperty("entryNumbers").GetArrayLength());

        var entries = (await Json(await client.GetAsync("/api/v1/accounting/journal-entries"))).EnumerateArray().ToList();
        JsonElement ByKind(string kind) => entries.Single(e => e.GetProperty("sourceDocumentId").GetString() == $"fy-2025-12-31:{kind}");
        var result = ByKind("refundicion");
        Assert.Equal(500m, Side(result, "4.1.01", "debit"));
        Assert.Equal(200m, Side(result, "5.3.01", "credit"));
        Assert.Equal(300m, Side(result, "3.2.02", "credit"));
        var closing = ByKind("cierre");
        Assert.Equal(300m, Side(closing, "3.2.02", "debit"));
        Assert.Equal(200000m, Side(closing, "3.1.01", "debit"));
        var opening = ByKind("apertura");
        Assert.StartsWith("2026-01-01", opening.GetProperty("date").GetString());
        Assert.Equal(300m, Side(opening, "3.2.01", "credit")); // el resultado pasa a Resultados no Asignados
        Assert.Equal(0m, Side(opening, "3.2.02", "credit"));
        var usdLine = opening.GetProperty("lines").EnumerateArray().Single(l => l.GetProperty("accountCode").GetString() == "1.1.01.010");
        Assert.Equal(105050m, usdLine.GetProperty("debit").GetDecimal());
        Assert.Equal("USD", usdLine.GetProperty("currency").GetString());

        // Los dólares siguen en el ejercicio nuevo: la revaluación de enero los ve.
        var reval = await Json(await client.PostAsJsonAsync("/api/v1/accounting/fx-revaluation/preview", new { date = "2026-01-31", rate = 1100m }));
        var row = reval.GetProperty("rows").EnumerateArray().Single(r => r.GetProperty("accountCode").GetString() == "1.1.01.010");
        Assert.Equal(100m, row.GetProperty("foreignBalance").GetDecimal());
        Assert.Equal(4950m, row.GetProperty("difference").GetDecimal());

        // Cerrado: sus meses tienen candado y no se reabren sueltos; no se cierra dos veces; el mes de cierre ya no cambia.
        Assert.Contains("cerrado", await Rejected(await EntryAsync(client, "2025-05-05", Line(a.Cash, 1m, 0m), Line(a.Income, 0m, 1m))));
        Assert.Contains("reabrí el ejercicio", await Rejected(await client.PostAsJsonAsync("/api/v1/accounting/periods/lock", new { year = 2025, month = 5, @lock = false })));
        Assert.Contains("ya está cerrado", await Rejected(await client.PostAsJsonAsync("/api/v1/accounting/fiscal-years/close", new { end = "2025-12-31" })));
        Assert.Contains("no se puede cambiar", await Rejected(await client.PutAsJsonAsync("/api/v1/accounting/settings", new { fiscalYearEndMonth = 6 })));

        // Libro Diario: el número de orden reinicia en cada ejercicio.
        var book = await Json(await client.GetAsync("/api/v1/accounting/journal-book?from=2025-01-01&to=2026-01-31"));
        var orders = book.GetProperty("entries").EnumerateArray().Select(e => (Date: e.GetProperty("date").GetString()!, Order: e.GetProperty("order").GetInt32())).ToList();
        Assert.Equal([1, 2, 3, 4, 5, 6, 1], orders.Select(o => o.Order));
        Assert.StartsWith("2026-01-01", orders[^1].Date);

        await Json(await client.PostAsJsonAsync("/api/v1/accounting/fiscal-years/reopen", new { end = "2025-12-31" }));
        Assert.DoesNotContain((await Json(await client.GetAsync("/api/v1/accounting/journal-entries"))).EnumerateArray(),
            e => e.GetProperty("sourceModule").GetString() == "FiscalYear");
        await Json(await EntryAsync(client, "2025-05-05", Line(a.Cash, 1m, 0m), Line(a.Income, 0m, 1m)));
    }

    [Fact]
    public async Task Each_company_sets_its_closing_month_and_unposted_documents_block_the_close()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var a = await LoadAccountsAsync(client);
        await Json(await client.PutAsJsonAsync("/api/v1/accounting/settings", new { fiscalYearEndMonth = 6 }));
        await Json(await EntryAsync(client, "2026-03-15", Line(a.Cash, 1000m, 0m), Line(a.Income, 0m, 1000m)));

        var years = await Json(await client.GetAsync("/api/v1/accounting/fiscal-years"));
        Assert.Contains(years.GetProperty("years").EnumerateArray(), y => y.GetProperty("label").GetString() == "01/07/2025 al 30/06/2026");

        // Una venta autorizada del ejercicio, sin contabilizar, frena el cierre.
        var invoice = await Json(await client.PostAsJsonAsync("/api/v1/sales/invoices", new
        {
            invoiceType = "A", pointOfSale = 3, customerId = Guid.NewGuid(), customerName = "Cliente SA", customerDocument = "30715489629",
            customerTaxCondition = "ResponsableInscripto", issueDate = "2026-05-10", dueDate = "2026-05-31", fiscalConcept = 1,
            currency = "ARS", exchangeRate = 1m, restockItems = false,
            items = new[] { new { code = "X", description = "Servicio", quantity = 1m, unitPrice = 100m, vatRate = 21m } }
        }));
        await using (var db = new NpgsqlConnection(_factory.DatabaseConnectionString))
        {
            await db.OpenAsync();
            await using var cmd = new NpgsqlCommand("""UPDATE sales.invoices SET "Status" = 'Authorized', "Cae" = '76000000000001' WHERE "Id" = @id""", db);
            cmd.Parameters.AddWithValue("id", invoice.GetProperty("id").GetGuid());
            await cmd.ExecuteNonQueryAsync();
        }
        Assert.Contains("sin contabilizar", await Rejected(await client.PostAsJsonAsync("/api/v1/accounting/fiscal-years/close", new { end = "2026-06-30" })));

        await Json(await client.PostAsJsonAsync("/api/v1/accounting/batch-post/execute", new
        {
            periodStart = "2025-07-01", periodEnd = "2026-06-30", modules = new[] { "Sales" }
        }));
        await Json(await client.PostAsJsonAsync("/api/v1/accounting/fiscal-years/close", new { end = "2026-06-30" }));
        var after = await Json(await client.GetAsync("/api/v1/accounting/fiscal-years"));
        var closed = after.GetProperty("years").EnumerateArray().Single(y => y.GetProperty("label").GetString() == "01/07/2025 al 30/06/2026");
        Assert.Equal("Closed", closed.GetProperty("status").GetString());
        Assert.Equal(1100m, closed.GetProperty("result").GetDecimal());
    }
}
