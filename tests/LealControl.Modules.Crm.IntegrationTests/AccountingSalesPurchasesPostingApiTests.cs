using System.Net.Http.Json;
using System.Text.Json;
using Npgsql;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>
/// Contabilidad C1: al tocar "contabilizar", las facturas de venta autorizadas y las de proveedor entran
/// a la cola y se asientan con los asientos modelo de fábrica (todas las alícuotas, exento y
/// percepciones, en pesos). Lo anulado se contra-asienta y nada se asienta dos veces.
/// </summary>
public sealed class AccountingSalesPurchasesPostingApiTests : IAsyncLifetime
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

    private static object Item(decimal unitPrice, decimal vatRate) =>
        new { code = "X", description = "Ítem", quantity = 1m, unitPrice, vatRate };

    private readonly Guid _customer = Guid.NewGuid();

    private Task<Guid> SaleAsync(HttpClient client, string type, string currency, decimal rate, bool authorize, params object[] items) =>
        SaleAsync(client, type, currency, rate, authorize, null, items);

    private async Task<Guid> SaleAsync(HttpClient client, string type, string currency, decimal rate, bool authorize, Guid? associated, params object[] items)
    {
        var invoice = await Json(await client.PostAsJsonAsync("/api/v1/sales/invoices", new
        {
            invoiceType = type, pointOfSale = 3, customerId = _customer, associatedInvoiceId = associated, customerName = "Cliente SA", customerDocument = "20123456786",
            customerTaxCondition = "ResponsableInscripto", issueDate = "2026-10-01", dueDate = "2026-10-31", fiscalConcept = 1,
            currency, exchangeRate = rate, restockItems = false, items
        }));
        var id = invoice.GetProperty("id").GetGuid();
        if (authorize)
        {
            // En pruebas no se habla con ARCA: se marca autorizada como lo haría la confirmación del CAE.
            await using var db = new NpgsqlConnection(_factory.DatabaseConnectionString);
            await db.OpenAsync();
            await using var cmd = new NpgsqlCommand("""UPDATE sales.invoices SET "Status" = 'Authorized' WHERE "Id" = @id""", db);
            cmd.Parameters.AddWithValue("id", id);
            await cmd.ExecuteNonQueryAsync();
        }
        return id;
    }

    private Task<HttpResponseMessage> PostPeriodAsync(HttpClient client) =>
        client.PostAsJsonAsync("/api/v1/accounting/batch-post/execute", new
        {
            periodStart = "2026-10-01", periodEnd = "2026-10-31", modules = new[] { "Sales", "Purchases" }
        });

    private static List<JsonElement> EntriesFor(JsonElement entries, Guid documentId) =>
        entries.EnumerateArray().Where(e => e.GetProperty("sourceDocumentId").GetString() == documentId.ToString()).ToList();

    private static decimal Side(JsonElement entry, string accountCode, string side) =>
        entry.GetProperty("lines").EnumerateArray().Where(l => l.GetProperty("accountCode").GetString() == accountCode)
            .Sum(l => l.GetProperty(side).GetDecimal());

    [Fact]
    public async Task Authorized_sales_and_supplier_invoices_are_posted_in_pesos_with_every_vat_rate()
    {
        using var client = _factory.CreateAuthenticatedClient();

        // Factura A: 1000 al 21 %, 200 al 10,5 % y 50 exento → total 1000+210+200+21+50 = 1481.
        var sale = await SaleAsync(client, "A", "ARS", 1m, authorize: true, Item(1000m, 21m), Item(200m, 10.5m), Item(50m, 0m));
        // Factura en dólares: 10 USD + IVA a 1000 → 12.100 pesos.
        var usdSale = await SaleAsync(client, "A", "USD", 1000m, authorize: true, Item(10m, 21m));
        // Borrador sin CAE: no se contabiliza.
        var draft = await SaleAsync(client, "B", "ARS", 1m, authorize: false, Item(500m, 21m));

        // Compra: 1000 al 21 % y 100 exento, percepciones de IVA 30 e IIBB 20, otros tributos 5.
        var purchase = await Json(await client.PostAsJsonAsync("/api/v1/purchases/invoices", new
        {
            invoiceType = "A", pointOfSale = 5, invoiceNumber = 77L, supplierId = Guid.NewGuid(), supplierName = "Proveedor SA",
            supplierDocument = "30111222333", supplierTaxCondition = "ResponsableInscripto",
            issueDate = "2026-10-02", dueDate = "2026-10-30", currency = "ARS", exchangeRate = 1m,
            iibbPerception = 20m, ivaPerception = 30m, otherTaxes = 5m,
            items = new[] { Item(1000m, 21m), Item(100m, 0m) }
        }));
        // El exento ya está en el subtotal: 1100 + 210 + 20 + 30 + 5 (antes sumaba los 100 dos veces).
        Assert.Equal(1365m, purchase.GetProperty("total").GetDecimal());
        var purchaseId = purchase.GetProperty("id").GetGuid();

        var result = await Json(await PostPeriodAsync(client));
        Assert.Equal(3, result.GetProperty("entriesGenerated").GetInt32());
        Assert.Equal(0, result.GetProperty("errorsCount").GetInt32());

        var entries = await Json(await client.GetAsync("/api/v1/accounting/journal-entries"));
        var saleEntry = Assert.Single(EntriesFor(entries, sale));
        Assert.Equal(1481m, Side(saleEntry, "1.1.02.001", "debit"));
        Assert.Equal(1250m, Side(saleEntry, "4.1.01", "credit"));
        Assert.Equal(231m, Side(saleEntry, "2.1.02.001", "credit"));

        var usdEntry = Assert.Single(EntriesFor(entries, usdSale));
        Assert.Equal(12100m, Side(usdEntry, "1.1.02.001", "debit"));
        Assert.Equal(10000m, Side(usdEntry, "4.1.01", "credit"));
        Assert.Equal("ARS", usdEntry.GetProperty("lines")[0].GetProperty("currency").GetString());

        Assert.Empty(EntriesFor(entries, draft));

        var purchaseEntry = Assert.Single(EntriesFor(entries, purchaseId));
        Assert.Equal(1100m, Side(purchaseEntry, "5.1.03", "debit"));
        Assert.Equal(210m, Side(purchaseEntry, "1.1.03.001", "debit"));
        Assert.Equal(30m, Side(purchaseEntry, "1.1.03.004", "debit"));
        Assert.Equal(20m, Side(purchaseEntry, "1.1.03.002", "debit"));
        Assert.Equal(5m, Side(purchaseEntry, "5.2.09", "debit"));
        Assert.Equal(1365m, Side(purchaseEntry, "2.1.01.001", "credit"));

        // Contabilizar otra vez no duplica nada.
        var again = await Json(await PostPeriodAsync(client));
        Assert.Equal(0, again.GetProperty("entriesGenerated").GetInt32());

        // Se anula la compra: el siguiente "contabilizar" la contra-asienta.
        await Json(await client.PostAsJsonAsync($"/api/v1/purchases/invoices/{purchaseId}/cancel", new { reason = "Mal cargada" }));
        await Json(await PostPeriodAsync(client));
        var after = await Json(await client.GetAsync("/api/v1/accounting/journal-entries"));
        var original = purchaseEntry.GetProperty("id").GetString();
        var reversal = Assert.Single(after.EnumerateArray(), e => e.GetProperty("entryType").GetString() == "Reversal"
            && e.GetProperty("sourceDocumentId").GetString() == original);
        Assert.Equal(1365m, Side(reversal, "2.1.01.001", "debit"));
    }

    [Fact]
    public async Task Credit_notes_reverse_the_invoice_entry_and_old_templates_are_retired()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var invoice = await SaleAsync(client, "A", "ARS", 1m, authorize: true, Item(300m, 21m));
        var creditNote = await SaleAsync(client, "NC_A", "ARS", 1m, authorize: true, invoice, Item(100m, 21m));

        await Json(await PostPeriodAsync(client));
        var entries = await Json(await client.GetAsync("/api/v1/accounting/journal-entries"));
        var entry = Assert.Single(EntriesFor(entries, creditNote));
        Assert.Equal(121m, Side(entry, "1.1.02.001", "credit"));
        Assert.Equal(100m, Side(entry, "4.1.01", "debit"));
        Assert.Equal(21m, Side(entry, "2.1.02.001", "debit"));

        var templates = (await Json(await client.GetAsync("/api/v1/accounting/templates"))).EnumerateArray().ToList();
        string Status(string code) => templates.Single(t => t.GetProperty("code").GetString() == code).GetProperty("status").GetString()!;
        Assert.Equal("Active", Status("AM-VTA-FAC"));
        Assert.Equal("Active", Status("AM-CMP-NC"));
        Assert.DoesNotContain(templates, t => t.GetProperty("code").GetString() == "AM-VTA-01");
    }
}
