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
}
