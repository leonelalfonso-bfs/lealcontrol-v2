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

public sealed class FiscalAuthorizationApiTests : IAsyncLifetime
{
    private readonly CrmWebApplicationFactory _factory = new();
    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    [Theory]
    [InlineData(true, "Admin", false, 200)]
    [InlineData(true, "Administrador", false, 200)]
    [InlineData(false, "Admin", false, 400)]
    [InlineData(true, "Sales", false, 403)]
    [InlineData(true, "", false, 401)]
    [InlineData(true, "Admin", true, 400)]
    public async Task Endpoint_respects_activation_roles_and_confirmed_lookup(
        bool enabled, string role, bool uncertain, int expectedStatus)
    {
        using var admin = _factory.CreateAuthenticatedClient();
        var id = await CreateDraft(admin);
        var gateway = new FakeGateway { Uncertain = uncertain };
        using var app = _factory.WithWebHostBuilder(builder =>
        {
            builder.UseSetting("Arca:EnableInvoiceAuthorization", enabled.ToString());
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<IArcaFiscalGateway>();
                services.AddSingleton<IArcaFiscalGateway>(gateway);
            });
        });
        using var client = app.CreateClient();
        if (role.Length > 0)
        {
            using var identity = _factory.CreateAuthenticatedClient(role: role);
            client.DefaultRequestHeaders.Authorization = identity.DefaultRequestHeaders.Authorization;
        }
        using var response = await client.PostAsync($"/api/v1/sales/invoices/{id}/authorize-arca", null);
        Assert.Equal((HttpStatusCode)expectedStatus, response.StatusCode);
        var shouldDispatch = enabled && (role == "Admin" || role == "Administrador");
        Assert.Equal(shouldDispatch ? 1 : 0, gateway.SubmitCalls);
        await using var db = new NpgsqlConnection(_factory.DatabaseConnectionString);
        await db.OpenAsync();
        await using (var query = new NpgsqlCommand("""
            SELECT "Status", "Cae" FROM sales.invoices WHERE "Id" = @id
            """, db))
        {
            query.Parameters.AddWithValue("id", id);
            await using var reader = await query.ExecuteReaderAsync();
            Assert.True(await reader.ReadAsync());
            Assert.Equal(expectedStatus == 200 ? "Authorized" : "Draft", reader.GetString(0));
            Assert.Equal(expectedStatus != 200, reader.IsDBNull(1));
        }
        await using (var count = new NpgsqlCommand("""
            SELECT count(*) FROM sales.fiscal_authorization_attempts WHERE "InvoiceId" = @id
            """, db))
        {
            count.Parameters.AddWithValue("id", id);
            Assert.Equal(shouldDispatch ? 1L : 0L, await count.ExecuteScalarAsync());
        }
        if (expectedStatus == 200)
        {
            using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            Assert.Equal("Authorized", body.RootElement.GetProperty("status").GetString());
            Assert.Equal(42, body.RootElement.GetProperty("invoiceNumber").GetInt32());
            Assert.Equal("12345678901234", body.RootElement.GetProperty("cae").GetString());
        }
        if (shouldDispatch)
        {
            using var repeated = await client.PostAsync($"/api/v1/sales/invoices/{id}/authorize-arca", null);
            Assert.Equal(response.StatusCode, repeated.StatusCode);
            Assert.Equal(1, gateway.SubmitCalls);
            Assert.Equal(1, gateway.NumberingCalls);
        }
    }

    private static async Task<Guid> CreateDraft(HttpClient client)
    {
        using var response = await client.PostAsJsonAsync("/api/v1/sales/invoices", new
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
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        return doc.RootElement.GetProperty("id").GetGuid();
    }

    private sealed class FakeGateway : IArcaFiscalGateway
    {
        public bool Uncertain { get; init; }
        public int SubmitCalls { get; private set; }
        public int NumberingCalls { get; private set; }
        private ArcaFiscalVoucherObservation? _observation;

        public Task<ArcaFiscalNumbering> GetLastAuthorizedAsync(int point, int type, CancellationToken ct)
        {
            NumberingCalls++;
            return Task.FromResult(new ArcaFiscalNumbering(true, 41, "30715489629", false, "prueba"));
        }
        public Task<WsfeCaeReply> SubmitCaeAsync(IWsfeInvoiceAServiceData data, int point,
            long number, string issuer, bool production, CancellationToken ct)
        {
            SubmitCalls++;
            Assert.Equal(1, SubmitCalls);
            Assert.Equal(42, number);
            Assert.Equal("30715489629", issuer);
            Assert.False(production);
            var fields = new WsfeVoucherFiscalData(data.ReceiverCuit, data.ReceiverDocumentType,
                data.ReceiverVatCondition, data.VoucherType, data.Concept, data.IssueDate,
                data.ServiceFrom, data.ServiceTo, data.PaymentDue, data.NetAmount, data.VatAmount,
                data.TotalAmount, data.VatRateCode, data.CurrencyCode, data.ExchangeRate);
            var due = new DateTime(2026, 10, 15, 0, 0, 0, DateTimeKind.Utc);
            _observation = new(true, number, data.ReceiverCuit, data.TotalAmount,
                "12345678901234", due, "prueba", fields);
            return Task.FromResult(Uncertain
                ? new WsfeCaeReply(WsfeCaeOutcome.Unknown, null, null, "prueba")
                : new WsfeCaeReply(WsfeCaeOutcome.ApprovedPendingConsultation, "12345678901234", due, "prueba"));
        }
        public Task<ArcaFiscalVoucherObservation> GetVoucherAsync(int point, int type,
            long number, string issuer, bool production, CancellationToken ct) =>
            Task.FromResult(Uncertain
                ? new ArcaFiscalVoucherObservation(false, 0, string.Empty, 0m, string.Empty, default, "prueba")
                : _observation!);
    }
}
