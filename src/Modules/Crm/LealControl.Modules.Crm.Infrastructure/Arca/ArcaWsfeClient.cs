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

    // Solo lectura: cotización oficial de ARCA (BNA) para una moneda y, opcionalmente, una fecha.
    public async Task<ArcaExchangeRate> GetExchangeRateAsync(
        string token, string sign, string cuit, bool production,
        string currencyCode, string? date, CancellationToken cancellationToken)
    {
        var url = production
            ? "https://servicios1.afip.gov.ar/wsfev1/service.asmx"
            : "https://wswhomo.afip.gov.ar/wsfev1/service.asmx";
        var dateNode = date is null ? "" : $"<ar:FchCotiz>{date}</ar:FchCotiz>";
        var envelope = $"""
            <?xml version="1.0" encoding="utf-8"?>
            <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
              <soapenv:Header/>
              <soapenv:Body>
                <ar:FEParamGetCotizacion>
                  <ar:Auth>
                    <ar:Token>{System.Security.SecurityElement.Escape(token)}</ar:Token>
                    <ar:Sign>{System.Security.SecurityElement.Escape(sign)}</ar:Sign>
                    <ar:Cuit>{System.Security.SecurityElement.Escape(cuit)}</ar:Cuit>
                  </ar:Auth>
                  <ar:MonId>{System.Security.SecurityElement.Escape(currencyCode)}</ar:MonId>
                  {dateNode}
                </ar:FEParamGetCotizacion>
              </soapenv:Body>
            </soapenv:Envelope>
            """;
        try
        {
            var client = _httpClientFactory.CreateClient("arca");
            using var request = new HttpRequestMessage(HttpMethod.Post, url);
            request.Content = new StringContent(envelope, Encoding.UTF8, "text/xml");
            request.Headers.TryAddWithoutValidation("SOAPAction", "http://ar.gov.afip.dif.FEV1/FEParamGetCotizacion");
            using var response = await client.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
                return new(false, 0m, string.Empty, $"ARCA respondió HTTP {(int)response.StatusCode} al consultar la cotización.");
            return WsfeExchangeRateParser.Parse(await response.Content.ReadAsStringAsync(cancellationToken), currencyCode);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Fallo FEParamGetCotizacion");
            return new(false, 0m, string.Empty, "No se pudo consultar la cotización en ARCA.");
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
    WsfeVoucherData? FiscalData = null)
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
        static List<XElement> Items(XElement node, string group, string item) =>
            node.Elements().Where(x => x.Name.LocalName == group)
                .SelectMany(x => x.Elements().Where(y => y.Name.LocalName == item)).ToList();
        const NumberStyles moneyStyle = NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint;
        static bool Money(XElement node, string field, out decimal amount)
        {
            var ok = decimal.TryParse(Field(node, field), moneyStyle, CultureInfo.InvariantCulture, out amount);
            amount = ok ? decimal.Round(amount, 2) : 0m;
            return ok;
        }
        static bool Int(XElement node, string field, out int value) =>
            int.TryParse(Field(node, field), NumberStyles.None, CultureInfo.InvariantCulture, out value);
        static bool Long(XElement node, string field, out long value) =>
            long.TryParse(Field(node, field), NumberStyles.None, CultureInfo.InvariantCulture, out value);
        static string? OptionalDate(XElement node, string field)
        {
            var value = Field(node, field);
            return string.IsNullOrEmpty(value) || value == "NULL" ? null : value;
        }
        bool ValidDate(string? value, out DateTime date) => DateTime.TryParseExact(
            value, "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out date);

        var cae = Field(voucher, "CodAutorizacion") ?? string.Empty;
        var issue = Field(voucher, "CbteFch") ?? string.Empty;
        var currency = Field(voucher, "MonId") ?? string.Empty;
        if (!Int(voucher, "PtoVta", out var point) || !Int(voucher, "CbteTipo", out var type)
            || !Long(voucher, "CbteDesde", out var first) || !Long(voucher, "CbteHasta", out var last)
            || !Int(voucher, "Concepto", out var concept) || !Int(voucher, "DocTipo", out var docType)
            || !Long(voucher, "DocNro", out var docNumber)
            || !Int(voucher, "CondicionIVAReceptorId", out var receiverVat)
            || !Money(voucher, "ImpTotal", out var total) || !Money(voucher, "ImpNeto", out var net)
            || !(Money(voucher, "ImpIVA", out var vat) || Money(voucher, "ImpIva", out vat))
            || !Money(voucher, "ImpTotConc", out var nonTaxed) || !Money(voucher, "ImpOpEx", out var exempt)
            || !Money(voucher, "ImpTrib", out var otherTaxes)
            || !decimal.TryParse(Field(voucher, "MonCotiz"), moneyStyle, CultureInfo.InvariantCulture, out var exchange)
            || !ValidDate(issue, out _) || !ValidDate(Field(voucher, "FchVto"), out var caeDue)
            || point != expectedPoint || type != expectedType || first != expectedNumber || last != expectedNumber
            || cae.Length != 14 || !cae.All(char.IsDigit)
            || Field(voucher, "Resultado") != "A" || Field(voucher, "EmisionTipo") != "CAE"
            // Nunca se envían tributos ni compradores: si aparecen, no es nuestro pedido.
            || Items(voucher, "Tributos", "Tributo").Count > 0
            || Items(voucher, "Compradores", "Comprador").Count > 0)
            return WsfeVoucherReply.Failure("ARCA devolvió datos incompletos o distintos al comprobante solicitado.");

        var vatLines = new List<WsfeVatLine>();
        foreach (var line in Items(voucher, "Iva", "AlicIva"))
        {
            if (!Int(line, "Id", out var id) || !Money(line, "BaseImp", out var vatBase)
                || !Money(line, "Importe", out var vatValue))
                return WsfeVoucherReply.Failure("ARCA devolvió alícuotas de IVA incompletas.");
            vatLines.Add(new WsfeVatLine(id, vatBase, vatValue));
        }
        var associated = new List<WsfeAssociatedVoucher>();
        foreach (var asoc in Items(voucher, "CbtesAsoc", "CbteAsoc"))
        {
            if (!Int(asoc, "Tipo", out var asocType) || !Int(asoc, "PtoVta", out var asocPoint)
                || !Long(asoc, "Nro", out var asocNumber))
                return WsfeVoucherReply.Failure("ARCA devolvió comprobantes asociados incompletos.");
            // FECompConsultar no devuelve CUIT ni fecha del asociado; solo se cotejan tipo, punto y número.
            associated.Add(new WsfeAssociatedVoucher(asocType, asocPoint, asocNumber, string.Empty, string.Empty));
        }
        var optionals = new List<WsfeOptional>();
        foreach (var opt in Items(voucher, "Opcionales", "Opcional"))
        {
            var id = Field(opt, "Id");
            if (string.IsNullOrEmpty(id))
                return WsfeVoucherReply.Failure("ARCA devolvió datos opcionales incompletos.");
            optionals.Add(new WsfeOptional(id, Field(opt, "Valor") ?? string.Empty));
        }
        var sameCurrency = Field(voucher, "CanMisMonExt") switch { "S" => true, "N" => (bool?)false, _ => null };

        var fields = new WsfeVoucherData(type, concept, docType,
            docNumber.ToString(CultureInfo.InvariantCulture), receiverVat, issue,
            OptionalDate(voucher, "FchServDesde"), OptionalDate(voucher, "FchServHasta"),
            OptionalDate(voucher, "FchVtoPago"), net, nonTaxed, exempt, vat, otherTaxes, total,
            vatLines, currency, exchange, sameCurrency, associated, optionals.Count == 0 ? null : optionals);
        return new(true, expectedNumber, fields.ReceiverDocumentNumber, total, cae,
            DateTime.SpecifyKind(caeDue, DateTimeKind.Utc),
            "Comprobante y CAE confirmados en ARCA; cotejar todos los campos con el borrador.", fields);
    }
}

public static class WsfeExchangeRateParser
{
    public static ArcaExchangeRate Parse(string body, string expectedCurrency)
    {
        if (string.IsNullOrEmpty(body) || body.Length > 200_000)
            return Fail("ARCA devolvió una cotización vacía.");
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
            return Fail("ARCA devolvió una cotización ilegible.");
        }
        var result = doc.Descendants().FirstOrDefault(x => x.Name.LocalName == "FEParamGetCotizacionResult");
        var get = result?.Elements().FirstOrDefault(x => x.Name.LocalName == "ResultGet");
        string? Value(string name) => get?.Elements().FirstOrDefault(x => x.Name.LocalName == name)?.Value?.Trim();
        if (result is null || get is null ||
            result.Descendants().Any(x => x.Name.LocalName == "Err") ||
            Value("MonId") != expectedCurrency ||
            !decimal.TryParse(Value("MonCotiz"), NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var rate) ||
            rate <= 0m)
            return Fail("ARCA no informó la cotización solicitada.");
        return new(true, decimal.Round(rate, 6), Value("FchCotiz") ?? string.Empty, "Cotización oficial de ARCA.");
    }

    private static ArcaExchangeRate Fail(string detail) => new(false, 0m, string.Empty, detail);
}
