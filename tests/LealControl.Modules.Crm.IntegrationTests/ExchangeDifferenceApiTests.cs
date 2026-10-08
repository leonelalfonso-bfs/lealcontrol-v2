using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LealControl.Modules.Sales.Infrastructure.Services;
using Npgsql;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class ExchangeDifferenceApiTests : IAsyncLifetime
{
    // Mismo día que FiscalTestClock: las ventanas de fecha de ARCA se miden contra ese reloj.
    private const string Today = "2026-10-02";
    private readonly CrmWebApplicationFactory _factory = new();
    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    [Fact]
    public async Task Exchange_difference_note_is_in_pesos_matches_the_collection_and_is_issued_once()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var customer = Guid.NewGuid();

        // Factura USD 121 (100 + IVA 21%) a TC 1.000, cobrada en pesos a TC 1.100: diferencia 12.100.
        using var created = await client.PostAsJsonAsync("/api/v1/sales/invoices", new
        {
            invoiceType = "A", pointOfSale = 3, customerId = customer,
            customerName = "Cliente de prueba", customerDocument = "20123456786",
            customerTaxCondition = "ResponsableInscripto", issueDate = Today, dueDate = Today,
            fiscalConcept = 1, currency = "USD", exchangeRate = 1000m, exchangeRateType = "Billete",
            items = new[] { new { code = "EQ", description = "Equipo", quantity = 1m, unitPrice = 100m, vatRate = 21m } }
        });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        Guid invoiceId;
        using (var doc = JsonDocument.Parse(await created.Content.ReadAsStringAsync()))
        {
            invoiceId = doc.RootElement.GetProperty("id").GetGuid();
            Assert.Equal("Billete", doc.RootElement.GetProperty("exchangeRateType").GetString());
        }

        // Se persiste: la pantalla de cobranzas la lee del listado.
        using (var listed = await client.GetAsync("/api/v1/sales/invoices"))
        {
            using var doc = JsonDocument.Parse(await listed.Content.ReadAsStringAsync());
            var row = doc.RootElement.EnumerateArray().Single(e => e.GetProperty("id").GetGuid() == invoiceId);
            Assert.Equal("Billete", row.GetProperty("exchangeRateType").GetString());
        }

        var imputationId = Guid.NewGuid();
        await using (var db = new NpgsqlConnection(_factory.DatabaseConnectionString))
        {
            await db.OpenAsync();
            var receiptId = Guid.NewGuid();
            await using var seed = new NpgsqlCommand("""
                INSERT INTO finance."CollectionReceipts"
                    ("Id","TenantId","AccountId","CustomerId","ReceiptNumber","Amount","Currency",
                     "ReceiptDateUtc","Description","Status","CreatedAtUtc")
                VALUES (@receipt,@tenant,@account,@customer,'RC-0099',133100,'ARS',now(),'Cobro','Confirmed',now());
                INSERT INTO finance."CollectionReceiptImputations"
                    ("Id","TenantId","ReceiptId","InvoiceId","InvoiceNumber","InvoiceTotal","AmountImputed",
                     "AmountUsd","InvoiceExchangeRate","PaymentExchangeRate","ExchangeDifferenceArs","Status","CreatedAtUtc")
                VALUES (@imputation,@tenant,@receipt,@invoice,'0003-00000001',121,133100,121,1000,1100,12100,'Active',now());
                """, db);
            seed.Parameters.AddWithValue("receipt", receiptId);
            seed.Parameters.AddWithValue("tenant", CrmWebApplicationFactory.DemoTenantId);
            seed.Parameters.AddWithValue("account", Guid.NewGuid());
            seed.Parameters.AddWithValue("customer", customer);
            seed.Parameters.AddWithValue("imputation", imputationId);
            seed.Parameters.AddWithValue("invoice", invoiceId);
            await seed.ExecuteNonQueryAsync();
        }

        Task<HttpResponseMessage> Note(string type, decimal net) =>
            client.PostAsJsonAsync("/api/v1/sales/invoices", new
            {
                invoiceType = type, pointOfSale = 3, customerId = customer,
                customerName = "Cliente de prueba", customerDocument = "20123456786",
                customerTaxCondition = "ResponsableInscripto", issueDate = Today, dueDate = Today,
                fiscalConcept = 1, currency = "ARS", exchangeRate = 1m,
                associatedInvoiceId = invoiceId, exchangeDifferenceImputationId = imputationId,
                items = new[] { new { code = "DIF-CAMBIO", description = "Diferencia de cambio", quantity = 1m, unitPrice = net, vatRate = 21m } }
            });

        // 10.000 + IVA 2.100 = 12.100: coincide con la diferencia del cobro.
        using (var wrongAmount = await Note("ND_A", 9000m))
            Assert.Equal(HttpStatusCode.BadRequest, wrongAmount.StatusCode);
        using (var wrongType = await Note("NC_A", 10000m))
            Assert.Equal(HttpStatusCode.BadRequest, wrongType.StatusCode);
        using (var debit = await Note("ND_A", 10000m))
        {
            Assert.Equal(HttpStatusCode.Created, debit.StatusCode);
            using var doc = JsonDocument.Parse(await debit.Content.ReadAsStringAsync());
            Assert.Equal("ARS", doc.RootElement.GetProperty("currency").GetString());
            Assert.Equal(12100m, doc.RootElement.GetProperty("total").GetDecimal());
            Assert.Equal(imputationId, doc.RootElement.GetProperty("exchangeDifferenceImputationId").GetGuid());
        }
        using (var again = await Note("ND_A", 10000m))
            Assert.Equal(HttpStatusCode.BadRequest, again.StatusCode);
    }

    [Fact]
    public void Parses_bna_history_in_both_number_formats()
    {
        const string html = "<tr><td>Dolar U.S.A</td><td>1490,0000</td><td>1540,0000</td><td>6/10/2026</td></tr>" +
                            "<tr><td>Dolar U.S.A</td><td>1508.0000</td><td>1517.0000</td><td>7/10/2026</td></tr>";
        var rows = ExchangeRateService.ParseBnaHistory(html).OrderBy(r => r.Date).ToList();
        Assert.Equal(2, rows.Count);
        Assert.Equal("2026-10-06", rows[0].Date);
        Assert.Equal(1540m, rows[0].Sell);
        Assert.Equal(1517m, rows[1].Sell);
        Assert.Equal(1508m, rows[1].Buy);
    }
}
