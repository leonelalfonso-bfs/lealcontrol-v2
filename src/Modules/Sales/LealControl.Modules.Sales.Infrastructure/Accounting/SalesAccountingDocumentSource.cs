using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Accounting.Contracts.Posting;
using LealControl.Modules.Sales.Domain.Invoices;
using LealControl.Modules.Sales.Domain.Purchases;
using LealControl.Modules.Sales.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Sales.Infrastructure.Accounting;

/// <summary>
/// Publica en la cola contable las facturas de venta autorizadas por ARCA y las facturas de proveedor
/// registradas, cuando Contabilidad va a contabilizar un período. Lo anulado que ya estaba publicado se
/// revierte. Todo en pesos: la moneda y la cotización originales quedan como datos del documento.
/// </summary>
internal sealed class SalesAccountingDocumentSource(
    SalesDbContext db,
    ITenantContext tenant,
    IAccountingPostingGateway gateway) : IAccountingDocumentSource
{
    public async Task<int> PublishPendingAsync(DateTime fromUtc, DateTime toUtc, CancellationToken cancellationToken = default)
    {
        var tenantId = tenant.TenantId;

        var sales = await db.Invoices.AsNoTracking().Include(i => i.Items)
            .Where(i => i.TenantId == tenantId && i.IssueDate >= fromUtc && i.IssueDate <= toUtc
                        && (i.Status == "Authorized" || i.Status == "Cancelled") && i.InvoiceType != "Proforma")
            .ToListAsync(cancellationToken);
        var purchases = await db.PurchaseInvoices.AsNoTracking().Include(i => i.Items)
            .Where(i => i.TenantId == tenantId && i.IssueDate >= fromUtc && i.IssueDate <= toUtc)
            .ToListAsync(cancellationToken);

        var published = 0;
        published += await PublishAsync(AccountingSourceModules.Sales,
            sales.Select(i => (i.Id, Active: i.Status == "Authorized", Build: (Func<PostableDocument>)(() => SaleDocument(i)))).ToList(),
            cancellationToken);
        published += await PublishAsync(AccountingSourceModules.Purchases,
            purchases.Select(i => (i.Id, Active: i.Status != "Cancelled", Build: (Func<PostableDocument>)(() => PurchaseDocument(i)))).ToList(),
            cancellationToken);
        return published;
    }

    private async Task<int> PublishAsync(string module, IReadOnlyList<(Guid Id, bool Active, Func<PostableDocument> Build)> documents, CancellationToken ct)
    {
        if (documents.Count == 0) return 0;
        var unpublished = await gateway.FilterUnpublishedAsync(module, documents.Select(d => d.Id.ToString()).ToList(), ct);
        var published = 0;
        foreach (var (id, active, build) in documents)
        {
            var isNew = unpublished.Contains(id.ToString());
            if (active && isNew)
            {
                await gateway.PostAsync(build(), ct);
                published++;
            }
            else if (!active && !isNew)
            {
                // Anulado después de publicado: se saca de la cola o se contra-asienta (si ya se revirtió, no hace nada).
                await gateway.ReverseAsync(module, id.ToString(), "Comprobante anulado", ct);
            }
        }
        return published;
    }

    private static PostableDocument SaleDocument(Invoice invoice)
    {
        var amounts = Amounts(invoice.Currency, invoice.ExchangeRate, invoice.Items.Select(i => (i.VatRate, i.NetSubtotal)).ToList(),
            invoice.Iva21, invoice.Iva105, invoice.Iva27,
            (AccountingAmountSources.PerceptionIibb, invoice.IibbPerception));
        var isCreditNote = invoice.InvoiceType.Contains("NC_", StringComparison.OrdinalIgnoreCase);
        return new PostableDocument(
            AccountingSourceModules.Sales,
            DocumentType(invoice.InvoiceType),
            invoice.Id.ToString(),
            $"{invoice.InvoiceType} {invoice.FormattedNumber}",
            invoice.IssueDate,
            "ARS", 1m,
            "Customer", invoice.CustomerId, invoice.CustomerName,
            // Las notas que documentan una diferencia de cambio van a su propio asiento modelo.
            invoice.ExchangeDifferenceImputationId is not null
                ? isCreditNote ? "AM-VTA-DC-NC" : "AM-VTA-DC-ND"
                : isCreditNote ? "AM-VTA-NC" : "AM-VTA-FAC",
            amounts,
            Tags(invoice.InvoiceType, invoice.Currency, invoice.ExchangeRate, invoice.Total));
    }

    private static PostableDocument PurchaseDocument(PurchaseInvoice invoice)
    {
        var amounts = Amounts(invoice.Currency, invoice.ExchangeRate, invoice.Items.Select(i => (i.VatRate, i.NetSubtotal)).ToList(),
            invoice.Iva21, invoice.Iva105, invoice.Iva27,
            (AccountingAmountSources.PerceptionIibb, invoice.IibbPerception),
            (AccountingAmountSources.PerceptionVat, invoice.IvaPerception),
            (AccountingAmountSources.OtherTaxes, invoice.OtherTaxes));
        var isCreditNote = invoice.InvoiceType.StartsWith("NC_", StringComparison.OrdinalIgnoreCase);
        return new PostableDocument(
            AccountingSourceModules.Purchases,
            DocumentType(invoice.InvoiceType),
            invoice.Id.ToString(),
            $"{invoice.InvoiceType} {invoice.FormattedNumber}",
            invoice.IssueDate,
            "ARS", 1m,
            "Supplier", invoice.SupplierId, invoice.SupplierName,
            isCreditNote ? "AM-CMP-NC" : "AM-CMP-FAC",
            amounts,
            Tags(invoice.InvoiceType, invoice.Currency, invoice.ExchangeRate, invoice.Total));
    }

    /// <summary>
    /// Importes en pesos, redondeados uno por uno; el total es la suma de las partes, así el asiento
    /// cuadra al centavo. Los netos de alícuotas que no son 21, 10,5 ni 27 % van con el exento.
    /// </summary>
    internal static Dictionary<string, decimal> Amounts(
        string currency, decimal exchangeRate, IReadOnlyList<(decimal VatRate, decimal Net)> items,
        decimal vat21, decimal vat105, decimal vat27, params (string Key, decimal Amount)[] extras)
    {
        var rate = string.Equals(currency, "ARS", StringComparison.OrdinalIgnoreCase) || exchangeRate <= 0 ? 1m : exchangeRate;
        decimal Ars(decimal amount) => Math.Round(amount * rate, 2, MidpointRounding.AwayFromZero);
        decimal Net(decimal vatRate) => items.Where(i => Math.Abs(i.VatRate - vatRate) < 0.01m).Sum(i => i.Net);

        var net21 = Net(21m);
        var net105 = Net(10.5m);
        var net27 = Net(27m);
        var amounts = new Dictionary<string, decimal>
        {
            [AccountingAmountSources.Net21] = Ars(net21),
            [AccountingAmountSources.Net105] = Ars(net105),
            [AccountingAmountSources.Net27] = Ars(net27),
            [AccountingAmountSources.NetExempt] = Ars(items.Sum(i => i.Net) - net21 - net105 - net27),
            [AccountingAmountSources.Vat21] = Ars(vat21),
            [AccountingAmountSources.Vat105] = Ars(vat105),
            [AccountingAmountSources.Vat27] = Ars(vat27)
        };
        foreach (var (key, amount) in extras) amounts[key] = Ars(amount);
        amounts[AccountingAmountSources.TotalVat] = amounts[AccountingAmountSources.Vat21] + amounts[AccountingAmountSources.Vat105] + amounts[AccountingAmountSources.Vat27];
        amounts[AccountingAmountSources.Total] = amounts.Where(a => a.Key != AccountingAmountSources.TotalVat).Sum(a => a.Value);
        return amounts;
    }

    private static Dictionary<string, string> Tags(string invoiceType, string currency, decimal exchangeRate, decimal originalTotal) => new()
    {
        ["InvoiceType"] = invoiceType,
        ["OriginalCurrency"] = currency,
        ["OriginalExchangeRate"] = exchangeRate.ToString(System.Globalization.CultureInfo.InvariantCulture),
        ["OriginalTotal"] = originalTotal.ToString(System.Globalization.CultureInfo.InvariantCulture)
    };

    /// <summary>A → InvoiceA, NC_B → CreditNoteB, ND_A → DebitNote, FCE_A → InvoiceA, etc.</summary>
    private static string DocumentType(string invoiceType)
    {
        var letter = invoiceType[^1..].ToUpperInvariant();
        if (invoiceType.Contains("NC_", StringComparison.OrdinalIgnoreCase)) return $"CreditNote{letter}";
        if (invoiceType.Contains("ND_", StringComparison.OrdinalIgnoreCase)) return AccountingDocumentTypes.DebitNote;
        return $"Invoice{letter}";
    }
}
