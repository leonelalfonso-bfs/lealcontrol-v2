using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using ExcelDataReader;

namespace LealControl.Modules.Finance.Infrastructure;

/// <summary>
/// Extractos tal como se bajan del home banking (nota 69, F1): el banco se reconoce por el encabezado y cada renglón
/// guarda, además del importe, la contraparte (CUIT y nombre) y el código de operación del banco, que después usan la
/// conciliación y la clasificación. Si el archivo no es de un banco conocido, se usa el importador genérico (perfiles).
/// </summary>
internal static partial class BankStatementFormats
{
    public sealed record Result(string Bank, List<BankImportRow> Rows);

    [GeneratedRegex(@"\b(20|23|24|27|30|33|34)\d{9}\b")]
    private static partial Regex CuitRegex();

    private static readonly CultureInfo Ar = CultureInfo.GetCultureInfo("es-AR");

    static BankStatementFormats() => Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);

    /// <summary>Texto de un CSV: UTF-8 si tiene BOM o es UTF-8 válido; si no, Windows-1252 (lo que bajan los bancos).</summary>
    public static string DecodeText(byte[] bytes)
    {
        if (bytes.Length >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF) return Encoding.UTF8.GetString(bytes, 3, bytes.Length - 3);
        try
        {
            return new UTF8Encoding(false, true).GetString(bytes);
        }
        catch (DecoderFallbackException)
        {
            return Encoding.GetEncoding(1252).GetString(bytes);
        }
    }

    public static Result? TryParse(byte[] bytes, string? fileName)
    {
        if (IsOleExcel(bytes) || (fileName ?? "").EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase))
            return TryParseExcel(bytes);
        var text = DecodeText(bytes);
        var lines = text.Replace("\r\n", "\n").Split('\n');
        if (lines.Any(l => l.Contains("Leyendas Adicionales1", StringComparison.OrdinalIgnoreCase) && l.Contains("Tipo de Movimiento", StringComparison.OrdinalIgnoreCase)))
            return new("Galicia", Galicia(text));
        if (lines.Any(l => l.StartsWith("Fecha;Suc. Origen;Desc. Sucursal;Cod. Operativo", StringComparison.OrdinalIgnoreCase)))
            return new("Santander", Santander(lines));
        return null;
    }

    private static bool IsOleExcel(byte[] b) => b.Length > 8 && b[0] == 0xD0 && b[1] == 0xCF && b[2] == 0x11 && b[3] == 0xE0;

    // Galicia: "Fecha";"Descripción";"Origen";"Débitos";"Créditos";...;"Número de Comprobante";"Leyendas Adicionales1..4";"Tipo de Movimiento";"Saldo".
    // En las transferencias, la leyenda 1 es la contraparte y la 2 su CUIT.
    private static List<BankImportRow> Galicia(string text)
    {
        var records = FinanceImport.ReadCsvRecords(text, ';');
        var header = records[0].Select(h => h.Trim().ToLowerInvariant()).ToList();
        int Col(string name) => header.FindIndex(h => h == name);
        var (date, desc, debit, credit, voucher, l1, l2, l3, balance) =
            (Col("fecha"), Col("descripción"), Col("débitos"), Col("créditos"), Col("número de comprobante"),
             Col("leyendas adicionales1"), Col("leyendas adicionales2"), Col("leyendas adicionales3"), Col("saldo"));
        var rows = new List<BankImportRow>();
        foreach (var c in records.Skip(1))
        {
            if (c.All(string.IsNullOrWhiteSpace)) continue;
            string Cell(int i) => i >= 0 && i < c.Count ? c[i].Trim() : "";
            if (!DateTime.TryParseExact(Cell(date), "dd/MM/yyyy", Ar, DateTimeStyles.None, out var d))
            {
                rows.Add(new(default, 0, FinancialMovementKind.Debit, string.Join(" | ", c), null, null, "Fecha inválida."));
                continue;
            }
            var debitAmount = Amount(Cell(debit));
            var creditAmount = Amount(Cell(credit));
            var taxId = Cuit(Cell(l2));
            var party = taxId is null ? null : NullIfEmpty(Cell(l1));
            var description = string.Join(" · ", new[] { Cell(desc), Cell(l1), Cell(l3) }.Where(x => x.Length > 0).Distinct());
            rows.Add(Row(d, debitAmount, creditAmount, description, NullIfEmpty(Cell(voucher)), AmountOrNull(Cell(balance)), taxId, party, null));
        }
        return rows;
    }

    // Santander: renglones de título, y uno o dos bloques "Fecha;Suc. Origen;...;Importe Pesos;Saldo Pesos;".
    // Los débitos van entre paréntesis; la contraparte con CUIT viene dentro del concepto.
    private static List<BankImportRow> Santander(string[] lines)
    {
        var rows = new List<BankImportRow>();
        var inBlock = false;
        var dayBlock = false;
        var title = "";
        foreach (var raw in lines)
        {
            var line = raw.TrimEnd('\r');
            if (line.StartsWith("Fecha;Suc. Origen", StringComparison.OrdinalIgnoreCase))
            {
                // El bloque "Movimientos del Día" no trae saldo por renglón (viene en cero).
                inBlock = true;
                dayBlock = title.Contains("del Día", StringComparison.OrdinalIgnoreCase);
                continue;
            }
            var c = line.Split(';');
            if (!inBlock || c.Length < 8 || !DateTime.TryParseExact(c[0].Trim(), "dd/MM/yyyy", Ar, DateTimeStyles.None, out var d))
            {
                inBlock = false;
                if (line.Trim().Length > 0 && !line.StartsWith("Cuenta", StringComparison.OrdinalIgnoreCase)) title = line;
                continue;
            }
            var amountText = c[6].Trim();
            var negative = amountText.StartsWith('(') || amountText.StartsWith('-');
            var amount = Amount(amountText.Trim('(', ')', '-'));
            var concept = c[5].Trim();
            var taxId = CuitRegex().Match(concept) is { Success: true } m ? m.Value : null;
            var party = taxId is null ? null : NullIfEmpty(Regex.Replace(concept[..concept.IndexOf(taxId, StringComparison.Ordinal)], @"^.*? - ", "").Trim());
            rows.Add(Row(d, negative ? amount : 0m, negative ? 0m : amount, concept, NullIfEmpty(c[4].Trim()),
                dayBlock ? null : AmountOrNull(c[7]), taxId, party, NullIfEmpty(c[3].Trim())));
        }
        return rows;
    }

    // BBVA (.xls): títulos (Empresa, Cuenta, Saldo...) y la tabla "Fecha, Fecha Valor, Concepto, Codigo, Número Documento,
    // Oficina, Crédito, Débito, Detalle"; los débitos vienen en negativo.
    private static Result? TryParseExcel(byte[] bytes)
    {
        using var stream = new MemoryStream(bytes);
        using var reader = ExcelReaderFactory.CreateReader(stream);
        var table = new List<string[]>();
        while (reader.Read())
            table.Add(Enumerable.Range(0, reader.FieldCount).Select(i => Convert.ToString(reader.GetValue(i), CultureInfo.InvariantCulture)?.Trim() ?? "").ToArray());
        var headerIndex = table.FindIndex(r => r.Length >= 9 && r[0] == "Fecha" && r[1] == "Fecha Valor" && r[3] == "Codigo");
        if (headerIndex < 0) return null;
        var rows = new List<BankImportRow>();
        foreach (var r in table.Skip(headerIndex + 1))
        {
            if (r.All(string.IsNullOrWhiteSpace)) continue;
            if (!DateTime.TryParseExact(r[0], "dd-MM-yyyy", Ar, DateTimeStyles.None, out var d))
            {
                rows.Add(new(default, 0, FinancialMovementKind.Debit, string.Join(" | ", r), null, null, "Fecha inválida."));
                continue;
            }
            var credit = Invariant(r[6]);
            var debit = Math.Abs(Invariant(r[7]));
            var detail = r.Length > 8 ? r[8].Trim().TrimEnd('-').Trim() : "";
            var description = string.Join(" · ", new[] { r[2], detail }.Where(x => x.Length > 0));
            var taxId = CuitRegex().Match(description) is { Success: true } m ? m.Value : null;
            rows.Add(Row(d, debit, credit, description, NullIfEmpty(r[4]), null, taxId, null, NullIfEmpty(r[3])));
        }
        return new("BBVA", rows);
    }

    private static BankImportRow Row(DateTime date, decimal debit, decimal credit, string description, string? reference, decimal? balance,
        string? taxId, string? party, string? bankCode)
    {
        var kind = debit > 0 ? FinancialMovementKind.Debit : FinancialMovementKind.Credit;
        var amount = debit > 0 ? debit : credit;
        var utc = DateTime.SpecifyKind(date, DateTimeKind.Utc);
        return amount == 0
            ? new(utc, 0, kind, description, reference, balance, "No se encontró débito ni crédito.")
            : new(utc, amount, kind, string.IsNullOrWhiteSpace(description) ? "Movimiento bancario" : description, reference, balance, null, taxId, party, bankCode);
    }

    private static string? Cuit(string value)
    {
        var digits = new string(value.Where(char.IsDigit).ToArray());
        return digits.Length == 11 && CuitRegex().IsMatch(digits) ? digits : null;
    }

    private static decimal Amount(string value) =>
        decimal.TryParse(value.Replace("$", "").Trim(), NumberStyles.Number, Ar, out var v) ? Math.Abs(v) : 0m;

    private static decimal? AmountOrNull(string value) =>
        decimal.TryParse(value.Replace("$", "").Trim(), NumberStyles.Number, Ar, out var v) ? v : null;

    private static decimal Invariant(string value) =>
        decimal.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var v) ? v : 0m;

    private static string? NullIfEmpty(string value) => string.IsNullOrWhiteSpace(value) ? null : value;
}
