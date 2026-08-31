using System.Threading.Tasks;
using FluentAssertions;
using LealControl.QA.Infrastructure;
using LealControl.QA.Models;
using LealControl.QA.Scenarios.Purchases;
using LealControl.QA.Scenarios.Sales;
using Xunit;
using Xunit.Abstractions;

namespace LealControl.QA.Tests;

public sealed class QaIntegrationTests : IClassFixture<QaWebApplicationFactory>
{
    private readonly QaWebApplicationFactory _factory;
    private readonly ITestOutputHelper _output;

    public QaIntegrationTests(QaWebApplicationFactory factory, ITestOutputHelper output)
    {
        _factory = factory;
        _output = output;
    }

    private void PrintReport(QaScenarioResult result)
    {
        _output.WriteLine("====================================================================");
        _output.WriteLine($"LEAL ERP TEST CENTER — {result.ScenarioName}");
        _output.WriteLine($"Estado: {result.Status} | Duración: {result.Duration.TotalMilliseconds:F0} ms");
        _output.WriteLine("--------------------------------------------------------------------");
        _output.WriteLine("CHECKS:");
        foreach (var check in result.Checks)
        {
            var symbol = check.Status == QaCheckStatus.Passed ? "✓ [PASS]" : "✗ [FAIL]";
            _output.WriteLine($"{symbol} [{check.Module}] {check.Name}");
            if (check.Status != QaCheckStatus.Passed)
            {
                _output.WriteLine($"    Expected: {check.Expected}");
                _output.WriteLine($"    Actual:   {check.Actual}");
                if (!string.IsNullOrWhiteSpace(check.Message)) _output.WriteLine($"    Nota:     {check.Message}");
            }
        }

        if (result.Issues.Count > 0)
        {
            _output.WriteLine("--------------------------------------------------------------------");
            _output.WriteLine($"ISSUES DETECTADOS ({result.Issues.Count}):");
            foreach (var issue in result.Issues)
            {
                _output.WriteLine($"* {issue.IssueCode} [{issue.Module}] {issue.Entity}: {issue.Difference}");
            }
        }
        _output.WriteLine("====================================================================");
    }

    // ====================================================================
    // VENTAS (SALES)
    // ====================================================================

    [Fact]
    public async Task Run_QaSale001_CashSale_AllAuditsPass()
    {
        await using var context = new QaTestContext(_factory);
        var scenario = new QaSale001Scenario();

        var result = await scenario.ExecuteAsync(context);
        context.Run.Scenarios.Add(result);
        PrintReport(result);

        result.Issues.Should().BeEmpty("todos los cheques matemáticos y de negocio deben ser 100% aprobados");
        result.Status.Should().Be(QaCheckStatus.Passed);
    }

    [Fact]
    public async Task Run_QaSale002_CreditSaleAndPartialCollections_AllAuditsPass()
    {
        await using var context = new QaTestContext(_factory);
        var scenario = new QaSale002Scenario();

        var result = await scenario.ExecuteAsync(context);
        context.Run.Scenarios.Add(result);
        PrintReport(result);

        result.Issues.Should().BeEmpty("todos los cheques matemáticos y de cuenta corriente deben ser 100% aprobados");
        result.Status.Should().Be(QaCheckStatus.Passed);
    }

    [Fact]
    public async Task Run_QaSale003_CreditNoteReturn_AllAuditsPass()
    {
        await using var context = new QaTestContext(_factory);
        var scenario = new QaSale003Scenario();

        var result = await scenario.ExecuteAsync(context);
        context.Run.Scenarios.Add(result);
        PrintReport(result);

        result.Issues.Should().BeEmpty("la nota de crédito debe restituir stock y disminuir saldo sin discrepancias");
        result.Status.Should().Be(QaCheckStatus.Passed);
    }

    [Fact]
    public async Task Run_QaSale004_MultiVatSale_AllAuditsPass()
    {
        await using var context = new QaTestContext(_factory);
        var scenario = new QaSale004Scenario();

        var result = await scenario.ExecuteAsync(context);
        context.Run.Scenarios.Add(result);
        PrintReport(result);

        result.Issues.Should().BeEmpty("todas las alícuotas impositivas deben calcularse y asentarse de forma determinística");
        result.Status.Should().Be(QaCheckStatus.Passed);
    }

    // ====================================================================
    // COMPRAS (PURCHASES)
    // ====================================================================

    [Fact]
    public async Task Run_QaPurchase001_CashPurchase_AllAuditsPass()
    {
        await using var context = new QaTestContext(_factory);
        var scenario = new QaPurchase001Scenario();

        var result = await scenario.ExecuteAsync(context);
        context.Run.Scenarios.Add(result);
        PrintReport(result);

        result.Issues.Should().BeEmpty("la compra contado con recepción debe incrementar stock y cancelar saldo con proveedor");
        result.Status.Should().Be(QaCheckStatus.Passed);
    }

    [Fact]
    public async Task Run_QaPurchase002_CreditPurchaseAndPartialPayments_AllAuditsPass()
    {
        await using var context = new QaTestContext(_factory);
        var scenario = new QaPurchase002Scenario();

        var result = await scenario.ExecuteAsync(context);
        context.Run.Scenarios.Add(result);
        PrintReport(result);

        result.Issues.Should().BeEmpty("la compra a crédito y pagos parciales deben auditar saldo de proveedor determinísticamente");
        result.Status.Should().Be(QaCheckStatus.Passed);
    }

    [Fact]
    public async Task Run_QaPurchase003_SupplierCreditNote_AllAuditsPass()
    {
        await using var context = new QaTestContext(_factory);
        var scenario = new QaPurchase003Scenario();

        var result = await scenario.ExecuteAsync(context);
        context.Run.Scenarios.Add(result);
        PrintReport(result);

        result.Issues.Should().BeEmpty("la nota de crédito de proveedor debe deducir la deuda comercial y balancear contabilidad");
        result.Status.Should().Be(QaCheckStatus.Passed);
    }
}
