using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using LealControl.Modules.Finance.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace LealControl.Modules.Finance.Tests;

public sealed class TreasuryResetTests : IClassFixture<FinanceWebApplicationFactory>
{
    private readonly FinanceWebApplicationFactory _factory;

    public TreasuryResetTests(FinanceWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task Treasury_reset_leaves_accounts_and_removes_every_operation()
    {
        var tenantId = FinanceWebApplicationFactory.DemoTenantId;
        var client = _factory.CreateAuthenticatedClient(tenantId);
        var accountId = Guid.NewGuid();
        await _factory.WithDbAsync(async db =>
        {
            db.Accounts.Add(new FinancialAccount { Id = accountId, TenantId = tenantId, Name = "Banco reinicio", Currency = "ARS", Type = FinancialAccountType.Bank, IsActive = true, CreatedAtUtc = DateTime.UtcNow });
            db.Movements.Add(new FinancialMovement { Id = Guid.NewGuid(), TenantId = tenantId, AccountId = accountId, Kind = FinancialMovementKind.Credit, Amount = 10m, Currency = "ARS", OperationDateUtc = DateTime.UtcNow, Description = "x", CreatedAtUtc = DateTime.UtcNow });
            db.ReceivedCheques.Add(new ReceivedCheque { Id = Guid.NewGuid(), TenantId = tenantId, CheckNumber = "1", Amount = 10m, Currency = "ARS", CreatedAtUtc = DateTime.UtcNow });
            db.CollectionReceipts.Add(new CollectionReceipt { Id = Guid.NewGuid(), TenantId = tenantId, AccountId = accountId, ReceiptNumber = "R-1", Amount = 10m });
            db.PaymentOrders.Add(new PaymentOrder { Id = Guid.NewGuid(), TenantId = tenantId, SupplierName = "Proveedor", OrderNumber = "OP-1", Amount = 10m });
            await db.SaveChangesAsync();
        });

        var preview = await client.GetFromJsonAsync<JsonElement>("/api/v1/finance/treasury-reset");
        preview.GetProperty("movements").GetInt32().Should().BeGreaterThan(0);
        preview.GetProperty("cheques").GetInt32().Should().BeGreaterThan(0);

        ((int)(await client.PostAsJsonAsync("/api/v1/finance/treasury-reset", new { confirm = "borrar" })).StatusCode).Should().Be(400);
        (await client.PostAsJsonAsync("/api/v1/finance/treasury-reset", new { confirm = "borrar compras y finanzas" })).EnsureSuccessStatusCode();

        await _factory.WithDbAsync(async db =>
        {
            (await db.Movements.CountAsync(x => x.TenantId == tenantId)).Should().Be(0);
            (await db.ReceivedCheques.CountAsync(x => x.TenantId == tenantId)).Should().Be(0);
            (await db.CollectionReceipts.CountAsync(x => x.TenantId == tenantId)).Should().Be(0);
            (await db.PaymentOrders.CountAsync(x => x.TenantId == tenantId)).Should().Be(0);
            (await db.Accounts.AnyAsync(x => x.Id == accountId)).Should().BeTrue();
        });
    }

    [Fact]
    public async Task Account_is_deleted_only_when_nothing_is_recorded_on_it()
    {
        var tenantId = FinanceWebApplicationFactory.DemoTenantId;
        var client = _factory.CreateAuthenticatedClient(tenantId);
        Guid empty = Guid.NewGuid(), used = Guid.NewGuid();
        await _factory.WithDbAsync(async db =>
        {
            foreach (var (id, name) in new[] { (empty, "Billetera de más"), (used, "Billetera usada") })
                db.Accounts.Add(new FinancialAccount { Id = id, TenantId = tenantId, Name = name, Currency = "ARS", Type = FinancialAccountType.Bank, IsActive = true, CreatedAtUtc = DateTime.UtcNow });
            db.Movements.Add(new FinancialMovement { Id = Guid.NewGuid(), TenantId = tenantId, AccountId = used, Kind = FinancialMovementKind.Debit, Amount = 5m, Currency = "ARS", OperationDateUtc = DateTime.UtcNow, Description = "x", CreatedAtUtc = DateTime.UtcNow });
            await db.SaveChangesAsync();
        });

        var refused = await client.DeleteAsync($"/api/v1/finance/accounts/{used}");
        ((int)refused.StatusCode).Should().Be(409);
        (await refused.Content.ReadAsStringAsync()).Should().Contain("1 movimientos");
        (await client.DeleteAsync($"/api/v1/finance/accounts/{empty}")).EnsureSuccessStatusCode();

        await _factory.WithDbAsync(async db =>
        {
            (await db.Accounts.AnyAsync(x => x.Id == empty)).Should().BeFalse();
            (await db.Accounts.AnyAsync(x => x.Id == used)).Should().BeTrue();
        });
    }
}
