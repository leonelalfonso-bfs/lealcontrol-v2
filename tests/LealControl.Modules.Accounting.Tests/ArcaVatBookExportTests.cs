using System.IO.Compression;
using FluentAssertions;
using LealControl.Modules.Accounting.Contracts.VatBooks;
using LealControl.Modules.Accounting.Infrastructure.VatBooks;
using Xunit;

namespace LealControl.Modules.Accounting.Tests;

/// <summary>Diseño de registro del Libro IVA Digital de ARCA: largo fijo y cada campo en su posición.</summary>
public sealed class ArcaVatBookExportTests
{
    private static VatBookVoucher Voucher(
        int type = 1, bool discriminates = true, string currency = "PES", decimal rate = 1m,
        IReadOnlyList<VatBookRate>? rates = null, decimal exempt = 0m, decimal perceptionVat = 0m,
        decimal perceptionIibb = 0m, decimal otherTaxes = 0m, string name = "Peñarol Ñandú S.A.", string document = "30715489629")
    {
        rates ??= [new VatBookRate(21m, 1000m, 210m), new VatBookRate(10.5m, 200m, 21m)];
        var total = rates.Sum(r => r.Net + r.Vat) + exempt + perceptionVat + perceptionIibb + otherTaxes;
        return new VatBookVoucher(new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc), type, "FC A 0003-00000042",
            type is 3 or 8, discriminates, 3, 42, document.Length == 11 ? 80 : 99, document, name, currency, rate,
            rates, exempt, perceptionVat, perceptionIibb, otherTaxes, total, null);
    }

    // Posiciones de 1 en adelante, como en el diseño de ARCA.
    private static string Field(string line, int from, int length) => line.Substring(from - 1, length);

    [Fact]
    public void Sales_voucher_has_266_positions_with_each_field_in_place()
    {
        var line = ArcaVatBookExport.SalesVoucher(Voucher(exempt: 50m, perceptionIibb: 12.34m));

        line.Should().HaveLength(266);
        Field(line, 1, 8).Should().Be("20261001");
        Field(line, 9, 3).Should().Be("001");
        Field(line, 12, 5).Should().Be("00003");
        Field(line, 17, 20).Should().Be("00000000000000000042");
        Field(line, 37, 20).Should().Be("00000000000000000042");
        Field(line, 57, 2).Should().Be("80");
        Field(line, 59, 20).Should().Be("00000000030715489629");
        Field(line, 79, 30).Should().Be("PENAROL NANDU S.A.            ");
        Field(line, 109, 15).Should().Be("000000000149334"); // 1000+210+200+21+50+12,34
        Field(line, 154, 15).Should().Be("000000000005000"); // exento
        Field(line, 184, 15).Should().Be("000000000001234"); // percepción IIBB
        Field(line, 229, 3).Should().Be("PES");
        Field(line, 232, 10).Should().Be("0001000000");
        Field(line, 242, 1).Should().Be("2");
        Field(line, 243, 1).Should().Be("0");
        Field(line, 259, 8).Should().Be("00000000");
    }

    [Fact]
    public void Sales_rates_have_62_positions_and_arca_rate_codes()
    {
        var lines = ArcaVatBookExport.SalesRates(Voucher()).ToList();

        lines.Should().HaveCount(2).And.OnlyContain(l => l.Length == 62);
        Field(lines[0], 29, 15).Should().Be("000000000100000");
        Field(lines[0], 44, 4).Should().Be("0005");
        Field(lines[0], 48, 15).Should().Be("000000000021000");
        Field(lines[1], 44, 4).Should().Be("0004");
    }

    [Fact]
    public void A_fully_exempt_sale_is_operation_E_with_one_zero_rate_record()
    {
        var voucher = Voucher(rates: [], exempt: 500m);

        var line = ArcaVatBookExport.SalesVoucher(voucher);
        Field(line, 242, 1).Should().Be("1");
        Field(line, 243, 1).Should().Be("E");
        var rate = ArcaVatBookExport.SalesRates(voucher).Single();
        Field(rate, 44, 4).Should().Be("0003");
    }

    [Fact]
    public void Purchase_voucher_has_325_positions_with_computable_credit()
    {
        var line = ArcaVatBookExport.PurchaseVoucher(Voucher(currency: "DOL", rate: 1050.25m, perceptionVat: 30m, otherTaxes: 5m));

        line.Should().HaveLength(325);
        Field(line, 37, 16).Should().Be(new string(' ', 16));
        Field(line, 53, 2).Should().Be("80");
        Field(line, 105, 15).Should().Be("000000000146600"); // 1431 + 30 + 5
        Field(line, 150, 15).Should().Be("000000000003000"); // percepción IVA
        Field(line, 225, 3).Should().Be("DOL");
        Field(line, 228, 10).Should().Be("1050250000");
        Field(line, 238, 1).Should().Be("2");
        Field(line, 240, 15).Should().Be("000000000023100"); // crédito fiscal 210 + 21
        Field(line, 255, 15).Should().Be("000000000000500"); // otros tributos
        Field(line, 270, 11).Should().Be("00000000000");
    }

    [Fact]
    public void Purchases_b_and_c_have_no_rate_records_nor_computable_credit()
    {
        var voucher = Voucher(type: 6, discriminates: false);

        ArcaVatBookExport.PurchaseRates(voucher).Should().BeEmpty();
        var line = ArcaVatBookExport.PurchaseVoucher(voucher);
        Field(line, 238, 1).Should().Be("0");
        Field(line, 240, 15).Should().Be("000000000000000");
        ArcaVatBookExport.PurchaseRates(Voucher()).Should().OnlyContain(l => l.Length == 84);
    }

    [Fact]
    public void Problems_block_what_arca_would_reject()
    {
        ArcaVatBookExport.Problems(Voucher(type: 0), purchase: false).Should().ContainSingle();
        ArcaVatBookExport.Problems(Voucher(rates: [new VatBookRate(19m, 100m, 19m)]), purchase: false).Should().ContainSingle();
        ArcaVatBookExport.Problems(Voucher(document: "0"), purchase: true).Should().ContainSingle();
        ArcaVatBookExport.Problems(Voucher(document: "0"), purchase: false).Should().BeEmpty();
    }

    [Fact]
    public void Zip_holds_the_four_files_with_crlf_lines()
    {
        var zip = ArcaVatBookExport.Zip(2026, 10, [Voucher()], [Voucher(), Voucher(type: 6, discriminates: false)]);

        using var archive = new ZipArchive(new MemoryStream(zip));
        archive.Entries.Select(e => e.Name).Should().BeEquivalentTo(
            "LIBRO_IVA_DIGITAL_VENTAS_CBTE_202610.txt", "LIBRO_IVA_DIGITAL_VENTAS_ALICUOTAS_202610.txt",
            "LIBRO_IVA_DIGITAL_COMPRAS_CBTE_202610.txt", "LIBRO_IVA_DIGITAL_COMPRAS_ALICUOTAS_202610.txt");
        using var reader = new StreamReader(archive.GetEntry("LIBRO_IVA_DIGITAL_COMPRAS_ALICUOTAS_202610.txt")!.Open());
        var content = reader.ReadToEnd();
        content.Split("\r\n", StringSplitOptions.RemoveEmptyEntries).Should().HaveCount(2); // solo la compra A
    }
}
