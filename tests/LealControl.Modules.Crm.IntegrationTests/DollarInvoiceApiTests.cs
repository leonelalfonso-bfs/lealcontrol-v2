using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LealControl.Modules.Crm.Contracts.Fiscal;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class DollarInvoiceApiTests : IAsyncLifetime
{
    private static readonly string Today = DateTime.UtcNow.AddHours(-3).ToString("yyyy-MM-dd");
    private readonly CrmWebApplicationFactory _factory = new();
    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    [Fact]
    public async Task Same_currency_dollar_invoice_requires_the_official_arca_rate()
    {
        var gateway = new RateGateway(1450.5m);
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

        using (var quote = await client.GetAsync($"/api/v1/sales/invoices/arca-exchange-rate?date={Today}"))
        {
            using var body = JsonDocument.Parse(await quote.Content.ReadAsStringAsync());
            Assert.True(body.RootElement.GetProperty("ok").GetBoolean());
            Assert.Equal(1450.5m, body.RootElement.GetProperty("rate").GetDecimal());
        }

        using var created = await client.PostAsJsonAsync("/api/v1/sales/invoices", new
        {
            invoiceType = "A", pointOfSale = 3, customerId = Guid.NewGuid(),
            customerName = "Cliente de prueba", customerDocument = "20123456786",
            customerTaxCondition = "ResponsableInscripto", issueDate = Today, dueDate = Today,
            fiscalConcept = 1, currency = "USD", exchangeRate = 1400m, paidInForeignCurrency = true,
            items = new[] { new { code = "EQ", description = "Equipo", quantity = 1m, unitPrice = 100m, vatRate = 21m } }
        });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        Guid id;
        using (var doc = JsonDocument.Parse(await created.Content.ReadAsStringAsync()))
        {
            id = doc.RootElement.GetProperty("id").GetGuid();
            Assert.True(doc.RootElement.GetProperty("paidInForeignCurrency").GetBoolean());
        }

        // Con una cotización distinta a la oficial no se reserva número ni se envía nada.
        using (var mismatch = await client.PostAsync($"/api/v1/sales/invoices/{id}/authorize-arca", null))
        {
            Assert.Equal(HttpStatusCode.BadRequest, mismatch.StatusCode);
            Assert.Contains("no coincide", await mismatch.Content.ReadAsStringAsync());
        }
        Assert.Null(gateway.Submitted);

        using (var applied = await client.PostAsync($"/api/v1/sales/invoices/{id}/apply-arca-rate", null))
        {
            Assert.Equal(HttpStatusCode.OK, applied.StatusCode);
            using var doc = JsonDocument.Parse(await applied.Content.ReadAsStringAsync());
            Assert.Equal(1450.5m, doc.RootElement.GetProperty("exchangeRate").GetDecimal());
        }

        using (var authorized = await client.PostAsync($"/api/v1/sales/invoices/{id}/authorize-arca", null))
            Assert.Equal(HttpStatusCode.OK, authorized.StatusCode);
        Assert.NotNull(gateway.Submitted);
        Assert.Equal("DOL", gateway.Submitted.CurrencyCode);
        Assert.Equal(1450.5m, gateway.Submitted.ExchangeRate);
        Assert.True(gateway.Submitted.PaidInSameForeignCurrency);

        // Ya enviada, la cotización no se puede cambiar.
        using var locked = await client.PostAsync($"/api/v1/sales/invoices/{id}/apply-arca-rate", null);
        Assert.Equal(HttpStatusCode.BadRequest, locked.StatusCode);
    }

    private sealed class RateGateway(decimal rate) : IArcaFiscalGateway
    {
        public WsfeVoucherData? Submitted { get; private set; }
        private ArcaFiscalVoucherObservation? _observation;

        public Task<ArcaExchangeRate> GetExchangeRateAsync(string currencyCode, string? issueDate, CancellationToken ct) =>
            Task.FromResult(new ArcaExchangeRate(true, rate, "20261006", "prueba"));

        public Task<ArcaFiscalNumbering> GetLastAuthorizedAsync(int point, int type, CancellationToken ct) =>
            Task.FromResult(new ArcaFiscalNumbering(true, 41, "30715489629", false, "prueba"));

        public Task<WsfeCaeReply> SubmitCaeAsync(WsfeVoucherData data, int point,
            long number, string issuer, bool production, CancellationToken ct)
        {
            Submitted = data;
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
