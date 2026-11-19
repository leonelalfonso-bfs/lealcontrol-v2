using System.IO.Compression;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Npgsql;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>
/// Contabilidad C2: los Libros IVA salen de los comprobantes fiscales (ventas con CAE, compras vigentes),
/// en pesos y con las notas de crédito restando, y se exportan al Libro IVA Digital de ARCA.
/// </summary>
public sealed class AccountingVatBooksApiTests : IAsyncLifetime
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

    private async Task<Guid> SaleAsync(HttpClient client, string type, string currency, decimal rate, bool withCae, Guid? associated, params object[] items)
    {
        var invoice = await Json(await client.PostAsJsonAsync("/api/v1/sales/invoices", new
        {
            invoiceType = type, pointOfSale = 3, customerId = _customer, associatedInvoiceId = associated, customerName = "Cliente Ñandú SA",
            customerDocument = "30715489629", customerTaxCondition = "ResponsableInscripto", issueDate = "2026-09-10", dueDate = "2026-09-30",
            fiscalConcept = 1, currency, exchangeRate = rate, restockItems = false, items
        }));
        var id = invoice.GetProperty("id").GetGuid();
        if (withCae)
        {
            // En pruebas no se habla con ARCA: queda como lo deja la confirmación del CAE.
            await using var db = new NpgsqlConnection(_factory.DatabaseConnectionString);
            await db.OpenAsync();
            await using var cmd = new NpgsqlCommand("""UPDATE sales.invoices SET "Status" = 'Authorized', "Cae" = '76000000000001' WHERE "Id" = @id""", db);
            cmd.Parameters.AddWithValue("id", id);
            await cmd.ExecuteNonQueryAsync();
        }
        return id;
    }

    private static async Task PurchaseAsync(HttpClient client, string type, long number, string supplierDocument, params object[] items) =>
        await Json(await client.PostAsJsonAsync("/api/v1/purchases/invoices", new
        {
            invoiceType = type, pointOfSale = 7, invoiceNumber = number, supplierId = Guid.NewGuid(), supplierName = "Proveedor SA",
            supplierDocument, supplierTaxCondition = "ResponsableInscripto",
            issueDate = "2026-09-15", dueDate = "2026-09-30", currency = "ARS", exchangeRate = 1m,
            iibbPerception = 0m, ivaPerception = 25m, otherTaxes = 0m, items
        }));

    [Fact]
    public async Task Vat_books_come_from_fiscal_vouchers_in_pesos_and_export_to_arca()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var invoice = await SaleAsync(client, "A", "ARS", 1m, withCae: true, null, Item(1000m, 21m), Item(200m, 10.5m), Item(50m, 0m));
        await SaleAsync(client, "NC_A", "ARS", 1m, withCae: true, invoice, Item(100m, 21m));
        await SaleAsync(client, "A", "USD", 1000m, withCae: true, null, Item(10m, 21m));
        await SaleAsync(client, "A", "ARS", 1m, withCae: false, null, Item(999m, 21m)); // borrador: no va al libro
        await PurchaseAsync(client, "A", 501, "30111222333", Item(1000m, 21m));
        await PurchaseAsync(client, "C", 502, "20123456786", Item(300m, 0m));
        // Compra sin factura (X): aunque llegue con IVA y percepción, se guarda sin ellos, se numera sola y no va al libro.
        await PurchaseAsync(client, "X", 0, "30111222333", Item(500m, 21m));
        var nonFiscal = (await Json(await client.GetAsync("/api/v1/purchases/invoices"))).EnumerateArray()
            .Single(p => p.GetProperty("invoiceType").GetString() == "X");
        Assert.Equal(500m, nonFiscal.GetProperty("total").GetDecimal());
        Assert.Equal(1, nonFiscal.GetProperty("invoiceNumber").GetInt64());

        var books = await Json(await client.GetAsync("/api/v1/accounting/vat-books?year=2026&month=9"));
        Assert.Empty(books.GetProperty("problems").EnumerateArray());

        var sales = books.GetProperty("sales");
        Assert.Equal(3, sales.GetProperty("rows").GetArrayLength());
        var totals = sales.GetProperty("totals");
        Assert.Equal(1000m - 100m + 10000m, totals.GetProperty("net21").GetDecimal());
        Assert.Equal(210m - 21m + 2100m, totals.GetProperty("vat21").GetDecimal());
        Assert.Equal(21m, totals.GetProperty("vat105").GetDecimal());
        Assert.Equal(50m, totals.GetProperty("exempt").GetDecimal());
        Assert.Equal(1481m - 121m + 12100m, totals.GetProperty("total").GetDecimal());

        var purchases = books.GetProperty("purchases").GetProperty("totals");
        Assert.Equal(210m, purchases.GetProperty("vat21").GetDecimal());
        Assert.Equal(300m, purchases.GetProperty("exempt").GetDecimal());
        Assert.Equal(25m * 2, purchases.GetProperty("perceptionVat").GetDecimal());

        using var export = await client.GetAsync("/api/v1/accounting/vat-books/arca?year=2026&month=9");
        Assert.Equal(HttpStatusCode.OK, export.StatusCode);
        using var zip = new ZipArchive(await export.Content.ReadAsStreamAsync());
        string[] Lines(string name)
        {
            using var reader = new StreamReader(zip.GetEntry(name)!.Open());
            return reader.ReadToEnd().Split("\r\n", StringSplitOptions.RemoveEmptyEntries);
        }
        var salesVouchers = Lines("LIBRO_IVA_DIGITAL_VENTAS_CBTE_202609.txt");
        Assert.Equal(3, salesVouchers.Length);
        Assert.All(salesVouchers, l => Assert.Equal(266, l.Length));
        Assert.Contains(salesVouchers, l => l.Substring(8, 3) == "003"); // la nota de crédito A
        Assert.Contains(salesVouchers, l => l.Substring(228, 3) == "DOL" && l.Substring(231, 10) == "1000000000");
        Assert.Equal(4, Lines("LIBRO_IVA_DIGITAL_VENTAS_ALICUOTAS_202609.txt").Length); // 21 y 10,5; 21; 21
        Assert.Equal(2, Lines("LIBRO_IVA_DIGITAL_COMPRAS_CBTE_202609.txt").Length);
        Assert.Single(Lines("LIBRO_IVA_DIGITAL_COMPRAS_ALICUOTAS_202609.txt")); // la C no discrimina IVA
    }

    [Fact]
    public async Task Purchase_from_a_closed_month_is_imputed_to_the_first_open_month()
    {
        using var client = _factory.CreateAuthenticatedClient();
        await Json(await client.PostAsJsonAsync("/api/v1/accounting/periods/lock", new { year = 2026, month = 8, @lock = true }));

        var suggestion = await Json(await client.GetAsync("/api/v1/purchases/invoices/imputation-period?issueDate=2026-08-20"));
        Assert.StartsWith("2026-09-01", suggestion.GetProperty("period").GetString());
        Assert.True(suggestion.GetProperty("issueMonthLocked").GetBoolean());

        object Purchase(long number, string? period) => new
        {
            invoiceType = "A", pointOfSale = 7, invoiceNumber = number, supplierId = Guid.NewGuid(), supplierName = "Proveedor SA",
            supplierDocument = "30111222333", supplierTaxCondition = "ResponsableInscripto",
            issueDate = "2026-08-20T00:00:00Z", dueDate = "2026-09-20T00:00:00Z", currency = "ARS", exchangeRate = 1m,
            iibbPerception = 0m, ivaPerception = 0m, otherTaxes = 0m, imputationPeriod = period, items = new[] { Item(1000m, 21m) }
        };
        // Sin período: va al primer mes abierto. Pedir el mes cerrado se rechaza.
        var created = await Json(await client.PostAsJsonAsync("/api/v1/purchases/invoices", Purchase(801, null)));
        Assert.StartsWith("2026-09-01", created.GetProperty("imputationPeriod").GetString());
        var refused = await client.PostAsJsonAsync("/api/v1/purchases/invoices", Purchase(802, "2026-08-01T00:00:00Z"));
        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);

        async Task<int> PurchasesIn(int month) =>
            (await Json(await client.GetAsync($"/api/v1/accounting/vat-books?year=2026&month={month}"))).GetProperty("purchases").GetProperty("rows").GetArrayLength();
        Assert.Equal(0, await PurchasesIn(8));
        Assert.Equal(1, await PurchasesIn(9));

        // Se puede mover a otro mes abierto mientras no tenga asiento.
        var id = created.GetProperty("id").GetGuid();
        await Json(await client.PutAsJsonAsync($"/api/v1/purchases/invoices/{id}/imputation-period", new { period = "2026-10-01T00:00:00Z" }));
        Assert.Equal(0, await PurchasesIn(9));
        Assert.Equal(1, await PurchasesIn(10));
    }

    [Fact]
    public async Task Purchase_book_carries_what_the_accountant_reads()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var bank = await Json(await client.PostAsJsonAsync("/api/v1/purchases/expense-categories", new { code = "gba", name = "Com y gtos bancarios" }));
        var taxes = await Json(await client.PostAsJsonAsync("/api/v1/purchases/expense-categories", new { code = "IMP", name = "Otros impuestos" }));
        var duplicate = await client.PostAsJsonAsync("/api/v1/purchases/expense-categories", new { code = "GBA", name = "Repetido" });
        Assert.Equal(HttpStatusCode.BadRequest, duplicate.StatusCode);

        // Un comprobante de banco (exceptuado de la RG 1415): IVA discriminado, percepción de Ganancias y dos rubros.
        await Json(await client.PostAsJsonAsync("/api/v1/purchases/invoices", new
        {
            invoiceType = "OC_A", pointOfSale = 0, invoiceNumber = 845615, supplierId = Guid.NewGuid(), supplierName = "Banco Ficticio SA",
            supplierDocument = "30111222333", supplierTaxCondition = "ResponsableInscripto", supplierProvince = "Santa Fe",
            issueDate = "2026-09-02T00:00:00Z", dueDate = "2026-09-02T00:00:00Z", currency = "ARS", exchangeRate = 1m,
            iibbPerception = 10m, ivaPerception = 5m, otherTaxes = 0m, gananciasPerception = 40m, internalTaxes = 2m, municipalTaxes = 3m,
            items = new object[]
            {
                new { code = "COM", description = "Comisiones", quantity = 1m, unitPrice = 100m, vatRate = 21m, expenseCategoryId = bank.GetProperty("id").GetGuid() },
                new { code = "SEL", description = "Sellos", quantity = 1m, unitPrice = 20m, vatRate = 0m, expenseCategoryId = taxes.GetProperty("id").GetGuid() }
            }
        }));

        var row = (await Json(await client.GetAsync("/api/v1/accounting/vat-books?year=2026&month=9")))
            .GetProperty("purchases").GetProperty("rows")[0];
        Assert.StartsWith("Otros comp. RG 1415", row.GetProperty("voucher").GetString());
        Assert.Equal("CUIT", row.GetProperty("documentType").GetString());
        Assert.Equal("RESPONSABLE INSCRIPTO", row.GetProperty("taxCondition").GetString());
        Assert.Equal("SANTA FE", row.GetProperty("jurisdiction").GetString());
        Assert.Equal("[GBA] COM Y GTOS BANCARIOS; [IMP] OTROS IMPUESTOS", row.GetProperty("categories").GetString());
        Assert.Equal(40m, row.GetProperty("perceptionGanancias").GetDecimal());
        Assert.Equal(2m, row.GetProperty("internalTaxes").GetDecimal());
        Assert.Equal(3m, row.GetProperty("municipalTaxes").GetDecimal());
        Assert.Equal(100m + 21m + 20m + 10m + 5m + 40m + 2m + 3m, row.GetProperty("total").GetDecimal());
        Assert.StartsWith("2026-09-02", row.GetProperty("accountingDate").GetString());

        using var export = await client.GetAsync("/api/v1/accounting/vat-books/arca?year=2026&month=9");
        Assert.Equal(HttpStatusCode.OK, export.StatusCode);
    }

    [Fact]
    public async Task Purchase_takes_the_jurisdiction_from_the_supplier_in_the_directory()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var created = await client.PostAsJsonAsync("/api/v1/crm/customers", new
        {
            legalName = "Proveedor Ficticio Entrerriano SRL", documentType = "Cuit", documentNumber = "30712345671",
            taxCondition = "ResponsableInscripto", iibbRegime = "ConvenioMultilateral", isCustomer = false, isSupplier = true,
            fiscalStreet = "Calle 1", fiscalCity = "Paraná", fiscalProvince = "EntreRios", fiscalPostalCode = "3100"
        });
        Assert.True(created.IsSuccessStatusCode, await created.Content.ReadAsStringAsync());
        var supplierId = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        await Json(await client.PostAsJsonAsync("/api/v1/purchases/invoices", new
        {
            invoiceType = "A", pointOfSale = 2, invoiceNumber = 77, supplierId, supplierName = "Proveedor Ficticio Entrerriano SRL",
            supplierDocument = "30712345671", supplierTaxCondition = "ResponsableInscripto",
            issueDate = "2026-09-05T00:00:00Z", dueDate = "2026-09-05T00:00:00Z", currency = "ARS", exchangeRate = 1m,
            iibbPerception = 0m, ivaPerception = 0m, otherTaxes = 0m, items = new[] { Item(100m, 21m) }
        }));

        var row = (await Json(await client.GetAsync("/api/v1/accounting/vat-books?year=2026&month=9")))
            .GetProperty("purchases").GetProperty("rows")[0];
        Assert.Equal("ENTRE RIOS", row.GetProperty("jurisdiction").GetString());
    }

    [Fact]
    public async Task Rubro_can_be_assigned_to_an_invoice_already_loaded()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var category = await Json(await client.PostAsJsonAsync("/api/v1/purchases/expense-categories", new { code = "PAP", name = "Papeleria" }));
        var invoice = await Json(await client.PostAsJsonAsync("/api/v1/purchases/invoices", new
        {
            invoiceType = "A", pointOfSale = 4, invoiceNumber = 545, supplierId = Guid.NewGuid(), supplierName = "Librería Ficticia",
            supplierDocument = "30111222333", supplierTaxCondition = "ResponsableInscripto",
            issueDate = "2026-09-01T00:00:00Z", dueDate = "2026-09-01T00:00:00Z", currency = "ARS", exchangeRate = 1m,
            iibbPerception = 0m, ivaPerception = 0m, otherTaxes = 0m, items = new[] { Item(100m, 21m) }
        }));
        var itemId = invoice.GetProperty("items")[0].GetProperty("id").GetGuid();
        var url = $"/api/v1/purchases/invoices/{invoice.GetProperty("id").GetGuid()}/expense-categories";

        var unknown = await client.PutAsJsonAsync(url, new { lines = new[] { new { itemId, expenseCategoryId = Guid.NewGuid() } } });
        Assert.Equal(HttpStatusCode.BadRequest, unknown.StatusCode);
        await Json(await client.PutAsJsonAsync(url, new { lines = new[] { new { itemId, expenseCategoryId = category.GetProperty("id").GetGuid() } } }));

        var row = (await Json(await client.GetAsync("/api/v1/accounting/vat-books?year=2026&month=9")))
            .GetProperty("purchases").GetProperty("rows")[0];
        Assert.Equal("[PAP] PAPELERIA", row.GetProperty("categories").GetString());
    }

    [Fact]
    public async Task Export_is_refused_when_a_voucher_cannot_be_informed()
    {
        using var client = _factory.CreateAuthenticatedClient();
        // Una factura A de proveedor sin CUIT no se puede informar.
        await PurchaseAsync(client, "A", 900, "", Item(100m, 21m));

        var books = await Json(await client.GetAsync("/api/v1/accounting/vat-books?year=2026&month=9"));
        Assert.Contains("necesita CUIT", books.GetProperty("problems")[0].GetString());
        using var export = await client.GetAsync("/api/v1/accounting/vat-books/arca?year=2026&month=9");
        Assert.Equal(HttpStatusCode.BadRequest, export.StatusCode);

        using var invalid = await client.GetAsync("/api/v1/accounting/vat-books?year=2026&month=13");
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
    }
}
