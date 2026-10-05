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

    public ArcaFiscalGateway(CrmDbContext db, ITenantContext tenant,
        ArcaWsaaClient wsaa, ArcaWsfeClient wsfe, WsfeCaeTransport cae)
    {
        _db = db;
        _tenant = tenant;
        _wsaa = wsaa;
        _wsfe = wsfe;
        _cae = cae;
    }

    public async Task<ArcaFiscalNumbering> GetLastAuthorizedAsync(
        int pointOfSale, int voucherType, CancellationToken cancellationToken)
    {
        if (pointOfSale is < 1 or > 99998 || voucherType != 1)
            return new(false, 0, string.Empty, false, "Punto de venta o tipo fiscal no admitido.");
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
        IWsfeInvoiceAServiceData data, int pointOfSale, long reservedNumber,
        string expectedIssuerCuit, bool expectedProduction, CancellationToken cancellationToken)
    {
        var auth = await AuthenticateAsync(expectedIssuerCuit, expectedProduction, cancellationToken);
        if (!auth.Ok)
            return Unknown("No se pudo autenticar la reserva fiscal; consultar antes de cualquier reintento.");
        return await _cae.SubmitAsync(auth.Token!, auth.Sign!, auth.IssuerCuit,
            auth.Production, data, pointOfSale, reservedNumber, cancellationToken);
    }

    public async Task<ArcaFiscalVoucherObservation> GetVoucherAsync(
        int pointOfSale, int voucherType, long number, string expectedIssuerCuit,
        bool expectedProduction, CancellationToken cancellationToken)
    {
        if (pointOfSale is < 1 or > 99998 || voucherType != 1 || number is < 1 or > 99_999_999)
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

    private async Task<Auth> AuthenticateAsync(
        string? expectedIssuerCuit, bool? expectedProduction, CancellationToken cancellationToken)
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
                settings.ArcaCertificateKey!, "wsfe", production, cancellationToken);
            return login.Ok && login.Token is not null && login.Sign is not null
                ? new(true, issuer, production, login.Token, login.Sign, string.Empty)
                : Auth.Fail("ARCA no autorizó el acceso a WSFE.");
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
