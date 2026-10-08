using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Contracts.Fiscal;
using LealControl.Modules.Crm.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Crm.Infrastructure.Arca;

internal sealed class ArcaFiscalGateway : IArcaFiscalGateway
{
    private readonly CrmDbContext _db;
    private readonly ITenantContext _tenant;
    private readonly ArcaWsaaClient _wsaa;
    private readonly ArcaWsfeClient _wsfe;
    private readonly WsfeCaeTransport _cae;
    private readonly WsfecredClient _wsfecred;

    public ArcaFiscalGateway(CrmDbContext db, ITenantContext tenant,
        ArcaWsaaClient wsaa, ArcaWsfeClient wsfe, WsfeCaeTransport cae, WsfecredClient wsfecred)
    {
        _db = db;
        _tenant = tenant;
        _wsaa = wsaa;
        _wsfe = wsfe;
        _cae = cae;
        _wsfecred = wsfecred;
    }

    public async Task<ArcaFiscalNumbering> GetLastAuthorizedAsync(
        int pointOfSale, int voucherType, CancellationToken cancellationToken)
    {
        if (pointOfSale is < 1 or > 99998 || !WsfeCaeRequestBuilder.SupportedVoucherTypes.Contains(voucherType))
            return new(false, 0, string.Empty, false, "Punto de venta o tipo fiscal no admitido.");
        var configured = await _db.CompanySettings.AsNoTracking()
            .Where(x => x.TenantId == _tenant.TenantId).Select(x => x.ArcaPointOfSale)
            .FirstOrDefaultAsync(cancellationToken);
        if (configured is not null && configured != pointOfSale)
            return new(false, 0, string.Empty, false,
                $"Este sistema emite solo por el punto de venta {configured} (Configuración). El comprobante usa el {pointOfSale}.");
        var auth = await AuthenticateAsync(null, null, cancellationToken);
        if (!auth.Ok)
            return new(false, 0, string.Empty, false, auth.Detail);
        var result = await _wsfe.GetLastAuthorizedAsync(auth.Token!, auth.Sign!,
            auth.IssuerCuit, auth.Production, pointOfSale, voucherType, cancellationToken);
        if (!result.Ok || result.LastNumber < 0 || result.LastNumber >= 99_999_999)
            return new(false, 0, string.Empty, auth.Production,
                "No se pudo verificar la numeración fiscal oficial.");
        return new(true, result.LastNumber, auth.IssuerCuit, auth.Production,
            "Numeración oficial consultada.");
    }

    public async Task<WsfeCaeReply> SubmitCaeAsync(
        WsfeVoucherData data, int pointOfSale, long reservedNumber,
        string expectedIssuerCuit, bool expectedProduction, CancellationToken cancellationToken)
    {
        var auth = await AuthenticateAsync(expectedIssuerCuit, expectedProduction, cancellationToken);
        if (!auth.Ok)
            return Unknown("No se pudo autenticar la reserva fiscal; consultar antes de cualquier reintento.");
        return await _cae.SubmitAsync(auth.Token!, auth.Sign!, auth.IssuerCuit,
            auth.Production, data, pointOfSale, reservedNumber, cancellationToken);
    }

    public async Task<ArcaExchangeRate> GetExchangeRateAsync(
        string currencyCode, string? issueDate, CancellationToken cancellationToken)
    {
        if (currencyCode != "DOL" || (issueDate is not null &&
            (issueDate.Length != 8 || !issueDate.All(char.IsDigit))))
            return new(false, 0m, string.Empty, "Moneda o fecha inválida para cotizar.");
        var auth = await AuthenticateAsync(null, null, cancellationToken);
        if (!auth.Ok)
            return new(false, 0m, string.Empty, auth.Detail);
        var rate = await _wsfe.GetExchangeRateAsync(auth.Token!, auth.Sign!, auth.IssuerCuit,
            auth.Production, currencyCode, issueDate, cancellationToken);
        return rate with { Production = auth.Production };
    }

    public async Task<ArcaFiscalVoucherObservation> GetVoucherAsync(
        int pointOfSale, int voucherType, long number, string expectedIssuerCuit,
        bool expectedProduction, CancellationToken cancellationToken)
    {
        if (pointOfSale is < 1 or > 99998 || !WsfeCaeRequestBuilder.SupportedVoucherTypes.Contains(voucherType)
            || number is < 1 or > 99_999_999)
            return Unconfirmed("Número fiscal inválido para consulta.");
        var auth = await AuthenticateAsync(expectedIssuerCuit, expectedProduction, cancellationToken);
        if (!auth.Ok)
            return Unconfirmed("No se pudo autenticar la consulta del comprobante.");
        var result = await _wsfe.GetVoucherAsync(auth.Token!, auth.Sign!, auth.IssuerCuit,
            auth.Production, pointOfSale, voucherType, number, cancellationToken);
        return result.Confirmed
            ? new(true, result.Number, result.RecipientDocument, result.Total,
                result.Cae, result.CaeDueDate, result.Detail, result.FiscalData)
            : Unconfirmed(result.Detail);
    }

    public async Task<ArcaFceObligation> GetFceObligationAsync(
        string receiverCuit, DateOnly issueDate, CancellationToken cancellationToken)
    {
        if (receiverCuit.Length != 11 || !receiverCuit.All(char.IsDigit))
            return new(false, false, 0m, "CUIT del cliente inválido para consultar FCE.");
        var auth = await AuthenticateAsync(null, null, cancellationToken, "wsfecred");
        if (!auth.Ok)
            return new(false, false, 0m, auth.Detail);
        return await _wsfecred.GetObligationAsync(auth.Token!, auth.Sign!, auth.IssuerCuit,
            auth.Production, receiverCuit, issueDate, cancellationToken);
    }

    private async Task<Auth> AuthenticateAsync(
        string? expectedIssuerCuit, bool? expectedProduction, CancellationToken cancellationToken,
        string service = "wsfe")
    {
        var settings = await _db.CompanySettings.AsNoTracking()
            .FirstOrDefaultAsync(x => x.TenantId == _tenant.TenantId, cancellationToken);
        if (settings is null)
            return Auth.Fail("Falta configuración fiscal de la empresa.");
        var issuer = new string((settings.DocumentNumber ?? string.Empty)
            .Where(ch => ch is >= '0' and <= '9').ToArray());
        if (issuer.Length != 11 ||
            (expectedIssuerCuit is not null && issuer != expectedIssuerCuit))
            return Auth.Fail("Cambió el CUIT emisor o falta configurarlo.");
        var environment = settings.ArcaEnvironment?.Trim();
        var production = environment is "Produccion" or "Producción" or "Production";
        var testing = environment is "Homologacion" or "Homologación" or "Testing";
        if ((!production && !testing) ||
            (expectedProduction.HasValue && expectedProduction.Value != production))
            return Auth.Fail("Cambió el ambiente fiscal o falta configurarlo.");
        if (!ArcaCertificateLoader.TryLoad(settings.ArcaCertificateCrt,
                settings.ArcaCertificateKey, out var certificate, out _) || certificate is null)
            return Auth.Fail("Falta un certificado ARCA válido.");
        using (certificate)
        {
            var login = await _wsaa.LoginAsync(certificate, settings.ArcaCertificateCrt!,
                settings.ArcaCertificateKey!, service, production, cancellationToken);
            return login.Ok && login.Token is not null && login.Sign is not null
                ? new(true, issuer, production, login.Token, login.Sign, string.Empty)
                : Auth.Fail(service == "wsfe" ? "ARCA no autorizó el acceso a WSFE."
                    : $"ARCA no autorizó el acceso a {service}: revisá que el certificado tenga ese servicio habilitado.");
        }
    }

    private static WsfeCaeReply Unknown(string detail) =>
        new(WsfeCaeOutcome.Unknown, null, null, detail);
    private static ArcaFiscalVoucherObservation Unconfirmed(string detail) =>
        new(false, 0, string.Empty, 0m, string.Empty, default, detail);

    private sealed record Auth(
        bool Ok, string IssuerCuit, bool Production, string? Token, string? Sign, string Detail)
    {
        public static Auth Fail(string detail) =>
            new(false, string.Empty, false, null, null, detail);
    }
}
