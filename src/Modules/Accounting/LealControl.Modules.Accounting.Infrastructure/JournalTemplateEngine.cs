using System;
using System.Collections.Generic;
using System.Linq;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Accounting.Contracts.Posting;

namespace LealControl.Modules.Accounting.Infrastructure;

/// <summary>
/// Motor puro de renderizado de asientos modelos (Journal Templates).
/// No accede a DB: recibe un resolutor de cuentas y usa only-reads sobre <see cref="PostableDocument"/>.
/// </summary>
public interface IAccountingAccountResolver
{
    ResolvedAccountingAccount Resolve(string accountCode, string accountNameFallback);
}

public sealed record ResolvedAccountingAccount(Guid Id, string Code, string Name);

public static class JournalTemplateEngine
{
    private const decimal BalanceTolerance = 0.01m;

    public static JournalEntry Render(
        JournalTemplate template,
        PostableDocument document,
        TenantId tenantId,
        IAccountingAccountResolver accounts,
        IReadOnlyDictionary<string, string>? accountCodeByAmountSource = null)
    {
        if (template is null) throw new ArgumentNullException(nameof(template));
        if (document is null) throw new ArgumentNullException(nameof(document));
        if (accounts is null) throw new ArgumentNullException(nameof(accounts));

        var entry = new JournalEntry
        {
            TenantId = tenantId,
            Date = document.Date.Kind == DateTimeKind.Unspecified
                ? DateTime.SpecifyKind(document.Date, DateTimeKind.Utc)
                : document.Date.ToUniversalTime(),
            Concept = BuildEntryConcept(document),
            EntryType = "Standard",
            SourceModule = document.SourceModule,
            SourceDocumentId = document.DocumentId,
            Status = "Posted",
            CreatedBy = "Accounting.TemplateEngine",
            CreatedAtUtc = DateTime.UtcNow
        };

        foreach (var line in template.Lines.OrderBy(l => l.OrderIndex))
        {
            if (!IsConditionMet(line.Condition, document))
                continue;

            var amount = ResolveAmountSourceAmount(line.AmountSource, document);
            amount = Math.Abs(amount);

            // Si la condición está metida pero el monto viene vacío,
            // dejamos que el balance falle más abajo (más trazable).
            if (amount == 0m && !string.Equals(line.Condition, "Always", StringComparison.OrdinalIgnoreCase))
                continue;

            var accountCode = line.AccountCode;
            if (accountCodeByAmountSource is not null
                && !string.IsNullOrWhiteSpace(line.AmountSource)
                && accountCodeByAmountSource.TryGetValue(line.AmountSource, out var mappedCode)
                && !string.IsNullOrWhiteSpace(mappedCode))
            {
                accountCode = mappedCode;
            }

            var resolvedAccount = accounts.Resolve(accountCode, line.AccountName);

            var memo = RenderMemoTemplate(line.MemoTemplate, document);

            bool isDebit = string.Equals(line.DebitCredit, "Debit", StringComparison.OrdinalIgnoreCase);
            var isInverted = line.IsInvertedSign;
            var debit = isDebit ^ isInverted ? amount : 0m;
            var credit = isDebit ^ isInverted ? 0m : amount;

            entry.Lines.Add(new JournalEntryLine
            {
                JournalEntryId = entry.Id,
                TenantId = tenantId,
                AccountId = resolvedAccount.Id,
                AccountCode = resolvedAccount.Code,
                AccountName = resolvedAccount.Name,
                Debit = debit,
                Credit = credit,
                Currency = document.Currency,
                ExchangeRate = document.ExchangeRate > 0 ? document.ExchangeRate : 1m,
                Memo = memo
            });
        }

        entry.TotalDebit = entry.Lines.Sum(l => l.Debit);
        entry.TotalCredit = entry.Lines.Sum(l => l.Credit);

        if (Math.Abs(entry.TotalDebit - entry.TotalCredit) > BalanceTolerance)
        {
            throw new InvalidOperationException(
                $"Asiento desbalanceado (render). Debe {entry.TotalDebit:N2} / Haber {entry.TotalCredit:N2} | " +
                $"Doc={document.SourceModule}/{document.DocumentType}/{document.DocumentNumber} | Template={template.Code}.");
        }

        return entry;
    }

    private static string BuildEntryConcept(PostableDocument doc)
    {
        if (!string.IsNullOrWhiteSpace(doc.CounterpartyName))
            return $"{doc.DocumentType} {doc.DocumentNumber} - {doc.CounterpartyName}";
        return $"{doc.DocumentType} {doc.DocumentNumber}";
    }

    private static bool IsConditionMet(string? condition, PostableDocument doc)
    {
        var c = (condition ?? "Always").Trim();
        if (c.Length == 0 || string.Equals(c, "Always", StringComparison.OrdinalIgnoreCase))
            return true;

        if (string.Equals(c, "IfCash", StringComparison.OrdinalIgnoreCase))
            return ResolveAmountSourceAmount(AccountingAmountSources.CashAmount, doc) > 0m;

        if (string.Equals(c, "IfBankTransfer", StringComparison.OrdinalIgnoreCase))
            return ResolveAmountSourceAmount(AccountingAmountSources.BankAmount, doc) > 0m;

        if (c.StartsWith("IfHas", StringComparison.OrdinalIgnoreCase))
        {
            var key = c[4..]; // after "IfHas"
            // Normalización de plural/singular
            if (string.Equals(key, "Withholding", StringComparison.OrdinalIgnoreCase))
                key = AccountingAmountSources.Withholdings;

            return ResolveAmountSourceAmount(key, doc) > 0m;
        }

        // Condición no conocida → por seguridad no incluir la línea.
        return false;
    }

    private static decimal ResolveAmountSourceAmount(string amountSource, PostableDocument doc)
    {
        var key = (amountSource ?? string.Empty).Trim();
        if (doc.Amounts.TryGetValue(key, out var v))
            return v;

        // Aliases para plantillas seed actuales (finance).
        if (string.Equals(key, AccountingAmountSources.Withholdings, StringComparison.OrdinalIgnoreCase))
        {
            // RetentionAmount es el equivalente nuevo.
            if (doc.Amounts.TryGetValue(AccountingAmountSources.RetentionAmount, out var r))
                return r;
        }

        if (string.Equals(key, AccountingAmountSources.PaymentAmount, StringComparison.OrdinalIgnoreCase))
        {
            // Pago neto = Total - Withholdings (equivalente RetentionAmount).
            if (!doc.Amounts.TryGetValue(AccountingAmountSources.Total, out var total))
                return 0m;

            var withholdings = doc.Amounts.TryGetValue(AccountingAmountSources.Withholdings, out var w)
                ? w
                : doc.Amounts.TryGetValue(AccountingAmountSources.RetentionAmount, out var r)
                    ? r
                    : 0m;

            return total - withholdings;
        }

        return 0m;
    }

    private static string? RenderMemoTemplate(string? memoTemplate, PostableDocument doc)
    {
        if (string.IsNullOrWhiteSpace(memoTemplate))
            return null;

        var memo = memoTemplate;

        var tokenMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["DocumentType"] = doc.DocumentType,
            ["DocumentNumber"] = doc.DocumentNumber,
            ["CounterpartyName"] = doc.CounterpartyName ?? string.Empty
        };

        foreach (var (k, v) in doc.Tags)
        {
            if (!string.IsNullOrWhiteSpace(k))
                tokenMap[k] = v;
        }

        foreach (var (token, value) in tokenMap)
        {
            memo = memo.Replace($"{{{token}}}", value);
        }

        return memo;
    }
}

