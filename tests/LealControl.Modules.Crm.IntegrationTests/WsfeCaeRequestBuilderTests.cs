using LealControl.Modules.Crm.Contracts.Fiscal;
using System;
using System.Linq;
using System.Xml.Linq;
using LealControl.Modules.Sales.Infrastructure.Fiscal;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class WsfeCaeRequestBuilderTests
{
    private static readonly WsfeInvoiceAServicePreparation.Data Data = new(
        "20123456786", 80, 1, 1, 2, "20261002", "20261001", "20261002", "20261012",
        0.83m, 0.17m, 1.00m, 5, "PES", 1m);

    [Fact]
    public void Emits_one_well_formed_invoice_with_reserved_number_and_one_peso()
    {
        var xml = WsfeCaeRequestBuilder.Build(Data, 3, 18, "20123456786", "token&demo", "sign<demo");
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
        var first = WsfeCaeRequestBuilder.Fingerprint(Data, 3, 18, "20123456786");
        Assert.Equal(64, first.Length);
        Assert.Equal(first, WsfeCaeRequestBuilder.Fingerprint(Data, 3, 18, "20123456786"));
        Assert.NotEqual(first, WsfeCaeRequestBuilder.Fingerprint(Data, 3, 19, "20123456786"));
    }

    [Fact]
    public void Rejects_unreserved_number_or_missing_authentication()
    {
        Assert.Throws<ArgumentException>(() => WsfeCaeRequestBuilder.Build(Data, 3, 0, "20123456786", "token", "sign"));
        Assert.Throws<ArgumentException>(() => WsfeCaeRequestBuilder.Build(Data, 0, 18, "20123456786", "token", "sign"));
        Assert.Throws<ArgumentException>(() => WsfeCaeRequestBuilder.Build(Data, 3, 18, "20123456786", "", "sign"));
    }
}
