using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using LealControl.Modules.Finance.Infrastructure;
using Xunit;

namespace LealControl.Modules.Finance.Tests;

/// <summary>Anular una orden de pago o un recibo borra el egreso o ingreso que generaron, así el saldo de la caja vuelve.</summary>
public sealed class VoidCashDocumentsTests : IClassFixture<FinanceWebApplicationFactory>
{
    private readonly FinanceWebApplicationFactory _factory;
    public VoidCashDocumentsTests(FinanceWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task Voiding_restores_the_cash_balance_and_drops_the_pending_bank_transfer()
    {
        var client = _factory.CreateAuthenticatedClient(FinanceWebApplicationFactory.DemoTenantId);
        async Task<Guid> Account(string name, string type) =>
            (await (await client.PostAsJsonAsync("/api/v1/finance/accounts", new { name = $"{name} {Guid.NewGuid():N}"[..30], currency = "ARS", type, openingBalance = 50000m, bookingMode = type == "Bank" ? "Statement" : "Manual" }))
                .Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        var cash = await Account("Caja", "Cash");
        var bank = await Account("Banco", "Bank");
        async Task<decimal> Balance(Guid id) =>
            (await client.GetFromJsonAsync<JsonElement>("/api/v1/finance/accounts")).EnumerateArray().Single(a => a.GetProperty("id").GetGuid() == id).GetProperty("balance").GetDecimal();
        async Task<int> Movements(Guid id) => await _factory.WithDbAsync(db => Task.FromResult(db.Movements.Count(m => m.AccountId == id)));

        async Task<Guid> Order(string method, Guid account, decimal amount)
        {
            var r = await client.PostAsJsonAsync("/api/v1/finance/payments", new
            {
                supplierId = Guid.NewGuid(), supplierName = "Proveedor", paymentDateUtc = "2026-10-29T00:00:00Z", currency = "ARS", amount,
                lines = new[] { new { method, amount, currency = "ARS", accountId = account } }
            });
            r.IsSuccessStatusCode.Should().BeTrue(await r.Content.ReadAsStringAsync());
            return (await r.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        }
        async Task Void(string path) => (await client.PostAsJsonAsync(path, new { reason = "Error de carga" })).IsSuccessStatusCode.Should().BeTrue();

        var cashOrder = await Order("Cash", cash, 12000m);
        (await Balance(cash)).Should().Be(38000m);
        await Void($"/api/v1/finance/payments/{cashOrder}/void");
        (await Balance(cash)).Should().Be(50000m);
        (await Movements(cash)).Should().Be(0);

        // La transferencia que el banco todavía no debitó tampoco queda dando vueltas en la conciliación.
        var bankOrder = await Order("BankTransfer", bank, 7000m);
        (await Movements(bank)).Should().Be(1);
        await Void($"/api/v1/finance/payments/{bankOrder}/void");
        (await Movements(bank)).Should().Be(0);

        var receipt = await client.PostAsJsonAsync("/api/v1/finance/collections", new
        {
            accountId = cash, amount = 9000m, currency = "ARS", receiptDateUtc = "2026-10-29T00:00:00Z", description = "Cobro en efectivo",
            lines = new[] { new { method = "Cash", amount = 9000m, currency = "ARS", accountId = cash } }
        });
        receipt.IsSuccessStatusCode.Should().BeTrue(await receipt.Content.ReadAsStringAsync());
        (await Balance(cash)).Should().Be(59000m);
        await Void($"/api/v1/finance/collections/{(await receipt.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid()}/void");
        (await Balance(cash)).Should().Be(50000m);
    }
}
