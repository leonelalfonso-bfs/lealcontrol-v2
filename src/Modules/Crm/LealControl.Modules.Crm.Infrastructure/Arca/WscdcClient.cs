using System.Globalization;
using System.Security;
using System.Text;
using System.Xml;
using System.Xml.Linq;
using LealControl.Modules.Crm.Contracts.Fiscal;
using Microsoft.Extensions.Logging;

namespace LealControl.Modules.Crm.Infrastructure.Arca;

/// <summary>
/// Web service de Constatación de Comprobantes (wscdc): ARCA confirma si un comprobante recibido existe con ese CAE,
/// emisor, tipo, punto de venta, número, fecha, importe total y receptor. Solo consulta; la empresa es la receptora.
/// </summary>
internal sealed class WscdcClient
{
    private readonly IHttpClientFactory _clients;
    private readonly ILogger<WscdcClient> _logger;

    public WscdcClient(IHttpClientFactory clients, ILogger<WscdcClient> logger)
    {
        _clients = clients;
        _logger = logger;
    }

    public async Task<ArcaVoucherCheck> VerifyAsync(string token, string sign, string companyCuit, bool production,
        ArcaReceivedVoucher v, CancellationToken cancellationToken)
    {
        var url = production
            ? "https://servicios1.afip.gov.ar/WSCDC/service.asmx"
            : "https://wswhomo.afip.gov.ar/WSCDC/service.asmx";
        var envelope = $"""
            <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://servicios1.afip.gob.ar/wscdc/">
              <soap:Body>
                <ar:ComprobanteConstatar>
                  <ar:Auth>
                    <ar:Token>{SecurityElement.Escape(token)}</ar:Token>
                    <ar:Sign>{SecurityElement.Escape(sign)}</ar:Sign>
                    <ar:Cuit>{companyCuit}</ar:Cuit>
                  </ar:Auth>
                  <ar:CmpReq>
                    <ar:CbteModo>CAE</ar:CbteModo>
                    <ar:CuitEmisor>{v.IssuerCuit}</ar:CuitEmisor>
                    <ar:PtoVta>{v.PointOfSale}</ar:PtoVta>
                    <ar:CbteTipo>{v.VoucherType}</ar:CbteTipo>
                    <ar:CbteNro>{v.Number}</ar:CbteNro>
                    <ar:CbteFch>{v.IssueDate:yyyyMMdd}</ar:CbteFch>
                    <ar:ImpTotal>{v.Total.ToString("0.00", CultureInfo.InvariantCulture)}</ar:ImpTotal>
                    <ar:CodAutorizacion>{SecurityElement.Escape(v.Cae)}</ar:CodAutorizacion>
                    <ar:DocTipoReceptor>80</ar:DocTipoReceptor>
                    <ar:DocNroReceptor>{companyCuit}</ar:DocNroReceptor>
                  </ar:CmpReq>
                </ar:ComprobanteConstatar>
              </soap:Body>
            </soap:Envelope>
            """;
        try
        {
            var client = _clients.CreateClient("arca");
            using var request = new HttpRequestMessage(HttpMethod.Post, url);
            request.Content = new StringContent(envelope, Encoding.UTF8, "text/xml");
            request.Headers.TryAddWithoutValidation("SOAPAction", "http://servicios1.afip.gob.ar/wscdc/ComprobanteConstatar");
            using var response = await client.SendAsync(request, cancellationToken);
            return WscdcResponseParser.Parse(await response.Content.ReadAsStringAsync(cancellationToken));
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !cancellationToken.IsCancellationRequested)
        {
            _logger.LogWarning(ex, "Fallo ComprobanteConstatar");
            return new(ArcaVoucherCheckOutcome.Unavailable, "No se pudo consultar a ARCA. Probá de nuevo más tarde.");
        }
    }
}

public static class WscdcResponseParser
{
    /// <summary>Resultado A (aprobado) o R (rechazado), con observaciones; los errores de la consulta no dicen nada del comprobante.</summary>
    public static ArcaVoucherCheck Parse(string body)
    {
        if (string.IsNullOrEmpty(body) || body.Length > 200_000)
            return Unavailable("ARCA devolvió una respuesta vacía.");
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
            return Unavailable("ARCA devolvió una respuesta ilegible.");
        }
        var nodes = doc.Descendants().ToList();
        var fault = nodes.FirstOrDefault(x => x.Name.LocalName == "faultstring")?.Value?.Trim();
        if (fault is not null)
            return Unavailable($"ARCA (wscdc): {Short(fault)}");
        string Messages(string container) => string.Join(" · ", nodes.Where(x => x.Name.LocalName == container)
            .SelectMany(x => x.Elements())
            .Select(e => $"{e.Elements().FirstOrDefault(c => c.Name.LocalName == "Code")?.Value?.Trim()} {e.Elements().FirstOrDefault(c => c.Name.LocalName == "Msg")?.Value?.Trim()}".Trim())
            .Where(m => m.Length > 0));
        var result = nodes.FirstOrDefault(x => x.Name.LocalName == "Resultado")?.Value?.Trim();
        var observations = Messages("Observaciones");
        if (result == "A")
            return new(ArcaVoucherCheckOutcome.Approved, observations.Length > 0 ? $"Constatado por ARCA. {Short(observations)}" : "Constatado por ARCA.");
        if (result == "R")
            return new(ArcaVoucherCheckOutcome.Rejected, observations.Length > 0 ? Short(observations) : "ARCA no reconoce el comprobante con esos datos.");
        var errors = Messages("Errors");
        return Unavailable(errors.Length > 0 ? $"ARCA (wscdc): {Short(errors)}" : "ARCA no informó el resultado de la constatación.");
    }

    private static string Short(string text) => text.Length <= 400 ? text : text[..400];
    private static ArcaVoucherCheck Unavailable(string detail) => new(ArcaVoucherCheckOutcome.Unavailable, detail);
}
