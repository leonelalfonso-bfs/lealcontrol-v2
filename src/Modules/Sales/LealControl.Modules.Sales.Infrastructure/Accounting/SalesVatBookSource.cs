using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Accounting.Contracts.VatBooks;
using LealControl.Modules.Sales.Domain.Invoices;
using LealControl.Modules.Sales.Domain.Purchases;
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
                new Taxes(0m, i.IibbPerception, 0m, 0m, 0m, 0m),
                informsDue ? i.DueDate : null) with
            {
                AccountingDate = i.IssueDate, CounterpartyTaxCondition = i.CustomerTaxCondition
            };
        }).ToList();
    }

    public async Task<IReadOnlyList<VatBookVoucher>> PurchasesAsync(DateTime fromUtc, DateTime toUtc, CancellationToken cancellationToken = default)
    {
        var tenantId = tenant.TenantId;
        var invoices = await db.PurchaseInvoices.AsNoTracking().Include(i => i.Items)
            // Compras: por período de imputación (una factura de un mes ya cerrado va al primer mes abierto).
            .Where(i => i.TenantId == tenantId && i.Status != "Cancelled" && i.InvoiceType != PurchaseInvoice.NonFiscalType
                        && i.ImputationPeriod >= fromUtc && i.ImputationPeriod <= toUtc)
            .OrderBy(i => i.IssueDate).ThenBy(i => i.SupplierName)
            .ToListAsync(cancellationToken);
        var categories = await db.Set<ExpenseCategory>().AsNoTracking().Where(c => c.TenantId == tenantId)
            .ToDictionaryAsync(c => c.Id, c => c.Label, cancellationToken);

        return invoices.Select(i => Voucher(i.IssueDate, i.InvoiceType, FiscalVoucherCodes.Any(i.InvoiceType) ?? 0,
            i.PointOfSale, i.InvoiceNumber, FiscalVoucherCodes.ReceiverDocument(i.SupplierDocument), i.SupplierName,
            i.Currency, i.ExchangeRate,
            i.Items.Select(x => (x.VatRate, x.NetSubtotal, x.VatAmount)).ToList(),
            new Taxes(i.IvaPerception, i.IibbPerception, i.OtherTaxes, i.GananciasPerception, i.InternalTaxes, i.MunicipalTaxes),
            null) with
        {
            AccountingDate = i.AccountingDate,
            CounterpartyTaxCondition = i.SupplierTaxCondition,
            Jurisdiction = Jurisdiction(i.SupplierProvince),
            Categories = string.Join("; ", i.Items
                .Select(x => x.ExpenseCategoryId is { } id && categories.TryGetValue(id, out var label) ? label : null)
                .OfType<string>().Distinct().Order())
        }).ToList();
    }

    /// <summary>
    /// La provincia como la escribe el libro: "SANTA FE", "CIUDAD AUTONOMA DE BUENOS AIRES". El directorio la
    /// guarda con el nombre del enum (SantaFe, Caba); un texto libre sale en mayúsculas.
    /// </summary>
    internal static string Jurisdiction(string? province) => province?.Trim() switch
    {
        null or "" => "",
        "Caba" => "CIUDAD AUTONOMA DE BUENOS AIRES",
        "TierraDelFuego" => "TIERRA DEL FUEGO",
        "SantiagoDelEstero" => "SANTIAGO DEL ESTERO",
        "EntreRios" => "ENTRE RIOS",
        "Cordoba" => "CORDOBA",
        "Neuquen" => "NEUQUEN",
        "RioNegro" => "RIO NEGRO",
        "Tucuman" => "TUCUMAN",
        var p when p.All(char.IsLetter) => string.Concat(p.Select((c, i) => i > 0 && char.IsUpper(c) ? " " + c : c.ToString())).ToUpperInvariant(),
        var p => p.ToUpperInvariant()
    };

    private sealed record Taxes(decimal PerceptionVat, decimal PerceptionIibb, decimal Other, decimal PerceptionGanancias, decimal Internal, decimal Municipal)
    {
        public decimal Sum => PerceptionVat + PerceptionIibb + Other + PerceptionGanancias + Internal + Municipal;
    }

    private static VatBookVoucher Voucher(
        DateTime date, string invoiceType, int voucherType, int pointOfSale, long number,
        string document, string name, string currency, decimal exchangeRate,
        IReadOnlyList<(decimal VatRate, decimal Net, decimal Vat)> items, Taxes taxes, DateTime? paymentDue)
    {
        var rates = items.Where(i => i.VatRate != 0m)
            .GroupBy(i => i.VatRate)
            .Select(g => new VatBookRate(g.Key, g.Sum(i => i.Net), g.Sum(i => i.Vat)))
            .OrderByDescending(r => r.Rate).ToList();
        var exempt = items.Where(i => i.VatRate == 0m).Sum(i => i.Net);
        var total = rates.Sum(r => r.Net + r.Vat) + exempt + taxes.Sum;
        var letter = FiscalVoucherCodes.BaseType(invoiceType).Replace("FCE_", "")[^1..];
        var isCreditNote = invoiceType.StartsWith("NC_", StringComparison.Ordinal);
        var kind = isCreditNote ? "NC" : invoiceType.StartsWith("ND_", StringComparison.Ordinal) ? "ND" : "FC";
        if (FiscalVoucherCodes.IsFce(invoiceType)) kind += " FCE";
        var label = invoiceType.StartsWith("TF_", StringComparison.Ordinal) ? $"Tique factura {letter} {pointOfSale:D5}-{number:D8}"
            : invoiceType.StartsWith("OC_", StringComparison.Ordinal) ? $"Otros comp. RG 1415 {pointOfSale:D5}-{number:D8}"
            : $"{kind} {letter} {pointOfSale:D5}-{number:D8}";
        return new VatBookVoucher(
            date, voucherType, label, isCreditNote,
            // B y C no discriminan IVA: el comprador no lo computa como crédito fiscal.
            DiscriminatesVat: letter is "A" or "M",
            pointOfSale, number, FiscalVoucherCodes.DocumentType(document), document, name,
            currency switch { "ARS" => "PES", "USD" => "DOL", "EUR" => "060", _ => currency },
            string.Equals(currency, "ARS", StringComparison.OrdinalIgnoreCase) || exchangeRate <= 0 ? 1m : exchangeRate,
            rates, exempt, taxes.PerceptionVat, taxes.PerceptionIibb, taxes.Other, total, paymentDue,
            date, "", "", "", taxes.PerceptionGanancias, taxes.Internal, taxes.Municipal);
    }
}
