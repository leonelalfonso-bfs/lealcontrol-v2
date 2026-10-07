using LealControl.Modules.Crm.Infrastructure.Arca;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class WsfecredObligationParserTests
{
    [Fact]
    public void Reads_obligation_and_minimum_amount()
    {
        const string body = "<soap:Envelope xmlns:soap=\"http://schemas.xmlsoap.org/soap/envelope/\"><soap:Body><ns2:consultarMontoObligadoRecepcionResponse xmlns:ns2=\"http://ar.gob.afip.wsfecred/FECredService/\"><consultarMontoObligadoRecepcionReturn><obligado>S</obligado><montoDesde>5549862.00</montoDesde></consultarMontoObligadoRecepcionReturn></ns2:consultarMontoObligadoRecepcionResponse></soap:Body></soap:Envelope>";
        var result = WsfecredObligationParser.Parse(body);
        Assert.True(result.Ok);
        Assert.True(result.Obligated);
        Assert.Equal(5549862m, result.MinimumAmount);
    }

    [Fact]
    public void Not_obligated_and_errors_are_distinguished()
    {
        var no = WsfecredObligationParser.Parse("<Envelope><Body><r><respuesta>N</respuesta></r></Body></Envelope>");
        Assert.True(no.Ok);
        Assert.False(no.Obligated);

        var error = WsfecredObligationParser.Parse("<Envelope><Body><r><arrayErrores><codigoDescripcion><codigo>1000</codigo><descripcion>LA CUIT NO SE ENCUENTRA ACTIVA</descripcion></codigoDescripcion></arrayErrores></r></Body></Envelope>");
        Assert.False(error.Ok);
        Assert.Contains("NO SE ENCUENTRA ACTIVA", error.Detail);

        var observed = WsfecredObligationParser.Parse("<Envelope><Body><r><arrayObservacion><codigoDescripcion><codigo>1</codigo><descripcion>Sin datos para la fecha</descripcion></codigoDescripcion></arrayObservacion></r></Body></Envelope>");
        Assert.False(observed.Ok);
        Assert.Contains("Sin datos", observed.Detail);
        Assert.False(WsfecredObligationParser.Parse("<Envelope><Body><soap:Fault xmlns:soap=\"x\"><faultstring>Token vencido</faultstring></soap:Fault></Body></Envelope>").Ok);
    }
}
