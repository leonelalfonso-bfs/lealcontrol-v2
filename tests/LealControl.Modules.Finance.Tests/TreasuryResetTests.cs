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
}
