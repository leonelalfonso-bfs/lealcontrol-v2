namespace LealControl.Modules.Crm.Contracts.Fiscal;

// Contrato entre Ventas y CRM: nunca entrega certificado, token ni firma.
public interface IArcaFiscalGateway
{
    Task<ArcaFiscalNumbering> GetLastAuthorizedAsync(
        int pointOfSale, int voucherType, CancellationToken cancellationToken);

    Task<WsfeCaeReply> SubmitCaeAsync(
        WsfeVoucherData data, int pointOfSale, long reservedNumber,
        string expectedIssuerCuit, bool expectedProduction, CancellationToken cancellationToken);

    // Cotización oficial que ARCA exige cuando el comprobante en moneda extranjera
    // se cancela en esa misma moneda (MonCotiz con CanMisMonExt = S).
    Task<ArcaExchangeRate> GetExchangeRateAsync(
        string currencyCode, string? issueDate, CancellationToken cancellationToken) =>
        Task.FromResult(new ArcaExchangeRate(false, 0m, string.Empty, "Cotización ARCA no disponible."));

    Task<ArcaFiscalVoucherObservation> GetVoucherAsync(
        int pointOfSale, int voucherType, long number, string expectedIssuerCuit,
        bool expectedProduction, CancellationToken cancellationToken);
}

public sealed record ArcaExchangeRate(bool Ok, decimal Rate, string RateDate, string Detail, bool Production = false);

public sealed record ArcaFiscalNumbering(
    bool Ok, long LastNumber, string IssuerCuit, bool Production, string Detail);

public sealed record ArcaFiscalVoucherObservation(
    bool Confirmed, long Number, string RecipientDocument, decimal Total,
    string Cae, DateTime CaeDueDate, string Detail,
    WsfeVoucherData? FiscalData = null);
