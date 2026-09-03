using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Accounting.Contracts.Posting;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Accounting.Infrastructure;

/// <summary>
/// Resuelve cuenta del plan a partir de la cuenta financiera del documento (tags).
/// </summary>
internal static class FinanceAccountMappingHelper
{
    public static async Task<IReadOnlyDictionary<string, string>> ResolveAmountSourceAccountsAsync(
        PostableDocument document,
        TenantId tenantId,
        AccountingDbContext db,
        CancellationToken ct)
    {
        var empty = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (!string.Equals(document.SourceModule, AccountingSourceModules.Finance, StringComparison.OrdinalIgnoreCase))
            return empty;

        if (document.Tags is null
            || !document.Tags.TryGetValue("FinancialAccountId", out var raw)
            || !Guid.TryParse(raw, out var financialAccountId)
            || financialAccountId == Guid.Empty)
        {
            return empty;
        }

        var map = await db.FinanceAccountMappings.AsNoTracking()
            .FirstOrDefaultAsync(
                x => x.TenantId == tenantId && x.FinancialAccountId == financialAccountId,
                ct);

        if (map is null)
        {
            throw new InvalidOperationException(
                $"Falta mapeo de la cuenta financiera {financialAccountId} a una cuenta del plan contable.");
        }

        var code = map.LedgerAccountCode.Trim();
        return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            [AccountingAmountSources.PaymentAmount] = code,
            [AccountingAmountSources.BankAmount] = code,
            [AccountingAmountSources.CashAmount] = code,
            [AccountingAmountSources.ChequeAmount] = code,
            [AccountingAmountSources.MovementAmount] = code
        };
    }
}
