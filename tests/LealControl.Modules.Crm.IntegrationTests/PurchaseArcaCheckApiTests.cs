using System.Net.Http.Json;
using System.Text.Json;
using LealControl.Modules.Crm.Contracts.Fiscal;
using LealControl.Modules.Crm.Infrastructure.Arca;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>Constatación de facturas de compra contra ARCA (wscdc), con ARCA simulado.</summary>
public sealed class PurchaseArcaCheckApiTests : IAsyncLifetime
{
    private readonly CrmWebApplicationFactory _factory = new();
    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    [Fact]
    public void Arca_answers_are_read()
    {
        const string approved = """
            <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ComprobanteConstatarResponse xmlns="http://servicios1.afip.gob.ar/wscdc/">
            <ComprobanteConstatarResult><CmpResp><CbteModo>CAE</CbteModo></CmpResp><Resultado>A</Resultado><FchProceso>20261026</FchProceso></ComprobanteConstatarResult>
            </ComprobanteConstatarResponse></soap:Body></soap:Envelope>
            """;
        const string rejected = """
            <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ComprobanteConstatarResponse xmlns="http://servicios1.afip.gob.ar/wscdc/">
            <ComprobanteConstatarResult><Resultado>R</Resultado><Observaciones><Obs><Code>102</Code><Msg>El importe informado no corresponde</Msg></Obs></Observaciones></ComprobanteConstatarResult>
            </ComprobanteConstatarResponse></soap:Body></soap:Envelope>
            """;
        const string error = """
            <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ComprobanteConstatarResponse xmlns="http://servicios1.afip.gob.ar/wscdc/">
            <ComprobanteConstatarResult><Errors><Err><Code>600</Code><Msg>No autorizado</Msg></Err></Errors></ComprobanteConstatarResult>
            </ComprobanteConstatarResponse></soap:Body></soap:Envelope>
            """;
        Assert.Equal(ArcaVoucherCheckOutcome.Approved, WscdcResponseParser.Parse(approved).Outcome);
        var r = WscdcResponseParser.Parse(rejected);
        Assert.Equal(ArcaVoucherCheckOutcome.Rejected, r.Outcome);
        Assert.Contains("102 El importe informado no corresponde", r.Detail);
        var e = WscdcResponseParser.Parse(error);
        Assert.Equal(ArcaVoucherCheckOutcome.Unavailable, e.Outcome);
        Assert.Contains("600 No autorizado", e.Detail);
    }

    [Fact]
    public async Task Purchase_invoices_are_checked_one_by_one_and_by_period()
    {
        var gateway = new FakeWscdc();
        using var app = _factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<IArcaFiscalGateway>();
            services.AddSingleton<IArcaFiscalGateway>(gateway);
        }));
        using var client = app.CreateClient();
        using var identity = _factory.CreateAuthenticatedClient();
        client.DefaultRequestHeaders.Authorization = identity.DefaultRequestHeaders.Authorization;

        async Task<Guid> Invoice(long number, string? cae)
        {
            var response = await client.PostAsJsonAsync("/api/v1/purchases/invoices", new
            {
                invoiceType = "A", pointOfSale = 5, invoiceNumber = number, supplierId = Guid.NewGuid(), supplierName = "Proveedor SA",
                supplierDocument = "20-30111222-0", supplierTaxCondition = "ResponsableInscripto", issueDate = "2026-10-06", dueDate = "2026-10-30",
                currency = "ARS", exchangeRate = 1m, cae, iibbPerception = 0m, ivaPerception = 0m, otherTaxes = 0m,
                items = new[] { new { code = "X", description = "Ítem", quantity = 1m, unitPrice = 1000m, vatRate = 21m } }
            });
            Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
            return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.GetProperty("id").GetGuid();
        }
        var good = await Invoice(10, "76123456789012");
        var bad = await Invoice(11, "76123456789013");
        var noCae = await Invoice(12, null);

        var one = await (await client.PostAsync($"/api/v1/purchases/invoices/{good}/arca-check", null)).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Approved", one.GetProperty("outcome").GetString());
        var sent = Assert.Single(gateway.Sent);
        Assert.Equal(new ArcaReceivedVoucher("20301112220", 5, 1, 10, new DateOnly(2026, 10, 6), 1210m, "76123456789012"), sent);

        // El período constata las que faltan: la ya aprobada no se vuelve a consultar.
        var period = await (await client.PostAsJsonAsync("/api/v1/purchases/invoices/arca-check", new { from = "2026-10-01T00:00:00Z", to = "2026-10-31T23:59:59Z" }))
            .Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(2, period.GetProperty("checked").GetInt32());
        Assert.Equal(1, period.GetProperty("rejected").GetInt32());
        Assert.Equal(1, period.GetProperty("notCheckable").GetInt32());
        Assert.Equal(2, gateway.Sent.Count);

        var checks = (await client.GetFromJsonAsync<JsonElement>("/api/v1/purchases/invoices/arca-checks")).EnumerateArray()
            .ToDictionary(c => c.GetProperty("purchaseInvoiceId").GetGuid(), c => c.GetProperty("outcome").GetString());
        Assert.Equal("Approved", checks[good]);
        Assert.Equal("Rejected", checks[bad]);
        Assert.Equal("NotCheckable", checks[noCae]);
    }

    private sealed class FakeWscdc : IArcaFiscalGateway
    {
        public List<ArcaReceivedVoucher> Sent { get; } = [];

        public Task<ArcaVoucherCheck> VerifyReceivedVoucherAsync(ArcaReceivedVoucher voucher, CancellationToken cancellationToken)
        {
            Sent.Add(voucher);
            return Task.FromResult(voucher.Cae.EndsWith('2')
                ? new ArcaVoucherCheck(ArcaVoucherCheckOutcome.Approved, "Constatado por ARCA.")
                : new ArcaVoucherCheck(ArcaVoucherCheckOutcome.Rejected, "101 El CAE informado no corresponde"));
        }

        public Task<ArcaFiscalNumbering> GetLastAuthorizedAsync(int pointOfSale, int voucherType, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<WsfeCaeReply> SubmitCaeAsync(WsfeVoucherData data, int pointOfSale, long reservedNumber, string expectedIssuerCuit, bool expectedProduction, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<ArcaFiscalVoucherObservation> GetVoucherAsync(int pointOfSale, int voucherType, long number, string expectedIssuerCuit, bool expectedProduction, CancellationToken cancellationToken) => throw new NotSupportedException();
    }
}
