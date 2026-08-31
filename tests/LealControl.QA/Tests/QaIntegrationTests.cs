using System.Threading.Tasks;
using FluentAssertions;
using LealControl.QA.Infrastructure;
using LealControl.QA.Models;
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

    [Fact]
    public async Task Run_QaSale001_CashSale_AllAuditsPass()
    {
        // ARRANGE
        await using var context = new QaTestContext(_factory);
        var scenario = new QaSale001Scenario();

        // ACT
        var result = await scenario.ExecuteAsync(context);
        context.Run.Scenarios.Add(result);

        // Print human-readable report to test output
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

        // ASSERT
        result.Issues.Should().BeEmpty("todos los cheques matemáticos y de negocio deben ser 100% aprobados");
        result.Status.Should().Be(QaCheckStatus.Passed);
    }
}
