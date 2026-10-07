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
