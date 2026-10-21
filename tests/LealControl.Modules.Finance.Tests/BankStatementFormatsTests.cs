using System.Text;
using FluentAssertions;
using LealControl.Modules.Finance.Infrastructure;
using Xunit;

namespace LealControl.Modules.Finance.Tests;

/// <summary>Extractos con el formato de cada banco (nota 69, F1); datos inventados.</summary>
public sealed class BankStatementFormatsTests
{
    [Fact]
    public void Galicia_takes_the_counterparty_cuit_and_name_from_the_legends()
    {
        var csv = "﻿\"Fecha\";\"Descripción\";\"Origen\";\"Débitos\";\"Créditos\";\"Grupo de Conceptos\";\"Concepto\";\"Número de Terminal\";\"Observaciones Cliente\";\"Número de Comprobante\";\"Leyendas Adicionales1\";\"Leyendas Adicionales2\";\"Leyendas Adicionales3\";\"Leyendas Adicionales4\";\"Tipo de Movimiento\";\"Saldo\"\n"
            + "\"01/10/2026\";\"Trf Inmed Proveed\";\"\";\"150000,50\";\"0\";\"\";\"\";\"\";\"\";\"12345678\";\"Proveedor Ejemplo SA\";\"30712345671\";\"FACTURAS\";\"\";\"Imputado\";\"849999,50\";\n"
            + "\"01/10/2026\";\"Ing. Brutos S/ Cred\";\"\";\"1200,00\";\"0\";\"\";\"\";\"\";\"\";\"\";\"REG.RECAU.SIRCREB\";\"\";\"\";\"\";\"Imputado\";\"848799,50\";\n"
            + "\"02/10/2026\";\"Transferencia De Terceros\";\"\";\"0\";\"300000,00\";\"\";\"\";\"\";\"\";\"\";\"Cliente Ejemplo SRL\";\"20301112220\";\"\";\"\";\"Imputado\";\"1148799,50\";\n";

        var result = BankStatementFormats.TryParse(Encoding.UTF8.GetBytes(csv), "Extracto_CC.csv");

        result.Should().NotBeNull();
        result!.Bank.Should().Be("Galicia");
        result.Rows.Should().HaveCount(3);
        var transfer = result.Rows[0];
        transfer.Kind.Should().Be(FinancialMovementKind.Debit);
        transfer.Amount.Should().Be(150000.50m);
        transfer.CounterpartyTaxId.Should().Be("30712345671");
        transfer.CounterpartyName.Should().Be("Proveedor Ejemplo SA");
        transfer.ExternalReference.Should().Be("12345678");
        transfer.ReportedBalance.Should().Be(849999.50m);
        transfer.Description.Should().Be("Trf Inmed Proveed · Proveedor Ejemplo SA · FACTURAS");
        result.Rows[1].CounterpartyTaxId.Should().BeNull();
        result.Rows[1].Description.Should().Contain("SIRCREB");
        result.Rows[2].Kind.Should().Be(FinancialMovementKind.Credit);
        result.Rows[2].CounterpartyTaxId.Should().Be("20301112220");
    }

    [Fact]
    public void Santander_reads_both_blocks_with_debits_in_parentheses()
    {
        var text = "Movimientos del Día\r\nCuenta Corriente en Pesos Nro. 000-000000/0\r\n"
            + "Fecha;Suc. Origen;Desc. Sucursal;Cod. Operativo;Referencia;Concepto;Importe Pesos;Saldo Pesos;\r\n"
            + "05/10/2026;0000;Casa Central;2393;000111;Pagos Ctas Propias Interbanking In  - Empresa Ejemplo Srl 30712345671 01 111 ;1.100.000,00;0,00\r\n"
            + "Saldo al 05/10/2026 1.160.665,53\r\n\r\nÚltimos Movimientos\r\nCuenta Corriente en Pesos Nro. 000-000000/0\r\n"
            + "Fecha;Suc. Origen;Desc. Sucursal;Cod. Operativo;Referencia;Concepto;Importe Pesos;Saldo Pesos;\r\n"
            + "29/09/2026;0332;San Lorenzo;4633;000000124;Impuesto Ley 25.413 Debito 0,6% ;(427,80);60.665,53\r\n"
            + "29/09/2026;0332;San Lorenzo;3253;000000123;Iva Percepcion Rg 2408 ;(1.725,00);61.093,33\r\n";

        var result = BankStatementFormats.TryParse(Encoding.GetEncoding("ISO-8859-1").GetBytes(text), "Santander.csv");

        result!.Bank.Should().Be("Santander");
        result.Rows.Should().HaveCount(3);
        result.Rows[0].Kind.Should().Be(FinancialMovementKind.Credit);
        result.Rows[0].Amount.Should().Be(1100000m);
        result.Rows[0].CounterpartyTaxId.Should().Be("30712345671");
        result.Rows[0].CounterpartyName.Should().Be("Empresa Ejemplo Srl");
        result.Rows[0].ReportedBalance.Should().BeNull();          // el bloque del día no trae saldo
        result.Rows[0].BankCode.Should().Be("2393");
        result.Rows[1].Kind.Should().Be(FinancialMovementKind.Debit);
        result.Rows[1].Amount.Should().Be(427.80m);
        result.Rows[1].ReportedBalance.Should().Be(60665.53m);
        result.Rows[2].Amount.Should().Be(1725m);
        result.Rows[2].Description.Should().Contain("Rg 2408");
    }

    [Fact]
    public void Credicoop_reads_the_ordering_cuit_and_own_transfers()
    {
        var text = "Fecha,Concepto,Nro.Cpbte.,Débito,Crédito,Saldo,Cód.\r\n"
            + "30/09/2026,Reg. de Recaudacion SIRCREB-Convenio,0,11792.76,0.00,500000.00,SCECO\r\n"
            + "30/09/2026,Transf. Interbanking - Distinto Titular Ord.:30712345671-CLIENTE EJEMPLO SA,123456,0.00,250000.70,511792.76,00974\r\n"
            + "29/09/2026,Transf.Inmediata e/Ctas.Igual Tit.O/Bco 30715342215-VAR-EMPRESA CBU Destino: 0000000000000000000000,555,100000.00,0.00,261792.06,01273\r\n";

        var result = BankStatementFormats.TryParse(Encoding.GetEncoding("ISO-8859-1").GetBytes(text), "saldos_y_movimientos.csv");

        result!.Bank.Should().Be("Credicoop");
        result.Rows.Should().HaveCount(3);
        result.Rows[0].Kind.Should().Be(FinancialMovementKind.Debit);
        result.Rows[0].Amount.Should().Be(11792.76m);
        result.Rows[0].ExternalReference.Should().BeNull();
        result.Rows[0].BankCode.Should().Be("SCECO");
        result.Rows[1].Kind.Should().Be(FinancialMovementKind.Credit);
        result.Rows[1].Amount.Should().Be(250000.70m);
        result.Rows[1].CounterpartyTaxId.Should().Be("30712345671");
        result.Rows[1].CounterpartyName.Should().Be("CLIENTE EJEMPLO SA");
        result.Rows[1].ReportedBalance.Should().Be(511792.76m);
        result.Rows[2].CounterpartyTaxId.Should().BeNull();               // transferencia entre cuentas propias
        BankChargeClassifier.Classify(result.Rows[2].Description).Should().Be("TRANSFERENCIA_PROPIA");
        BankChargeClassifier.Classify("Servicio acreditaciones automaticas SERV ACRED AUTOMATIC").Should().Be("COMISION");
    }

    [Fact]
    public void An_unknown_file_falls_back_to_the_generic_importer()
    {
        BankStatementFormats.TryParse(Encoding.UTF8.GetBytes("Fecha;Importe\n01/10/2026;100\n"), "otro.csv").Should().BeNull();
        BankStatementFormats.DecodeText(Encoding.GetEncoding("ISO-8859-1").GetBytes("Descripción")).Should().Be("Descripción");
    }
}
