using System.Globalization;
using System.Xml;
using System.Text;
using System.Xml.Linq;
using Microsoft.Extensions.Logging;
using LealControl.Modules.Crm.Contracts.Fiscal;

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

    // Consulta de solo lectura. Nunca debe usarse una falla de red como prueba de que
    // un comprobante no existe: la autorización anterior podría haber sido aceptada.
    public async Task<WsfeVoucherReply> GetVoucherAsync(
        string token, string sign, string cuit, bool production,
        int pointOfSale, int voucherType, long number, CancellationToken cancellationToken)
    {
        if (pointOfSale <= 0 || voucherType <= 0 || number <= 0)
            return WsfeVoucherReply.Failure("Punto de venta, tipo y número deben ser positivos.");

        var url = production
            ? "https://servicios1.afip.gov.ar/wsfev1/service.asmx"
            : "https://wswhomo.afip.gov.ar/wsfev1/service.asmx";
        var envelope = $"""
            <?xml version="1.0" encoding="utf-8"?>
            <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
              <soapenv:Header/>
              <soapenv:Body>
                <ar:FECompConsultar>
                  <ar:Auth>
                    <ar:Token>{System.Security.SecurityElement.Escape(token)}</ar:Token>
                    <ar:Sign>{System.Security.SecurityElement.Escape(sign)}</ar:Sign>
                    <ar:Cuit>{System.Security.SecurityElement.Escape(cuit)}</ar:Cuit>
                  </ar:Auth>
                  <ar:FeCompConsReq>
                    <ar:CbteTipo>{voucherType}</ar:CbteTipo>
                    <ar:CbteNro>{number}</ar:CbteNro>
                    <ar:PtoVta>{pointOfSale}</ar:PtoVta>
                  </ar:FeCompConsReq>
                </ar:FECompConsultar>
              </soapenv:Body>
            </soapenv:Envelope>
            """;

        try
        {
            var client = _httpClientFactory.CreateClient("arca");
            using var request = new HttpRequestMessage(HttpMethod.Post, url);
            request.Content = new StringContent(envelope, Encoding.UTF8, "text/xml");
            request.Headers.TryAddWithoutValidation("SOAPAction", "http://ar.gov.afip.dif.FEV1/FECompConsultar");
            using var response = await client.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
                return WsfeVoucherReply.Failure($"ARCA respondió HTTP {(int)response.StatusCode} al consultar el comprobante.");
            return WsfeVoucherLookupParser.Parse(
                await response.Content.ReadAsStringAsync(cancellationToken), pointOfSale, voucherType, number);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Fallo FECompConsultar");
            return WsfeVoucherReply.Failure("No se pudo confirmar el comprobante en ARCA. No reintentar la autorización automáticamente.");
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

// Un error, un resultado ausente o una respuesta incompleta quedan sin confirmar.
// El emisor no debe inferir que puede reusar ese número a partir de este estado.
public sealed record WsfeVoucherReply(
    bool Confirmed, long Number, string RecipientDocument, decimal Total,
    string Cae, DateTime CaeDueDate, string Detail,
    WsfeVoucherFiscalData? FiscalData = null)
{
    public static WsfeVoucherReply Failure(string detail) =>
        new(false, 0, string.Empty, 0m, string.Empty, default, detail);
}

public static class WsfeVoucherLookupParser
{
    public static WsfeVoucherReply Parse(string body, int expectedPoint, int expectedType, long expectedNumber)
    {
        if (string.IsNullOrEmpty(body) || body.Length > 1_000_000)
            return WsfeVoucherReply.Failure("ARCA devolvió una respuesta vacía o demasiado extensa.");
        XDocument doc;
        try
        {
            using var reader = XmlReader.Create(new StringReader(body), new XmlReaderSettings
            {
                DtdProcessing = DtdProcessing.Prohibit,
                XmlResolver = null,
                MaxCharactersInDocument = 1_000_000
            });
            doc = XDocument.Load(reader);
        }
        catch (XmlException)
        {
            return WsfeVoucherReply.Failure("ARCA devolvió una respuesta XML inválida.");
        }

        if (doc.Descendants().Any(x => x.Name.LocalName == "Fault"))
            return WsfeVoucherReply.Failure("ARCA rechazó la consulta del comprobante.");
        var results = doc.Descendants().Where(x => x.Name.LocalName == "FECompConsultarResult").ToList();
        if (results.Count != 1 || results[0].Descendants().Any(x => x.Name.LocalName == "Err"))
            return WsfeVoucherReply.Failure("ARCA no confirmó el comprobante consultado.");
        var vouchers = results[0].Elements().Where(x => x.Name.LocalName == "ResultGet").ToList();
        if (vouchers.Count != 1)
            return WsfeVoucherReply.Failure("ARCA no devolvió un comprobante único.");
        var voucher = vouchers[0];
        static string? Field(XElement node, string name) =>
            node.Elements().FirstOrDefault(x => x.Name.LocalName == name)?.Value?.Trim();
        const NumberStyles moneyStyle = NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint;
        bool Money(string field, out decimal amount) => decimal.TryParse(
            Field(voucher, field), moneyStyle, CultureInfo.InvariantCulture, out amount);
        bool Date(string field, out DateTime value) => DateTime.TryParseExact(
            Field(voucher, field), "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out value);

        var recipient = Field(voucher, "DocNro") ?? string.Empty;
        var cae = Field(voucher, "CodAutorizacion") ?? string.Empty;
        var issue = Field(voucher, "CbteFch") ?? string.Empty;
        var fromService = Field(voucher, "FchServDesde") ?? string.Empty;
        var toService = Field(voucher, "FchServHasta") ?? string.Empty;
        var payment = Field(voucher, "FchVtoPago") ?? string.Empty;
        var currency = Field(voucher, "MonId") ?? string.Empty;
        var vatEntries = voucher.Elements().Where(x => x.Name.LocalName == "Iva")
            .SelectMany(x => x.Elements().Where(y => y.Name.LocalName == "AlicIva")).ToList();
        if (!int.TryParse(Field(voucher, "PtoVta"), NumberStyles.None, CultureInfo.InvariantCulture, out var point)
            || !int.TryParse(Field(voucher, "CbteTipo"), NumberStyles.None, CultureInfo.InvariantCulture, out var type)
            || !long.TryParse(Field(voucher, "CbteDesde"), NumberStyles.None, CultureInfo.InvariantCulture, out var first)
            || !long.TryParse(Field(voucher, "CbteHasta"), NumberStyles.None, CultureInfo.InvariantCulture, out var last)
            || !int.TryParse(Field(voucher, "Concepto"), NumberStyles.None, CultureInfo.InvariantCulture, out var concept)
            || !int.TryParse(Field(voucher, "DocTipo"), NumberStyles.None, CultureInfo.InvariantCulture, out var docType)
            || !int.TryParse(Field(voucher, "CondicionIVAReceptorId"), NumberStyles.None, CultureInfo.InvariantCulture, out var receiverVat)
            || !Money("ImpTotal", out var total) || !Money("ImpNeto", out var net)
            || !decimal.TryParse(Field(voucher, "ImpIVA") ?? Field(voucher, "ImpIva"),
                moneyStyle, CultureInfo.InvariantCulture, out var vat)
            || !Money("ImpTotConc", out var nonTaxed) || !Money("ImpOpEx", out var exempt)
            || !Money("ImpTrib", out var otherTaxes) || !Money("MonCotiz", out var exchange)
            || !Date("CbteFch", out var issueDate) || !Date("FchServDesde", out var serviceFrom)
            || !Date("FchServHasta", out var serviceTo) || !Date("FchVtoPago", out var paymentDue)
            || !Date("FchVto", out var caeDue)
            || vatEntries.Count != 1
            || !int.TryParse(Field(vatEntries[0], "Id"), NumberStyles.None, CultureInfo.InvariantCulture, out var vatCode)
            || !decimal.TryParse(Field(vatEntries[0], "BaseImp"), moneyStyle, CultureInfo.InvariantCulture, out var vatBase)
            || !decimal.TryParse(Field(vatEntries[0], "Importe"), moneyStyle, CultureInfo.InvariantCulture, out var vatValue)
            || point != expectedPoint || type != expectedType || first != expectedNumber || last != expectedNumber
            || type != 1 || concept != 2 || docType != 80 || receiverVat != 1 || vatCode != 5
            || recipient.Length != 11 || !recipient.All(char.IsDigit)
            || total <= 0 || net <= 0 || vat <= 0 || total != net + vat
            || vatBase != net || vatValue != vat || nonTaxed != 0 || exempt != 0 || otherTaxes != 0
            || currency != "PES" || exchange != 1m || serviceTo < serviceFrom || paymentDue < issueDate
            || voucher.Descendants().Any(x => x.Name.LocalName is "Tributo" or "CbteAsoc" or "Opcional" or "Comprador")
            || cae.Length != 14 || !cae.All(char.IsDigit)
            || Field(voucher, "Resultado") != "A" || Field(voucher, "EmisionTipo") != "CAE")
            return WsfeVoucherReply.Failure("ARCA devolvió datos incompletos o distintos al perfil fiscal solicitado.");

        var fields = new WsfeVoucherFiscalData(recipient, docType, receiverVat, type, concept,
            issue, fromService, toService, payment, net, vat, total, vatCode, currency, exchange);
        return new(true, expectedNumber, recipient, total, cae,
            DateTime.SpecifyKind(caeDue, DateTimeKind.Utc),
            "Comprobante y CAE confirmados en ARCA; cotejar todos los campos con el borrador.", fields);
    }
}
