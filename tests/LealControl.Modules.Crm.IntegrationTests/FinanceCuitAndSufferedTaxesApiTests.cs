using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>
/// Finanzas con el CRM y las compras reales: el CUIT del banco encuentra al proveedor o cliente (crm.customers; antes la
/// búsqueda apuntaba a tablas que no existen) y las retenciones y percepciones sufridas salen para SIFERE (nota 69, F3).
/// </summary>
public sealed class FinanceCuitAndSufferedTaxesApiTests : IAsyncLifetime
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
    public async Task Bank_cuit_suggests_creating_the_payment_order_or_the_receipt()
    {
        using var client = _factory.CreateAuthenticatedClient();
        async Task<Guid> Party(string name, string cuit, bool customer) => (await Json(await client.PostAsJsonAsync("/api/v1/crm/customers", new
        {
            legalName = name, documentType = "Cuit", documentNumber = cuit, taxCondition = "ResponsableInscripto", iibbRegime = "Local",
            isCustomer = customer, isSupplier = !customer
        }))).GetProperty("id").GetGuid();
        var supplier = await Party("Proveedor Banco SA", "30-71234567-1", false);
        var customerId = await Party("Cliente Banco SRL", "20-30111222-0", true);
        var account = (await Json(await client.PostAsJsonAsync("/api/v1/finance/accounts", new
        {
            name = "Galicia CUIT", currency = "ARS", type = "Bank", openingBalance = 0m, bookingMode = "Statement"
        }))).GetProperty("id").GetGuid();

        var csv = "\"Fecha\";\"Descripción\";\"Origen\";\"Débitos\";\"Créditos\";\"Grupo de Conceptos\";\"Concepto\";\"Número de Terminal\";\"Observaciones Cliente\";\"Número de Comprobante\";\"Leyendas Adicionales1\";\"Leyendas Adicionales2\";\"Leyendas Adicionales3\";\"Leyendas Adicionales4\";\"Tipo de Movimiento\";\"Saldo\"\n"
            + "\"05/10/2026\";\"Trf Inmed Proveed\";\"\";\"150000,00\";\"0\";\"\";\"\";\"\";\"\";\"11111111\";\"Proveedor Banco SA\";\"30712345671\";\"FACTURAS\";\"\";\"Imputado\";\"850000,00\";\n"
            + "\"05/10/2026\";\"Transferencia De Terceros\";\"\";\"0\";\"90000,00\";\"\";\"\";\"\";\"\";\"\";\"Cliente Banco SRL\";\"20301112220\";\"\";\"\";\"Imputado\";\"940000,00\";\n";
        await Json(await client.PostAsJsonAsync("/api/v1/finance/imports/bank/confirm", new
        {
            accountId = account, fileBase64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(csv)), fileName = "Extracto_CC.csv"
        }));

        var rows = (await Json(await client.GetAsync($"/api/v1/finance/reconciliation/tray?accountId={account}"))).GetProperty("rows").EnumerateArray().ToList();
        var debit = rows.Single(r => r.GetProperty("description").GetString()!.StartsWith("Trf")).GetProperty("suggestion");
        Assert.Equal("CreatePayment", debit.GetProperty("type").GetString());
        Assert.Equal(supplier, debit.GetProperty("counterpartyId").GetGuid());
        var credit = rows.Single(r => r.GetProperty("description").GetString()!.StartsWith("Transferencia")).GetProperty("suggestion");
        Assert.Equal("CreateReceipt", credit.GetProperty("type").GetString());
        Assert.Equal(customerId, credit.GetProperty("counterpartyId").GetGuid());
    }

    private static object Item(decimal unitPrice, decimal vatRate) =>
        new { code = "X", description = "Ítem", quantity = 1m, unitPrice, vatRate };

    [Fact]
    public async Task Suffered_withholdings_and_perceptions_go_to_sifere()
    {
        using var client = _factory.CreateAuthenticatedClient();
        await Json(await client.PutAsJsonAsync("/api/v1/finance/suffered/settings", new { defaultJurisdiction = "921" }));
        var customer = (await Json(await client.PostAsJsonAsync("/api/v1/crm/customers", new
        {
            legalName = "Cliente Agente SA", documentType = "Cuit", documentNumber = "30-71234567-1", taxCondition = "ResponsableInscripto", iibbRegime = "Local", isCustomer = true, isSupplier = false
        }))).GetProperty("id").GetGuid();
        var cash = (await Json(await client.PostAsJsonAsync("/api/v1/finance/accounts", new { name = "Caja F3", currency = "ARS", type = "Cash", openingBalance = 0m, bookingMode = "Manual" }))).GetProperty("id").GetGuid();

        // Recibo con retención de IIBB Buenos Aires (902) y de Ganancias.
        await Json(await client.PostAsJsonAsync("/api/v1/finance/collections", new
        {
            accountId = cash, customerId = customer, currency = "ARS", amount = 100000m, description = "Cobro con retenciones", receiptDateUtc = "2026-10-05T12:00:00Z",
            lines = new object[]
            {
                new { method = "Cash", amount = 97700m, currency = "ARS", accountId = cash },
                new { method = "Retention", amount = 1500m, currency = "ARS", retentionType = "IIBB", retentionCertificate = "0001-00012345", jurisdiction = "902" },
                new { method = "Retention", amount = 800m, currency = "ARS", retentionType = "Ganancias", retentionCertificate = "777" }
            }
        }));
        // Compra con percepción de IIBB (jurisdicción por defecto 921) y de IVA.
        await Json(await client.PostAsJsonAsync("/api/v1/purchases/invoices", new
        {
            invoiceType = "A", pointOfSale = 5, invoiceNumber = 77L, supplierId = Guid.NewGuid(), supplierName = "Proveedor Perceptor SA",
            supplierDocument = "20301112220", supplierTaxCondition = "ResponsableInscripto",
            issueDate = "2026-10-06", dueDate = "2026-10-30", currency = "ARS", exchangeRate = 1m,
            iibbPerception = 300m, ivaPerception = 450m, otherTaxes = 0m, items = new[] { Item(10000m, 21m) }
        }));

        var report = await Json(await client.GetAsync("/api/v1/finance/suffered?from=2026-10-01&to=2026-10-31"));
        var rows = report.GetProperty("rows").EnumerateArray().ToList();
        Assert.Contains(rows, r => r.GetProperty("tax").GetString() == "GAN" && r.GetProperty("amount").GetDecimal() == 800m);
        Assert.Contains(rows, r => r.GetProperty("tax").GetString() == "IVA" && r.GetProperty("kind").GetString() == "Percepción" && r.GetProperty("amount").GetDecimal() == 450m);
        Assert.Empty(report.GetProperty("problems").EnumerateArray());

        var retentions = Encoding.Latin1.GetString(await (await client.GetAsync("/api/v1/finance/suffered/sifere/retenciones?from=2026-10-01&to=2026-10-31")).Content.ReadAsByteArrayAsync());
        var r = retentions.Split("\r\n", StringSplitOptions.RemoveEmptyEntries).Single();
        Assert.Equal(79, r.Length);
        Assert.Equal("902" + "30-71234567-1" + "05/10/2026" + "0001" + "0000000000012345", r[..46]);
        Assert.Equal("00001500,00", r[^11..]);

        var perceptions = Encoding.Latin1.GetString(await (await client.GetAsync("/api/v1/finance/suffered/sifere/percepciones?from=2026-10-01&to=2026-10-31")).Content.ReadAsByteArrayAsync());
        var p = perceptions.Split("\r\n", StringSplitOptions.RemoveEmptyEntries).Single();
        Assert.Equal("921" + "20-30111222-0" + "06/10/2026" + "0005" + "00000077" + "F" + "A" + "00000300,00", p);
    }
}
