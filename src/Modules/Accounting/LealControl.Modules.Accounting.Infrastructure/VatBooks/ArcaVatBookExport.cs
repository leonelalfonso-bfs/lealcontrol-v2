using System.Globalization;
using System.IO.Compression;
using System.Text;
using LealControl.Modules.Accounting.Contracts.VatBooks;

namespace LealControl.Modules.Accounting.Infrastructure.VatBooks;

/// <summary>
/// Archivos de importación del Libro IVA Digital de ARCA (RG 4597, el mismo diseño del Régimen de
/// Información de Compras y Ventas): registros de ancho fijo, uno por comprobante y uno por alícuota.
/// Números alineados a la derecha con ceros; textos a la izquierda con espacios; importes con dos
/// decimales sin separador.
/// </summary>
public static class ArcaVatBookExport
{
    public const int SalesVoucherLength = 266;
    public const int SalesRateLength = 62;
    public const int PurchaseVoucherLength = 325;
    public const int PurchaseRateLength = 84;

    /// <summary>Código de alícuota de ARCA: 3 = 0 %, 4 = 10,5 %, 5 = 21 %, 6 = 27 %, 8 = 5 %, 9 = 2,5 %.</summary>
    public static int RateCode(decimal rate) => rate switch
    {
        0m => 3,
        10.5m => 4,
        21m => 5,
        27m => 6,
        5m => 8,
        2.5m => 9,
        _ => throw new ArgumentOutOfRangeException(nameof(rate), $"La alícuota {rate} % no existe en ARCA.")
    };

    /// <summary>Lo que impide exportar un comprobante (sin código de comprobante, alícuota inexistente, etc.).</summary>
    public static IEnumerable<string> Problems(VatBookVoucher v, bool purchase)
    {
        if (v.VoucherType == 0)
            yield return $"{v.VoucherLabel} ({v.CounterpartyName}): tipo de comprobante sin código ARCA.";
        foreach (var r in v.Rates.Where(r => r.Rate is not (10.5m or 21m or 27m or 5m or 2.5m)))
            yield return $"{v.VoucherLabel} ({v.CounterpartyName}): la alícuota {r.Rate} % no existe en ARCA.";
        if (v.CurrencyCode is not ("PES" or "DOL" or "060"))
            yield return $"{v.VoucherLabel} ({v.CounterpartyName}): moneda {v.CurrencyCode} sin código ARCA.";
        if (v.ExchangeRate >= 10_000m)
            yield return $"{v.VoucherLabel} ({v.CounterpartyName}): la cotización {v.ExchangeRate} no entra en el formato de ARCA (hasta 9999,999999).";
        if (purchase && v.DiscriminatesVat && v.CounterpartyDocumentType != 80)
            yield return $"{v.VoucherLabel} ({v.CounterpartyName}): el proveedor de un comprobante A o M necesita CUIT.";
    }

    public static string SalesVoucher(VatBookVoucher v) => Record(SalesVoucherLength,
        Date(v.Date), Num(v.VoucherType, 3), Num(v.PointOfSale, 5), Num(v.Number, 20), Num(v.Number, 20),
        Num(v.CounterpartyDocumentType, 2), Num(v.CounterpartyDocument, 20), Text(v.CounterpartyName, 30),
        Amount(v.Total),
        Amount(0m),            // conceptos que no integran el neto gravado
        Amount(0m),            // percepción a no categorizados
        Amount(v.Exempt),
        Amount(v.PerceptionVat), // percepciones o pagos a cuenta de impuestos nacionales
        Amount(v.PerceptionIibb),
        Amount(0m),            // percepciones municipales
        Amount(0m),            // impuestos internos
        Text(v.CurrencyCode, 3), Rate(v.ExchangeRate),
        Num(RateCount(v, purchase: false), 1), OperationCode(v),
        Amount(v.OtherTaxes),
        v.PaymentDueDate is { } due ? Date(due) : new string('0', 8));

    public static IEnumerable<string> SalesRates(VatBookVoucher v) => RatesOf(v).Select(r => Record(SalesRateLength,
        Num(v.VoucherType, 3), Num(v.PointOfSale, 5), Num(v.Number, 20),
        Amount(r.Net), Num(RateCode(r.Rate), 4), Amount(r.Vat)));

    public static string PurchaseVoucher(VatBookVoucher v) => Record(PurchaseVoucherLength,
        Date(v.Date), Num(v.VoucherType, 3), Num(v.PointOfSale, 5), Num(v.Number, 20),
        new string(' ', 16),   // despacho de importación
        Num(v.CounterpartyDocumentType, 2), Num(v.CounterpartyDocument, 20), Text(v.CounterpartyName, 30),
        Amount(v.Total),
        Amount(0m),            // conceptos que no integran el neto gravado
        Amount(v.Exempt),
        Amount(v.PerceptionVat),
        Amount(0m),            // percepciones de otros impuestos nacionales
        Amount(v.PerceptionIibb),
        Amount(0m),            // percepciones municipales
        Amount(0m),            // impuestos internos
        Text(v.CurrencyCode, 3), Rate(v.ExchangeRate),
        Num(RateCount(v, purchase: true), 1), OperationCode(v),
        Amount(v.DiscriminatesVat ? v.Rates.Sum(r => r.Vat) : 0m), // crédito fiscal computable
        Amount(v.OtherTaxes),
        new string('0', 11), new string(' ', 30), Amount(0m)); // emisor/corredor e IVA comisión

    /// <summary>Compras B y C no llevan registro de alícuotas: no discriminan IVA.</summary>
    public static IEnumerable<string> PurchaseRates(VatBookVoucher v) => !v.DiscriminatesVat ? [] : RatesOf(v).Select(r => Record(PurchaseRateLength,
        Num(v.VoucherType, 3), Num(v.PointOfSale, 5), Num(v.Number, 20),
        Num(v.CounterpartyDocumentType, 2), Num(v.CounterpartyDocument, 20),
        Amount(r.Net), Num(RateCode(r.Rate), 4), Amount(r.Vat)));

    /// <summary>Los cuatro archivos del período en un .zip, listos para importar en el Libro IVA Digital.</summary>
    public static byte[] Zip(int year, int month, IReadOnlyList<VatBookVoucher> sales, IReadOnlyList<VatBookVoucher> purchases)
    {
        var period = $"{year:D4}{month:D2}";
        using var buffer = new MemoryStream();
        using (var zip = new ZipArchive(buffer, ZipArchiveMode.Create, leaveOpen: true))
        {
            Add(zip, $"LIBRO_IVA_DIGITAL_VENTAS_CBTE_{period}.txt", sales.Select(SalesVoucher));
            Add(zip, $"LIBRO_IVA_DIGITAL_VENTAS_ALICUOTAS_{period}.txt", sales.SelectMany(SalesRates));
            Add(zip, $"LIBRO_IVA_DIGITAL_COMPRAS_CBTE_{period}.txt", purchases.Select(PurchaseVoucher));
            Add(zip, $"LIBRO_IVA_DIGITAL_COMPRAS_ALICUOTAS_{period}.txt", purchases.SelectMany(PurchaseRates));
        }
        return buffer.ToArray();
    }

    private static void Add(ZipArchive zip, string name, IEnumerable<string> lines)
    {
        using var writer = new StreamWriter(zip.CreateEntry(name).Open(), Encoding.ASCII);
        foreach (var line in lines)
            writer.Write(line + "\r\n");
    }

    /// <summary>
    /// Un comprobante sin IVA (todo exento) igual lleva un registro de alícuota 0 %: ARCA pide al menos uno.
    /// </summary>
    private static IReadOnlyList<VatBookRate> RatesOf(VatBookVoucher v) =>
        v.Rates.Count > 0 ? v.Rates : [new VatBookRate(0m, 0m, 0m)];

    private static int RateCount(VatBookVoucher v, bool purchase) => purchase && !v.DiscriminatesVat ? 0 : RatesOf(v).Count;

    /// <summary>"E" si todo es exento; "0" (no corresponde) en el resto.</summary>
    private static string OperationCode(VatBookVoucher v) => v.Rates.Count == 0 && v.Exempt > 0m ? "E" : "0";

    private static string Record(int length, params string[] fields)
    {
        var line = string.Concat(fields);
        if (line.Length != length)
            throw new InvalidOperationException($"Registro de {line.Length} posiciones; el diseño de ARCA pide {length}.");
        return line;
    }

    private static string Date(DateTime date) => date.ToString("yyyyMMdd", CultureInfo.InvariantCulture);

    private static string Num(long value, int width) => value.ToString(CultureInfo.InvariantCulture).PadLeft(width, '0')[^width..];

    private static string Num(string digits, int width)
    {
        var clean = new string(digits.Where(char.IsDigit).ToArray());
        return clean.PadLeft(width, '0')[^width..];
    }

    /// <summary>Texto en ASCII (sin acentos ni eñes), en mayúsculas, recortado o completado con espacios.</summary>
    private static string Text(string value, int width)
    {
        var plain = new string((value ?? string.Empty).Normalize(NormalizationForm.FormD)
            .Where(c => CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
            .Select(c => c is >= ' ' and <= '~' ? c : ' ').ToArray()).ToUpperInvariant();
        return plain.Length >= width ? plain[..width] : plain.PadRight(width);
    }

    /// <summary>13 enteros y 2 decimales, sin coma; negativo con el signo en la primera posición.</summary>
    private static string Amount(decimal value)
    {
        var cents = (long)Math.Round(Math.Abs(value) * 100m, MidpointRounding.AwayFromZero);
        return value < 0m ? "-" + Num(cents, 14) : Num(cents, 15);
    }

    /// <summary>Tipo de cambio: 4 enteros y 6 decimales.</summary>
    private static string Rate(decimal value) =>
        Num((long)Math.Round(value * 1_000_000m, MidpointRounding.AwayFromZero), 10);
}
