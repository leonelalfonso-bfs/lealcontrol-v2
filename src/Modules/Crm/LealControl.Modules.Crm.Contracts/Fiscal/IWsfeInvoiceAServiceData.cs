namespace LealControl.Modules.Crm.Contracts.Fiscal;

// Datos fiscales preparados localmente. No contiene certificado, token ni firma.
public interface IWsfeInvoiceAServiceData
{
    string ReceiverCuit { get; }
    int ReceiverDocumentType { get; }
    int ReceiverVatCondition { get; }
    int VoucherType { get; }
    int Concept { get; }
    string IssueDate { get; }
    string ServiceFrom { get; }
    string ServiceTo { get; }
    string PaymentDue { get; }
    decimal NetAmount { get; }
    decimal VatAmount { get; }
    decimal TotalAmount { get; }
    int VatRateCode { get; }
    string CurrencyCode { get; }
    decimal ExchangeRate { get; }
}
