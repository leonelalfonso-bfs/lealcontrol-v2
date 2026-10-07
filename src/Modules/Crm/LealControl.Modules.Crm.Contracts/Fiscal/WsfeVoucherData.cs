using System.Globalization;

namespace LealControl.Modules.Crm.Contracts.Fiscal;

/// <summary>Una alícuota de IVA totalizada (Id según FEParamGetTiposIva).</summary>
public sealed record WsfeVatLine(int Id, decimal BaseAmount, decimal Amount);

/// <summary>Dato opcional por RG (FEParamGetTiposOpcional): CBU 2101, alias 2102, anulación 22, transferencia 27.</summary>
public sealed record WsfeOptional(string Id, string Value);

/// <summary>Comprobante asociado de una nota de crédito o débito.</summary>
public sealed record WsfeAssociatedVoucher(
    int Type, int PointOfSale, long Number, string IssuerCuit, string IssueDate);

/// <summary>
/// Datos fiscales de un comprobante, preparados localmente o leídos de FECompConsultar.
/// No contiene certificado, token ni firma.
/// </summary>
public sealed record WsfeVoucherData(
    int VoucherType,
    int Concept,
    int ReceiverDocumentType,
    string ReceiverDocumentNumber,
    int ReceiverVatCondition,
    string IssueDate,
    string? ServiceFrom,
    string? ServiceTo,
    string? PaymentDue,
    decimal NetAmount,
    decimal NonTaxedAmount,
    decimal ExemptAmount,
    decimal VatAmount,
    decimal OtherTaxesAmount,
    decimal TotalAmount,
    IReadOnlyList<WsfeVatLine> VatLines,
    string CurrencyCode,
    decimal ExchangeRate,
    bool? PaidInSameForeignCurrency,
    IReadOnlyList<WsfeAssociatedVoucher> AssociatedVouchers,
    IReadOnlyList<WsfeOptional>? Optionals = null)
{
    public IReadOnlyList<WsfeOptional> OptionalList => Optionals ?? [];

    public static readonly IReadOnlyList<WsfeVatLine> NoVat = [];
    public static readonly IReadOnlyList<WsfeAssociatedVoucher> NoAssociated = [];

    public bool IsCreditOrDebitNote => VoucherType is 2 or 3 or 7 or 8 or 202 or 203 or 207 or 208;

    /// <summary>Factura de Crédito Electrónica MiPyMEs y sus notas (201-203, 206-208).</summary>
    public bool IsFce => VoucherType is >= 201 and <= 208 and not (204 or 205);

    /// <summary>Todos los datos enviados en la solicitud, en forma canónica.</summary>
    public string RequestKey() => string.Join("|",
        ObservableKey(),
        PaidInSameForeignCurrency switch { true => "S", false => "N", null => "-" },
        string.Join(";", AssociatedVouchers.Select(a => string.Join(",",
            a.Type, a.PointOfSale, a.Number, a.IssuerCuit, a.IssueDate))));

    /// <summary>
    /// Los datos que FECompConsultar devuelve. La marca de cancelación en moneda
    /// extranjera y el CUIT o la fecha de los asociados no forman parte de la respuesta.
    /// </summary>
    public string ObservableKey() => string.Join("|",
        VoucherType, Concept, ReceiverDocumentType, ReceiverDocumentNumber, ReceiverVatCondition,
        IssueDate, ServiceFrom ?? "-", ServiceTo ?? "-", PaymentDue ?? "-",
        Money(NetAmount), Money(NonTaxedAmount), Money(ExemptAmount), Money(VatAmount),
        Money(OtherTaxesAmount), Money(TotalAmount),
        string.Join(";", VatLines.OrderBy(v => v.Id)
            .Select(v => $"{v.Id},{Money(v.BaseAmount)},{Money(v.Amount)}")),
        CurrencyCode, ExchangeRate.ToString("0.000000", CultureInfo.InvariantCulture),
        string.Join(";", AssociatedVouchers.OrderBy(a => a.Type).ThenBy(a => a.PointOfSale)
            .ThenBy(a => a.Number).Select(a => $"{a.Type},{a.PointOfSale},{a.Number}")))
        // Sin opcionales la clave queda igual que antes: las reservas ya hechas siguen conciliando.
        + (OptionalList.Count == 0 ? "" : "|" + string.Join(";", OptionalList
            .OrderBy(o => o.Id, StringComparer.Ordinal).Select(o => $"{o.Id}={o.Value}")));

    private static string Money(decimal value) => value.ToString("0.00", CultureInfo.InvariantCulture);
}
