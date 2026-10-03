using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Json;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Contracts.Fiscal;
using LealControl.Modules.Sales.Infrastructure.Fiscal;
using LealControl.Modules.Sales.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class FiscalVoucherRecoveryServiceTests : IAsyncLifetime
{
    private readonly CrmWebApplicationFactory _factory = new();
    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    [Fact]
    public async Task Matching_lookup_confirms_number_cae_and_qr_without_resending()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var id = await CreateDraft(client);
        using var scope = _factory.Services.CreateScope();
        var accessor = SetTenant(scope.ServiceProvider);
        try
        {
            var db = scope.ServiceProvider.GetRequiredService<SalesDbContext>();
            var tenant = scope.ServiceProvider.GetRequiredService<ITenantContext>();
            var gateway = new FakeGateway();
            var reserve = new FiscalReservationService(db, tenant, gateway, new FiscalTestClock());
            var reservation = await reserve.ReserveAsync(id, CancellationToken.None);
            Assert.True(reservation.Ok, reservation.Detail);
            var attempt = await db.FiscalAuthorizationAttempts.SingleAsync(a => a.InvoiceId == id);
            attempt.MarkDispatching();
            await db.SaveChangesAsync();
            gateway.Reply = await MatchingReply(db, id);
            var recovery = new FiscalVoucherRecoveryService(db, tenant, gateway);

            var result = await recovery.RecoverAsync(id, CancellationToken.None);
            Assert.True(result.Confirmed, result.Detail);
            var saved = await db.Invoices.AsNoTracking().SingleAsync(i => i.Id == id);
            var fiscal = await db.FiscalAuthorizationAttempts.AsNoTracking().SingleAsync(a => a.InvoiceId == id);
            Assert.Equal("Authorized", saved.Status);
            Assert.Equal(42, saved.InvoiceNumber);
            Assert.Equal("12345678901234", saved.Cae);
            Assert.StartsWith("https://www.arca.gob.ar/fe/qr/?p=", saved.QrUrl);
            Assert.Equal("Confirmed", fiscal.Status);
            Assert.True((await recovery.RecoverAsync(id, CancellationToken.None)).Confirmed);
            Assert.Equal(1, gateway.LookupCalls);
            Assert.Equal(0, gateway.SubmitCalls);
        }
        finally { accessor.HttpContext = null; }
    }

    [Fact]
    public async Task Different_fiscal_data_keeps_invoice_draft_and_attempt_unknown()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var id = await CreateDraft(client);
        using var scope = _factory.Services.CreateScope();
        var accessor = SetTenant(scope.ServiceProvider);
        try
        {
            var db = scope.ServiceProvider.GetRequiredService<SalesDbContext>();
            var tenant = scope.ServiceProvider.GetRequiredService<ITenantContext>();
            var gateway = new FakeGateway();
            Assert.True((await new FiscalReservationService(db, tenant, gateway, new FiscalTestClock())
                .ReserveAsync(id, CancellationToken.None)).Ok);
            var attempt = await db.FiscalAuthorizationAttempts.SingleAsync(a => a.InvoiceId == id);
            attempt.MarkDispatching();
            await db.SaveChangesAsync();
            var reply = await MatchingReply(db, id);
            gateway.Reply = reply with { FiscalData = reply.FiscalData! with { Concept = 1 } };
            var result = await new FiscalVoucherRecoveryService(db, tenant, gateway)
                .RecoverAsync(id, CancellationToken.None);
            Assert.False(result.Confirmed);
            Assert.Equal("Draft", (await db.Invoices.AsNoTracking().SingleAsync(i => i.Id == id)).Status);
            Assert.Equal("Unknown", (await db.FiscalAuthorizationAttempts.AsNoTracking()
                .SingleAsync(a => a.InvoiceId == id)).Status);
            Assert.Equal(0, gateway.SubmitCalls);
        }
        finally { accessor.HttpContext = null; }
    }

    [Fact]
    public async Task Lookup_network_failure_keeps_number_unknown_without_resubmission()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var id = await CreateDraft(client);
        using var scope = _factory.Services.CreateScope();
        var accessor = SetTenant(scope.ServiceProvider);
        try
        {
            var db = scope.ServiceProvider.GetRequiredService<SalesDbContext>();
            var tenant = scope.ServiceProvider.GetRequiredService<ITenantContext>();
            var gateway = new FakeGateway { ThrowOnLookup = true };
            Assert.True((await new FiscalReservationService(db, tenant, gateway, new FiscalTestClock())
                .ReserveAsync(id, CancellationToken.None)).Ok);
            var attempt = await db.FiscalAuthorizationAttempts.SingleAsync(a => a.InvoiceId == id);
            attempt.MarkDispatching();
            await db.SaveChangesAsync();
            var result = await new FiscalVoucherRecoveryService(db, tenant, gateway)
                .RecoverAsync(id, CancellationToken.None);
            Assert.False(result.Confirmed);
            Assert.Equal("Unknown", (await db.FiscalAuthorizationAttempts.AsNoTracking()
                .SingleAsync(a => a.InvoiceId == id)).Status);
            Assert.Equal("Draft", (await db.Invoices.AsNoTracking().SingleAsync(i => i.Id == id)).Status);
            Assert.Equal(1, gateway.LookupCalls);
            Assert.Equal(0, gateway.SubmitCalls);
        }
        finally { accessor.HttpContext = null; }
    }

    [Fact]
    public async Task Reserved_without_dispatch_cannot_be_recovered()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var id = await CreateDraft(client);
        using var scope = _factory.Services.CreateScope();
        var accessor = SetTenant(scope.ServiceProvider);
        try
        {
            var db = scope.ServiceProvider.GetRequiredService<SalesDbContext>();
            var tenant = scope.ServiceProvider.GetRequiredService<ITenantContext>();
            var gateway = new FakeGateway();
            Assert.True((await new FiscalReservationService(db, tenant, gateway, new FiscalTestClock())
                .ReserveAsync(id, CancellationToken.None)).Ok);
            var result = await new FiscalVoucherRecoveryService(db, tenant, gateway)
                .RecoverAsync(id, CancellationToken.None);
            Assert.False(result.Confirmed);
            Assert.Equal(0, gateway.LookupCalls);
            Assert.Equal("Reserved", (await db.FiscalAuthorizationAttempts.AsNoTracking()
                .SingleAsync(a => a.InvoiceId == id)).Status);
        }
        finally { accessor.HttpContext = null; }
    }

    private static async Task<ArcaFiscalVoucherObservation> MatchingReply(SalesDbContext db, Guid id)
    {
        var invoice = await db.Invoices.Include(i => i.Items).AsNoTracking()
            .SingleAsync(i => i.Id == id);
        Assert.True(WsfeInvoiceAServicePreparation.TryBuild(invoice, out var data, out var error), error);
        Assert.NotNull(data);
        var fields = new WsfeVoucherFiscalData(data.ReceiverCuit, data.ReceiverDocumentType,
            data.ReceiverVatCondition, data.VoucherType, data.Concept, data.IssueDate,
            data.ServiceFrom, data.ServiceTo, data.PaymentDue, data.NetAmount,
            data.VatAmount, data.TotalAmount, data.VatRateCode, data.CurrencyCode,
            data.ExchangeRate);
        return new(true, 42, data.ReceiverCuit, data.TotalAmount, "12345678901234",
            new DateTime(2026, 10, 15, 0, 0, 0, DateTimeKind.Utc), "prueba", fields);
    }

    private static IHttpContextAccessor SetTenant(IServiceProvider services)
    {
        var accessor = services.GetRequiredService<IHttpContextAccessor>();
        var context = new DefaultHttpContext();
        context.User = new ClaimsPrincipal(new ClaimsIdentity(
        [
            new Claim("tenant_id", CrmWebApplicationFactory.DemoTenantId.ToString()),
            new Claim(ClaimTypes.Role, "Admin")
        ], "Test"));
        accessor.HttpContext = context;
        return accessor;
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
        public ArcaFiscalVoucherObservation? Reply { get; set; }
        public bool ThrowOnLookup { get; set; }
        public int LookupCalls { get; private set; }
        public int SubmitCalls { get; private set; }
        public Task<ArcaFiscalNumbering> GetLastAuthorizedAsync(
            int pointOfSale, int voucherType, CancellationToken cancellationToken) =>
            Task.FromResult(new ArcaFiscalNumbering(true, 41, "30715489629", false, "prueba"));
        public Task<WsfeCaeReply> SubmitCaeAsync(IWsfeInvoiceAServiceData data,
            int pointOfSale, long reservedNumber, string expectedIssuerCuit,
            bool expectedProduction, CancellationToken cancellationToken)
        {
            SubmitCalls++;
            throw new InvalidOperationException("La recuperación nunca debe enviar CAE.");
        }
        public Task<ArcaFiscalVoucherObservation> GetVoucherAsync(
            int pointOfSale, int voucherType, long number, string expectedIssuerCuit,
            bool expectedProduction, CancellationToken cancellationToken)
        {
            LookupCalls++;
            if (ThrowOnLookup) throw new HttpRequestException("Simulación de corte de red");
            Assert.Equal(3, pointOfSale);
            Assert.Equal(1, voucherType);
            Assert.Equal(42, number);
            Assert.Equal("30715489629", expectedIssuerCuit);
            Assert.False(expectedProduction);
            return Task.FromResult(Reply ??
                new ArcaFiscalVoucherObservation(false, 0, string.Empty, 0m, string.Empty,
                    default, "Sin respuesta"));
        }
    }
}
