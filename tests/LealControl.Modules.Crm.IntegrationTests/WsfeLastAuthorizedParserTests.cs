using LealControl.Modules.Crm.Infrastructure.Arca;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class WsfeLastAuthorizedParserTests
{
    [Fact]
    public void Reads_number_for_requested_point_and_type()
    {
        const string xml = "<Envelope><Body><FECompUltimoAutorizadoResponse><FECompUltimoAutorizadoResult><PtoVta>5</PtoVta><CbteTipo>1</CbteTipo><CbteNro>43</CbteNro></FECompUltimoAutorizadoResult></FECompUltimoAutorizadoResponse></Body></Envelope>";
        var result = WsfeLastAuthorizedParser.Parse(xml, 5, 1);
        Assert.True(result.Ok);
        Assert.Equal(43, result.LastNumber);
    }

    [Fact]
    public void Rejects_response_for_another_sales_point()
    {
        const string xml = "<Envelope><Body><FECompUltimoAutorizadoResult><PtoVta>9</PtoVta><CbteTipo>1</CbteTipo><CbteNro>43</CbteNro></FECompUltimoAutorizadoResult></Body></Envelope>";
        Assert.False(WsfeLastAuthorizedParser.Parse(xml, 5, 1).Ok);
    }

    [Fact]
    public void Rejects_errors_even_if_number_is_present()
    {
        const string xml = "<Envelope><Body><FECompUltimoAutorizadoResult><PtoVta>5</PtoVta><CbteTipo>1</CbteTipo><CbteNro>43</CbteNro><Errors><Err><Msg>Punto de venta inválido</Msg></Err></Errors></FECompUltimoAutorizadoResult></Body></Envelope>";
        Assert.False(WsfeLastAuthorizedParser.Parse(xml, 5, 1).Ok);
    }
}
