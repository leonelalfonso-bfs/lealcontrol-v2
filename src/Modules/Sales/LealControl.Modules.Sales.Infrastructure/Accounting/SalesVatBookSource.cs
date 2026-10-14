using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Accounting.Contracts.VatBooks;
using LealControl.Modules.Sales.Domain.Invoices;
using LealControl.Modules.Sales.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Sales.Infrastructure.Accounting;

/// <summary>
/// Comprobantes para los Libros IVA: las ventas con CAE (lo que ARCA tiene registrado) y las facturas de
/// proveedor vigentes. Las alícuotas salen de los ítems, así el libro coincide con lo que se informó.
/// </summary>
internal sealed class SalesVatBookSource(SalesDbContext db, ITenantContext tenant) : IVatBookSource
{
    public async Task<IReadOnlyList<VatBookVoucher>> SalesAsync(DateTime fromUtc, DateTime toUtc, CancellationToken cancellationToken = default)
    {
        var tenantId = tenant.TenantId;
        var invoices = await db.Invoices.AsNoTracking().Include(i => i.Items)
            .Where(i => i.TenantId == tenantId && i.Status == "Authorized" && i.Cae != null
                        && i.IssueDate >= fromUtc && i.IssueDate <= toUtc)
            .OrderBy(i => i.IssueDate).ThenBy(i => i.PointOfSale).ThenBy(i => i.InvoiceNumber)
            .ToListAsync(cancellationToken);

        return invoices.Select(i =>
        {
            var document = FiscalVoucherCodes.ReceiverDocument(i.CustomerDocument);
            var voucherType = FiscalVoucherCodes.Any(i.InvoiceType) ?? 0;
            // El vencimiento se informa cuando va en el comprobante: servicios y Factura de Crédito Electrónica.
            var informsDue = i.FiscalConcept is 2 or 3 || voucherType is 201 or 206;
            return Voucher(i.IssueDate, i.InvoiceType, voucherType, i.PointOfSale, i.InvoiceNumber,
                document, i.CustomerName, i.Currency, i.ExchangeRate,
                i.Items.Select(x => (x.VatRate, x.NetSubtotal, x.VatAmount)).ToList(),
                perceptionVat: 0m, perceptionIibb: i.IibbPerception, otherTaxes: 0m,
                informsDue ? i.DueDate : null);
        }).ToList();
    }

    public async Task<IReadOnlyList<VatBookVoucher>> PurchasesAsync(DateTime fromUtc, DateTime toUtc, CancellationToken cancellationToken = default)
    {
        var tenantId = tenant.TenantId;
        var invoices = await db.PurchaseInvoices.AsNoTracking().Include(i => i.Items)
            .Where(i => i.TenantId == tenantId && i.Status != "Cancelled"
                        && i.IssueDate >= fromUtc && i.IssueDate <= toUtc)
            .OrderBy(i => i.IssueDate).ThenBy(i => i.SupplierName)
            .ToListAsync(cancellationToken);

        return invoices.Select(i => Voucher(i.IssueDate, i.InvoiceType, FiscalVoucherCodes.Any(i.InvoiceType) ?? 0,
            i.PointOfSale, i.InvoiceNumber, FiscalVoucherCodes.ReceiverDocument(i.SupplierDocument), i.SupplierName,
            i.Currency, i.ExchangeRate,
            i.Items.Select(x => (x.VatRate, x.NetSubtotal, x.VatAmount)).ToList(),
            i.IvaPerception, i.IibbPerception, i.OtherTaxes, null)).ToList();
    }

    private static VatBookVoucher Voucher(
        DateTime date, string invoiceType, int voucherType, int pointOfSale, long number,
        string document, string name, string currency, decimal exchangeRate,
        IReadOnlyList<(decimal VatRate, decimal Net, decimal Vat)> items,
        decimal perceptionVat, decimal perceptionIibb, decimal otherTaxes, DateTime? paymentDue)
    {
        var rates = items.Where(i => i.VatRate != 0m)
            .GroupBy(i => i.VatRate)
            .Select(g => new VatBookRate(g.Key, g.Sum(i => i.Net), g.Sum(i => i.Vat)))
            .OrderByDescending(r => r.Rate).ToList();
        var exempt = items.Where(i => i.VatRate == 0m).Sum(i => i.Net);
        var total = rates.Sum(r => r.Net + r.Vat) + exempt + perceptionVat + perceptionIibb + otherTaxes;
        var letter = FiscalVoucherCodes.BaseType(invoiceType).Replace("FCE_", "")[^1..];
        var isCreditNote = invoiceType.StartsWith("NC_", StringComparison.Ordinal);
        var kind = isCreditNote ? "NC" : invoiceType.StartsWith("ND_", StringComparison.Ordinal) ? "ND" : "FC";
        if (FiscalVoucherCodes.IsFce(invoiceType)) kind += " FCE";
        return new VatBookVoucher(
            date, voucherType, $"{kind} {letter} {pointOfSale:D4}-{number:D8}", isCreditNote,
            // B y C no discriminan IVA: el comprador no lo computa como crédito fiscal.
            DiscriminatesVat: letter is "A" or "M",
            pointOfSale, number, FiscalVoucherCodes.DocumentType(document), document, name,
            currency switch { "ARS" => "PES", "USD" => "DOL", "EUR" => "060", _ => currency },
            string.Equals(currency, "ARS", StringComparison.OrdinalIgnoreCase) || exchangeRate <= 0 ? 1m : exchangeRate,
            rates, exempt, perceptionVat, perceptionIibb, otherTaxes, total, paymentDue);
    }
}
