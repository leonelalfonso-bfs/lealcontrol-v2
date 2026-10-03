using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Json;
using LealControl.Modules.Crm.Contracts.Fiscal;
using LealControl.Modules.Sales.Infrastructure.Fiscal;
using LealControl.Modules.Sales.Infrastructure.Persistence;
using LealControl.BuildingBlocks.Tenancy;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class FiscalReservationServiceTests : IAsyncLifetime
{
    private readonly CrmWebApplicationFactory _factory = new();
    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    [Fact]
    public async Task Number_is_persisted_once_before_any_submission()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var invoiceId = await CreateDraft(client);
        using var scope = _factory.Services.CreateScope();
        var accessor = SetTenant(scope.ServiceProvider);
        try
        {
            var db = scope.ServiceProvider.GetRequiredService<SalesDbContext>();
            var tenant = scope.ServiceProvider.GetRequiredService<ITenantContext>();
            var gateway = new FakeGateway();
            var service = new FiscalReservationService(db, tenant, gateway);
            var first = await service.ReserveAsync(invoiceId, CancellationToken.None);
            Assert.True(first.Ok, first.Detail);
            Assert.Equal(42, first.VoucherNumber);
            var saved = await db.FiscalAuthorizationAttempts.AsNoTracking()
                .SingleAsync(a => a.TenantId == tenant.TenantId && a.InvoiceId == invoiceId);
            Assert.Equal(first.AttemptId, saved.Id);
            Assert.Equal("Reserved", saved.Status);
            Assert.Equal("30715489629", saved.IssuerCuit);
            Assert.False(saved.Production);
            var second = await service.ReserveAsync(invoiceId, CancellationToken.None);
            Assert.False(second.Ok);
            Assert.Equal(1, gateway.NumberingCalls);
            Assert.Equal(0, gateway.SubmitCalls);
            Assert.Equal(0, gateway.LookupCalls);
        }
        finally { accessor.HttpContext = null; }
    }

    [Fact]
    public async Task Unresolved_reservation_blocks_next_invoice_in_same_series()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var firstId = await CreateDraft(client);
        var secondId = await CreateDraft(client);
        using var scope = _factory.Services.CreateScope();
        var accessor = SetTenant(scope.ServiceProvider);
        try
        {
            var db = scope.ServiceProvider.GetRequiredService<SalesDbContext>();
            var tenant = scope.ServiceProvider.GetRequiredService<ITenantContext>();
            var gateway = new FakeGateway();
            var service = new FiscalReservationService(db, tenant, gateway);
            Assert.True((await service.ReserveAsync(firstId, CancellationToken.None)).Ok);
            Assert.False((await service.ReserveAsync(secondId, CancellationToken.None)).Ok);
            Assert.Equal(1, await db.FiscalAuthorizationAttempts.CountAsync());
            Assert.Equal(0, gateway.SubmitCalls);
        }
        finally { accessor.HttpContext = null; }
    }

    [Theory]
    [InlineData(99_999_998L, true)]
    [InlineData(99_999_999L, false)]
    [InlineData(100_000_000L, false)]
    [InlineData(long.MaxValue, false)]
    public async Task Official_number_limit_is_checked_before_persisting(long last, bool allowed)
    {
        using var client = _factory.CreateAuthenticatedClient();
        var id = await CreateDraft(client);
        using var scope = _factory.Services.CreateScope();
        var accessor = SetTenant(scope.ServiceProvider);
        try
        {
            var db = scope.ServiceProvider.GetRequiredService<SalesDbContext>();
            var tenant = scope.ServiceProvider.GetRequiredService<ITenantContext>();
            var gateway = new FakeGateway { LastNumber = last };
            var result = await new FiscalReservationService(db, tenant, gateway)
                .ReserveAsync(id, CancellationToken.None);
            Assert.Equal(allowed, result.Ok);
            Assert.Equal(allowed ? 1 : 0, await db.FiscalAuthorizationAttempts.CountAsync(a => a.InvoiceId == id));
            if (allowed) Assert.Equal(99_999_999L, result.VoucherNumber);
            Assert.Equal(0, gateway.SubmitCalls);
        }
        finally { accessor.HttpContext = null; }
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
        public long LastNumber { get; init; } = 41;
        public int NumberingCalls { get; private set; }
        public int SubmitCalls { get; private set; }
        public int LookupCalls { get; private set; }

        public Task<ArcaFiscalNumbering> GetLastAuthorizedAsync(
            int pointOfSale, int voucherType, CancellationToken cancellationToken)
        {
            NumberingCalls++;
            Assert.Equal(3, pointOfSale);
            Assert.Equal(1, voucherType);
            return Task.FromResult(new ArcaFiscalNumbering(true, LastNumber,
                "30715489629", false, "prueba"));
        }

        public Task<WsfeCaeReply> SubmitCaeAsync(IWsfeInvoiceAServiceData data,
            int pointOfSale, long reservedNumber, string expectedIssuerCuit,
            bool expectedProduction, CancellationToken cancellationToken)
        {
            SubmitCalls++;
            throw new InvalidOperationException("La reserva no debe enviar CAE.");
        }

        public Task<ArcaFiscalVoucherObservation> GetVoucherAsync(
            int pointOfSale, int voucherType, long number, string expectedIssuerCuit,
            bool expectedProduction, CancellationToken cancellationToken)
        {
            LookupCalls++;
            throw new InvalidOperationException("La reserva no debe consultar comprobantes.");
        }
    }
}
