using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Npgsql;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class ReceivableBalancesApiTests : IAsyncLifetime
{
    private const string Today = "2026-10-02";
    private readonly CrmWebApplicationFactory _factory = new();
    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    [Fact]
    public async Task Balances_come_from_the_server_with_usd_collections_credit_notes_and_voided_receipts()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var customer = Guid.NewGuid();
        async Task<Guid> Create(string type, string currency, decimal rate, decimal price, Guid? associated = null)
        {
            using var response = await client.PostAsJsonAsync("/api/v1/sales/invoices", new
            {
                invoiceType = type, pointOfSale = 3, customerId = customer, customerName = "Cliente",
                customerDocument = "20123456786", customerTaxCondition = "ResponsableInscripto",
                issueDate = Today, dueDate = Today, fiscalConcept = 1, currency, exchangeRate = rate,
                associatedInvoiceId = associated, restockItems = false,
                items = new[] { new { code = "X", description = "Ítem", quantity = 1m, unitPrice = price, vatRate = 21m } }
            });
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            return doc.RootElement.GetProperty("id").GetGuid();
        }

        var usd = await Create("A", "USD", 1000m, 100m);       // USD 121
        var ars = await Create("A", "ARS", 1m, 1000m);         // $ 1.210
        var legacy = await Create("A", "ARS", 1m, 100m);       // $ 121
        var note = await Create("NC_A", "ARS", 1m, 100m, ars); // $ 121 sobre la de $ 1.210

        await using (var db = new NpgsqlConnection(_factory.DatabaseConnectionString))
        {
            await db.OpenAsync();
            var active = Guid.NewGuid();
            var voided = Guid.NewGuid();
            var old = Guid.NewGuid();
            await using var seed = new NpgsqlCommand("""
                UPDATE sales.invoices SET "Status" = 'Authorized' WHERE "Id" = @note;
                INSERT INTO finance."CollectionReceipts"
                    ("Id","TenantId","AccountId","CustomerId","InvoiceId","ReceiptNumber","Amount","Currency","ReceiptDateUtc","Description","Status","CreatedAtUtc")
                VALUES (@active,@t,@acc,@c,NULL,'RC-1',66000,'ARS',now(),'Cobro','Confirmed',now()),
                       (@voided,@t,@acc,@c,NULL,'RC-2',500,'ARS',now(),'Anulado','Voided',now()),
                       (@old,@t,@acc,@c,@legacy,'RC-3',21,'ARS',now(),'Viejo','Confirmed',now());
                INSERT INTO finance."CollectionReceiptImputations"
                    ("Id","TenantId","ReceiptId","InvoiceId","InvoiceNumber","InvoiceTotal","AmountImputed","AmountUsd","InvoiceExchangeRate","PaymentExchangeRate","ExchangeDifferenceArs","Status","CreatedAtUtc")
                VALUES (gen_random_uuid(),@t,@active,@usd,'x',121,55000,50,1000,1100,5000,'Active',now()),
                       (gen_random_uuid(),@t,@active,@ars,'y',1210,11000,NULL,NULL,NULL,NULL,'Active',now()),
                       (gen_random_uuid(),@t,@voided,@ars,'y',1210,500,NULL,NULL,NULL,NULL,'Active',now());
                """, db);
            seed.Parameters.AddWithValue("note", note);
            seed.Parameters.AddWithValue("active", active);
            seed.Parameters.AddWithValue("voided", voided);
            seed.Parameters.AddWithValue("old", old);
            seed.Parameters.AddWithValue("t", CrmWebApplicationFactory.DemoTenantId);
            seed.Parameters.AddWithValue("acc", Guid.NewGuid());
            seed.Parameters.AddWithValue("c", customer);
            seed.Parameters.AddWithValue("usd", usd);
            seed.Parameters.AddWithValue("ars", ars);
            seed.Parameters.AddWithValue("legacy", legacy);
            await seed.ExecuteNonQueryAsync();
        }

        using var list = await client.GetAsync("/api/v1/sales/invoices");
        using var body = JsonDocument.Parse(await list.Content.ReadAsStringAsync());
        JsonElement Row(Guid id) => body.RootElement.EnumerateArray().Single(e => e.GetProperty("id").GetGuid() == id);

        // USD 121 con USD 50 cobrados en pesos: quedan USD 71 (no se suman los $ 55.000).
        Assert.Equal(50m, Row(usd).GetProperty("collected").GetDecimal());
        Assert.Equal(71m, Row(usd).GetProperty("pending").GetDecimal());
        // $ 1.210 con $ 11.000 imputados es más que el total: queda 0; el recibo anulado no suma.
        Assert.Equal(11000m, Row(ars).GetProperty("collected").GetDecimal());
        Assert.Equal(121m, Row(ars).GetProperty("credited").GetDecimal());
        Assert.Equal(0m, Row(ars).GetProperty("pending").GetDecimal());
        // Recibo viejo sin imputaciones: cuenta por su factura.
        Assert.Equal(100m, Row(legacy).GetProperty("pending").GetDecimal());
        // La nota de crédito no es un saldo a cobrar.
        Assert.Equal(0m, Row(note).GetProperty("pending").GetDecimal());
    }
}
