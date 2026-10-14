using LealControl.Modules.Accounting.Contracts.VatBooks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace LealControl.Modules.Accounting.Infrastructure.VatBooks;

/// <summary>Libros IVA Ventas y Compras del mes, en pesos, y su exportación al Libro IVA Digital de ARCA.</summary>
internal static class VatBookEndpoints
{
    public static RouteGroupBuilder MapVatBookEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("/vat-books", async (int year, int month, IVatBookSource source, CancellationToken ct) =>
        {
            if (Period(year, month) is not var (from, to)) return InvalidPeriod();
            var sales = await source.SalesAsync(from, to, ct);
            var purchases = await source.PurchasesAsync(from, to, ct);
            return Results.Ok(new VatBooksResponse(year, month, Book(sales), Book(purchases), Problems(sales, purchases)));
        });

        group.MapGet("/vat-books/arca", async (int year, int month, IVatBookSource source, CancellationToken ct) =>
        {
            if (Period(year, month) is not var (from, to)) return InvalidPeriod();
            var sales = await source.SalesAsync(from, to, ct);
            var purchases = await source.PurchasesAsync(from, to, ct);
            var problems = Problems(sales, purchases);
            if (problems.Count > 0)
                return Results.BadRequest(new { error = "Hay comprobantes que no se pueden informar a ARCA.", problems });
            return Results.File(ArcaVatBookExport.Zip(year, month, sales, purchases), "application/zip",
                $"libro-iva-digital-{year:D4}{month:D2}.zip");
        });

        return group;
    }

    private static (DateTime From, DateTime To)? Period(int year, int month)
    {
        if (year is < 2000 or > 2100 || month is < 1 or > 12) return null;
        var from = new DateTime(year, month, 1, 0, 0, 0, DateTimeKind.Utc);
        return (from, from.AddMonths(1).AddTicks(-1));
    }

    private static IResult InvalidPeriod() => Results.BadRequest(new { error = "Elegí un mes válido." });

    private static List<string> Problems(IReadOnlyList<VatBookVoucher> sales, IReadOnlyList<VatBookVoucher> purchases) =>
        sales.SelectMany(v => ArcaVatBookExport.Problems(v, purchase: false))
            .Concat(purchases.SelectMany(v => ArcaVatBookExport.Problems(v, purchase: true))).ToList();

    /// <summary>
    /// El libro en pesos: cada importe convertido a la cotización del comprobante; las notas de crédito restan.
    /// </summary>
    private static VatBook Book(IReadOnlyList<VatBookVoucher> vouchers)
    {
        var rows = vouchers.Select(v =>
        {
            var sign = v.IsCreditNote ? -1m : 1m;
            decimal Ars(decimal amount) => sign * Math.Round(amount * v.ExchangeRate, 2, MidpointRounding.AwayFromZero);
            decimal Net(decimal rate) => Ars(v.Rates.Where(r => r.Rate == rate).Sum(r => r.Net));
            decimal Vat(decimal rate) => Ars(v.Rates.Where(r => r.Rate == rate).Sum(r => r.Vat));
            var other = v.Rates.Where(r => r.Rate is not (21m or 10.5m or 27m)).ToList();
            var row = new VatBookRow(
                v.Date, v.VoucherLabel, v.CounterpartyDocument, v.CounterpartyName, v.CurrencyCode == "PES" ? "ARS" : v.CurrencyCode,
                v.ExchangeRate,
                Net(21m), Vat(21m), Net(10.5m), Vat(10.5m), Net(27m), Vat(27m),
                Ars(other.Sum(r => r.Net)), Ars(other.Sum(r => r.Vat)),
                Ars(v.Exempt), Ars(v.PerceptionVat), Ars(v.PerceptionIibb), Ars(v.OtherTaxes), 0m);
            return row with { Total = Sum(row) };
        }).ToList();

        var totals = new VatBookRow(DateTime.MinValue, "Totales", "", "", "ARS", 1m,
            rows.Sum(r => r.Net21), rows.Sum(r => r.Vat21), rows.Sum(r => r.Net105), rows.Sum(r => r.Vat105),
            rows.Sum(r => r.Net27), rows.Sum(r => r.Vat27), rows.Sum(r => r.NetOther), rows.Sum(r => r.VatOther),
            rows.Sum(r => r.Exempt), rows.Sum(r => r.PerceptionVat), rows.Sum(r => r.PerceptionIibb), rows.Sum(r => r.OtherTaxes),
            rows.Sum(r => r.Total));
        return new VatBook(rows, totals);
    }

    private static decimal Sum(VatBookRow r) =>
        r.Net21 + r.Vat21 + r.Net105 + r.Vat105 + r.Net27 + r.Vat27 + r.NetOther + r.VatOther +
        r.Exempt + r.PerceptionVat + r.PerceptionIibb + r.OtherTaxes;
}

public sealed record VatBooksResponse(int Year, int Month, VatBook Sales, VatBook Purchases, IReadOnlyList<string> Problems);

public sealed record VatBook(IReadOnlyList<VatBookRow> Rows, VatBookRow Totals);

/// <summary>Una línea del Libro IVA, en pesos (negativa en las notas de crédito).</summary>
public sealed record VatBookRow(
    DateTime Date, string Voucher, string CounterpartyDocument, string CounterpartyName, string Currency, decimal ExchangeRate,
    decimal Net21, decimal Vat21, decimal Net105, decimal Vat105, decimal Net27, decimal Vat27,
    decimal NetOther, decimal VatOther, decimal Exempt, decimal PerceptionVat, decimal PerceptionIibb, decimal OtherTaxes,
    decimal Total);
