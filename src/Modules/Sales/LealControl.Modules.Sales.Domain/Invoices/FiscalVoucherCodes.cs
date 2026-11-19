using System.Linq;

namespace LealControl.Modules.Sales.Domain.Invoices;

/// <summary>Código ARCA (FEParamGetTiposCbte) de cada tipo de comprobante emitible por WSFE.</summary>
public static class FiscalVoucherCodes
{
    public static int? For(string invoiceType) => invoiceType switch
    {
        "A" => 1,
        "ND_A" => 2,
        "NC_A" => 3,
        "B" => 6,
        "ND_B" => 7,
        "NC_B" => 8,
        // Factura de Crédito Electrónica MiPyMEs y sus notas.
        "FCE_A" => 201,
        "ND_FCE_A" => 202,
        "NC_FCE_A" => 203,
        "FCE_B" => 206,
        "ND_FCE_B" => 207,
        "NC_FCE_B" => 208,
        _ => null
    };

    /// <summary>
    /// Código ARCA de cualquier comprobante, también los recibidos de proveedores (C y M incluidos),
    /// como se informa en el Libro IVA Digital.
    /// </summary>
    public static int? Any(string invoiceType) => For(invoiceType) ?? invoiceType switch
    {
        "C" => 11,
        "ND_C" => 12,
        "NC_C" => 13,
        "M" => 51,
        "ND_M" => 52,
        "NC_M" => 53,
        "FCE_C" => 211,
        "ND_FCE_C" => 212,
        "NC_FCE_C" => 213,
        // Recibidos sin CAE: tique factura de controlador fiscal y los exceptuados de la RG 1415
        // (bancos, seguros, servicios públicos). OC_A discrimina IVA; OC_B no.
        "TF_A" => 81,
        "TF_B" => 82,
        "OC_A" or "OC_B" => 99,
        _ => null
    };

    /// <summary>Tipo de documento ARCA del receptor o emisor: 80 CUIT, 96 DNI, 99 sin identificar.</summary>
    public static int DocumentType(string document) => document.Length switch
    {
        11 => 80,
        7 or 8 => 96,
        _ => 99
    };

    /// <summary>Tique factura u otro comprobante de la RG 1415: no tienen CAE, no se constatan en ARCA.</summary>
    public static bool IsWithoutCae(string invoiceType) =>
        invoiceType.StartsWith("TF_", StringComparison.Ordinal) || invoiceType.StartsWith("OC_", StringComparison.Ordinal);

    public static bool IsFce(string invoiceType) => invoiceType.Contains("FCE_", StringComparison.Ordinal);

    /// <summary>Tipo de la factura sin el prefijo de nota: "NC_FCE_A" → "FCE_A", "ND_B" → "B".</summary>
    public static string BaseType(string invoiceType) =>
        invoiceType.StartsWith("NC_", StringComparison.Ordinal) || invoiceType.StartsWith("ND_", StringComparison.Ordinal)
            ? invoiceType[3..] : invoiceType;

    /// <summary>Documento del receptor tal como se informa a ARCA; "0" si no se identifica.</summary>
    public static string ReceiverDocument(string? customerDocument)
    {
        var digits = new string((customerDocument ?? string.Empty).Where(char.IsDigit).ToArray());
        return digits.Length == 0 ? "0" : digits;
    }
}
