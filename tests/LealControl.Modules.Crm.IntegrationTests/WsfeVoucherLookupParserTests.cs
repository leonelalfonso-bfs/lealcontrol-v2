using LealControl.Modules.Crm.Contracts.Fiscal;
using LealControl.Modules.Crm.Infrastructure.Arca;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class WsfeVoucherLookupParserTests
{
    private const string Valid = "<Envelope><Body><FECompConsultarResult><ResultGet><PtoVta>5</PtoVta><CbteTipo>1</CbteTipo><CbteDesde>44</CbteDesde><CbteHasta>44</CbteHasta><Concepto>2</Concepto><DocTipo>80</DocTipo><DocNro>20123456786</DocNro><CbteFch>20261002</CbteFch><ImpTotal>1.00</ImpTotal><ImpTotConc>0</ImpTotConc><ImpNeto>0.83</ImpNeto><ImpOpEx>0</ImpOpEx><ImpTrib>0</ImpTrib><ImpIVA>0.17</ImpIVA><FchServDesde>20261001</FchServDesde><FchServHasta>20261002</FchServHasta><FchVtoPago>20261012</FchVtoPago><MonId>PES</MonId><MonCotiz>1</MonCotiz><CondicionIVAReceptorId>1</CondicionIVAReceptorId><Iva><AlicIva><Id>5</Id><BaseImp>0.83</BaseImp><Importe>0.17</Importe></AlicIva></Iva><Resultado>A</Resultado><CodAutorizacion>12345678901234</CodAutorizacion><EmisionTipo>CAE</EmisionTipo><FchVto>20261015</FchVto></ResultGet></FECompConsultarResult></Body></Envelope>";

    [Fact]
    public void Confirms_cae_and_fields_of_the_requested_voucher()
    {
        var result = WsfeVoucherLookupParser.Parse(Valid, 5, 1, 44);
        Assert.True(result.Confirmed);
        Assert.Equal(44, result.Number);
        Assert.Equal("20123456786", result.RecipientDocument);
        Assert.Equal(1m, result.Total);
        Assert.Equal("12345678901234", result.Cae);
        Assert.NotNull(result.FiscalData);
        Assert.Equal(2, result.FiscalData.Concept);
        Assert.Equal(0.83m, result.FiscalData.NetAmount);
        Assert.Equal(0.17m, result.FiscalData.VatAmount);
    }

    [Fact]
    public void Does_not_confirm_a_different_voucher()
    {
        Assert.False(WsfeVoucherLookupParser.Parse(Valid, 5, 1, 45).Confirmed);
        Assert.False(WsfeVoucherLookupParser.Parse(Valid, 6, 1, 44).Confirmed);
    }

    [Theory]
    [InlineData("<CodAutorizacion>12345678901234</CodAutorizacion>", "<CodAutorizacion>123</CodAutorizacion>")]
    [InlineData("<Resultado>A</Resultado>", "<Resultado>R</Resultado>")]
    [InlineData("<ImpNeto>0.83</ImpNeto>", "")]
    [InlineData("<CondicionIVAReceptorId>1</CondicionIVAReceptorId>", "")]
    [InlineData("<Iva>", "<Tributos><Tributo><Id>7</Id></Tributo></Tributos><Iva>")]
    [InlineData("<AlicIva><Id>5</Id>", "<AlicIva>")]
    public void Rejects_incomplete_or_foreign_responses(string original, string replacement)
    {
        Assert.False(WsfeVoucherLookupParser.Parse(Valid.Replace(original, replacement), 5, 1, 44).Confirmed);
    }

    [Fact]
    public void Reads_product_voucher_b_with_several_rates_exempt_and_associated()
    {
        var xml = Valid
            .Replace("<CbteTipo>1</CbteTipo>", "<CbteTipo>8</CbteTipo>")
            .Replace("<Concepto>2</Concepto>", "<Concepto>1</Concepto>")
            .Replace("<DocTipo>80</DocTipo><DocNro>20123456786</DocNro>", "<DocTipo>99</DocTipo><DocNro>0</DocNro>")
            .Replace("<ImpTotal>1.00</ImpTotal>", "<ImpTotal>355.5</ImpTotal>")
            .Replace("<ImpNeto>0.83</ImpNeto>", "<ImpNeto>300</ImpNeto>")
            .Replace("<ImpOpEx>0</ImpOpEx>", "<ImpOpEx>10</ImpOpEx>")
            .Replace("<ImpIVA>0.17</ImpIVA>", "<ImpIVA>45.5</ImpIVA>")
            .Replace("<FchServDesde>20261001</FchServDesde><FchServHasta>20261002</FchServHasta><FchVtoPago>20261012</FchVtoPago>",
                "<FchServDesde></FchServDesde><FchServHasta></FchServHasta><FchVtoPago></FchVtoPago>")
            .Replace("<CondicionIVAReceptorId>1</CondicionIVAReceptorId>",
                "<CondicionIVAReceptorId>5</CondicionIVAReceptorId><CbtesAsoc><CbteAsoc><Tipo>6</Tipo><PtoVta>5</PtoVta><Nro>12</Nro></CbteAsoc></CbtesAsoc>")
            .Replace("<AlicIva><Id>5</Id><BaseImp>0.83</BaseImp><Importe>0.17</Importe></AlicIva>",
                "<AlicIva><Id>5</Id><BaseImp>200</BaseImp><Importe>42</Importe></AlicIva><AlicIva><Id>4</Id><BaseImp>100</BaseImp><Importe>10.5</Importe></AlicIva>");
        var result = WsfeVoucherLookupParser.Parse(xml, 5, 8, 44);
        Assert.True(result.Confirmed, result.Detail);
        var data = result.FiscalData!;
        Assert.Equal(1, data.Concept);
        Assert.Equal(99, data.ReceiverDocumentType);
        Assert.Equal("0", data.ReceiverDocumentNumber);
        Assert.Equal(5, data.ReceiverVatCondition);
        Assert.Null(data.ServiceFrom);
        Assert.Equal(300m, data.NetAmount);
        Assert.Equal(10m, data.ExemptAmount);
        Assert.Equal(2, data.VatLines.Count);
        Assert.Equal(12, Assert.Single(data.AssociatedVouchers).Number);
    }

    [Fact]
    public void Does_not_treat_errors_or_missing_data_as_absence()
    {
        Assert.False(WsfeVoucherLookupParser.Parse("<Envelope><FECompConsultarResult><Errors><Err><Msg>error</Msg></Err></Errors></FECompConsultarResult></Envelope>", 5, 1, 44).Confirmed);
        Assert.False(WsfeVoucherLookupParser.Parse("<Envelope><FECompConsultarResult/></Envelope>", 5, 1, 44).Confirmed);
        Assert.False(WsfeVoucherLookupParser.Parse("not xml", 5, 1, 44).Confirmed);
    }

    [Fact]
    public void Reads_official_exchange_rate_and_rejects_errors()
    {
        const string ok = "<Envelope><Body><FEParamGetCotizacionResponse><FEParamGetCotizacionResult><ResultGet><MonId>DOL</MonId><MonCotiz>1450.5</MonCotiz><FchCotiz>20261006</FchCotiz></ResultGet></FEParamGetCotizacionResult></FEParamGetCotizacionResponse></Body></Envelope>";
        var rate = WsfeExchangeRateParser.Parse(ok, "DOL");
        Assert.True(rate.Ok);
        Assert.Equal(1450.5m, rate.Rate);
        Assert.Equal("20261006", rate.RateDate);
        Assert.False(WsfeExchangeRateParser.Parse(ok.Replace("<MonId>DOL", "<MonId>060"), "DOL").Ok);
        Assert.False(WsfeExchangeRateParser.Parse(ok.Replace("</ResultGet>", "</ResultGet><Errors><Err><Code>12002</Code></Err></Errors>"), "DOL").Ok);
        Assert.False(WsfeExchangeRateParser.Parse("no xml", "DOL").Ok);
    }

    [Fact]
    public void Reads_fce_optionals()
    {
        var xml = Valid.Replace("<Resultado>A</Resultado>",
            "<Opcionales><Opcional><Id>2101</Id><Valor>0070123420000012345678</Valor></Opcional><Opcional><Id>27</Id><Valor>SCA</Valor></Opcional></Opcionales><Resultado>A</Resultado>");
        var result = WsfeVoucherLookupParser.Parse(xml, 5, 1, 44);
        Assert.True(result.Confirmed, result.Detail);
        Assert.Equal(2, result.FiscalData!.OptionalList.Count);
        Assert.Contains(new WsfeOptional("27", "SCA"), result.FiscalData.OptionalList);
    }
}
