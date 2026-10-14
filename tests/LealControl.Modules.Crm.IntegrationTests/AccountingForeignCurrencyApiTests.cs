using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Npgsql;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>
/// Contabilidad C3: el libro va en pesos con la moneda original como dato; un cobro en dólares registra la
/// diferencia de cambio realizada; las notas por diferencia de cambio van a su cuenta; y a fin de mes las
/// cuentas en dólares se revalúan a la cotización de cierre.
/// </summary>
public sealed class AccountingForeignCurrencyApiTests : IAsyncLifetime
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

    private async Task Sql(string sql, Guid id)
    {
        await using var db = new NpgsqlConnection(_factory.DatabaseConnectionString);
        await db.OpenAsync();
        await using var cmd = new NpgsqlCommand(sql, db);
        cmd.Parameters.AddWithValue("id", id);
        await cmd.ExecuteNonQueryAsync();
    }

    private async Task<Guid> SaleAsync(HttpClient client, Guid customer, string type, string currency, decimal rate, decimal price, Guid? associated = null)
    {
        var invoice = await Json(await client.PostAsJsonAsync("/api/v1/sales/invoices", new
        {
            invoiceType = type, pointOfSale = 3, customerId = customer, associatedInvoiceId = associated, customerName = "Cliente Dólar SA",
            customerDocument = "30715489629", customerTaxCondition = "ResponsableInscripto", issueDate = "2026-10-01", dueDate = "2026-10-31",
            fiscalConcept = 1, currency, exchangeRate = rate, restockItems = false,
            items = new[] { new { code = "X", description = "Servicio", quantity = 1m, unitPrice = price, vatRate = 21m } }
        }));
        var id = invoice.GetProperty("id").GetGuid();
        await Sql("""UPDATE sales.invoices SET "Status" = 'Authorized', "Cae" = '76000000000001' WHERE "Id" = @id""", id);
        return id;
    }

    private static Task<HttpResponseMessage> PostPeriodAsync(HttpClient client) =>
        client.PostAsJsonAsync("/api/v1/accounting/batch-post/execute", new
        {
            periodStart = "2026-10-01", periodEnd = "2026-10-31", modules = new[] { "Sales", "Finance" }
        });

    private static decimal Side(JsonElement entry, string accountCode, string side) =>
        entry.GetProperty("lines").EnumerateArray().Where(l => l.GetProperty("accountCode").GetString() == accountCode)
            .Sum(l => l.GetProperty(side).GetDecimal());

    [Fact]
    public async Task A_dollar_collection_is_posted_in_pesos_with_its_realized_difference_and_revalued_at_month_end()
    {
        using var client = _factory.CreateAuthenticatedClient();
        // Caja en dólares: en Finanzas y en el plan de cuentas (moneda USD), mapeadas entre sí.
        await Json(await client.GetAsync("/api/v1/accounting/accounts"));
        await Json(await client.PostAsJsonAsync("/api/v1/accounting/accounts", new
        {
            code = "1.1.01.010", name = "Caja en Dólares", accountType = "Asset", level = 4, parentCode = "1.1.01",
            isDirectPosting = true, currency = "USD", adjustsForInflation = false
        }));
        var cash = await Json(await client.PostAsJsonAsync("/api/v1/finance/accounts", new
        {
            name = "Caja USD", currency = "USD", type = "Cash", openingBalance = 0m, bookingMode = "Manual"
        }));
        var cashId = cash.GetProperty("id").GetGuid();
        await Json(await client.PutAsJsonAsync("/api/v1/accounting/finance-account-mappings",
            new[] { new { financialAccountId = cashId, ledgerAccountCode = "1.1.01.010" } }));

        // Factura de USD 121 a 1000 → Deudores $ 121.000.
        var customer = Guid.NewGuid();
        var invoice = await SaleAsync(client, customer, "A", "USD", 1000m, 100m);

        object Receipt(decimal? rate) => new
        {
            accountId = cashId, customerId = customer, currency = "USD", amount = 121m, description = "Cobro en dólares",
            receiptDateUtc = "2026-10-05T12:00:00Z", paymentExchangeRate = rate,
            lines = new[] { new { method = "Cash", amount = 121m, currency = "USD", accountId = cashId } },
            imputations = new[] { new { invoiceId = invoice, invoiceNumber = "0003-00000001", invoiceTotal = 121m, amountImputed = 121m, invoiceExchangeRate = 1000m } }
        };
        Assert.Contains("cotización del día", await Rejected(await client.PostAsJsonAsync("/api/v1/finance/collections", Receipt(null))));
        var receipt = await Json(await client.PostAsJsonAsync("/api/v1/finance/collections", Receipt(1100m)));

        var result = await Json(await PostPeriodAsync(client));
        Assert.Equal(0, result.GetProperty("errorsCount").GetInt32());

        var entries = (await Json(await client.GetAsync("/api/v1/accounting/journal-entries"))).EnumerateArray().ToList();
        var collection = entries.Single(e => e.GetProperty("sourceDocumentId").GetString() == receipt.GetProperty("id").GetGuid().ToString());
        // USD 121 a 1100 en la caja; Deudores se cancela a 1000; la diferencia es ganancia.
        Assert.Equal(133100m, Side(collection, "1.1.01.010", "debit"));
        Assert.Equal(121000m, Side(collection, "1.1.02.001", "credit"));
        Assert.Equal(12100m, Side(collection, "4.2.03", "credit"));
        var cashLine = collection.GetProperty("lines").EnumerateArray().Single(l => l.GetProperty("accountCode").GetString() == "1.1.01.010");
        Assert.Equal("USD", cashLine.GetProperty("currency").GetString());
        Assert.Equal(121m, cashLine.GetProperty("originalAmount").GetDecimal());

        // Cierre de octubre a 1200: USD 121 valen $ 145.200; en libros hay $ 133.100.
        var request = new { date = "2026-10-31", rate = 1200m };
        var preview = await Json(await client.PostAsJsonAsync("/api/v1/accounting/fx-revaluation/preview", request));
        var row = preview.GetProperty("rows").EnumerateArray().Single(r => r.GetProperty("accountCode").GetString() == "1.1.01.010");
        Assert.Equal(121m, row.GetProperty("foreignBalance").GetDecimal());
        Assert.Equal(133100m, row.GetProperty("bookBalance").GetDecimal());
        Assert.Equal(12100m, row.GetProperty("difference").GetDecimal());

        await Json(await client.PostAsJsonAsync("/api/v1/accounting/fx-revaluation", request));
        Assert.Contains("ya tiene revaluación", await Rejected(await client.PostAsJsonAsync("/api/v1/accounting/fx-revaluation", request)));
        var after = await Json(await client.PostAsJsonAsync("/api/v1/accounting/fx-revaluation/preview", request));
        var revalued = after.GetProperty("rows").EnumerateArray().Single(r => r.GetProperty("accountCode").GetString() == "1.1.01.010");
        Assert.Equal(121m, revalued.GetProperty("foreignBalance").GetDecimal()); // los dólares no cambian
        Assert.Equal(0m, revalued.GetProperty("difference").GetDecimal());

        var ledger = await Json(await client.GetAsync("/api/v1/accounting/general-ledger?accountCode=1.1.01.010&startDate=2026-10-01&endDate=2026-11-01"));
        Assert.Equal(145200m, ledger[0].GetProperty("finalBalance").GetDecimal());
    }

    [Fact]
    public async Task Exchange_difference_notes_go_to_the_exchange_difference_accounts_and_manual_dollar_lines_need_a_rate()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var customer = Guid.NewGuid();
        var invoice = await SaleAsync(client, customer, "A", "ARS", 1m, 1000m);
        var debitNote = await SaleAsync(client, customer, "ND_A", "ARS", 1m, 100m, invoice);
        // La nota documenta la diferencia de cambio de un cobro (como la emite Ventas desde la cuenta corriente).
        await Sql("""UPDATE sales.invoices SET "ExchangeDifferenceImputationId" = gen_random_uuid() WHERE "Id" = @id""", debitNote);

        await Json(await PostPeriodAsync(client));
        var entries = (await Json(await client.GetAsync("/api/v1/accounting/journal-entries"))).EnumerateArray().ToList();
        var note = entries.Single(e => e.GetProperty("sourceDocumentId").GetString() == debitNote.ToString());
        Assert.Equal(100m, Side(note, "4.2.03", "credit"));
        Assert.Equal(0m, Side(note, "4.1.01", "credit"));
        Assert.Equal(121m, Side(note, "1.1.02.001", "debit"));

        var accounts = (await Json(await client.GetAsync("/api/v1/accounting/accounts"))).EnumerateArray().ToList();
        var cash = accounts.Single(a => a.GetProperty("code").GetString() == "1.1.01.001");
        var bank = accounts.Single(a => a.GetProperty("code").GetString() == "1.1.01.002");
        object Line(JsonElement account, decimal debit, decimal credit, string currency, decimal rate) => new
        {
            accountId = account.GetProperty("id").GetGuid(), accountCode = account.GetProperty("code").GetString(), accountName = "x",
            debit, credit, currency, exchangeRate = rate
        };
        Assert.Contains("necesita la cotización", await Rejected(await client.PostAsJsonAsync("/api/v1/accounting/journal-entries", new
        {
            date = "2026-10-02", concept = "Compra de dólares", entryType = "Standard",
            lines = new[] { Line(bank, 105050m, 0m, "USD", 1m), Line(cash, 0m, 105050m, "ARS", 1m) }
        })));
        var manual = await Json(await client.PostAsJsonAsync("/api/v1/accounting/journal-entries", new
        {
            date = "2026-10-02", concept = "Compra de dólares", entryType = "Standard",
            lines = new[] { Line(bank, 105050m, 0m, "USD", 1050.5m), Line(cash, 0m, 105050m, "ARS", 1m) }
        }));
        var usdLine = manual.GetProperty("lines").EnumerateArray().Single(l => l.GetProperty("currency").GetString() == "USD");
        Assert.Equal(100m, usdLine.GetProperty("originalAmount").GetDecimal());
    }
}
