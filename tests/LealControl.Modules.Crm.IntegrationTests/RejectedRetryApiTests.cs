using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LealControl.Modules.Crm.Contracts.Fiscal;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class RejectedRetryApiTests : IAsyncLifetime
{
    private static readonly string Today = DateTime.UtcNow.AddHours(-3).ToString("yyyy-MM-dd");
    private readonly CrmWebApplicationFactory _factory = new();
    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    [Fact]
    public async Task Rejected_draft_shows_arca_reason_and_can_be_replaced_reusing_the_number()
    {
        var gateway = new RejectOnceGateway();
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

        async Task<Guid> Create(Guid? replaces)
        {
            using var response = await client.PostAsJsonAsync("/api/v1/sales/invoices", new
            {
                invoiceType = "A", pointOfSale = 3, customerId = customer,
                customerName = "Cliente", customerDocument = "20123456786",
                customerTaxCondition = "ResponsableInscripto", issueDate = Today, dueDate = Today,
                fiscalConcept = 1, currency = "ARS", exchangeRate = 1m, replacesInvoiceId = replaces,
                items = new[] { new { code = "X", description = "Ítem", quantity = 1m, unitPrice = 100m, vatRate = 21m } }
            });
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            return doc.RootElement.GetProperty("id").GetGuid();
        }

        var first = await Create(null);
        using (var rejected = await client.PostAsync($"/api/v1/sales/invoices/{first}/authorize-arca", null))
        {
            Assert.Equal(HttpStatusCode.BadRequest, rejected.StatusCode);
            Assert.Contains("10016", await rejected.Content.ReadAsStringAsync());
        }
        using (var status = await client.GetAsync("/api/v1/sales/invoices/fiscal-status"))
            Assert.Contains("10016", await status.Content.ReadAsStringAsync());

        var second = await Create(first);
        using (var authorized = await client.PostAsync($"/api/v1/sales/invoices/{second}/authorize-arca", null))
            Assert.Equal(HttpStatusCode.OK, authorized.StatusCode);
        // El número que ARCA no usó (42) se vuelve a reservar.
        Assert.Equal([42L, 42L], gateway.Numbers);

        using var old = await client.GetAsync($"/api/v1/sales/invoices/{first}");
        using var doc = JsonDocument.Parse(await old.Content.ReadAsStringAsync());
        Assert.Equal("Cancelled", doc.RootElement.GetProperty("status").GetString());

        // Un comprobante autorizado o un borrador sin rechazo no se reemplazan.
        using var notReplaceable = await client.PostAsJsonAsync("/api/v1/sales/invoices", new
        {
            invoiceType = "A", pointOfSale = 3, customerId = customer, customerName = "Cliente",
            customerDocument = "20123456786", customerTaxCondition = "ResponsableInscripto",
            issueDate = Today, dueDate = Today, fiscalConcept = 1, currency = "ARS", exchangeRate = 1m,
            replacesInvoiceId = second,
            items = new[] { new { code = "X", description = "Ítem", quantity = 1m, unitPrice = 100m, vatRate = 21m } }
        });
        Assert.Equal(HttpStatusCode.BadRequest, notReplaceable.StatusCode);
    }

    private sealed class RejectOnceGateway : IArcaFiscalGateway
    {
        public List<long> Numbers { get; } = [];
        private ArcaFiscalVoucherObservation? _observation;

        public Task<ArcaFiscalNumbering> GetLastAuthorizedAsync(int point, int type, CancellationToken ct) =>
            Task.FromResult(new ArcaFiscalNumbering(true, 41, "30715489629", false, "prueba"));

        public Task<WsfeCaeReply> SubmitCaeAsync(WsfeVoucherData data, int point,
            long number, string issuer, bool production, CancellationToken ct)
        {
            Numbers.Add(number);
            if (Numbers.Count == 1)
                return Task.FromResult(new WsfeCaeReply(WsfeCaeOutcome.Rejected, null, null,
                    "ARCA rechazó el comprobante: [10016] Fecha fuera de rango"));
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
