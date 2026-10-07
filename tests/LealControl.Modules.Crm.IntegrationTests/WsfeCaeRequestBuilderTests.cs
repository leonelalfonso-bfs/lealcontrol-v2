using LealControl.Modules.Crm.Contracts.Fiscal;
using System;
using System.Linq;
using System.Xml.Linq;
using LealControl.Modules.Sales.Infrastructure.Fiscal;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class WsfeCaeRequestBuilderTests
{
    private static readonly WsfeVoucherData Data = FiscalTestData.ServiceA();

    [Fact]
    public void Emits_one_well_formed_invoice_with_reserved_number_and_one_peso()
    {
        var xml = WsfeCaeRequestBuilder.Build(Data, 3, 18, "30715489629", "token&demo", "sign<demo");
        var document = XDocument.Parse(xml);
        var nodes = document.Descendants().ToList();
        string? Value(string name) => nodes.FirstOrDefault(n => n.Name.LocalName == name)?.Value;
        Assert.Equal("FECAESolicitar", nodes.Single(n => n.Name.LocalName == "FECAESolicitar").Name.LocalName);
        Assert.Single(nodes, n => n.Name.LocalName == "FECAEDetRequest");
        Assert.Equal("1", Value("CantReg"));
        Assert.Equal("3", Value("PtoVta"));
        Assert.Equal("18", Value("CbteDesde"));
        Assert.Equal("18", Value("CbteHasta"));
        Assert.Equal("20123456786", Value("DocNro"));
        Assert.Equal("20261001", Value("FchServDesde"));
        Assert.Equal("20261002", Value("FchServHasta"));
        Assert.Equal("20261012", Value("FchVtoPago"));
        Assert.Equal("1.00", Value("ImpTotal"));
        Assert.Equal("0.83", Value("ImpNeto"));
        Assert.Equal("0.17", Value("ImpIVA"));
        Assert.Equal("1", Value("CondicionIVAReceptorId"));
        Assert.Equal("PES", Value("MonId"));
        Assert.Equal("token&demo", Value("Token"));
        Assert.Equal("sign<demo", Value("Sign"));
    }

    [Fact]
    public void Fingerprint_is_stable_for_same_reservation_and_changes_with_number()
    {
        var first = WsfeCaeRequestBuilder.Fingerprint(Data, 3, 18, "30715489629");
        Assert.Equal(64, first.Length);
        Assert.Equal(first, WsfeCaeRequestBuilder.Fingerprint(Data, 3, 18, "30715489629"));
        Assert.NotEqual(first, WsfeCaeRequestBuilder.Fingerprint(Data, 3, 19, "30715489629"));
    }

    [Fact]
    public void Rejects_unreserved_number_or_missing_authentication()
    {
        Assert.Throws<ArgumentException>(() => WsfeCaeRequestBuilder.Build(Data, 3, 0, "30715489629", "token", "sign"));
        Assert.Throws<ArgumentException>(() => WsfeCaeRequestBuilder.Build(Data, 0, 18, "30715489629", "token", "sign"));
        Assert.Throws<ArgumentException>(() => WsfeCaeRequestBuilder.Build(Data, 3, 18, "20123456786", "", "sign"));
    }

    [Fact]
    public void Product_invoice_b_to_anonymous_consumer_omits_service_dates()
    {
        var data = new WsfeVoucherData(6, 1, 99, "0", 5, "20261002", null, null, null,
            100m, 0m, 0m, 21m, 0m, 121m, [new WsfeVatLine(5, 100m, 21m)], "PES", 1m, null,
            WsfeVoucherData.NoAssociated);
        var xml = WsfeCaeRequestBuilder.Build(data, 3, 18, "30715489629", "token", "sign");
        Assert.Contains("<ar:CbteTipo>6</ar:CbteTipo>", xml);
        Assert.Contains("<ar:DocTipo>99</ar:DocTipo><ar:DocNro>0</ar:DocNro>", xml);
        Assert.Contains("<ar:CondicionIVAReceptorId>5</ar:CondicionIVAReceptorId>", xml);
        Assert.DoesNotContain("FchServDesde", xml);
        Assert.DoesNotContain("CanMisMonExt", xml);
        XDocument.Parse(xml);
    }

    [Fact]
    public void Foreign_currency_declares_same_currency_payment()
    {
        var data = Data with { CurrencyCode = "DOL", ExchangeRate = 1450.5m, PaidInSameForeignCurrency = true };
        var xml = WsfeCaeRequestBuilder.Build(data, 3, 18, "30715489629", "token", "sign");
        Assert.Contains("<ar:MonId>DOL</ar:MonId><ar:MonCotiz>1450.5</ar:MonCotiz><ar:CanMisMonExt>S</ar:CanMisMonExt>", xml);
        Assert.Throws<ArgumentException>(() => WsfeCaeRequestBuilder.Build(
            data with { PaidInSameForeignCurrency = null }, 3, 18, "30715489629", "token", "sign"));
    }

    [Theory]
    [InlineData("classA-dni")]
    [InlineData("classB-ri")]
    [InlineData("note-without-associated")]
    [InlineData("vat-mismatch")]
    [InlineData("anonymous-with-number")]
    public void Invalid_combinations_never_build(string kind)
    {
        var data = kind switch
        {
            "classA-dni" => Data with { ReceiverDocumentType = 96, ReceiverDocumentNumber = "30123456" },
            "classB-ri" => Data with { VoucherType = 6 },
            "note-without-associated" => Data with { VoucherType = 3 },
            "vat-mismatch" => Data with { VatAmount = 0.18m, TotalAmount = 1.01m },
            _ => Data with { VoucherType = 6, ReceiverVatCondition = 5, ReceiverDocumentType = 99 }
        };
        Assert.Throws<ArgumentException>(() => WsfeCaeRequestBuilder.Build(data, 3, 18, "30715489629", "token", "sign"));
    }
}
