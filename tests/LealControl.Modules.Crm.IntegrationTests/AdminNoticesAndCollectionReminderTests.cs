using System.Net.Http.Json;
using System.Text.Json;
using LealControl.Api.Ai;
using LealControl.BuildingBlocks.Notices;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Finance.Infrastructure;
using LealControl.Modules.Sales.Domain.Invoices;
using LealControl.Modules.Sales.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class AdminNoticesAndCollectionReminderTests : IAsyncLifetime
{
    private readonly CrmWebApplicationFactory _factory = new();
    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, body);
        return JsonDocument.Parse(body).RootElement.Clone();
    }

    [Fact]
    public async Task OwnChequesDueNotices_returns_only_issued_cheques_due_within_5_days()
    {
        var tenantId = CrmWebApplicationFactory.DemoTenantId;
        var cs = _factory.DatabaseConnectionString;
        var today = new DateOnly(2026, 11, 28);
        var todayUtc = today.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);

        await using (var fin = new FinanceDbContext(new DbContextOptionsBuilder<FinanceDbContext>().UseNpgsql(cs).Options))
        {
            await fin.Database.EnsureCreatedAsync();
            fin.ReceivedCheques.AddRange(
                new ReceivedCheque
                {
                    Id = Guid.NewGuid(), TenantId = tenantId, CheckNumber = "CHQ-PROPIO-1",
                    Amount = 250_000m, Currency = "ARS", DueDateUtc = todayUtc.AddDays(1),
                    IssuerName = "Proveedor Norte SA", BankName = "Banco Galicia",
                    Direction = ChequeDirection.Issued, Status = ReceivedChequeStatus.Issued,
                    CreatedAtUtc = todayUtc.AddDays(-10)
                },
                new ReceivedCheque
                {
                    Id = Guid.NewGuid(), TenantId = tenantId, CheckNumber = "CHQ-PROPIO-2",
                    Amount = 120_000m, Currency = "ARS", DueDateUtc = todayUtc.AddDays(4),
                    IssuerName = "Metalurgica Sur SRL", BankName = "Banco Macro",
                    Direction = ChequeDirection.Issued, Status = ReceivedChequeStatus.Issued,
                    CreatedAtUtc = todayUtc.AddDays(-10)
                },
                new ReceivedCheque
                {
                    Id = Guid.NewGuid(), TenantId = tenantId, CheckNumber = "CHQ-PROPIO-LEJOS",
                    Amount = 500_000m, Currency = "ARS", DueDateUtc = todayUtc.AddDays(12),
                    IssuerName = "Proveedor Futuro SA",
                    Direction = ChequeDirection.Issued, Status = ReceivedChequeStatus.Issued,
                    CreatedAtUtc = todayUtc.AddDays(-10)
                },
                new ReceivedCheque
                {
                    Id = Guid.NewGuid(), TenantId = tenantId, CheckNumber = "CHQ-PROPIO-DEBITADO",
                    Amount = 80_000m, Currency = "ARS", DueDateUtc = todayUtc.AddDays(-1),
                    IssuerName = "Proveedor Pagado SA",
                    Direction = ChequeDirection.Issued, Status = ReceivedChequeStatus.Debited,
                    CreatedAtUtc = todayUtc.AddDays(-15)
                },
                new ReceivedCheque
                {
                    Id = Guid.NewGuid(), TenantId = tenantId, CheckNumber = "CHQ-TERCERO-1",
                    Amount = 95_000m, Currency = "ARS", DueDateUtc = todayUtc,
                    IssuerName = "Cliente Tercero SA",
                    Direction = ChequeDirection.Received, Status = ReceivedChequeStatus.Available,
                    CreatedAtUtc = todayUtc.AddDays(-5)
                });
            await fin.SaveChangesAsync();
        }

        var provider = new OwnChequesDueNotices();
        var items = await provider.GetAsync(new NoticeContext(tenantId, cs, today, SeesAmounts: true), CancellationToken.None);

        Assert.Equal(2, items.Count);
        Assert.Contains("CHQ-PROPIO-1", items[0].Title);
        Assert.Equal(NoticeSeverity.Critical, items[0].Severity);
        Assert.Equal("/finanzas/echeqs", items[0].Link);
        Assert.Contains("CHQ-PROPIO-2", items[1].Title);
        Assert.Equal(NoticeSeverity.Warning, items[1].Severity);
        Assert.DoesNotContain(items, x => x.Title.Contains("LEJOS") || x.Title.Contains("DEBITADO") || x.Title.Contains("TERCERO"));
    }

    [Fact]
    public async Task CollectionReminderDrafter_builds_deterministic_draft_with_overdue_invoices_and_billing_contact()
    {
        var tenantId = CrmWebApplicationFactory.DemoTenantId;
        var cs = _factory.DatabaseConnectionString;
        var now = _factory.Services.GetRequiredService<TimeProvider>().GetUtcNow().UtcDateTime;
        using var admin = _factory.CreateAuthenticatedClient();

        var customerId = (await Json(await admin.PostAsJsonAsync("/api/v1/crm/customers", new
        {
            legalName = "Molino Ejemplo SA",
            documentType = "Cuit",
            documentNumber = "30712345671",
            taxCondition = "ResponsableInscripto",
            iibbRegime = "Local",
            email = "info@molinoejemplo.com",
            isCustomer = true,
            isSupplier = false
        }))).GetProperty("id").GetGuid();

        await admin.PostAsJsonAsync($"/api/v1/crm/customers/{customerId}/contacts", new
        {
            name = "Laura Administración",
            position = "Pagos a Proveedores",
            email = "pagos@molinoejemplo.com"
        });

        await using (var sales = new SalesDbContext(new DbContextOptionsBuilder<SalesDbContext>().UseNpgsql(cs).Options))
        {
            await sales.EnsureTablesCreatedAsync();
            var overdue = new Invoice(
                Guid.NewGuid(),
                new TenantId(tenantId),
                "A", 1, 1042, "0001-00001042", null, null,
                customerId, "Molino Ejemplo SA", "30712345671", "ResponsableInscripto", null,
                now.AddDays(-25), now.AddDays(-10), "ARS", 1m,
                123_966.94m, 26_033.06m, 0m, 0m, 0m, 0m, 150_000m,
                "12345678901234", now.AddDays(10), null, "Authorized", null, null, now.AddDays(-25));

            var future = new Invoice(
                Guid.NewGuid(),
                new TenantId(tenantId),
                "A", 1, 1099, "0001-00001099", null, null,
                customerId, "Molino Ejemplo SA", "30712345671", "ResponsableInscripto", null,
                now.AddDays(-2), now.AddDays(15), "ARS", 1m,
                50_000m, 10_500m, 0m, 0m, 0m, 0m, 60_500m,
                "12345678909999", now.AddDays(10), null, "Authorized", null, null, now.AddDays(-2));

            sales.Invoices.AddRange(overdue, future);
            await sales.SaveChangesAsync();
        }

        var response = await admin.PostAsync($"/api/v1/finance/collection-reminder/{customerId}", null);
        var json = await Json(response);

        Assert.True(json.GetProperty("ok").GetBoolean());
        Assert.False(json.GetProperty("usedAi").GetBoolean());
        Assert.Equal("pagos@molinoejemplo.com", json.GetProperty("to").GetString());
        Assert.Equal(1, json.GetProperty("overdueCount").GetInt32());
        var body = json.GetProperty("body").GetString()!;
        Assert.Contains("0001-00001042", body);
        Assert.Contains("150.000,00", body);
        Assert.DoesNotContain("0001-00001099", body);

        // Usuario sin permiso para ver importes no puede generar recordatorio con montos.
        using var scope = _factory.Services.CreateScope();
        var drafter = scope.ServiceProvider.GetRequiredService<CollectionReminderDrafter>();
        var blocked = await drafter.DraftAsync(cs, tenantId, customerId, seesAmounts: false, now, CancellationToken.None);
        Assert.False(blocked.Ok);
        Assert.Contains("permiso", blocked.Error!, StringComparison.OrdinalIgnoreCase);
    }
}
