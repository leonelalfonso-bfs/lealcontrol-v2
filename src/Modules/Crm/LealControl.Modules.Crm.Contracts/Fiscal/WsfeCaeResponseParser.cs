using System.Globalization;
using System.Xml;
using System.Xml.Linq;

namespace LealControl.Modules.Crm.Contracts.Fiscal;

public enum WsfeCaeOutcome
{
    Unknown,
    Rejected,
    ApprovedPendingConsultation
}

public sealed record WsfeCaeReply(
    WsfeCaeOutcome Outcome, string? Cae, DateTime? CaeDueDate, string Detail);

/// <summary>
/// Examina una sola respuesta de FECAESolicitar. No decide si corresponde volver a
/// solicitar: ante incertidumbre el siguiente paso es FECompConsultar, nunca reenvío.
/// </summary>
public static class WsfeCaeResponseParser
{
    public static WsfeCaeReply Parse(
        string xml, int expectedPoint, int expectedType, long expectedNumber,
        int expectedConcept, int expectedDocumentType, string expectedDocument, string expectedDate)
    {
        if (string.IsNullOrEmpty(xml) || xml.Length > 1_000_000)
            return Unknown("Respuesta de ARCA vacía o demasiado extensa.");

        XDocument doc;
        try
        {
            using var reader = XmlReader.Create(new StringReader(xml), new XmlReaderSettings
            {
                DtdProcessing = DtdProcessing.Prohibit,
                XmlResolver = null,
                MaxCharactersInDocument = 1_000_000
            });
            doc = XDocument.Load(reader);
        }
        catch (XmlException)
        {
            return Unknown("La respuesta XML de ARCA no se pudo analizar.");
        }

        if (doc.Descendants().Any(x => x.Name.LocalName == "Fault"))
            return Unknown("ARCA devolvió un fallo SOAP; consultar el comprobante antes de reintentar.");

        var results = doc.Descendants().Where(x => x.Name.LocalName == "FECAESolicitarResult").ToList();
        if (results.Count != 1) return Unknown("ARCA no devolvió un resultado único de solicitud.");
        var result = results[0];
        var header = Child(result, "FeCabResp");
        if (header is null ||
            !EqualsNumber(header, "PtoVta", expectedPoint) ||
            !EqualsNumber(header, "CbteTipo", expectedType) ||
            !EqualsNumber(header, "CantReg", 1))
            return Unknown("La cabecera de ARCA no corresponde al comprobante reservado.");

        var details = result.Descendants().Where(x => x.Name.LocalName == "FECAEDetResponse").ToList();
        var headerResult = Value(header, "Resultado");
        if (details.Count == 0 && headerResult == "R" && HasErrors(result))
            return new(WsfeCaeOutcome.Rejected, null, null, "ARCA rechazó la solicitud: " + Messages(result));
        if (details.Count != 1) return Unknown("ARCA no devolvió un detalle único.");

        var detail = details[0];
        if (!EqualsNumber(detail, "CbteDesde", expectedNumber) ||
            !EqualsNumber(detail, "CbteHasta", expectedNumber) ||
            !EqualsNumber(detail, "DocTipo", expectedDocumentType) ||
            !EqualsNumber(detail, "Concepto", expectedConcept) ||
            !EqualsNumber(detail, "DocNro", long.Parse(expectedDocument, CultureInfo.InvariantCulture)) ||
            Value(detail, "CbteFch") != expectedDate)
            return Unknown("El detalle de ARCA no corresponde al comprobante reservado.");

        var detailResult = Value(detail, "Resultado");
        if (headerResult == "R" && detailResult == "R" && string.IsNullOrWhiteSpace(Value(detail, "CAE")))
            return new(WsfeCaeOutcome.Rejected, null, null, "ARCA rechazó el comprobante: " + Messages(result));
        if (headerResult != "A" || detailResult != "A" || HasErrors(result))
            return Unknown("Resultado ARCA mixto o contradictorio; consultar el comprobante.");

        var cae = Value(detail, "CAE");
        if (cae is null || cae.Length != 14 || !cae.All(char.IsDigit) ||
            !DateTime.TryParseExact(Value(detail, "CAEFchVto"), "yyyyMMdd",
                CultureInfo.InvariantCulture, DateTimeStyles.None, out var expiry))
            return Unknown("ARCA aprobó, pero CAE o vencimiento son inválidos; consultar el comprobante.");

        return new(WsfeCaeOutcome.ApprovedPendingConsultation, cae,
            DateTime.SpecifyKind(expiry, DateTimeKind.Utc),
            "CAE recibido; verificar el comprobante mediante FECompConsultar antes de marcarlo autorizado.");
    }

    // "[10184] mensaje · [10154] mensaje": errores de la solicitud y observaciones del comprobante.
    private static string Messages(XElement result)
    {
        var items = result.Descendants()
            .Where(x => x.Name.LocalName is "Err" or "Obs")
            .Select(x => $"[{Child(x, "Code")?.Value?.Trim()}] {Child(x, "Msg")?.Value?.Trim()}")
            .Distinct()
            .ToList();
        var text = items.Count == 0 ? "sin detalle" : string.Join(" · ", items);
        return text.Length <= 900 ? text : text[..900];
    }

    private static bool HasErrors(XElement result) =>
        Child(result, "Errors")?.Descendants().Any(x => x.Name.LocalName == "Err") == true;

    private static XElement? Child(XElement node, string name) =>
        node.Elements().FirstOrDefault(x => x.Name.LocalName == name);

    private static string? Value(XElement node, string name) => Child(node, name)?.Value?.Trim();

    private static bool EqualsNumber(XElement node, string name, long expected) =>
        long.TryParse(Value(node, name), NumberStyles.None, CultureInfo.InvariantCulture,
            out var actual) && actual == expected;

    private static WsfeCaeReply Unknown(string detail) =>
        new(WsfeCaeOutcome.Unknown, null, null, detail);
}
