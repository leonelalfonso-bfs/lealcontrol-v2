using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using LealControl.Modules.Finance.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace LealControl.Modules.Finance.Tests;

public sealed class ChequeLifecycleTests : IClassFixture<FinanceWebApplicationFactory>
{
    private readonly FinanceWebApplicationFactory _factory;

    public ChequeLifecycleTests(FinanceWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task Received_cheque_deposit_then_reject_creates_bank_movements()
    {
        var tenantId = FinanceWebApplicationFactory.DemoTenantId;
        var client = _factory.CreateAuthenticatedClient(tenantId);

        Guid bankAccountId = default;
        await _factory.WithDbAsync(async db =>
        {
            bankAccountId = Guid.NewGuid();
            db.Accounts.Add(new FinancialAccount
            {
                Id = bankAccountId,
                TenantId = tenantId,
                Name = "Banco Depositos",
                Currency = "ARS",
                Type = FinancialAccountType.Bank,
                IsActive = true,
                CreatedAtUtc = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
        });

        var createRes = await client.PostAsJsonAsync("/api/v1/finance/echeqs", new
        {
            checkNumber = "CH-9001",
            amount = 25000m,
            currency = "ARS",
            issuerName = "Cliente SA",
            issueDateUtc = DateTime.UtcNow.Date,
            dueDateUtc = DateTime.UtcNow.Date.AddDays(30),
            direction = "Received"
        });
        if (!createRes.IsSuccessStatusCode)
        {
            var body = await createRes.Content.ReadAsStringAsync();
            throw new HttpRequestException($"HTTP {(int)createRes.StatusCode}: {body}");
        }
        using var createDoc = JsonDocument.Parse(await createRes.Content.ReadAsStringAsync());
        var chequeId = createDoc.RootElement.GetProperty("id").GetGuid();

        var depositRes = await client.PostAsJsonAsync($"/api/v1/finance/echeqs/{chequeId}/deposit", new
        {
            bankAccountId,
            depositDateUtc = DateTime.UtcNow
        });
        depositRes.EnsureSuccessStatusCode();

        await _factory.WithDbAsync(async db =>
        {
            var cheque = await db.ReceivedCheques.SingleAsync(x => x.Id == chequeId);
            cheque.Status.Should().Be(ReceivedChequeStatus.Deposited);
            cheque.BankAccountId.Should().Be(bankAccountId);
            cheque.BankMovementId.Should().NotBeNull();

            var credit = await db.Movements.SingleAsync(x => x.Id == cheque.BankMovementId);
            credit.Kind.Should().Be(FinancialMovementKind.Credit);
            credit.Amount.Should().Be(25000m);
        });

        var rejectRes = await client.PostAsJsonAsync($"/api/v1/finance/echeqs/{chequeId}/reject", new
        {
            rejectDateUtc = DateTime.UtcNow,
            note = "Sin fondos",
            fees = 150m
        });
        rejectRes.EnsureSuccessStatusCode();

        await _factory.WithDbAsync(async db =>
        {
            var cheque = await db.ReceivedCheques.SingleAsync(x => x.Id == chequeId);
            cheque.Status.Should().Be(ReceivedChequeStatus.Rejected);

            var debit = await db.Movements
                .Where(x => x.TenantId == tenantId && x.LinkedEntityId == chequeId && x.Kind == FinancialMovementKind.Debit)
                .SingleAsync();
            debit.Amount.Should().Be(25150m);
        });
    }

    [Fact]
    public async Task Issued_cheque_can_move_to_debited_via_link_movement()
    {
        var tenantId = FinanceWebApplicationFactory.DemoTenantId;
        var client = _factory.CreateAuthenticatedClient(tenantId);
        Guid bankAccountId = default;
        Guid movementId = default;
        Guid chequeId = default;

        await _factory.WithDbAsync(async db =>
        {
            bankAccountId = Guid.NewGuid();
            movementId = Guid.NewGuid();
            chequeId = Guid.NewGuid();
            db.Accounts.Add(new FinancialAccount
            {
                Id = bankAccountId,
                TenantId = tenantId,
                Name = "Banco Emitidos",
                Currency = "ARS",
                Type = FinancialAccountType.Bank,
                IsActive = true,
                CreatedAtUtc = DateTime.UtcNow
            });
            db.ReceivedCheques.Add(new ReceivedCheque
            {
                Id = chequeId,
                TenantId = tenantId,
                CheckNumber = "EMI-1",
                Amount = 8000m,
                Direction = ChequeDirection.Issued,
                Status = ReceivedChequeStatus.Issued,
                CreatedAtUtc = DateTime.UtcNow
            });
            db.Movements.Add(new FinancialMovement
            {
                Id = movementId,
                TenantId = tenantId,
                AccountId = bankAccountId,
                Kind = FinancialMovementKind.Debit,
                Amount = 8000m,
                OperationDateUtc = DateTime.UtcNow,
                Description = "Debito cheque EMI-1",
                ExternalReference = "EMI-1",
                CreatedAtUtc = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
        });

        var linkRes = await client.PostAsJsonAsync($"/api/v1/finance/echeqs/{chequeId}/link-movement", new
        {
            accountId = bankAccountId,
            movementId,
            isCredit = false
        });
        linkRes.EnsureSuccessStatusCode();

        await _factory.WithDbAsync(async db =>
        {
            var cheque = await db.ReceivedCheques.SingleAsync(x => x.Id == chequeId);
            cheque.Status.Should().Be(ReceivedChequeStatus.Debited);
        });
    }

    [Fact]
    public async Task Issued_cheque_gets_supplier_then_goes_into_a_single_payment_order()
    {
        var tenantId = FinanceWebApplicationFactory.DemoTenantId;
        var client = _factory.CreateAuthenticatedClient(tenantId);
        var supplierId = Guid.NewGuid();

        var created = await client.PostAsJsonAsync("/api/v1/finance/echeqs", new
        {
            checkNumber = "9438", amount = 179300m, currency = "ARS", issuerName = "Proveedor Cheques SA",
            issueDateUtc = DateTime.UtcNow.Date, dueDateUtc = DateTime.UtcNow.Date.AddDays(10), direction = "Issued"
        });
        created.EnsureSuccessStatusCode();
        var chequeId = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        var assigned = await client.PostAsJsonAsync($"/api/v1/finance/echeqs/{chequeId}/supplier", new { supplierId });
        assigned.EnsureSuccessStatusCode();
        (await assigned.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("supplierId").GetGuid().Should().Be(supplierId);

        object Order() => new
        {
            supplierId, supplierName = "Proveedor Cheques SA", paymentDateUtc = DateTime.UtcNow, currency = "ARS", amount = 179300m,
            lines = new object[] { new { method = "ChequeOwn", amount = 179300m, currency = "ARS", chequeId } }
        };
        var order = await client.PostAsJsonAsync("/api/v1/finance/payments", Order());
        order.StatusCode.Should().Be(System.Net.HttpStatusCode.Created, await order.Content.ReadAsStringAsync());
        var orderId = (await order.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        await _factory.WithDbAsync(async db =>
        {
            var cheque = await db.ReceivedCheques.SingleAsync(x => x.Id == chequeId);
            cheque.PaymentOrderId.Should().Be(orderId);
            cheque.SupplierId.Should().Be(supplierId);
        });

        // El mismo cheque no entra en otra orden, y el proveedor ya no se cambia desde la cartera.
        (await client.PostAsJsonAsync("/api/v1/finance/payments", Order())).StatusCode.Should().Be(System.Net.HttpStatusCode.BadRequest);
        (await client.PostAsJsonAsync($"/api/v1/finance/echeqs/{chequeId}/supplier", new { supplierId = Guid.NewGuid() })).StatusCode.Should().Be(System.Net.HttpStatusCode.Conflict);
    }
}
