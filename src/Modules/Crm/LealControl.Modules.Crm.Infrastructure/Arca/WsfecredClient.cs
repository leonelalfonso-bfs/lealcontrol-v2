using System.Globalization;
using System.Security;
using System.Text;
using System.Xml;
using System.Xml.Linq;
using LealControl.Modules.Crm.Contracts.Fiscal;
using Microsoft.Extensions.Logging;

namespace LealControl.Modules.Crm.Infrastructure.Arca;

/// <summary>Web service de Factura de Crédito Electrónica MiPyMEs (wsfecred). Solo consultas.</summary>
internal sealed class WsfecredClient
{
    private readonly IHttpClientFactory _clients;
    private readonly ILogger<WsfecredClient> _logger;

    public WsfecredClient(IHttpClientFactory clients, ILogger<WsfecredClient> logger)
    {
        _clients = clients;
        _logger = logger;
    }

    // Si la CUIT receptora está obligada a recibir FCE en esa fecha y desde qué monto.
    public async Task<ArcaFceObligation> GetObligationAsync(string token, string sign, string issuerCuit,
        bool production, string receiverCuit, DateOnly issueDate, CancellationToken cancellationToken)
    {
        var url = production
            ? "https://serviciosjava.afip.gob.ar/wsfecred/FECredService"
            : "https://fwshomo.afip.gov.ar/wsfecred/FECredService";
        var envelope = $"""
            <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://ar.gob.afip.wsfecred/FECredService/">
              <soapenv:Header/>
              <soapenv:Body>
                <ser:consultarMontoObligadoRecepcionRequest>
                  <authRequest>
                    <token>{SecurityElement.Escape(token)}</token>
                    <sign>{SecurityElement.Escape(sign)}</sign>
                    <cuitRepresentada>{issuerCuit}</cuitRepresentada>
                  </authRequest>
                  <cuitConsultada>{receiverCuit}</cuitConsultada>
                  <fechaEmision>{issueDate:yyyy-MM-dd}</fechaEmision>
                </ser:consultarMontoObligadoRecepcionRequest>
              </soapenv:Body>
            </soapenv:Envelope>
            """;
        try
        {
            var client = _clients.CreateClient("arca");
            using var request = new HttpRequestMessage(HttpMethod.Post, url);
            request.Content = new StringContent(envelope, Encoding.UTF8, "text/xml");
            request.Headers.TryAddWithoutValidation("SOAPAction", "");
            using var response = await client.SendAsync(request, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            return WsfecredObligationParser.Parse(body);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Fallo consultarMontoObligadoRecepcion");
            return new(false, false, 0m, "No se pudo consultar a ARCA si el cliente está obligado a recibir FCE.");
        }
    }
}

public static class WsfecredObligationParser
{
    public static ArcaFceObligation Parse(string body)
    {
        if (string.IsNullOrEmpty(body) || body.Length > 200_000)
            return Fail("ARCA devolvió una respuesta vacía sobre la obligación de FCE.");
        XDocument doc;
        try
        {
            using var reader = XmlReader.Create(new StringReader(body), new XmlReaderSettings
            {
                DtdProcessing = DtdProcessing.Prohibit,
                XmlResolver = null,
                MaxCharactersInDocument = 200_000
            });
            doc = XDocument.Load(reader);
        }
        catch (XmlException)
        {
            return Fail("ARCA devolvió una respuesta ilegible sobre la obligación de FCE.");
        }
        var nodes = doc.Descendants().ToList();
        var fault = nodes.FirstOrDefault(x => x.Name.LocalName == "faultstring")?.Value?.Trim();
        if (fault is not null)
            return Fail($"ARCA (wsfecred): {Short(fault)}");
        var errors = nodes.Where(x => x.Name.LocalName is "arrayErrores" or "arrayErroresFormato")
            .SelectMany(x => x.Descendants().Where(d => d.Name.LocalName == "descripcion"))
            .Select(d => d.Value.Trim()).Where(v => v.Length > 0).ToList();
        if (errors.Count > 0)
            return Fail($"ARCA (wsfecred): {Short(string.Join(" · ", errors))}");
        var answer = nodes.FirstOrDefault(x => x.Name.LocalName == "respuesta")?.Value?.Trim();
        if (answer is not ("S" or "N"))
            return Fail("ARCA no informó si el cliente está obligado a recibir FCE.");
        var minimum = 0m;
        var rawMinimum = nodes.FirstOrDefault(x => x.Name.LocalName == "montoDesde")?.Value?.Trim();
        if (answer == "S" && !decimal.TryParse(rawMinimum, NumberStyles.AllowDecimalPoint,
                CultureInfo.InvariantCulture, out minimum))
            return Fail("ARCA informó la obligación de FCE sin el monto desde el que rige.");
        return new(true, answer == "S", minimum,
            answer == "S" ? "Obligado a recibir Factura de Crédito Electrónica." : "No obligado a recibir FCE.");
    }

    private static string Short(string text) => text.Length <= 240 ? text : text[..240];
    private static ArcaFceObligation Fail(string detail) => new(false, false, 0m, detail);
}
