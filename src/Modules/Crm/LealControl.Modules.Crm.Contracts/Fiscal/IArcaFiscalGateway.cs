namespace LealControl.Modules.Crm.Contracts.Fiscal;

// Contrato entre Ventas y CRM: nunca entrega certificado, token ni firma.
public interface IArcaFiscalGateway
{
    Task<ArcaFiscalNumbering> GetLastAuthorizedAsync(
        int pointOfSale, int voucherType, CancellationToken cancellationToken);

    Task<WsfeCaeReply> SubmitCaeAsync(
        IWsfeInvoiceAServiceData data, int pointOfSale, long reservedNumber,
        string expectedIssuerCuit, bool expectedProduction, CancellationToken cancellationToken);

    Task<ArcaFiscalVoucherObservation> GetVoucherAsync(
        int pointOfSale, int voucherType, long number, string expectedIssuerCuit,
        bool expectedProduction, CancellationToken cancellationToken);
}

public sealed record ArcaFiscalNumbering(
    bool Ok, long LastNumber, string IssuerCuit, bool Production, string Detail);

public sealed record ArcaFiscalVoucherObservation(
    bool Confirmed, long Number, string RecipientDocument, decimal Total,
    string Cae, DateTime CaeDueDate, string Detail,
    WsfeVoucherFiscalData? FiscalData = null);
