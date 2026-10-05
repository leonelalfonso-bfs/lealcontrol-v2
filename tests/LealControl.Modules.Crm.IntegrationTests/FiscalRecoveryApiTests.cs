using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LealControl.Modules.Crm.Contracts.Fiscal;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Npgsql;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class FiscalRecoveryApiTests : IAsyncLifetime
{
    private readonly CrmWebApplicationFactory _factory = new();
    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    [Theory]
    [InlineData("Pending", "Admin", 200, 1)]
    [InlineData("Unknown", "Admin", 200, 1)]
    [InlineData("Pending", "Administrador", 200, 1)]
    [InlineData("Unknown", "SuperAdmin", 200, 1)]
    [InlineData("Reserved", "Admin", 400, 0)]
    [InlineData("Rejected", "Admin", 400, 0)]
    [InlineData("None", "Admin", 400, 0)]
    [InlineData("Pending", "Sales", 403, 0)]
    [InlineData("Pending", "Anonymous", 401, 0)]
    [InlineData("Pending", "ForeignAdmin", 403, 0)]
    public async Task Disabled_emission_allows_only_recovery_of_sent_reservations(
        string status, string role, int expectedStatus, int lookups)
    {
        using var seedClient = _factory.CreateAuthenticatedClient();
        using var created = await seedClient.PostAsJsonAsync("/api/v1/sales/invoices", new
        {
            invoiceType = "A", pointOfSale = 3, customerId = Guid.NewGuid(),
            customerName = "Cliente de prueba", customerDocument = "20123456786",
            customerTaxCondition = "ResponsableInscripto", issueDate = "2026-10-02",
            dueDate = "2026-10-12", fiscalConcept = 2,
            serviceFrom = "2026-10-01", serviceTo = "2026-10-02",
            currency = "ARS", exchangeRate = 1m,
            items = new[] { new { code = "SERV", description = "Servicio de prueba",
                quantity = 1m, unitPrice = 1m, vatRate = 21m } }
        });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        using var body = JsonDocument.Parse(await created.Content.ReadAsStringAsync());
        var id = body.RootElement.GetProperty("id").GetGuid();
        var fields = new WsfeVoucherFiscalData("20123456786", 80, 1, 1, 2,
            "20261002", "20261001", "20261002", "20261012", 1m, .21m, 1.21m, 5, "PES", 1m);
        await using var db = new NpgsqlConnection(_factory.DatabaseConnectionString);
        await db.OpenAsync();
        if (status != "None")
        {
            await using var seed = new NpgsqlCommand("""
                INSERT INTO sales.fiscal_authorization_attempts
                ("Id","TenantId","InvoiceId","PointOfSale","VoucherType","VoucherNumber",
                 "IssuerCuit","Production","RequestHash","RecipientDocument","Total","Status","CreatedAtUtc")
                VALUES (@id,@tenant,@invoice,3,1,42,'30715489629',false,@hash,'20123456786',1.21,@status,@created)
                """, db);
            seed.Parameters.AddWithValue("id", Guid.NewGuid());
            seed.Parameters.AddWithValue("tenant", CrmWebApplicationFactory.DemoTenantId);
            seed.Parameters.AddWithValue("invoice", id);
            seed.Parameters.AddWithValue("hash", WsfeCaeRequestBuilder.Fingerprint(fields, 3, 42, "30715489629"));
            seed.Parameters.AddWithValue("status", status);
            seed.Parameters.AddWithValue("created", DateTime.UtcNow);
            await seed.ExecuteNonQueryAsync();
        }
        var gateway = new RecoveryOnlyGateway(fields);
        using var app = _factory.WithWebHostBuilder(builder =>
        {
            builder.UseSetting("Arca:EnableInvoiceAuthorization", "false");
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<IArcaFiscalGateway>();
                services.AddSingleton<IArcaFiscalGateway>(gateway);
            });
        });
        using var client = app.CreateClient();
        if (role != "Anonymous")
        {
            using var authenticated = _factory.CreateAuthenticatedClient(
                tenantId: role == "ForeignAdmin" ? Guid.NewGuid() : null,
                role: role == "ForeignAdmin" ? "Admin" : role);
            client.DefaultRequestHeaders.Authorization = authenticated.DefaultRequestHeaders.Authorization;
        }
        using var response = await client.PostAsync($"/api/v1/sales/invoices/{id}/recover-arca", null);
        Assert.Equal(expectedStatus, (int)response.StatusCode);
        Assert.Equal(lookups, gateway.LookupCalls);
        Assert.Equal(0, gateway.NumberingCalls);
        Assert.Equal(0, gateway.SubmitCalls);
        await using var saved = new NpgsqlCommand("SELECT \"Status\", \"Cae\" FROM sales.invoices WHERE \"Id\" = @id", db);
        saved.Parameters.AddWithValue("id", id);
        await using var reader = await saved.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        Assert.Equal(expectedStatus == 200 ? "Authorized" : "Draft", reader.GetString(0));
        if (expectedStatus == 200) Assert.Equal("12345678901234", reader.GetString(1));
        else Assert.True(reader.IsDBNull(1));
    }

    private sealed class RecoveryOnlyGateway(WsfeVoucherFiscalData fields) : IArcaFiscalGateway
    {
        public int NumberingCalls { get; private set; }
        public int SubmitCalls { get; private set; }
        public int LookupCalls { get; private set; }
        public Task<ArcaFiscalNumbering> GetLastAuthorizedAsync(int pointOfSale, int voucherType, CancellationToken cancellationToken)
        {
            NumberingCalls++;
            throw new InvalidOperationException("La recuperación no debe reservar números.");
        }
        public Task<WsfeCaeReply> SubmitCaeAsync(IWsfeInvoiceAServiceData data, int pointOfSale,
            long reservedNumber, string expectedIssuerCuit, bool expectedProduction, CancellationToken cancellationToken)
        {
            SubmitCalls++;
            throw new InvalidOperationException("La recuperación no debe enviar comprobantes.");
        }
        public Task<ArcaFiscalVoucherObservation> GetVoucherAsync(int pointOfSale, int voucherType,
            long number, string expectedIssuerCuit, bool expectedProduction, CancellationToken cancellationToken)
        {
            LookupCalls++;
            Assert.Equal(3, pointOfSale);
            Assert.Equal(1, voucherType);
            Assert.Equal(42L, number);
            Assert.Equal("30715489629", expectedIssuerCuit);
            Assert.False(expectedProduction);
            return Task.FromResult(new ArcaFiscalVoucherObservation(true, 42, fields.ReceiverCuit,
                fields.TotalAmount, "12345678901234", new DateTime(2026, 10, 15, 0, 0, 0, DateTimeKind.Utc),
                "Respuesta simulada", fields));
        }
    }
}
