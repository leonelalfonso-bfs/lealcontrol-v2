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
        _ => null
    };

    /// <summary>Documento del receptor tal como se informa a ARCA; "0" si no se identifica.</summary>
    public static string ReceiverDocument(string? customerDocument)
    {
        var digits = new string((customerDocument ?? string.Empty).Where(char.IsDigit).ToArray());
        return digits.Length == 0 ? "0" : digits;
    }
}
