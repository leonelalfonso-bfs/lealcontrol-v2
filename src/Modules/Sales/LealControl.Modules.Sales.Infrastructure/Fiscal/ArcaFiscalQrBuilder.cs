using System.Globalization;
using System.Text;
using System.Text.Json;
using LealControl.Modules.Crm.Contracts.Fiscal;

namespace LealControl.Modules.Sales.Infrastructure.Fiscal;

/// <summary>Genera el enlace QR de ARCA a partir de un CAE ya confirmado.</summary>
public static class ArcaFiscalQrBuilder
{
    public static string Build(
        IWsfeInvoiceAServiceData data, string issuerCuit, int pointOfSale,
        long officialNumber, string cae)
    {
        ArgumentNullException.ThrowIfNull(data);
        if (issuerCuit.Length != 11 || !issuerCuit.All(ch => ch is >= '0' and <= '9') ||
            data.ReceiverCuit.Length != 11 || !data.ReceiverCuit.All(ch => ch is >= '0' and <= '9') ||
            cae.Length != 14 || !cae.All(ch => ch is >= '0' and <= '9') ||
            pointOfSale is < 1 or > 99998 || officialNumber is < 1 or > 99999999 ||
            data.VoucherType != 1 || data.ReceiverDocumentType != 80 ||
            data.CurrencyCode != "PES" || data.ExchangeRate != 1m ||
            data.TotalAmount <= 0m || decimal.Round(data.TotalAmount, 2) != data.TotalAmount ||
            !DateTime.TryParseExact(data.IssueDate, "yyyyMMdd", CultureInfo.InvariantCulture,
                DateTimeStyles.None, out var issued))
            throw new ArgumentException("Los datos confirmados no permiten generar un QR fiscal válido.");

        var payload = new
        {
            ver = 1,
            fecha = issued.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            cuit = long.Parse(issuerCuit, CultureInfo.InvariantCulture),
            ptoVta = pointOfSale,
            tipoCmp = data.VoucherType,
            nroCmp = officialNumber,
            importe = data.TotalAmount,
            moneda = data.CurrencyCode,
            ctz = data.ExchangeRate,
            tipoDocRec = data.ReceiverDocumentType,
            nroDocRec = long.Parse(data.ReceiverCuit, CultureInfo.InvariantCulture),
            tipoCodAut = "E",
            codAut = long.Parse(cae, CultureInfo.InvariantCulture)
        };
        var encoded = Convert.ToBase64String(
            Encoding.UTF8.GetBytes(JsonSerializer.Serialize(payload)));
        return "https://www.arca.gob.ar/fe/qr/?p=" + Uri.EscapeDataString(encoded);
    }
}
