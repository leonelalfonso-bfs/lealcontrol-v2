namespace LealControl.Modules.Accounting.Contracts.Posting;

/// <summary>
/// Documento listo para contabilizar. Finanzas/Ventas lo arman; Contabilidad lo encola o asienta.
/// </summary>
public sealed record PostableDocument(
    string SourceModule,
    string DocumentType,
    string DocumentId,
    string DocumentNumber,
    DateTime Date,
    string Currency,
    decimal ExchangeRate,
    string? CounterpartyType,
    Guid? CounterpartyId,
    string? CounterpartyName,
    string? TemplateHint,
    IReadOnlyDictionary<string, decimal> Amounts,
    IReadOnlyDictionary<string, string> Tags,
    IReadOnlyList<PostableDocumentLine>? Lines = null);

/// <summary>
/// Línea opcional del documento (medio de cobro/pago, ítem de factura, etc.).
/// </summary>
public sealed record PostableDocumentLine(
    string LineType,
    decimal Amount,
    string Currency,
    IReadOnlyDictionary<string, string>? Tags = null);

/// <summary>
/// Constantes de módulos y tipos de documento reconocidos por el motor de plantillas.
/// </summary>
public static class AccountingSourceModules
{
    public const string Sales = "Sales";
    public const string Purchases = "Purchases";
    public const string Finance = "Finance";
    public const string Payroll = "Payroll";
    public const string Inventory = "Inventory";
}

public static class AccountingDocumentTypes
{
    public const string InvoiceA = "InvoiceA";
    public const string InvoiceB = "InvoiceB";
    public const string InvoiceC = "InvoiceC";
    public const string CreditNoteA = "CreditNoteA";
    public const string CreditNoteB = "CreditNoteB";
    public const string CreditNoteC = "CreditNoteC";
    public const string DebitNote = "DebitNote";
    public const string CollectionReceipt = "CollectionReceipt";
    public const string PaymentOrder = "PaymentOrder";
    public const string BankMovement = "BankMovement";
    public const string ChequeDeposit = "ChequeDeposit";
    public const string ChequeReject = "ChequeReject";
    public const string InternalTransfer = "InternalTransfer";
    public const string Payroll = "Payroll";
    public const string All = "All";
}

/// <summary>
/// Claves de importe usadas en <see cref="PostableDocument.Amounts"/> y en plantillas (AmountSource).
/// </summary>
public static class AccountingAmountSources
{
    public const string Total = "Total";
    public const string Net21 = "Net21";
    public const string Net105 = "Net105";
    public const string Net27 = "Net27";
    public const string NetExempt = "NetExempt";
    public const string Vat21 = "Vat21";
    public const string Vat105 = "Vat105";
    public const string Vat27 = "Vat27";
    public const string TotalVat = "TotalVat";
    // Usados por plantillas seed actuales del módulo Contabilidad (finance/sales).
    public const string PaymentAmount = "PaymentAmount"; // Importe neto de cobro/pago
    public const string Withholdings = "Withholdings"; // Retenciones/percepciones sufridas o practicadas
    public const string BankAmount = "BankAmount";
    public const string CashAmount = "CashAmount";
    public const string ChequeAmount = "ChequeAmount";
    public const string ThirdPartyChequeAmount = "ThirdPartyChequeAmount";
    public const string OwnChequeAmount = "OwnChequeAmount";
    public const string RetentionAmount = "RetentionAmount";
    public const string ImputedAmount = "ImputedAmount";
    public const string AdvanceAmount = "AdvanceAmount";
    public const string ExchangeDifference = "ExchangeDifference";
    public const string BankFee = "BankFee";
    public const string MovementAmount = "MovementAmount";
    public const string RejectionFees = "RejectionFees";
}
