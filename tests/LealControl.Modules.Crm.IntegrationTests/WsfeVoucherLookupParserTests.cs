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
    [InlineData("<Concepto>2</Concepto>", "<Concepto>1</Concepto>")]
    [InlineData("<ImpNeto>0.83</ImpNeto>", "<ImpNeto>0.84</ImpNeto>")]
    [InlineData("<MonId>PES</MonId>", "<MonId>DOL</MonId>")]
    [InlineData("<FchServDesde>20261001</FchServDesde>", "")]
    [InlineData("<AlicIva><Id>5</Id>", "<AlicIva><Id>4</Id>")]
    public void Rejects_incomplete_or_inconsistent_fiscal_profile(string original, string replacement)
    {
        Assert.False(WsfeVoucherLookupParser.Parse(Valid.Replace(original, replacement), 5, 1, 44).Confirmed);
    }

    [Fact]
    public void Does_not_treat_errors_or_missing_data_as_absence()
    {
        Assert.False(WsfeVoucherLookupParser.Parse("<Envelope><FECompConsultarResult><Errors><Err><Msg>error</Msg></Err></Errors></FECompConsultarResult></Envelope>", 5, 1, 44).Confirmed);
        Assert.False(WsfeVoucherLookupParser.Parse("<Envelope><FECompConsultarResult/></Envelope>", 5, 1, 44).Confirmed);
        Assert.False(WsfeVoucherLookupParser.Parse("not xml", 5, 1, 44).Confirmed);
    }
}
