using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LealControl.Modules.Crm.Contracts.Fiscal;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class FceApiTests : IAsyncLifetime
{
    private static readonly string Today = DateTime.UtcNow.AddHours(-3).ToString("yyyy-MM-dd");
    private static readonly string InAMonth = DateTime.UtcNow.AddHours(-3).AddDays(30).ToString("yyyy-MM-dd");
    private readonly CrmWebApplicationFactory _factory = new();
    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    [Fact]
    public async Task Obligated_customer_blocks_common_invoice_and_accepts_fce()
    {
        var gateway = new FceGateway();
        using var app = _factory.WithWebHostBuilder(builder =>
        {
            builder.UseSetting("Arca:EnableInvoiceAuthorization", "true");
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<IArcaFiscalGateway>();
                services.AddSingleton<IArcaFiscalGateway>(gateway);
            });
        });
        using var client = app.CreateClient();
        using var identity = _factory.CreateAuthenticatedClient();
        client.DefaultRequestHeaders.Authorization = identity.DefaultRequestHeaders.Authorization;
        var customer = Guid.NewGuid();

        async Task<Guid> Create(string type, decimal price = 2_000_000m)
        {
            using var response = await client.PostAsJsonAsync("/api/v1/sales/invoices", new
            {
                invoiceType = type, pointOfSale = 3, customerId = customer,
                customerName = "Gran empresa", customerDocument = "20123456786",
                customerTaxCondition = "ResponsableInscripto", issueDate = Today, dueDate = InAMonth,
                fiscalConcept = 1, currency = "ARS", exchangeRate = 1m,
                fceCbu = "0070123420000012345678", fceTransferMode = "SCA",
                items = new[] { new { code = "EQ", description = "Equipo", quantity = 1m, unitPrice = price, vatRate = 21m } }
            });
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            return doc.RootElement.GetProperty("id").GetGuid();
        }

        var common = await Create("A");
        using (var blocked = await client.PostAsync($"/api/v1/sales/invoices/{common}/authorize-arca", null))
        {
            Assert.Equal(HttpStatusCode.BadRequest, blocked.StatusCode);
            Assert.Contains("FCE", await blocked.Content.ReadAsStringAsync());
        }
        Assert.Empty(gateway.Submitted);

        // Una FCE por debajo del mínimo tampoco se autoriza.
        var smallFce = await Create("FCE_A", 1_000m);
        using (var belowMinimum = await client.PostAsync($"/api/v1/sales/invoices/{smallFce}/authorize-arca", null))
            Assert.Equal(HttpStatusCode.BadRequest, belowMinimum.StatusCode);
        Assert.Empty(gateway.Submitted);

        var fce = await Create("FCE_A");
        using (var authorized = await client.PostAsync($"/api/v1/sales/invoices/{fce}/authorize-arca", null))
            Assert.Equal(HttpStatusCode.OK, authorized.StatusCode);
        var data = Assert.Single(gateway.Submitted);
        Assert.Equal(201, data.VoucherType);
        Assert.Contains(new WsfeOptional("2101", "0070123420000012345678"), data.OptionalList);
        Assert.NotNull(data.PaymentDue);
    }

    private sealed class FceGateway : IArcaFiscalGateway
    {
        public List<WsfeVoucherData> Submitted { get; } = [];
        private ArcaFiscalVoucherObservation? _observation;

        public Task<ArcaFceObligation> GetFceObligationAsync(string receiverCuit, DateOnly issueDate, CancellationToken ct) =>
            Task.FromResult(new ArcaFceObligation(true, true, 1_500_000m, "prueba"));

        public Task<ArcaFiscalNumbering> GetLastAuthorizedAsync(int point, int type, CancellationToken ct) =>
            Task.FromResult(new ArcaFiscalNumbering(true, 41, "30715489629", false, "prueba"));

        public Task<WsfeCaeReply> SubmitCaeAsync(WsfeVoucherData data, int point,
            long number, string issuer, bool production, CancellationToken ct)
        {
            Submitted.Add(data);
            var due = new DateTime(2026, 10, 25, 0, 0, 0, DateTimeKind.Utc);
            _observation = new(true, number, data.ReceiverDocumentNumber, data.TotalAmount,
                "12345678901234", due, "prueba", data);
            return Task.FromResult(new WsfeCaeReply(
                WsfeCaeOutcome.ApprovedPendingConsultation, "12345678901234", due, "prueba"));
        }

        public Task<ArcaFiscalVoucherObservation> GetVoucherAsync(int point, int type,
            long number, string issuer, bool production, CancellationToken ct) =>
            Task.FromResult(_observation!);
    }
}
