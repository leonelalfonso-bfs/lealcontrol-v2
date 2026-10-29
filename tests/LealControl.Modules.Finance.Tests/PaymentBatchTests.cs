using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using FluentAssertions;
using LealControl.Modules.Finance.Infrastructure;
using Xunit;

namespace LealControl.Modules.Finance.Tests;

/// <summary>Pagos por archivo (nota 69, F4): lote de transferencias en formato Interbanking por CBU y conciliación del débito consolidado.</summary>
public sealed class PaymentBatchTests : IClassFixture<FinanceWebApplicationFactory>
{
    private readonly FinanceWebApplicationFactory _factory;
    public PaymentBatchTests(FinanceWebApplicationFactory factory) => _factory = factory;

    private const string OwnCbu = "0070999003000000001235";
    private const string SupplierCbu = "2850590994000000004566";

    [Fact]
    public void Cbu_check_digits()
    {
        PaymentBatches.IsValidCbu(OwnCbu).Should().BeTrue();
        PaymentBatches.IsValidCbu(SupplierCbu).Should().BeTrue();
        PaymentBatches.IsValidCbu("0070999003000000001236").Should().BeFalse();
        PaymentBatches.IsValidCbu("0070999103000000001235").Should().BeFalse();
        PaymentBatches.IsValidCbu("007099900300000000123").Should().BeFalse();
    }

    [Fact]
    public async Task Batch_exports_interbanking_and_the_consolidated_debit_reconciles_every_order()
    {
        var tenantId = FinanceWebApplicationFactory.DemoTenantId;
        var client = _factory.CreateAuthenticatedClient(tenantId);
        var accountId = Guid.NewGuid();
        var (supplierA, supplierB, supplierC) = (Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
        var movements = new Dictionary<Guid, Guid>();
        await _factory.WithDbAsync(async db =>
        {
            db.Accounts.Add(new FinancialAccount { Id = accountId, TenantId = tenantId, Name = $"Credicoop {accountId:N}"[..22], Currency = "ARS", Type = FinancialAccountType.Bank, IsActive = true, CreatedAtUtc = DateTime.UtcNow });
            foreach (var (supplier, cuit, amount) in new[] { (supplierA, "30712345671", 200000m), (supplierB, "20301112220", 150000.25m), (supplierC, "27222333440", 5000m) })
            {
                var orderId = Guid.NewGuid();
                movements[supplier] = Guid.NewGuid();
                db.PaymentOrders.Add(new PaymentOrder { Id = orderId, TenantId = tenantId, SupplierId = supplier, SupplierName = $"Proveedor Ñandú {cuit[..4]}", SupplierTaxId = cuit, OrderNumber = $"OP-{cuit}", Amount = amount, Currency = "ARS", PaymentDateUtc = new DateTime(2026, 10, 21, 0, 0, 0, DateTimeKind.Utc), Status = "Confirmed", CreatedAtUtc = DateTime.UtcNow });
                db.Movements.Add(new FinancialMovement { Id = movements[supplier], TenantId = tenantId, AccountId = accountId, Kind = FinancialMovementKind.Debit, Amount = amount, Currency = "ARS", OperationDateUtc = new DateTime(2026, 10, 21, 0, 0, 0, DateTimeKind.Utc), Description = "Pago OP", Origin = FinancialMovementOrigin.System, ReconciliationStatus = FinancialReconciliationStatus.PendingBank, LinkedEntityType = "PaymentOrder", LinkedEntityId = orderId, CreatedAtUtc = DateTime.UtcNow });
            }
            await db.SaveChangesAsync();
        });

        (await client.PutAsJsonAsync($"/api/v1/finance/payment-batches/suppliers/{supplierA}", new { cbu = "0070999003000000001236" })).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await client.PutAsJsonAsync($"/api/v1/finance/payment-batches/suppliers/{supplierA}", new { cbu = SupplierCbu })).IsSuccessStatusCode.Should().BeTrue();
        (await client.PutAsJsonAsync($"/api/v1/finance/payment-batches/suppliers/{supplierB}", new { cbu = OwnCbu, alias = "PROVEEDOR.B" })).IsSuccessStatusCode.Should().BeTrue();

        var candidates = (await client.GetFromJsonAsync<JsonElement>($"/api/v1/finance/payment-batches/candidates?accountId={accountId}")).EnumerateArray().ToList();
        candidates.Should().HaveCount(3);
        candidates.Single(c => c.GetProperty("supplierId").GetGuid() == supplierC).GetProperty("problem").GetString().Should().Contain("CBU");

        object Batch(params Guid[] suppliers) => new { accountId, movementIds = suppliers.Select(s => movements[s]), requestDate = "2026-10-22T00:00:00Z", consolidated = true };
        (await (await client.PostAsJsonAsync("/api/v1/finance/payment-batches", Batch(supplierA, supplierB))).Content.ReadAsStringAsync()).Should().Contain("CBU de la cuenta");
        (await client.PutAsJsonAsync($"/api/v1/finance/payment-batches/accounts/{accountId}", new { cbu = OwnCbu })).IsSuccessStatusCode.Should().BeTrue();
        (await (await client.PostAsJsonAsync("/api/v1/finance/payment-batches", Batch(supplierA, supplierC))).Content.ReadAsStringAsync()).Should().Contain("no tiene CBU");
        var created = await client.PostAsJsonAsync("/api/v1/finance/payment-batches", Batch(supplierA, supplierB));
        created.StatusCode.Should().Be(HttpStatusCode.Created, await created.Content.ReadAsStringAsync());
        var batch = await created.Content.ReadFromJsonAsync<JsonElement>();
        batch.GetProperty("total").GetDecimal().Should().Be(350000.25m);
        // Una orden que está en un lote generado no se anula suelta.
        var orderA = await _factory.WithDbAsync(db => Task.FromResult(db.Movements.Single(m => m.Id == movements[supplierA]).LinkedEntityId!.Value));
        (await client.PostAsJsonAsync($"/api/v1/finance/payments/{orderA}/void", new { reason = "Prueba" })).StatusCode.Should().Be(HttpStatusCode.Conflict);
        // Ya en un lote: no se vuelven a ofrecer.
        (await client.GetFromJsonAsync<JsonElement>($"/api/v1/finance/payment-batches/candidates?accountId={accountId}")).GetArrayLength().Should().Be(1);

        var file = Encoding.ASCII.GetString(await (await client.GetAsync($"/api/v1/finance/payment-batches/{batch.GetProperty("id").GetGuid()}/interbanking")).Content.ReadAsByteArrayAsync());
        var lines = file.Split("\r\n", StringSplitOptions.RemoveEmptyEntries);
        lines.Should().HaveCount(3).And.OnlyContain(l => l.Length == 240);
        lines[0][..3].Should().Be("*U*");
        lines[0].Substring(3, 22).Should().Be(OwnCbu);
        lines[0].Substring(25, 10).Should().Be("D20261022S");
        var b = lines.Single(l => l.Contains("OP-20301112220"));
        b[..3].Should().Be("*M*");
        b.Substring(3, 22).Should().Be(OwnCbu);
        b.Substring(25, 17).Should().Be("00000000015000025");
        b.Substring(42, 60).TrimEnd().Should().Be("OP-20301112220 Proveedor Nandu 2030");
        b.Substring(116, 2).Should().Be("OP");
        b.Substring(178, 11).Should().Be("20301112220");

        // El banco debita el lote consolidado en un solo renglón: la bandeja lo propone contra las dos órdenes de pago.
        var csv = "\"Fecha\";\"Descripción\";\"Origen\";\"Débitos\";\"Créditos\";\"Grupo de Conceptos\";\"Concepto\";\"Número de Terminal\";\"Observaciones Cliente\";\"Número de Comprobante\";\"Leyendas Adicionales1\";\"Leyendas Adicionales2\";\"Leyendas Adicionales3\";\"Leyendas Adicionales4\";\"Tipo de Movimiento\";\"Saldo\"\n"
            + "\"23/10/2026\";\"Pago Proveedores Interbanking\";\"\";\"350000,25\";\"0\";\"\";\"\";\"\";\"\";\"1\";\"\";\"\";\"\";\"\";\"Imputado\";\"649999,75\";\n";
        (await client.PostAsJsonAsync("/api/v1/finance/imports/bank/confirm", new { accountId, fileBase64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(csv)), fileName = "Extracto_CC.csv" }))
            .IsSuccessStatusCode.Should().BeTrue();
        var tray = await client.GetFromJsonAsync<JsonElement>($"/api/v1/finance/reconciliation/tray?accountId={accountId}");
        var suggestion = tray.GetProperty("rows").EnumerateArray().Single().GetProperty("suggestion");
        suggestion.GetProperty("type").GetString().Should().Be("MatchMany");
        suggestion.GetProperty("label").GetString().Should().StartWith("Lote de pagos");
        suggestion.GetProperty("systemIds").EnumerateArray().Select(x => x.GetGuid()).Should().BeEquivalentTo(new[] { movements[supplierA], movements[supplierB] });
    }
}
