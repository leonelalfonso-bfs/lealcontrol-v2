using System;
using System.Text.RegularExpressions;

namespace LealControl.Modules.Finance.Infrastructure;

/// <summary>
/// Matching puro de reglas de concepto (sin DB). Usado por FinanceConcepts y tests.
/// </summary>
public static class FinanceConceptMatching
{
    public static bool MatchesDescription(string source, string pattern, string mode)
    {
        if (string.IsNullOrWhiteSpace(pattern)) return false;
        var text = source?.Trim() ?? "";
        var expected = pattern.Trim();
        return mode.Trim().ToUpperInvariant() switch
        {
            "REGEX" => Regex.IsMatch(text, expected, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant),
            "STARTSWITH" => text.StartsWith(expected, StringComparison.OrdinalIgnoreCase),
            "ENDSWITH" => text.EndsWith(expected, StringComparison.OrdinalIgnoreCase),
            "EXACT" => string.Equals(text, expected, StringComparison.OrdinalIgnoreCase),
            _ => text.Contains(expected, StringComparison.OrdinalIgnoreCase)
        };
    }

    public static bool RuleMatches(FinancialMovement movement, FinancialConceptRule rule)
    {
        if (rule.AmountMin.HasValue && movement.Amount < rule.AmountMin.Value) return false;
        if (rule.AmountMax.HasValue && movement.Amount > rule.AmountMax.Value) return false;
        if (!string.IsNullOrWhiteSpace(rule.CuitPattern))
        {
            var cuit = FinanceCounterpartyLookup.ExtractCuit(movement.Description);
            if (cuit is null || !cuit.StartsWith(rule.CuitPattern.Trim().Replace("-", ""), StringComparison.Ordinal))
                return false;
        }

        return MatchesDescription(movement.Description, rule.Pattern, rule.MatchMode);
    }
}
