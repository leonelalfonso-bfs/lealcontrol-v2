using FluentAssertions;
using LealControl.Modules.Finance.Infrastructure;
using Xunit;

namespace LealControl.Modules.Finance.Tests;

public sealed class BankImportParseTests
{
    [Fact]
    public void Parse_galicia_style_csv_maps_debit_credit_cuit_and_balance()
    {
        var csv = """
            Fecha;Descripción;Débitos;Créditos;Saldo;Número de comprobante;Leyendas adicionales1;Leyendas adicionales2
            15/03/2026;TRANSF RECIBIDA;;15000,50;100000,00;OP-99;ACME SA;30-71234567-8
            16/03/2026;COMISION;500,00;;99500,00;COM-1;;;
            17/03/2026;SIN IMPORTE;;;;REF-X;;;
            """;

        var rows = FinanceImport.Parse(csv);

        rows.Should().HaveCount(3);
        rows[0].Error.Should().BeNull();
        rows[0].Kind.Should().Be(FinancialMovementKind.Credit);
        rows[0].Amount.Should().Be(15000.50m);
        rows[0].ReportedBalance.Should().Be(100000m);
        rows[0].ExternalReference.Should().Be("OP-99");
        rows[0].Description.Should().Contain("Titular: ACME SA");
        rows[0].Description.Should().Contain("CUIT: 30-71234567-8");

        rows[1].Kind.Should().Be(FinancialMovementKind.Debit);
        rows[1].Amount.Should().Be(500m);
        rows[1].Error.Should().BeNull();

        rows[2].Error.Should().NotBeNullOrEmpty();
    }

    [Fact]
    public void Parse_rejects_invalid_date()
    {
        var csv = """
            Fecha;Créditos;Débitos
            no-es-fecha;100;0
            """;

        var rows = FinanceImport.Parse(csv);
        rows.Should().ContainSingle();
        rows[0].Error.Should().Contain("Fecha");
    }

    [Fact]
    public void Parse_lealcontrol_template_tipo_and_importe()
    {
        var rows = FinanceImport.Parse(FinanceImport.TemplateSample);

        rows.Should().HaveCount(2);
        rows[0].Error.Should().BeNull();
        rows[0].Kind.Should().Be(FinancialMovementKind.Credit);
        rows[0].Amount.Should().Be(15000.50m);
        rows[0].ExternalReference.Should().Be("OP-123");
        rows[1].Kind.Should().Be(FinancialMovementKind.Debit);
        rows[1].Amount.Should().Be(500m);
    }

    [Fact]
    public void Parse_unknown_headers_requires_mapping()
    {
        var csv = """
            ColA;ColB;ColC
            01/01/2026;100;foo
            """;

        var outcome = FinanceImport.ParseWithOptions(csv, profile: null);
        outcome.RequiresMapping.Should().BeTrue();
        outcome.Headers.Should().Contain("ColA");
    }

    [Fact]
    public void Parse_with_saved_column_profile()
    {
        var csv = """
            ColA;ColB;ColC;ColD
            15/03/2026;Cobro;Credito;2500,00
            """;
        var profile = new BankImportProfile
        {
            ColumnMapJson = """{"date":0,"description":1,"tipo":2,"amount":3}""",
            Delimiter = ";"
        };

        var outcome = FinanceImport.ParseWithOptions(csv, profile);
        outcome.RequiresMapping.Should().BeFalse();
        outcome.Rows.Should().ContainSingle();
        outcome.Rows[0].Amount.Should().Be(2500m);
        outcome.Rows[0].Kind.Should().Be(FinancialMovementKind.Credit);
        outcome.Rows[0].Description.Should().Be("Cobro");
    }
}
