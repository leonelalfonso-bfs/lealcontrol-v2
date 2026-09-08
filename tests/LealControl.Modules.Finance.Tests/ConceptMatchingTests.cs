using FluentAssertions;
using LealControl.Modules.Finance.Infrastructure;
using Xunit;

namespace LealControl.Modules.Finance.Tests;

public sealed class ConceptMatchingTests
{
    [Theory]
    [InlineData("Contains", "TRANSFERENCIA RECIBIDA ACME", "TRANSFERENCIA", true)]
    [InlineData("Contains", "PAGO PROVEEDOR", "TRANSFERENCIA", false)]
    [InlineData("StartsWith", "COMISION BANCARIA", "COMISION", true)]
    [InlineData("StartsWith", "BANCO COMISION", "COMISION", false)]
    [InlineData("EndsWith", "ABONO SUELDO", "SUELDO", true)]
    [InlineData("Exact", "AJUSTE", "AJUSTE", true)]
    [InlineData("Exact", "AJUSTE X", "AJUSTE", false)]
    [InlineData("Regex", "TRANSF 12345", @"TRANSF\s+\d+", true)]
    [InlineData("Regex", "SIN MATCH", @"TRANSF\s+\d+", false)]
    public void MatchesDescription_covers_each_MatchMode(string mode, string source, string pattern, bool expected)
    {
        FinanceConceptMatching.MatchesDescription(source, pattern, mode).Should().Be(expected);
    }

    [Fact]
    public void RuleMatches_respects_amount_range_and_cuit_prefix()
    {
        var movement = new FinancialMovement
        {
            Amount = 1500m,
            Description = "Cobro · CUIT: 30712345678"
        };
        var rule = new FinancialConceptRule
        {
            Pattern = "Cobro",
            MatchMode = "Contains",
            AmountMin = 1000m,
            AmountMax = 2000m,
            CuitPattern = "3071"
        };

        FinanceConceptMatching.RuleMatches(movement, rule).Should().BeTrue();

        rule.AmountMax = 1400m;
        FinanceConceptMatching.RuleMatches(movement, rule).Should().BeFalse();

        rule.AmountMax = 2000m;
        rule.CuitPattern = "2099";
        FinanceConceptMatching.RuleMatches(movement, rule).Should().BeFalse();
    }
}
