using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Npgsql;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class FiscalAuthorizationReservationDbTests : IAsyncLifetime
{
    private readonly CrmWebApplicationFactory _factory = new();
    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    [Fact]
    public async Task Bootstrap_creates_reservations_and_prevents_reusing_an_official_number()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var first = await CreateDraft(client);
        var second = await CreateDraft(client);
        await using var db = new NpgsqlConnection(_factory.DatabaseConnectionString);
        await db.OpenAsync();

        await InsertReservation(db, first, 9001);
        var error = await Assert.ThrowsAsync<PostgresException>(
            () => InsertReservation(db, second, 9001));
        Assert.Equal("23505", error.SqlState);
    }

    private static async Task<Guid> CreateDraft(HttpClient client)
    {
        var response = await client.PostAsJsonAsync("/api/v1/sales/invoices", new
        {
            invoiceType = "A", pointOfSale = 5,
            customerId = Guid.NewGuid(), customerName = "Cliente prueba",
            customerDocument = "20123456786", customerTaxCondition = "ResponsableInscripto",
            dueDate = DateTime.UtcNow.AddDays(30), currency = "ARS", exchangeRate = 1,
            items = new[] { new { code = "S", description = "Servicio", quantity = 1,
                unitPrice = 1, vatRate = 0 } }
        });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return body.RootElement.GetProperty("id").GetGuid();
    }

    private static async Task InsertReservation(NpgsqlConnection db, Guid invoiceId, long number)
    {
        await using var cmd = new NpgsqlCommand("""
            INSERT INTO sales.fiscal_authorization_attempts
            ("Id","TenantId","InvoiceId","PointOfSale","VoucherType","VoucherNumber",
             "IssuerCuit","Production","RequestHash","RecipientDocument","Total","Status","CreatedAtUtc")
            VALUES (@id,@tenant,@invoice,5,1,@number,'30715489629',false,@hash,'20123456786',1,'Pending',@created)
            """, db);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid());
        cmd.Parameters.AddWithValue("tenant", CrmWebApplicationFactory.DemoTenantId);
        cmd.Parameters.AddWithValue("invoice", invoiceId);
        cmd.Parameters.AddWithValue("number", number);
        cmd.Parameters.AddWithValue("hash", new string('a', 64));
        cmd.Parameters.AddWithValue("created", DateTime.UtcNow);
        await cmd.ExecuteNonQueryAsync();
    }
}
