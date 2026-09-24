using LealControl.BuildingBlocks.Results;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Application.Abstractions;
using LealControl.Modules.Crm.Application.Customers;
using LealControl.Modules.Crm.Application.Settings;
using LealControl.Modules.Crm.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace LealControl.Modules.Crm.Infrastructure.Arca;

internal sealed class ArcaIntegrationService : IArcaIntegration
{
    private readonly CrmDbContext _db;
    private readonly ITenantContext _tenant;
    private readonly ArcaWsaaClient _wsaa;
    private readonly ArcaPadronClient _padron;
    private readonly ArcaWsfeClient _wsfe;
    private readonly ILogger<ArcaIntegrationService> _logger;

    public ArcaIntegrationService(
        CrmDbContext db,
        ITenantContext tenant,
        ArcaWsaaClient wsaa,
        ArcaPadronClient padron,
        ArcaWsfeClient wsfe,
        ILogger<ArcaIntegrationService> logger)
    {
        _db = db;
        _tenant = tenant;
        _wsaa = wsaa;
        _padron = padron;
        _wsfe = wsfe;
        _logger = logger;
    }

    public async Task<ArcaDiagnosticsDto> DiagnoseAsync(CancellationToken cancellationToken = default)
    {
        var checks = new List<ArcaCheckDto>();
        var settings = await _db.CompanySettings.AsNoTracking()
            .FirstOrDefaultAsync(x => x.TenantId == _tenant.TenantId, cancellationToken);

        var production = IsProduction(settings?.ArcaEnvironment);
        var envLabel = production ? "Produccion" : "Homologacion";
        var signerCuit = Digits(settings?.ArcaSignerCuit);
        if (signerCuit.Length != 11) signerCuit = Digits(settings?.DocumentNumber);

        var hasCrt = !string.IsNullOrWhiteSpace(settings?.ArcaCertificateCrt);
        var hasKey = !string.IsNullOrWhiteSpace(settings?.ArcaCertificateKey);
        checks.Add(Check("cert.crt", "Certificado (.crt) cargado", hasCrt,
            hasCrt ? "Presente en la configuración de la empresa" : "Subí el .crt emitido por ARCA en Configuración."));
        checks.Add(Check("cert.key", "Clave privada (.key) cargada", hasKey,
            hasKey ? "Presente en la configuración de la empresa" : "Generá el CSR desde el ERP o cargá el .key del certificado."));

        string? subject = null;
        string? thumbprint = null;
        DateTime? notBefore = null;
        DateTime? notAfter = null;
        var readyInvoice = false;
        var readyLookup = false;

        if (!hasCrt || !hasKey)
        {
            return Build(readyInvoice, readyLookup, envLabel, signerCuit, subject, thumbprint, notBefore, notAfter, checks);
        }

        if (!ArcaCertificateLoader.TryLoad(settings!.ArcaCertificateCrt, settings.ArcaCertificateKey, out var cert, out var loadError)
            || cert is null)
        {
            checks.Add(Check("cert.parse", "Certificado y clave válidos", false, loadError ?? "PEM inválido."));
            return Build(readyInvoice, readyLookup, envLabel, signerCuit, subject, thumbprint, notBefore, notAfter, checks);
        }

        using (cert)
        {
            subject = cert.Subject;
            thumbprint = cert.Thumbprint;
            notBefore = cert.NotBefore.ToUniversalTime();
            notAfter = cert.NotAfter.ToUniversalTime();
            var notExpired = DateTime.UtcNow <= notAfter.Value;

            checks.Add(Check("cert.parse", "Certificado y clave válidos", true, subject));
            checks.Add(Check("cert.expiry", "Certificado vigente", notExpired,
                notExpired ? $"Vence {notAfter:yyyy-MM-dd}" : $"Venció {notAfter:yyyy-MM-dd}. Renová en ARCA."));

            var signerOk = signerCuit.Length == 11;
            checks.Add(Check("cert.cuit", "CUIT firmante configurado", signerOk,
                signerOk ? signerCuit : "Completá el CUIT del firmante (11 dígitos)."));
            checks.Add(Check("cert.env", "Ambiente ARCA", true, production ? "Producción" : "Homologación / testing"));

            if (!notExpired || !signerOk)
            {
                return Build(readyInvoice, readyLookup, envLabel, signerCuit, subject, thumbprint, notBefore, notAfter, checks);
            }

            var crtPem = settings.ArcaCertificateCrt!;
            var keyPem = settings.ArcaCertificateKey!;

            var wsfe = await _wsaa.LoginAsync(cert, crtPem, keyPem, "wsfe", production, cancellationToken);
            checks.Add(Check("wsaa.wsfe", "WSAA → Facturación (wsfe)", wsfe.Ok, wsfe.Detail));
            readyInvoice = wsfe.Ok;

            var padron = await _wsaa.LoginAsync(cert, crtPem, keyPem, "ws_sr_constancia_inscripcion", production, cancellationToken);
            checks.Add(Check("wsaa.padron", "WSAA → Constancia de inscripción", padron.Ok, padron.Detail));
            readyLookup = padron.Ok;

            return Build(readyInvoice, readyLookup, envLabel, signerCuit, subject, thumbprint, notBefore, notAfter, checks);
        }
    }

    public async Task<Result<ArcaCuitLookupResult>> LookupCuitAsync(
        string cuit,
        CancellationToken cancellationToken = default)
    {
        var cleanCuit = Digits(cuit);
        if (cleanCuit.Length != 11)
        {
            return Result<ArcaCuitLookupResult>.Failure(
                Error.Validation("Crm.Arca.InvalidCuit", "El CUIT debe contener 11 dígitos numéricos."));
        }

        var settings = await _db.CompanySettings.AsNoTracking()
            .FirstOrDefaultAsync(x => x.TenantId == _tenant.TenantId, cancellationToken);

        string? loadError = null;
        if (settings is null
            || !ArcaCertificateLoader.TryLoad(settings.ArcaCertificateCrt, settings.ArcaCertificateKey, out var cert, out loadError)
            || cert is null)
        {
            return Result<ArcaCuitLookupResult>.Failure(
                Error.Validation(
                    "Crm.Arca.CertMissing",
                    (loadError
                     ?? "Cargá el certificado ARCA en Configuración para consultar el padrón.")
                    + " Mientras tanto podés completar razón social a mano."));
        }

        using (cert)
        {
            var production = IsProduction(settings.ArcaEnvironment);
            var signer = Digits(settings.ArcaSignerCuit);
            if (signer.Length != 11) signer = Digits(settings.DocumentNumber);
            if (signer.Length != 11)
            {
                return Result<ArcaCuitLookupResult>.Failure(
                    Error.Validation("Crm.Arca.SignerCuit", "Configurá el CUIT firmante ARCA (11 dígitos)."));
            }

            var login = await _wsaa.LoginAsync(
                cert,
                settings.ArcaCertificateCrt!,
                settings.ArcaCertificateKey!,
                "ws_sr_constancia_inscripcion",
                production,
                cancellationToken);
            if (!login.Ok || login.Token is null || login.Sign is null)
            {
                _logger.LogWarning("Constancia de inscripción no autorizada: {Detail}", login.Detail);
                return Result<ArcaCuitLookupResult>.Failure(
                    Error.Failure(
                        "Crm.Arca.PadronUnauthorized",
                        "El certificado está cargado, pero ARCA no autorizó la consulta de CUIT "
                        + "(ws_sr_constancia_inscripcion). En Administrador de Relaciones asociá el certificado a "
                        + "«Constancia de Inscripción». El padrón Alcance 5 (ws_sr_padron_a5) está deprecado. "
                        + "Detalle: " + login.Detail));
            }

            return await _padron.GetPersonaAsync(
                login.Token,
                login.Sign,
                signer,
                cleanCuit,
                production,
                cancellationToken);
        }
    }

    public async Task<Result<ArcaSalesPointsDto>> ListSalesPointsAsync(CancellationToken cancellationToken = default)
    {
        var settings = await _db.CompanySettings.AsNoTracking()
            .FirstOrDefaultAsync(x => x.TenantId == _tenant.TenantId, cancellationToken);
        if (settings is null
            || string.IsNullOrWhiteSpace(settings.ArcaCertificateCrt)
            || string.IsNullOrWhiteSpace(settings.ArcaCertificateKey))
        {
            return Result<ArcaSalesPointsDto>.Failure(Error.Validation(
                "Crm.Arca.Certificate",
                "Cargá el certificado de ARCA para detectar el punto de venta."));
        }

        if (!ArcaCertificateLoader.TryLoad(settings.ArcaCertificateCrt, settings.ArcaCertificateKey, out var cert, out var loadError)
            || cert is null)
        {
            return Result<ArcaSalesPointsDto>.Failure(Error.Validation(
                "Crm.Arca.Certificate",
                loadError ?? "El certificado de ARCA no se pudo leer."));
        }

        using (cert)
        {
            var signer = Digits(settings.ArcaSignerCuit);
            if (signer.Length != 11) signer = Digits(settings.DocumentNumber);
            if (signer.Length != 11)
            {
                return Result<ArcaSalesPointsDto>.Failure(Error.Validation(
                    "Crm.Arca.SignerCuit",
                    "Configurá el CUIT firmante ARCA (11 dígitos)."));
            }

            var production = IsProduction(settings.ArcaEnvironment);
            var login = await _wsaa.LoginAsync(cert, settings.ArcaCertificateCrt, settings.ArcaCertificateKey, "wsfe", production, cancellationToken);
            if (!login.Ok || login.Token is null || login.Sign is null)
            {
                return Result<ArcaSalesPointsDto>.Failure(Error.Validation("Crm.Arca.Wsfe", login.Detail));
            }

            var listed = await _wsfe.GetSalesPointsAsync(login.Token, login.Sign, signer, production, cancellationToken);
            if (!listed.Ok)
            {
                return Result<ArcaSalesPointsDto>.Failure(Error.Validation("Crm.Arca.SalesPoint", listed.Detail));
            }

            var active = listed.Points.Where(x => !x.Blocked).ToList();
            var pool = active.Count > 0 ? active : listed.Points.ToList();
            var suggested = pool.FirstOrDefault(x => IsElectronic(x.EmissionType))?.Number ?? pool[0].Number;
            return Result<ArcaSalesPointsDto>.Success(new ArcaSalesPointsDto(
                suggested,
                pool.Select(x => new ArcaSalesPointDto(x.Number, x.EmissionType, x.Blocked)).ToList()));
        }
    }

    private static bool IsElectronic(string emissionType) =>
        emissionType.Contains("CAE", StringComparison.OrdinalIgnoreCase)
        && !emissionType.Contains("CAEA", StringComparison.OrdinalIgnoreCase)
        || emissionType.Contains("WS", StringComparison.OrdinalIgnoreCase);

    private static ArcaDiagnosticsDto Build(
        bool readyInvoice,
        bool readyLookup,
        string envLabel,
        string signerCuit,
        string? subject,
        string? thumbprint,
        DateTime? notBefore,
        DateTime? notAfter,
        IReadOnlyList<ArcaCheckDto> checks) =>
        new(
            readyInvoice,
            readyLookup,
            envLabel,
            signerCuit.Length == 11 ? signerCuit : null,
            subject,
            thumbprint,
            notBefore,
            notAfter,
            checks,
            BuildSummary(readyInvoice, readyLookup, checks));

    private static ArcaCheckDto Check(string code, string label, bool ok, string detail) =>
        new(code, label, ok, detail);

    private static bool IsProduction(string? environment) =>
        string.Equals(environment, "Produccion", StringComparison.OrdinalIgnoreCase)
        || string.Equals(environment, "Producción", StringComparison.OrdinalIgnoreCase)
        || string.Equals(environment, "Production", StringComparison.OrdinalIgnoreCase);

    private static string Digits(string? value) =>
        new((value ?? string.Empty).Where(char.IsDigit).ToArray());

    private static string BuildSummary(bool invoice, bool lookup, IReadOnlyList<ArcaCheckDto> checks)
    {
        if (invoice && lookup)
            return "ARCA listo: facturación electrónica y consulta de CUIT OK.";
        if (invoice && !lookup)
            return "Certificado OK para facturar (wsfe), pero falta autorizar Constancia de Inscripción para el botón ARCA de clientes.";
        if (!invoice && lookup)
            return "Consulta CUIT OK, pero falta habilitar wsfe para facturación electrónica.";
        var firstFail = checks.FirstOrDefault(c => !c.Ok);
        return firstFail is null
            ? "ARCA incompleto."
            : $"ARCA incompleto: {firstFail.Label}. {firstFail.Detail}";
    }
}
