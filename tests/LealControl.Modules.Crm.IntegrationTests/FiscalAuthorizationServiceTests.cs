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
using Npgsql;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class FiscalAuthorizationServiceTests : IAsyncLifetime
{
    private readonly CrmWebApplicationFactory _factory = new();
    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    [Theory]
    [InlineData("approved", true)]
    [InlineData("unknown", true)]
    [InlineData("network", true)]
    [InlineData("rejected", false)]
    [InlineData("mismatch", false)]
    public async Task Dispatch_is_committed_before_gateway_and_never_repeated(string mode, bool confirmed)
    {
        using var client = _factory.CreateAuthenticatedClient();
        var id = await CreateDraft(client);
        using var scope = _factory.Services.CreateScope();
        var accessor = SetTenant(scope.ServiceProvider);
        try
        {
            var db = scope.ServiceProvider.GetRequiredService<SalesDbContext>();
            var tenant = scope.ServiceProvider.GetRequiredService<ITenantContext>();
            var gateway = new FakeGateway(db.Database.GetConnectionString()!, id, mode)
            { Reply = await MatchingReply(db, id) };
            var service = Service(db, tenant, gateway);
            var result = await service.AuthorizeAsync(id, CancellationToken.None);
            Assert.Equal(confirmed, result.Confirmed);
            Assert.Equal(1, gateway.SubmitCalls);
            Assert.Equal(mode == "rejected" ? 0 : 1, gateway.LookupCalls);
            var saved = await db.Invoices.AsNoTracking().SingleAsync(i => i.Id == id);
            Assert.Equal(confirmed ? "Authorized" : "Draft", saved.Status);
            var attempt = await db.FiscalAuthorizationAttempts.AsNoTracking().SingleAsync(a => a.InvoiceId == id);
            Assert.Equal(confirmed ? "Confirmed" : mode == "rejected" ? "Rejected" : "Unknown", attempt.Status);
            Assert.Equal(42, attempt.VoucherNumber);
            if (confirmed) Assert.NotNull(saved.Cae);
            else Assert.Null(saved.Cae);
            // Simula un nuevo request con un DbContext independiente.
            using var retryScope = _factory.Services.CreateScope();
            var retryDb = retryScope.ServiceProvider.GetRequiredService<SalesDbContext>();
            var retryTenant = retryScope.ServiceProvider.GetRequiredService<ITenantContext>();
            await Service(retryDb, retryTenant, gateway).AuthorizeAsync(id, CancellationToken.None);
            Assert.Equal(1, gateway.SubmitCalls);
            Assert.Equal(1, gateway.NumberingCalls);
        }
        finally { accessor.HttpContext = null; }
    }

    [Fact]
    public async Task Cancellation_after_dispatch_keeps_reservation_and_retry_only_consults()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var id = await CreateDraft(client);
        using var scope = _factory.Services.CreateScope();
        var accessor = SetTenant(scope.ServiceProvider);
        try
        {
            var db = scope.ServiceProvider.GetRequiredService<SalesDbContext>();
            var tenant = scope.ServiceProvider.GetRequiredService<ITenantContext>();
            using var cancellation = new CancellationTokenSource();
            var gateway = new FakeGateway(db.Database.GetConnectionString()!, id, "cancel")
            { Reply = await MatchingReply(db, id), Cancellation = cancellation };
            var service = Service(db, tenant, gateway);
            await Assert.ThrowsAnyAsync<OperationCanceledException>(() => service.AuthorizeAsync(id, cancellation.Token));
            Assert.Equal("Pending", (await db.FiscalAuthorizationAttempts.AsNoTracking()
                .SingleAsync(a => a.InvoiceId == id)).Status);
            Assert.Equal(0, gateway.LookupCalls);
            Assert.True((await service.AuthorizeAsync(id, CancellationToken.None)).Confirmed);
            Assert.Equal(1, gateway.SubmitCalls);
            Assert.Equal(1, gateway.LookupCalls);
        }
        finally { accessor.HttpContext = null; }
    }

    [Fact]
    public async Task Simultaneous_authorization_only_dispatches_once()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var id = await CreateDraft(client);
        using var firstScope = _factory.Services.CreateScope();
        var accessor = SetTenant(firstScope.ServiceProvider);
        var entered = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        Task<FiscalRecoveryResult>? first = null;
        try
        {
            var db = firstScope.ServiceProvider.GetRequiredService<SalesDbContext>();
            var tenant = firstScope.ServiceProvider.GetRequiredService<ITenantContext>();
            var gateway = new FakeGateway(db.Database.GetConnectionString()!, id, "approved")
            {
                Reply = await MatchingReply(db, id), DispatchEntered = entered,
                DispatchRelease = release.Task, HideLookup = true
            };
            first = Service(db, tenant, gateway).AuthorizeAsync(id, CancellationToken.None);
            await entered.Task.WaitAsync(TimeSpan.FromSeconds(20));
            using (var secondScope = _factory.Services.CreateScope())
            {
                var secondDb = secondScope.ServiceProvider.GetRequiredService<SalesDbContext>();
                var secondTenant = secondScope.ServiceProvider.GetRequiredService<ITenantContext>();
                var second = await Service(secondDb, secondTenant, gateway)
                    .AuthorizeAsync(id, CancellationToken.None).WaitAsync(TimeSpan.FromSeconds(20));
                Assert.False(second.Confirmed);
                Assert.Equal("Unknown", (await secondDb.FiscalAuthorizationAttempts.AsNoTracking()
                    .SingleAsync(a => a.InvoiceId == id)).Status);
                Assert.Equal("Draft", (await secondDb.Invoices.AsNoTracking()
                    .SingleAsync(i => i.Id == id)).Status);
            }
            Assert.Equal(1, gateway.SubmitCalls);
            Assert.Equal(1, gateway.NumberingCalls);
            Assert.Equal(1, gateway.LookupCalls);
            gateway.HideLookup = false;
            release.TrySetResult(true);
            Assert.True((await first.WaitAsync(TimeSpan.FromSeconds(20))).Confirmed);
            Assert.Equal(1, gateway.SubmitCalls);
            Assert.Equal(2, gateway.LookupCalls);
            using var checkScope = _factory.Services.CreateScope();
            var check = checkScope.ServiceProvider.GetRequiredService<SalesDbContext>();
            Assert.Equal("Confirmed", (await check.FiscalAuthorizationAttempts.AsNoTracking()
                .SingleAsync(a => a.InvoiceId == id)).Status);
            Assert.Equal("Authorized", (await check.Invoices.AsNoTracking()
                .SingleAsync(i => i.Id == id)).Status);
        }
        finally
        {
            release.TrySetResult(true);
            if (first is not null) await first.WaitAsync(TimeSpan.FromSeconds(20));
            accessor.HttpContext = null;
        }
    }

    private static FiscalAuthorizationService Service(SalesDbContext db, ITenantContext tenant, IArcaFiscalGateway gateway) =>
        new(db, tenant, gateway, new FiscalReservationService(db, tenant, gateway),
            new FiscalVoucherRecoveryService(db, tenant, gateway));

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

    private sealed class FakeGateway(string connectionString, Guid invoiceId, string mode) : IArcaFiscalGateway
    {
        public ArcaFiscalVoucherObservation Reply { get; init; } = null!;
        public CancellationTokenSource? Cancellation { get; init; }
        public TaskCompletionSource<bool>? DispatchEntered { get; init; }
        public Task? DispatchRelease { get; init; }
        public bool HideLookup { get; set; }
        public int SubmitCalls { get; private set; }
        public int LookupCalls { get; private set; }
        public int NumberingCalls { get; private set; }

        public Task<ArcaFiscalNumbering> GetLastAuthorizedAsync(int pointOfSale, int voucherType, CancellationToken ct)
        {
            NumberingCalls++;
            return Task.FromResult(new ArcaFiscalNumbering(true, 41, "30715489629", false, "prueba"));
        }

        public async Task<WsfeCaeReply> SubmitCaeAsync(IWsfeInvoiceAServiceData data,
            int pointOfSale, long reservedNumber, string expectedIssuerCuit,
            bool expectedProduction, CancellationToken ct)
        {
            SubmitCalls++;
            Assert.Equal(1, SubmitCalls);
            Assert.Equal(42, reservedNumber);
            Assert.Equal("30715489629", expectedIssuerCuit);
            Assert.False(expectedProduction);
            // Otra conexión solo puede ver Pending si la transacción ya hizo COMMIT.
            await using var connection = new NpgsqlConnection(connectionString);
            await connection.OpenAsync(ct);
            await using var command = new NpgsqlCommand(
                "SELECT \"Status\" FROM sales.fiscal_authorization_attempts WHERE \"InvoiceId\" = @id", connection);
            command.Parameters.AddWithValue("id", invoiceId);
            Assert.Equal("Pending", await command.ExecuteScalarAsync(ct));
            DispatchEntered?.TrySetResult(true);
            if (DispatchRelease is not null) await DispatchRelease.WaitAsync(TimeSpan.FromSeconds(30));
            if (mode == "network") throw new HttpRequestException("Corte simulado");
            if (mode == "cancel")
            {
                Cancellation!.Cancel();
                ct.ThrowIfCancellationRequested();
            }
            if (mode == "rejected") return new(WsfeCaeOutcome.Rejected, null, null, "prueba");
            if (mode == "unknown") return new(WsfeCaeOutcome.Unknown, null, null, "prueba");
            return new(WsfeCaeOutcome.ApprovedPendingConsultation,
                mode == "mismatch" ? "98765432101234" : Reply.Cae, Reply.CaeDueDate, "prueba");
        }

        public Task<ArcaFiscalVoucherObservation> GetVoucherAsync(int pointOfSale, int voucherType,
            long number, string issuer, bool production, CancellationToken ct)
        {
            LookupCalls++;
            Assert.Equal(42, number);
            Assert.Equal("30715489629", issuer);
            Assert.False(production);
            return Task.FromResult(HideLookup
                ? new ArcaFiscalVoucherObservation(false, 0, string.Empty, 0m, string.Empty,
                    default, "Consulta aún sin confirmación") : Reply);
        }
    }
}
