using System.Collections.Generic;
using System.Linq;
using LealControl.Modules.Accounting.Contracts.Posting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace LealControl.Modules.Finance.Infrastructure;

/// <summary>
/// Publica documentos de tesorería a Contabilidad vía <see cref="IAccountingPostingGateway"/>.
/// Los fallos de Contabilidad no bloquean la operación de Finanzas.
/// </summary>
internal static class FinanceAccountingPublisher
{
    public static async Task TryPostCollectionReceiptAsync(
        IAccountingPostingGateway gateway,
        FinanceDbContext db,
        CollectionReceipt receipt,
        IReadOnlyList<CollectionReceiptLine> lines,
        ILogger logger,
        CancellationToken ct)
    {
        try
        {
            var amounts = BuildReceiptAmounts(receipt, lines);
            var tags = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            if (receipt.AccountId != Guid.Empty)
                tags["FinancialAccountId"] = receipt.AccountId.ToString();
            tags["Currency"] = receipt.Currency;

            string? templateHint = null;
            var conceptIds = lines.Where(l => l.ConceptId.HasValue).Select(l => l.ConceptId!.Value).Distinct().ToList();
            if (conceptIds.Count > 0)
            {
                templateHint = await db.FinancialConcepts.AsNoTracking()
                    .Where(c => conceptIds.Contains(c.Id) && c.JournalTemplateCode != null && c.JournalTemplateCode != "")
                    .OrderBy(c => c.Code)
                    .Select(c => c.JournalTemplateCode)
                    .FirstOrDefaultAsync(ct);
            }

            var docLines = lines.Select(l => new PostableDocumentLine(
                l.Method,
                l.Amount,
                l.Currency,
                new Dictionary<string, string>
                {
                    ["Method"] = l.Method,
                    ["AccountId"] = l.AccountId?.ToString() ?? "",
                    ["ConceptId"] = l.ConceptId?.ToString() ?? ""
                })).ToList();

            var doc = new PostableDocument(
                AccountingSourceModules.Finance,
                AccountingDocumentTypes.CollectionReceipt,
                receipt.Id.ToString(),
                receipt.ReceiptNumber,
                receipt.ReceiptDateUtc,
                receipt.Currency,
                receipt.PaymentExchangeRate is > 0 ? receipt.PaymentExchangeRate.Value : 1m,
                "Customer",
                receipt.CustomerId,
                null,
                templateHint,
                amounts,
                tags,
                docLines);

            await gateway.PostAsync(doc, ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "No se pudo encolar el recibo {ReceiptId} en Contabilidad.", receipt.Id);
        }
    }

    public static async Task TryPostPaymentOrderAsync(
        IAccountingPostingGateway gateway,
        FinanceDbContext db,
        PaymentOrder order,
        IReadOnlyList<PaymentOrderLine> lines,
        ILogger logger,
        CancellationToken ct)
    {
        try
        {
            var amounts = BuildPaymentAmounts(order, lines);
            var tags = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                ["Currency"] = order.Currency
            };

            string? templateHint = null;
            var conceptIds = lines.Where(l => l.ConceptId.HasValue).Select(l => l.ConceptId!.Value).Distinct().ToList();
            if (conceptIds.Count > 0)
            {
                templateHint = await db.FinancialConcepts.AsNoTracking()
                    .Where(c => conceptIds.Contains(c.Id) && c.JournalTemplateCode != null && c.JournalTemplateCode != "")
                    .OrderBy(c => c.Code)
                    .Select(c => c.JournalTemplateCode)
                    .FirstOrDefaultAsync(ct);
            }

            var docLines = lines.Select(l => new PostableDocumentLine(
                l.Method,
                l.Amount,
                l.Currency,
                new Dictionary<string, string>
                {
                    ["Method"] = l.Method,
                    ["AccountId"] = l.AccountId?.ToString() ?? "",
                    ["ConceptId"] = l.ConceptId?.ToString() ?? ""
                })).ToList();

            var doc = new PostableDocument(
                AccountingSourceModules.Finance,
                AccountingDocumentTypes.PaymentOrder,
                order.Id.ToString(),
                order.OrderNumber,
                order.PaymentDateUtc,
                order.Currency,
                1m,
                "Supplier",
                order.SupplierId,
                order.SupplierName,
                templateHint,
                amounts,
                tags,
                docLines);

            await gateway.PostAsync(doc, ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "No se pudo encolar la OP {OrderId} en Contabilidad.", order.Id);
        }
    }

    public static async Task TryReverseAsync(
        IAccountingPostingGateway gateway,
        string documentId,
        string reason,
        ILogger logger,
        CancellationToken ct)
    {
        try
        {
            await gateway.ReverseAsync(AccountingSourceModules.Finance, documentId, reason, ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "No se pudo revertir en Contabilidad el documento {DocumentId}.", documentId);
        }
    }

    private static Dictionary<string, decimal> BuildReceiptAmounts(
        CollectionReceipt receipt, IReadOnlyList<CollectionReceiptLine> lines)
    {
        decimal bank = 0, cash = 0, cheque = 0, retention = 0;
        foreach (var line in lines)
        {
            var method = line.Method ?? "";
            if (method.Contains("Bank", StringComparison.OrdinalIgnoreCase)
                || method.Contains("Transfer", StringComparison.OrdinalIgnoreCase))
                bank += line.Amount;
            else if (method.Contains("Cash", StringComparison.OrdinalIgnoreCase))
                cash += line.Amount;
            else if (method.Contains("Cheque", StringComparison.OrdinalIgnoreCase)
                     || method.Contains("Check", StringComparison.OrdinalIgnoreCase))
                cheque += line.Amount;
            else if (method.Contains("Retention", StringComparison.OrdinalIgnoreCase)
                     || method.Contains("Retencion", StringComparison.OrdinalIgnoreCase))
                retention += line.Amount;
            else
                bank += line.Amount;
        }

        var imputed = receipt.Amount - receipt.AdvanceAmount;
        if (imputed < 0) imputed = 0;

        var amounts = new Dictionary<string, decimal>(StringComparer.OrdinalIgnoreCase)
        {
            [AccountingAmountSources.Total] = receipt.Amount,
            [AccountingAmountSources.Withholdings] = retention,
            [AccountingAmountSources.PaymentAmount] = Math.Max(0m, receipt.Amount - retention),
            [AccountingAmountSources.BankAmount] = bank,
            [AccountingAmountSources.CashAmount] = cash,
            [AccountingAmountSources.ChequeAmount] = cheque,
            [AccountingAmountSources.RetentionAmount] = retention,
            [AccountingAmountSources.ImputedAmount] = imputed,
            [AccountingAmountSources.AdvanceAmount] = receipt.AdvanceAmount
        };
        if (receipt.ExchangeDifferenceAmount is { } fx && fx != 0)
            amounts[AccountingAmountSources.ExchangeDifference] = fx;
        return amounts;
    }

    private static Dictionary<string, decimal> BuildPaymentAmounts(
        PaymentOrder order, IReadOnlyList<PaymentOrderLine> lines)
    {
        decimal bank = 0, cash = 0, ownCheque = 0, thirdCheque = 0, retention = 0;
        foreach (var line in lines)
        {
            var method = line.Method ?? "";
            if (method.Contains("Bank", StringComparison.OrdinalIgnoreCase)
                || method.Contains("Transfer", StringComparison.OrdinalIgnoreCase))
                bank += line.Amount;
            else if (method.Contains("Cash", StringComparison.OrdinalIgnoreCase))
                cash += line.Amount;
            else if (method.Contains("Own", StringComparison.OrdinalIgnoreCase)
                     || method.Equals("ChequeOwn", StringComparison.OrdinalIgnoreCase))
                ownCheque += line.Amount;
            else if (method.Contains("Third", StringComparison.OrdinalIgnoreCase)
                     || method.Contains("Cheque", StringComparison.OrdinalIgnoreCase))
                thirdCheque += line.Amount;
            else if (method.Contains("Retention", StringComparison.OrdinalIgnoreCase))
                retention += line.Amount;
            else
                bank += line.Amount;
        }

        var imputed = order.Amount - order.AdvanceAmount;
        if (imputed < 0) imputed = 0;

        return new Dictionary<string, decimal>(StringComparer.OrdinalIgnoreCase)
        {
            [AccountingAmountSources.Total] = order.Amount,
            [AccountingAmountSources.Withholdings] = retention,
            [AccountingAmountSources.PaymentAmount] = Math.Max(0m, order.Amount - retention),
            [AccountingAmountSources.BankAmount] = bank,
            [AccountingAmountSources.CashAmount] = cash,
            [AccountingAmountSources.OwnChequeAmount] = ownCheque,
            [AccountingAmountSources.ThirdPartyChequeAmount] = thirdCheque,
            [AccountingAmountSources.ChequeAmount] = ownCheque + thirdCheque,
            [AccountingAmountSources.RetentionAmount] = retention,
            [AccountingAmountSources.ImputedAmount] = imputed,
            [AccountingAmountSources.AdvanceAmount] = order.AdvanceAmount
        };
    }
}
