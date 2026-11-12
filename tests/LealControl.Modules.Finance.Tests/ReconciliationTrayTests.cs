using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using FluentAssertions;
using LealControl.Modules.Finance.Infrastructure;
using Xunit;

namespace LealControl.Modules.Finance.Tests;

/// <summary>
/// Bandeja de conciliación (nota 69, F1b), datos inventados con el formato de Galicia: pago desempatado por el CUIT,
/// eCheq por su número, impuesto bancario clasificado solo y el resto sin identificar; confirmación masiva.
/// </summary>
public sealed class ReconciliationTrayTests : IClassFixture<FinanceWebApplicationFactory>
{
    private readonly FinanceWebApplicationFactory _factory;
    public ReconciliationTrayTests(FinanceWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public void Bank_texts_are_recognized()
    {
        BankChargeClassifier.Classify("Imp. Deb. Ley 25413 Gral.").Should().Be("IMPUESTO_RETENCION");
        BankChargeClassifier.Classify("Ing. Brutos S/ Cred · REG.RECAU.SIRCREB").Should().Be("IMPUESTO_RETENCION");
        BankChargeClassifier.Classify("Iva Percepcion Rg 2408").Should().Be("IMPUESTO_RETENCION");
        BankChargeClassifier.Classify("COM MANT FRA 09/26 123").Should().Be("COMISION");
        BankChargeClassifier.Classify("Rescate Fima · FIMA PREMIUM CLASE A").Should().Be("INVERSION_RESCATE");
        BankChargeClassifier.Classify("Servicio Acreditamiento De Haberes").Should().Be("SUELDOS");
        BankChargeClassifier.Classify("Trf Inmed Proveed · Proveedor SA").Should().BeNull();
        FinanceReconciliationTray.ChequeNumberIn("Echeq 48 Hs. Nro.      345").Should().Be(345);
        FinanceReconciliationTray.ChequeNumberIn("Echeq Galicia Nro: 00000414").Should().Be(414);
        FinanceReconciliationTray.ChequeNumberIn("Cheque pagado Nro 438").Should().Be(438);
        FinanceReconciliationTray.ChequeNumberIn("Trf Inmed Proveed Nro 123").Should().BeNull();
    }

    [Fact]
    public async Task Tray_suggests_and_confirms_in_bulk()
    {
        var tenantId = FinanceWebApplicationFactory.DemoTenantId;
        var client = _factory.CreateAuthenticatedClient(tenantId);
        var accountId = Guid.NewGuid();
        var (orderA, orderB, chequeId) = (Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
        Guid movementB = Guid.NewGuid(), manualChequeId = Guid.NewGuid();
        await _factory.WithDbAsync(async db =>
        {
            db.Accounts.Add(new FinancialAccount { Id = accountId, TenantId = tenantId, Name = $"Galicia {accountId:N}"[..20], Currency = "ARS", Type = FinancialAccountType.Bank, IsActive = true, CreatedAtUtc = DateTime.UtcNow });
            // Dos órdenes de pago por el mismo importe: la de A tiene la fecha más cercana, pero el banco trae el CUIT de B.
            foreach (var (id, cuit, day, movementId) in new[] { (orderA, "30712345671", 4, Guid.NewGuid()), (orderB, "20301112220", 1, movementB) })
            {
                db.PaymentOrders.Add(new PaymentOrder { Id = id, TenantId = tenantId, SupplierName = $"Proveedor {cuit}", SupplierTaxId = cuit, OrderNumber = $"OP-{cuit[..4]}-{id:N}"[..20], Amount = 100000m, Currency = "ARS", PaymentDateUtc = new DateTime(2026, 10, day, 0, 0, 0, DateTimeKind.Utc), Status = "Issued", CreatedAtUtc = DateTime.UtcNow });
                db.Movements.Add(new FinancialMovement { Id = movementId, TenantId = tenantId, AccountId = accountId, Kind = FinancialMovementKind.Debit, Amount = 100000m, Currency = "ARS", OperationDateUtc = new DateTime(2026, 10, day, 0, 0, 0, DateTimeKind.Utc), Description = "Pago OP", Origin = FinancialMovementOrigin.System, ReconciliationStatus = FinancialReconciliationStatus.PendingBank, LinkedEntityType = "PaymentOrder", LinkedEntityId = id, CreatedAtUtc = DateTime.UtcNow });
            }
            db.ReceivedCheques.Add(new ReceivedCheque { Id = chequeId, TenantId = tenantId, CheckNumber = "00000345", Amount = 64024.84m, Direction = ChequeDirection.Issued, Status = ReceivedChequeStatus.Issued, ReceivedFrom = "Proveedor eCheq", CreatedAtUtc = DateTime.UtcNow });
            // Cheque que el banco no nombra: se ofrece para elegirlo a mano en el débito del mismo importe.
            db.ReceivedCheques.Add(new ReceivedCheque { Id = manualChequeId, TenantId = tenantId, CheckNumber = "777", Amount = 1000m, Direction = ChequeDirection.Issued, Status = ReceivedChequeStatus.Issued, IssuerName = "Proveedor Cheque Físico", CreatedAtUtc = DateTime.UtcNow });
            await db.SaveChangesAsync();
        });

        var csv = "\"Fecha\";\"Descripción\";\"Origen\";\"Débitos\";\"Créditos\";\"Grupo de Conceptos\";\"Concepto\";\"Número de Terminal\";\"Observaciones Cliente\";\"Número de Comprobante\";\"Leyendas Adicionales1\";\"Leyendas Adicionales2\";\"Leyendas Adicionales3\";\"Leyendas Adicionales4\";\"Tipo de Movimiento\";\"Saldo\"\n"
            + "\"05/10/2026\";\"Trf Inmed Proveed\";\"\";\"100000,00\";\"0\";\"\";\"\";\"\";\"\";\"11111111\";\"Proveedor B\";\"20301112220\";\"FACTURAS\";\"\";\"Imputado\";\"900000,00\";\n"
            + "\"05/10/2026\";\"Echeq 48 Hs. Nro.      345\";\"\";\"64024,84\";\"0\";\"\";\"\";\"\";\"\";\"345\";\"\";\"\";\"\";\"\";\"Imputado\";\"835975,16\";\n"
            + "\"05/10/2026\";\"Imp. Deb. Ley 25413 Gral.\";\"\";\"600,00\";\"0\";\"\";\"\";\"\";\"\";\"\";\"\";\"\";\"\";\"\";\"Imputado\";\"835375,16\";\n"
            + "\"05/10/2026\";\"Deb. Autom. De Serv.\";\"\";\"1000,00\";\"0\";\"\";\"\";\"\";\"\";\"\";\"EMPRESA DE SERVICIOS\";\"\";\"\";\"\";\"Imputado\";\"834375,16\";\n";
        var import = await client.PostAsJsonAsync("/api/v1/finance/imports/bank/confirm", new
        {
            accountId, fileBase64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(csv)), fileName = "Extracto_CC.csv"
        });
        import.IsSuccessStatusCode.Should().BeTrue(await import.Content.ReadAsStringAsync());

        var tray = await client.GetFromJsonAsync<JsonElement>($"/api/v1/finance/reconciliation/tray?accountId={accountId}");
        var rows = tray.GetProperty("rows").EnumerateArray().ToList();
        JsonElement Row(string text) => rows.Single(r => r.GetProperty("description").GetString()!.StartsWith(text));
        var transfer = Row("Trf Inmed Proveed").GetProperty("suggestion");
        transfer.GetProperty("type").GetString().Should().Be("Match");
        transfer.GetProperty("systemId").GetGuid().Should().Be(movementB);
        var option = Row("Deb. Autom").GetProperty("chequeOptions").EnumerateArray().Single();
        option.GetProperty("chequeId").GetGuid().Should().Be(manualChequeId);
        option.GetProperty("label").GetString().Should().Be("Cheque 777 a Proveedor Cheque Físico");
        Row("Echeq").GetProperty("chequeOptions").EnumerateArray().Should().BeEmpty();
        var cheque = Row("Echeq").GetProperty("suggestion");
        cheque.GetProperty("type").GetString().Should().Be("Cheque");
        cheque.GetProperty("chequeId").GetGuid().Should().Be(chequeId);
        Row("Imp. Deb.").GetProperty("suggestion").GetProperty("type").GetString().Should().Be("Classified");
        Row("Deb. Autom.").GetProperty("suggestion").GetProperty("type").GetString().Should().Be("Unknown");

        var confirm = await client.PostAsJsonAsync("/api/v1/finance/reconciliation/tray/confirm", new
        {
            accountId,
            matches = new[] { new { importedId = Row("Trf Inmed Proveed").GetProperty("id").GetGuid(), systemId = movementB } },
            cheques = new[] { new { importedId = Row("Echeq").GetProperty("id").GetGuid(), chequeId } },
            classify = new[] { Row("Imp. Deb.").GetProperty("id").GetGuid() }
        });
        var result = await confirm.Content.ReadFromJsonAsync<JsonElement>();
        result.GetProperty("matched").GetInt32().Should().Be(1);
        result.GetProperty("cheques").GetInt32().Should().Be(1);
        result.GetProperty("classified").GetInt32().Should().Be(1);

        var after = await client.GetFromJsonAsync<JsonElement>($"/api/v1/finance/reconciliation/tray?accountId={accountId}");
        after.GetProperty("rows").EnumerateArray().Should().ContainSingle()
            .Which.GetProperty("description").GetString().Should().StartWith("Deb. Autom.");
        await _factory.WithDbAsync(async db =>
        {
            var linked = await db.ReceivedCheques.FindAsync(chequeId);
            linked!.Status.Should().Be(ReceivedChequeStatus.Debited);
            linked.BankMovementId.Should().NotBeNull();
        });
    }

    [Fact]
    public async Task One_transfer_paying_several_orders_of_the_same_supplier_is_matched_with_all()
    {
        var tenantId = FinanceWebApplicationFactory.DemoTenantId;
        var client = _factory.CreateAuthenticatedClient(tenantId);
        var accountId = Guid.NewGuid();
        var movements = new List<Guid>();
        await _factory.WithDbAsync(async db =>
        {
            db.Accounts.Add(new FinancialAccount { Id = accountId, TenantId = tenantId, Name = $"Galicia {accountId:N}"[..20], Currency = "ARS", Type = FinancialAccountType.Bank, IsActive = true, CreatedAtUtc = DateTime.UtcNow });
            // Tres OP del mismo proveedor (30.000, 20.000 y 45.000) y una de otro por 20.000: la transferencia de 50.000 paga las dos primeras.
            foreach (var (cuit, amount) in new[] { ("27301112225", 30000m), ("27301112225", 20000m), ("27301112225", 45000m), ("30712345671", 20000m) })
            {
                var orderId = Guid.NewGuid();
                var movementId = Guid.NewGuid();
                movements.Add(movementId);
                db.PaymentOrders.Add(new PaymentOrder { Id = orderId, TenantId = tenantId, SupplierName = "Proveedor", SupplierTaxId = cuit, OrderNumber = $"OP-{orderId:N}"[..20], Amount = amount, Currency = "ARS", PaymentDateUtc = new DateTime(2026, 10, 2, 0, 0, 0, DateTimeKind.Utc), Status = "Issued", CreatedAtUtc = DateTime.UtcNow });
                db.Movements.Add(new FinancialMovement { Id = movementId, TenantId = tenantId, AccountId = accountId, Kind = FinancialMovementKind.Debit, Amount = amount, Currency = "ARS", OperationDateUtc = new DateTime(2026, 10, 2, 0, 0, 0, DateTimeKind.Utc), Description = "Pago OP", Origin = FinancialMovementOrigin.System, ReconciliationStatus = FinancialReconciliationStatus.PendingBank, LinkedEntityType = "PaymentOrder", LinkedEntityId = orderId, CreatedAtUtc = DateTime.UtcNow });
            }
            await db.SaveChangesAsync();
        });
        var csv = "\"Fecha\";\"Descripción\";\"Origen\";\"Débitos\";\"Créditos\";\"Grupo de Conceptos\";\"Concepto\";\"Número de Terminal\";\"Observaciones Cliente\";\"Número de Comprobante\";\"Leyendas Adicionales1\";\"Leyendas Adicionales2\";\"Leyendas Adicionales3\";\"Leyendas Adicionales4\";\"Tipo de Movimiento\";\"Saldo\"\n"
            + "\"03/10/2026\";\"Trf Inmed Proveed\";\"\";\"50000,00\";\"0\";\"\";\"\";\"\";\"\";\"22222222\";\"Proveedor\";\"27301112225\";\"FACTURAS\";\"\";\"Imputado\";\"950000,00\";\n";
        (await client.PostAsJsonAsync("/api/v1/finance/imports/bank/confirm", new { accountId, fileBase64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(csv)), fileName = "Extracto_CC.csv" }))
            .IsSuccessStatusCode.Should().BeTrue();

        var tray = await client.GetFromJsonAsync<JsonElement>($"/api/v1/finance/reconciliation/tray?accountId={accountId}");
        var row = tray.GetProperty("rows").EnumerateArray().Single();
        var suggestion = row.GetProperty("suggestion");
        suggestion.GetProperty("type").GetString().Should().Be("MatchMany");
        var systemIds = suggestion.GetProperty("systemIds").EnumerateArray().Select(x => x.GetGuid()).ToList();
        systemIds.Should().BeEquivalentTo(new[] { movements[0], movements[1] });

        var confirm = await client.PostAsJsonAsync("/api/v1/finance/reconciliation/tray/confirm", new
        {
            accountId, matches = Array.Empty<object>(), cheques = Array.Empty<object>(), classify = Array.Empty<Guid>(),
            matchesMany = new[] { new { importedId = row.GetProperty("id").GetGuid(), systemIds } }
        });
        (await confirm.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("matched").GetInt32().Should().Be(2);
        var after = await client.GetFromJsonAsync<JsonElement>($"/api/v1/finance/reconciliation/tray?accountId={accountId}");
        after.GetProperty("rows").EnumerateArray().Should().BeEmpty();
        after.GetProperty("pendingSystem").GetInt32().Should().Be(2);
    }

    [Fact]
    public async Task Bank_debit_marked_as_transfer_credits_the_other_own_account()
    {
        var tenantId = FinanceWebApplicationFactory.DemoTenantId;
        var client = _factory.CreateAuthenticatedClient(tenantId);
        var (bankId, walletId) = (Guid.NewGuid(), Guid.NewGuid());
        await _factory.WithDbAsync(async db =>
        {
            db.Accounts.Add(new FinancialAccount { Id = bankId, TenantId = tenantId, Name = $"Banco {bankId:N}"[..20], Currency = "ARS", Type = FinancialAccountType.Bank, IsActive = true, CreatedAtUtc = DateTime.UtcNow });
            db.Accounts.Add(new FinancialAccount { Id = walletId, TenantId = tenantId, Name = "Viáticos Empleado", Currency = "ARS", Type = FinancialAccountType.Cash, BookingMode = FinancialAccountBookingMode.Manual, EmployeeId = Guid.NewGuid(), IsActive = true, CreatedAtUtc = DateTime.UtcNow });
            await db.SaveChangesAsync();
        });
        var csv = "\"Fecha\";\"Descripción\";\"Origen\";\"Débitos\";\"Créditos\";\"Grupo de Conceptos\";\"Concepto\";\"Número de Terminal\";\"Observaciones Cliente\";\"Número de Comprobante\";\"Leyendas Adicionales1\";\"Leyendas Adicionales2\";\"Leyendas Adicionales3\";\"Leyendas Adicionales4\";\"Tipo de Movimiento\";\"Saldo\"\n"
            + "\"03/11/2026\";\"Trf Inmed Proveed\";\"\";\"100000,00\";\"0\";\"\";\"\";\"\";\"\";\"33333333\";\"Empleado Viajante\";\"20111222333\";\"VARIOS\";\"\";\"Imputado\";\"900000,00\";\n";
        (await client.PostAsJsonAsync("/api/v1/finance/imports/bank/confirm", new { accountId = bankId, fileBase64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(csv)), fileName = "Extracto_transf.csv" })).EnsureSuccessStatusCode();
        var tray = await client.GetFromJsonAsync<JsonElement>($"/api/v1/finance/reconciliation/tray?accountId={bankId}");
        var importedId = tray.GetProperty("rows").EnumerateArray().Single().GetProperty("id").GetGuid();

        var confirm = await client.PostAsJsonAsync("/api/v1/finance/reconciliation/tray/confirm", new
        {
            accountId = bankId, matches = Array.Empty<object>(), cheques = Array.Empty<object>(), classify = Array.Empty<Guid>(),
            transfers = new[] { new { importedId, otherAccountId = walletId } }
        });
        (await confirm.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("transfers").GetInt32().Should().Be(1);

        await _factory.WithDbAsync(async db =>
        {
            var imported = db.Movements.Single(m => m.Id == importedId);
            imported.ReconciliationStatus.Should().Be(FinancialReconciliationStatus.Reconciled);
            var credit = db.Movements.Single(m => m.AccountId == walletId);
            credit.Kind.Should().Be(FinancialMovementKind.Credit);
            credit.Amount.Should().Be(100000m);
            credit.TransferId.Should().Be(imported.TransferId!.Value);
        });
        (await client.GetFromJsonAsync<JsonElement>($"/api/v1/finance/reconciliation/tray?accountId={bankId}")).GetProperty("rows").GetArrayLength().Should().Be(0);
    }
}
