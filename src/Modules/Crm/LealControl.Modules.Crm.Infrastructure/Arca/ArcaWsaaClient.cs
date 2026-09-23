using System.Diagnostics;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Xml.Linq;
using Microsoft.Extensions.Logging;

namespace LealControl.Modules.Crm.Infrastructure.Arca;

internal sealed class ArcaWsaaClient
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<ArcaWsaaClient> _logger;

    public ArcaWsaaClient(IHttpClientFactory httpClientFactory, ILogger<ArcaWsaaClient> logger)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public async Task<(bool Ok, string? Token, string? Sign, string Detail)> LoginAsync(
        X509Certificate2 certificate,
        string certificatePem,
        string privateKeyPem,
        string service,
        bool production,
        CancellationToken cancellationToken)
    {
        try
        {
            var cms = await BuildSignedLoginCmsWithOpenSslAsync(certificatePem, privateKeyPem, service, cancellationToken);
            var url = production
                ? "https://wsaa.afip.gov.ar/ws/services/LoginCms"
                : "https://wsaahomo.afip.gov.ar/ws/services/LoginCms";

            var envelope = $"""
                <?xml version="1.0" encoding="utf-8"?>
                <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
                  <soapenv:Header/>
                  <soapenv:Body>
                    <wsaa:loginCms>
                      <wsaa:in0>{System.Security.SecurityElement.Escape(cms)}</wsaa:in0>
                    </wsaa:loginCms>
                  </soapenv:Body>
                </soapenv:Envelope>
                """;

            var client = _httpClientFactory.CreateClient("arca");
            using var request = new HttpRequestMessage(HttpMethod.Post, url);
            request.Content = new StringContent(envelope, Encoding.UTF8, "text/xml");
            request.Headers.TryAddWithoutValidation("SOAPAction", "");

            using var response = await client.SendAsync(request, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                return (false, null, null, ExplainWsaaFault(service, body, (int)response.StatusCode));
            }

            if (body.Contains("faultstring", StringComparison.OrdinalIgnoreCase)
                || body.Contains("Fault>", StringComparison.Ordinal))
            {
                return (false, null, null, ExplainWsaaFault(service, body, null));
            }

            var taXml = ExtractXmlText(body, "loginCmsReturn");
            if (string.IsNullOrWhiteSpace(taXml))
            {
                return (false, null, null, $"WSAA no devolvió ticket para '{service}'.");
            }

            taXml = System.Net.WebUtility.HtmlDecode(taXml);
            var token = ExtractXmlText(taXml, "token");
            var sign = ExtractXmlText(taXml, "sign");
            if (string.IsNullOrWhiteSpace(token) || string.IsNullOrWhiteSpace(sign))
            {
                return (false, null, null, $"Ticket WSAA incompleto para '{service}'.");
            }

            // certificate usado solo para forzar carga válida previa
            _ = certificate.Thumbprint;

            return (true, token, sign, $"Ticket WSAA OK para '{service}'.");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Fallo login WSAA service={Service}", service);
            return (false, null, null, $"Error de red/WSAA ({service}): {ex.Message}");
        }
    }

    private static async Task<string> BuildSignedLoginCmsWithOpenSslAsync(
        string certificatePem,
        string privateKeyPem,
        string service,
        CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.Now;
        var uniqueId = now.ToUnixTimeSeconds().ToString();
        var generation = now.AddMinutes(-5).ToString("yyyy-MM-ddTHH:mm:sszzz");
        var expiration = now.AddMinutes(10).ToString("yyyy-MM-ddTHH:mm:sszzz");

        var loginXml = $"""
            <?xml version="1.0" encoding="UTF-8"?>
            <loginTicketRequest version="1.0">
              <header>
                <uniqueId>{uniqueId}</uniqueId>
                <generationTime>{generation}</generationTime>
                <expirationTime>{expiration}</expirationTime>
              </header>
              <service>{service}</service>
            </loginTicketRequest>
            """;

        var workDir = Path.Combine(Path.GetTempPath(), "leal-arca-" + Guid.NewGuid().ToString("N"));
        System.IO.Directory.CreateDirectory(workDir);
        try
        {
            var loginPath = Path.Combine(workDir, "login.xml");
            var crtPath = Path.Combine(workDir, "cert.crt");
            var keyPath = Path.Combine(workDir, "cert.key");
            var cmsPath = Path.Combine(workDir, "login.cms");

            await File.WriteAllTextAsync(loginPath, loginXml, cancellationToken);
            await File.WriteAllTextAsync(crtPath, certificatePem, cancellationToken);
            await File.WriteAllTextAsync(keyPath, privateKeyPem, cancellationToken);

            // Misma receta que el manual AFIP/ARCA (CMS detached firmado).
            var psi = new ProcessStartInfo
            {
                FileName = "openssl",
                ArgumentList =
                {
                    "cms", "-sign", "-in", loginPath, "-signer", crtPath, "-inkey", keyPath,
                    "-nodetach", "-outform", "DER", "-out", cmsPath
                },
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false
            };

            using var process = Process.Start(psi)
                ?? throw new InvalidOperationException("No se pudo iniciar openssl.");
            var stderr = await process.StandardError.ReadToEndAsync(cancellationToken);
            await process.WaitForExitAsync(cancellationToken);
            if (process.ExitCode != 0 || !File.Exists(cmsPath))
            {
                throw new InvalidOperationException(
                    "openssl cms -sign falló: " + (string.IsNullOrWhiteSpace(stderr) ? $"exit {process.ExitCode}" : stderr.Trim()));
            }

            var der = await File.ReadAllBytesAsync(cmsPath, cancellationToken);
            return Convert.ToBase64String(der);
        }
        finally
        {
            try { System.IO.Directory.Delete(workDir, recursive: true); } catch { /* ignore */ }
        }
    }

    private static string ExplainWsaaFault(string service, string body, int? httpStatus)
    {
        var fault = ExtractXmlText(body, "faultstring") ?? string.Empty;
        var code = ExtractXmlText(body, "faultcode") ?? string.Empty;
        var blob = (code + " " + fault + " " + body).ToLowerInvariant();

        if (blob.Contains("cms.cert.untrusted", StringComparison.Ordinal)
            || fault.Contains("no emitido por AC de confianza", StringComparison.OrdinalIgnoreCase))
        {
            return $"WSAA rechazó '{service}': certificado no emitido por la AC de confianza de este ambiente. "
                + "Si el .crt salió del Administrador de Certificados (producción), en Configuración poné Ambiente = Producción. "
                + "Si querés Homologación, el .crt debe salir de WSASS (testing), no del portal de producción.";
        }

        if (blob.Contains("coe.notauthorized", StringComparison.Ordinal)
            || fault.Contains("no autorizado a acceder", StringComparison.OrdinalIgnoreCase))
        {
            return $"WSAA rechazó '{service}': el certificado no tiene esa relación en ARCA. "
                + "Para consultar un CUIT hace falta «Constancia de Inscripción» (ws_sr_constancia_inscripcion), no el padrón Alcance 5. "
                + "Para facturar, «Facturación Electrónica» (wsfe).";
        }

        if (blob.Contains("alreadyauthenticated", StringComparison.Ordinal)
            || fault.Contains("ya posee un tat vigente", StringComparison.OrdinalIgnoreCase))
        {
            return $"WSAA '{service}': ya hay un ticket vigente (reintentá en ~1 minuto).";
        }

        if (!string.IsNullOrWhiteSpace(fault))
        {
            return httpStatus is null
                ? $"WSAA rechazó '{service}': {fault}"
                : $"WSAA HTTP {httpStatus} para '{service}': {fault}";
        }

        return httpStatus is null
            ? $"WSAA rechazó '{service}': {Trim(body)}"
            : $"WSAA HTTP {httpStatus} para '{service}': {Trim(body)}";
    }

    private static string? ExtractXmlText(string xml, string localName)
    {
        try
        {
            var doc = XDocument.Parse(xml);
            var node = doc.Descendants().FirstOrDefault(e => e.Name.LocalName == localName);
            return node?.Value;
        }
        catch
        {
            var token = $"<{localName}>";
            var start = xml.IndexOf(token, StringComparison.OrdinalIgnoreCase);
            if (start < 0) return null;
            var gt = xml.IndexOf('>', start);
            if (gt < 0) return null;
            var end = xml.IndexOf($"</{localName}>", gt, StringComparison.OrdinalIgnoreCase);
            if (end < 0) return null;
            return xml[(gt + 1)..end];
        }
    }

    private static string Trim(string value) =>
        value.Length <= 400 ? value : value[..400] + "…";
}
