namespace LealControl.Modules.Crm.Contracts.Fiscal;

// Campos del comprobante devueltos por FECompConsultar para cotejo con el pedido.
public sealed record WsfeVoucherFiscalData(
    string ReceiverCuit, int ReceiverDocumentType, int ReceiverVatCondition,
    int VoucherType, int Concept, string IssueDate, string ServiceFrom,
    string ServiceTo, string PaymentDue, decimal NetAmount, decimal VatAmount,
    decimal TotalAmount, int VatRateCode, string CurrencyCode, decimal ExchangeRate)
    : IWsfeInvoiceAServiceData;
