namespace LealControl.Modules.Accounting.Contracts.VatBooks;

/// <summary>
/// Los comprobantes fiscales del período para los Libros IVA: Ventas aporta lo emitido con CAE y Compras
/// lo recibido de proveedores. Los libros salen de los comprobantes, no de los asientos.
/// </summary>
public interface IVatBookSource
{
    Task<IReadOnlyList<VatBookVoucher>> SalesAsync(DateTime fromUtc, DateTime toUtc, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<VatBookVoucher>> PurchasesAsync(DateTime fromUtc, DateTime toUtc, CancellationToken cancellationToken = default);
}

/// <summary>
/// Un comprobante tal como se informa a ARCA: importes en la moneda del comprobante (positivos también en
/// las notas de crédito), con su cotización. <see cref="Total"/> es la suma de las partes.
/// </summary>
public sealed record VatBookVoucher(
    DateTime Date,
    int VoucherType,
    string VoucherLabel,
    bool IsCreditNote,
    bool DiscriminatesVat,
    int PointOfSale,
    long Number,
    int CounterpartyDocumentType,
    string CounterpartyDocument,
    string CounterpartyName,
    string CurrencyCode,
    decimal ExchangeRate,
    IReadOnlyList<VatBookRate> Rates,
    decimal Exempt,
    decimal PerceptionVat,
    decimal PerceptionIibb,
    decimal OtherTaxes,
    decimal Total,
    DateTime? PaymentDueDate);

/// <summary>Neto gravado e IVA de una alícuota (21, 10,5, 27, 5 o 2,5 %).</summary>
public sealed record VatBookRate(decimal Rate, decimal Net, decimal Vat);
