using System;
using System.Linq;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Contracts.Fiscal;
using LealControl.Modules.Sales.Domain.Invoices;
using LealControl.Modules.Sales.Infrastructure.Fiscal;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class WsfeVoucherPreparationTests
{
    private static readonly DateTime Issue = new(2026, 10, 2, 0, 0, 0, DateTimeKind.Utc);

    private static Invoice Draft(
        string type = "A", string taxCondition = "ResponsableInscripto",
        string document = "20123456786", string currency = "ARS", int concept = 2,
        params (decimal Price, decimal Vat)[] items)
    {
        var services = concept is 2 or 3;
        var invoice = Invoice.Create(new TenantId(Guid.NewGuid()), type, 1, 1, null, null,
            Guid.NewGuid(), "Cliente de prueba", document, taxCondition, null,
            Issue.AddDays(10), currency, 1m, null, Issue, concept,
            services ? Issue.AddDays(-1) : null, services ? Issue : null);
        foreach (var (price, vat) in items.Length == 0 ? [(0.83m, 21m)] : items)
            invoice.AddItem(null, "ITEM", "Ítem de prueba", 1m, price, vat);
        return invoice;
    }

    private static WsfeVoucherData Valid(Invoice invoice)
    {
        Assert.True(WsfeVoucherPreparation.TryBuild(invoice, out var data, out var error), error);
        return data!;
    }

    [Fact]
    public void Service_invoice_a_keeps_the_homologated_mapping()
    {
        var data = Valid(Draft());
        Assert.Equal(1, data.VoucherType);
        Assert.Equal(2, data.Concept);
        Assert.Equal(80, data.ReceiverDocumentType);
        Assert.Equal("20123456786", data.ReceiverDocumentNumber);
        Assert.Equal(1, data.ReceiverVatCondition);
        Assert.Equal("20261002", data.IssueDate);
        Assert.Equal("20261001", data.ServiceFrom);
        Assert.Equal("20261002", data.ServiceTo);
        Assert.Equal("20261012", data.PaymentDue);
        Assert.Equal(0.83m, data.NetAmount);
        Assert.Equal(0.17m, data.VatAmount);
        Assert.Equal(1.00m, data.TotalAmount);
        Assert.Equal(new WsfeVatLine(5, 0.83m, 0.17m), Assert.Single(data.VatLines));
        Assert.Equal("PES", data.CurrencyCode);
    }

    [Fact]
    public void Monotributista_receives_invoice_a_with_condition_6()
    {
        var data = Valid(Draft(taxCondition: "Monotributo"));
        Assert.Equal(1, data.VoucherType);
        Assert.Equal(6, data.ReceiverVatCondition);
    }

    [Fact]
    public void Products_with_several_rates_and_exempt_items_are_totalized_by_rate()
    {
        var data = Valid(Draft(concept: 1, items: [(100m, 21m), (50m, 21m), (200m, 10.5m), (10m, 27m), (30m, 0m)]));
        Assert.Equal(1, data.Concept);
        Assert.Null(data.ServiceFrom);
        Assert.Null(data.PaymentDue);
        Assert.Equal(360m, data.NetAmount);
        Assert.Equal(30m, data.ExemptAmount);
        Assert.Equal([new WsfeVatLine(4, 200m, 21m), new WsfeVatLine(5, 150m, 31.5m), new WsfeVatLine(6, 10m, 2.7m)],
            data.VatLines.ToArray());
        Assert.Equal(55.2m, data.VatAmount);
        Assert.Equal(445.2m, data.TotalAmount);
        WsfeCaeRequestBuilder.Validate(data);
    }

    [Fact]
    public void Fully_exempt_invoice_sends_no_vat_array()
    {
        var data = Valid(Draft(concept: 3, items: [(500m, 0m)]));
        Assert.Equal(0m, data.NetAmount);
        Assert.Equal(500m, data.ExemptAmount);
        Assert.Empty(data.VatLines);
        Assert.DoesNotContain("<ar:Iva>", WsfeCaeRequestBuilder.Build(data, 1, 7, "30715489629", "t", "s"));
    }

    [Theory]
    [InlineData("", 99, "0")]
    [InlineData("30.123.456", 96, "30123456")]
    [InlineData("20-12345678-6", 80, "20123456786")]
    public void Consumer_final_invoice_b_identifies_by_cuit_dni_or_not_at_all(
        string document, int documentType, string number)
    {
        var data = Valid(Draft("B", "ConsumidorFinal", document));
        Assert.Equal(6, data.VoucherType);
        Assert.Equal(5, data.ReceiverVatCondition);
        Assert.Equal(documentType, data.ReceiverDocumentType);
        Assert.Equal(number, data.ReceiverDocumentNumber);
    }

    [Fact]
    public void Exempt_customer_receives_invoice_b_with_condition_4()
    {
        var data = Valid(Draft("B", "Exento"));
        Assert.Equal(6, data.VoucherType);
        Assert.Equal(4, data.ReceiverVatCondition);
        Assert.Equal(80, data.ReceiverDocumentType);
    }

    [Fact]
    public void Anonymous_consumer_from_ten_million_must_be_identified()
    {
        var invoice = Draft("B", "ConsumidorFinal", "", items: [(8_264_463m, 21m)]);
        Assert.True(invoice.Total >= WsfeVoucherPreparation.ConsumerIdentificationThreshold);
        Assert.False(WsfeVoucherPreparation.TryBuild(invoice, out _, out var error));
        Assert.Contains("identificarse", error);
        Valid(Draft("B", "ConsumidorFinal", "30123456", items: [(8_264_463m, 21m)]));
    }

    [Theory]
    [InlineData("B", "ResponsableInscripto", "20123456786", "ARS", 2, 21)]
    [InlineData("B", "Monotributo", "20123456786", "ARS", 2, 21)]
    [InlineData("A", "ConsumidorFinal", "20123456786", "ARS", 2, 21)]
    [InlineData("A", "Exento", "20123456786", "ARS", 2, 21)]
    [InlineData("A", "ResponsableInscripto", "20123456789", "ARS", 2, 21)]
    [InlineData("A", "ResponsableInscripto", "", "ARS", 2, 21)]
    [InlineData("B", "Exento", "30123456", "ARS", 2, 21)]
    [InlineData("B", "ConsumidorFinal", "12345", "ARS", 2, 21)]
    [InlineData("A", "ResponsableInscripto", "20123456786", "EUR", 2, 21)]
    [InlineData("A", "ResponsableInscripto", "20123456786", "ARS", 0, 21)]
    [InlineData("A", "ResponsableInscripto", "20123456786", "ARS", 2, 5)]
    [InlineData("C", "ResponsableInscripto", "20123456786", "ARS", 2, 21)]
    [InlineData("Proforma", "ResponsableInscripto", "20123456786", "ARS", 2, 21)]
    [InlineData("NC_A", "ResponsableInscripto", "20123456786", "ARS", 2, 21)]
    public void Unsupported_or_invalid_data_is_rejected(
        string type, string condition, string document, string currency, int concept, int vat)
    {
        var valid = WsfeVoucherPreparation.TryBuild(
            Draft(type, condition, document, currency, concept, (0.83m, vat)), out var data, out var error);
        Assert.False(valid);
        Assert.Null(data);
        Assert.NotEmpty(error);
    }

    [Fact]
    public void Credit_note_carries_the_associated_invoice()
    {
        var associated = new WsfeAssociatedVoucher(1, 1, 15, "30715489629", "20261001");
        Assert.True(WsfeVoucherPreparation.TryBuild(Draft("NC_A"), out var data, out var error, associated), error);
        Assert.Equal(3, data!.VoucherType);
        Assert.Equal(associated, Assert.Single(data.AssociatedVouchers));
        var xml = WsfeCaeRequestBuilder.Build(data, 1, 3, "30715489629", "t", "s");
        Assert.Contains("<ar:CbtesAsoc><ar:CbteAsoc><ar:Tipo>1</ar:Tipo><ar:PtoVta>1</ar:PtoVta><ar:Nro>15</ar:Nro>", xml);

        var wrongClass = associated with { Type = 6 };
        Assert.False(WsfeVoucherPreparation.TryBuild(Draft("NC_A"), out _, out _, wrongClass));
        Assert.False(WsfeVoucherPreparation.TryBuild(Draft("A"), out _, out _, associated));
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void Dollar_invoice_maps_to_dol_with_rate_and_same_currency_flag(bool paidInDollars)
    {
        var invoice = Invoice.Create(new TenantId(Guid.NewGuid()), "A", 1, 1, null, null,
            Guid.NewGuid(), "Cliente de prueba", "20123456786", "ResponsableInscripto", null,
            Issue.AddDays(10), "USD", 1450.5m, null, Issue, 1, paidInForeignCurrency: paidInDollars);
        invoice.AddItem(null, "ITEM", "Ítem en dólares", 2m, 50m, 21m);
        var data = Valid(invoice);
        Assert.Equal("DOL", data.CurrencyCode);
        Assert.Equal(1450.5m, data.ExchangeRate);
        Assert.Equal(paidInDollars, data.PaidInSameForeignCurrency);
        Assert.Equal(121m, data.TotalAmount);
        var xml = WsfeCaeRequestBuilder.Build(data, 1, 9, "30715489629", "t", "s");
        Assert.Contains($"<ar:CanMisMonExt>{(paidInDollars ? "S" : "N")}</ar:CanMisMonExt>", xml);
    }

    [Fact]
    public void Consumer_threshold_is_measured_in_pesos_for_dollar_invoices()
    {
        var invoice = Invoice.Create(new TenantId(Guid.NewGuid()), "B", 1, 1, null, null,
            Guid.NewGuid(), "Consumidor final", "0", "ConsumidorFinal", null,
            Issue.AddDays(10), "USD", 1500m, null, Issue, 1);
        invoice.AddItem(null, "ITEM", "Equipo", 1m, 6000m, 21m);
        Assert.False(WsfeVoucherPreparation.TryBuild(invoice, out _, out var error));
        Assert.Contains("identificarse", error);
    }

    [Theory]
    [InlineData("20261005", "20261007", "20261005")]
    [InlineData("20261007", "20261007", null)]
    [InlineData("20261009", "20261007", null)]
    public void Exchange_rate_date_uses_issue_date_only_when_it_is_in_the_past(
        string issue, string today, string? expected)
    {
        var now = DateTimeOffset.ParseExact(today + " 15:00 -03:00", "yyyyMMdd HH:mm zzz",
            System.Globalization.CultureInfo.InvariantCulture);
        Assert.Equal(expected, FiscalExchangeRateDate.For(issue, now));
    }

    [Fact]
    public void Fce_invoice_carries_cbu_alias_transfer_mode_and_due_date_even_for_products()
    {
        var invoice = Invoice.Create(new TenantId(Guid.NewGuid()), "FCE_A", 1, 1, null, null,
            Guid.NewGuid(), "Gran empresa", "20123456786", "ResponsableInscripto", null,
            Issue.AddDays(30), "ARS", 1m, null, Issue, 1,
            fceCbu: "0070123420000012345678", fceAlias: "EMPRESA.COBRO", fceTransferMode: "SCA");
        invoice.AddItem(null, "EQ", "Equipo", 1m, 100m, 21m);
        var data = Valid(invoice);
        Assert.Equal(201, data.VoucherType);
        Assert.Equal("20261101", data.PaymentDue);
        Assert.Equal(["2101=0070123420000012345678", "2102=EMPRESA.COBRO", "27=SCA"],
            data.OptionalList.Select(o => $"{o.Id}={o.Value}").ToArray());
        var xml = WsfeCaeRequestBuilder.Build(data, 1, 5, "30715489629", "t", "s");
        Assert.Contains("<ar:FchVtoPago>20261101</ar:FchVtoPago>", xml);
        Assert.Contains("<ar:Opcionales><ar:Opcional><ar:Id>2101</ar:Id><ar:Valor>0070123420000012345678</ar:Valor></ar:Opcional>", xml);
    }

    [Fact]
    public void Fce_requires_company_cbu()
    {
        var invoice = Invoice.Create(new TenantId(Guid.NewGuid()), "FCE_A", 1, 1, null, null,
            Guid.NewGuid(), "Gran empresa", "20123456786", "ResponsableInscripto", null,
            Issue.AddDays(30), "ARS", 1m, null, Issue, 1);
        invoice.AddItem(null, "EQ", "Equipo", 1m, 100m, 21m);
        Assert.False(WsfeVoucherPreparation.TryBuild(invoice, out _, out var error));
        Assert.Contains("CBU", error);
    }

    [Theory]
    [InlineData(false, "N", null)]
    [InlineData(true, "S", "20261101")]
    public void Fce_credit_note_informs_cancellation_and_due_only_when_cancelling(
        bool cancellation, string code, string? due)
    {
        var note = Invoice.Create(new TenantId(Guid.NewGuid()), "NC_FCE_A", 1, 1, null, null,
            Guid.NewGuid(), "Gran empresa", "20123456786", "ResponsableInscripto", null,
            Issue.AddDays(30), "ARS", 1m, null, Issue, 1, fceCancellation: cancellation);
        note.AddItem(null, "EQ", "Equipo", 1m, 100m, 21m);
        var associated = new WsfeAssociatedVoucher(201, 1, 5, "30715489629", "20261001");
        Assert.True(WsfeVoucherPreparation.TryBuild(note, out var data, out var error, associated), error);
        Assert.Equal(203, data!.VoucherType);
        Assert.Equal(new WsfeOptional("22", code), Assert.Single(data.OptionalList));
        Assert.Equal(due, data.PaymentDue);
        Assert.False(WsfeVoucherPreparation.TryBuild(note, out _, out _,
            associated with { Type = 1 }));
    }
}
