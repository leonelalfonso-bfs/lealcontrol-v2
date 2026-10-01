using LealControl.Modules.Crm.Infrastructure.Arca;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class WsfeVoucherLookupParserTests
{
    private const string Valid = "<Envelope><Body><FECompConsultarResult><ResultGet><PtoVta>5</PtoVta><CbteTipo>1</CbteTipo><CbteDesde>44</CbteDesde><CbteHasta>44</CbteHasta><DocNro>20123456786</DocNro><ImpTotal>1.00</ImpTotal><Resultado>A</Resultado><CodAutorizacion>12345678901234</CodAutorizacion><EmisionTipo>CAE</EmisionTipo><FchVto>20261015</FchVto></ResultGet></FECompConsultarResult></Body></Envelope>";

    [Fact]
    public void Confirms_cae_and_fields_of_the_requested_voucher()
    {
        var result = WsfeVoucherLookupParser.Parse(Valid, 5, 1, 44);
        Assert.True(result.Confirmed);
        Assert.Equal(44, result.Number);
        Assert.Equal("20123456786", result.RecipientDocument);
        Assert.Equal(1m, result.Total);
        Assert.Equal("12345678901234", result.Cae);
    }

    [Fact]
    public void Does_not_confirm_a_different_voucher()
    {
        Assert.False(WsfeVoucherLookupParser.Parse(Valid, 5, 1, 45).Confirmed);
        Assert.False(WsfeVoucherLookupParser.Parse(Valid, 6, 1, 44).Confirmed);
    }

    [Fact]
    public void Does_not_treat_errors_or_missing_data_as_absence()
    {
        Assert.False(WsfeVoucherLookupParser.Parse("<Envelope><FECompConsultarResult><Errors><Err><Msg>error</Msg></Err></Errors></FECompConsultarResult></Envelope>", 5, 1, 44).Confirmed);
        Assert.False(WsfeVoucherLookupParser.Parse("<Envelope><FECompConsultarResult/></Envelope>", 5, 1, 44).Confirmed);
        Assert.False(WsfeVoucherLookupParser.Parse("not xml", 5, 1, 44).Confirmed);
    }
}
