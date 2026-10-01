using System.Globalization;
using System.Xml;
using System.Text;
using System.Xml.Linq;
using Microsoft.Extensions.Logging;

namespace LealControl.Modules.Crm.Infrastructure.Arca;

internal sealed class ArcaWsfeClient
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<ArcaWsfeClient> _logger;

    public ArcaWsfeClient(IHttpClientFactory httpClientFactory, ILogger<ArcaWsfeClient> logger)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public async Task<(bool Ok, IReadOnlyList<WsfeSalesPoint> Points, string Detail)> GetSalesPointsAsync(
        string token,
        string sign,
        string cuit,
        bool production,
        CancellationToken cancellationToken)
    {
        var url = production
            ? "https://servicios1.afip.gov.ar/wsfev1/service.asmx"
            : "https://wswhomo.afip.gov.ar/wsfev1/service.asmx";

        var envelope = $"""
            <?xml version="1.0" encoding="utf-8"?>
            <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
              <soapenv:Header/>
              <soapenv:Body>
                <ar:FEParamGetPtosVenta>
                  <ar:Auth>
                    <ar:Token>{System.Security.SecurityElement.Escape(token)}</ar:Token>
                    <ar:Sign>{System.Security.SecurityElement.Escape(sign)}</ar:Sign>
                    <ar:Cuit>{cuit}</ar:Cuit>
                  </ar:Auth>
                </ar:FEParamGetPtosVenta>
              </soapenv:Body>
            </soapenv:Envelope>
            """;

        try
        {
            var client = _httpClientFactory.CreateClient("arca");
            using var request = new HttpRequestMessage(HttpMethod.Post, url);
            request.Content = new StringContent(envelope, Encoding.UTF8, "text/xml");
            request.Headers.TryAddWithoutValidation("SOAPAction", "http://ar.gov.afip.dif.FEV1/FEParamGetPtosVenta");

            using var response = await client.SendAsync(request, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return (false, [], $"ARCA respondió HTTP {(int)response.StatusCode} al consultar puntos de venta.");
            }

            var doc = XDocument.Parse(body);
            var fault = doc.Descendants().FirstOrDefault(x => x.Name.LocalName == "faultstring")?.Value;
            if (!string.IsNullOrWhiteSpace(fault))
            {
                return (false, [], fault.Trim());
            }

            var error = doc.Descendants()
                .Where(x => x.Name.LocalName is "Err" or "Obs")
                .Select(x => x.Descendants().FirstOrDefault(d => d.Name.LocalName == "Msg")?.Value)
                .FirstOrDefault(x => !string.IsNullOrWhiteSpace(x));
            if (!string.IsNullOrWhiteSpace(error) && !doc.Descendants().Any(x => x.Name.LocalName == "PtoVenta"))
            {
                return (false, [], error.Trim());
            }

            var points = doc.Descendants()
                .Where(x => x.Name.LocalName == "PtoVenta")
                .Select(ParsePoint)
                .Where(x => x.Number > 0)
                .OrderBy(x => x.Number)
                .ToList();

            if (points.Count == 0)
            {
                return (false, [], "ARCA no devolvió puntos de venta para este CUIT.");
            }

            return (true, points, "Puntos de venta consultados en ARCA.");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Fallo FEParamGetPtosVenta");
            return (false, [], $"No se pudo consultar el punto de venta en ARCA: {ex.Message}");
        }
    }

    public async Task<WsfeLastAuthorizedReply> GetLastAuthorizedAsync(
        string token, string sign, string cuit, bool production,
        int pointOfSale, int voucherType, CancellationToken cancellationToken)
    {
        var url = production
            ? "https://servicios1.afip.gov.ar/wsfev1/service.asmx"
            : "https://wswhomo.afip.gov.ar/wsfev1/service.asmx";
        var envelope = $"""
            <?xml version="1.0" encoding="utf-8"?>
            <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
              <soapenv:Header/>
              <soapenv:Body>
                <ar:FECompUltimoAutorizado>
                  <ar:Auth>
                    <ar:Token>{System.Security.SecurityElement.Escape(token)}</ar:Token>
                    <ar:Sign>{System.Security.SecurityElement.Escape(sign)}</ar:Sign>
                    <ar:Cuit>{System.Security.SecurityElement.Escape(cuit)}</ar:Cuit>
                  </ar:Auth>
                  <ar:PtoVta>{pointOfSale}</ar:PtoVta>
                  <ar:CbteTipo>{voucherType}</ar:CbteTipo>
                </ar:FECompUltimoAutorizado>
              </soapenv:Body>
            </soapenv:Envelope>
            """;
        try
        {
            var client = _httpClientFactory.CreateClient("arca");
            using var request = new HttpRequestMessage(HttpMethod.Post, url);
            request.Content = new StringContent(envelope, Encoding.UTF8, "text/xml");
            request.Headers.TryAddWithoutValidation("SOAPAction", "http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado");
            using var response = await client.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
                return new(false, 0, $"ARCA respondió HTTP {(int)response.StatusCode} al consultar la numeración.");
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            return WsfeLastAuthorizedParser.Parse(body, pointOfSale, voucherType);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Fallo FECompUltimoAutorizado");
            return new(false, 0, "No se pudo consultar la numeración en ARCA. Reintentá la consulta.");
        }
    }

    private static WsfeSalesPoint ParsePoint(XElement node)
    {
        var number = int.TryParse(Child(node, "Nro"), NumberStyles.Integer, CultureInfo.InvariantCulture, out var nro) ? nro : 0;
        var emission = Child(node, "EmisionTipo") ?? "";
        var blocked = string.Equals(Child(node, "Bloqueado"), "S", StringComparison.OrdinalIgnoreCase);
        var baja = Child(node, "FchBaja");
        var closed = !string.IsNullOrWhiteSpace(baja) && !string.Equals(baja, "NULL", StringComparison.OrdinalIgnoreCase);
        return new WsfeSalesPoint(number, emission, blocked || closed);
    }

    private static string? Child(XElement node, string name) =>
        node.Elements().FirstOrDefault(x => x.Name.LocalName == name)?.Value?.Trim();
}

internal sealed record WsfeSalesPoint(int Number, string EmissionType, bool Blocked);

public sealed record WsfeLastAuthorizedReply(bool Ok, long LastNumber, string Detail);

public static class WsfeLastAuthorizedParser
{
    public static WsfeLastAuthorizedReply Parse(string body, int expectedPoint, int expectedType)
    {
        XDocument doc;
        try
        {
            using var reader = XmlReader.Create(new StringReader(body), new XmlReaderSettings
            {
                DtdProcessing = DtdProcessing.Prohibit,
                XmlResolver = null
            });
            doc = XDocument.Load(reader);
        }
        catch (XmlException)
        {
            return new(false, 0, "ARCA devolvió una respuesta XML inválida.");
        }

        var fault = doc.Descendants().FirstOrDefault(x => x.Name.LocalName is "faultstring" or "Text")?.Value;
        if (!string.IsNullOrWhiteSpace(fault))
            return new(false, 0, "ARCA rechazó la consulta: " + Short(fault));

        var result = doc.Descendants().FirstOrDefault(x => x.Name.LocalName == "FECompUltimoAutorizadoResult");
        if (result is null)
            return new(false, 0, "ARCA no devolvió el resultado de numeración esperado.");

        var error = result.Descendants().FirstOrDefault(x => x.Name.LocalName == "Err");
        if (error is not null)
            return new(false, 0, "ARCA rechazó la consulta: " + Short(Value(error, "Msg") ?? "error sin descripción"));

        if (!int.TryParse(Value(result, "PtoVta"), NumberStyles.Integer, CultureInfo.InvariantCulture, out var point)
            || !int.TryParse(Value(result, "CbteTipo"), NumberStyles.Integer, CultureInfo.InvariantCulture, out var type)
            || !long.TryParse(Value(result, "CbteNro"), NumberStyles.Integer, CultureInfo.InvariantCulture, out var number)
            || point != expectedPoint || type != expectedType || number < 0)
            return new(false, 0, "ARCA devolvió una numeración incompleta o de otro punto de venta/tipo.");

        return new(true, number, "Último número autorizado consultado en ARCA.");
    }

    private static string? Value(XElement node, string name) =>
        node.Elements().FirstOrDefault(x => x.Name.LocalName == name)?.Value?.Trim();

    private static string Short(string value) => value.Trim().Length <= 250 ? value.Trim() : value.Trim()[..250];
}
