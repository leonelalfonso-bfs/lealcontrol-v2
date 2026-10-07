using LealControl.Modules.Crm.Contracts.Fiscal;
using LealControl.Modules.Sales.Infrastructure.Fiscal;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class WsfeCaeResponseParserTests
{
    private const string ValidDetail = "<Concepto>2</Concepto><DocTipo>80</DocTipo><DocNro>20123456786</DocNro>" +
        "<CbteDesde>18</CbteDesde><CbteHasta>18</CbteHasta><CbteFch>20261002</CbteFch>" +
        "<Resultado>A</Resultado><CAE>12345678901234</CAE><CAEFchVto>20261012</CAEFchVto>";

    private static string Response(string header, string details, string errors = "") =>
        $"<Envelope><Body><FECAESolicitarResult><FeCabResp><CantReg>1</CantReg><PtoVta>1</PtoVta><CbteTipo>1</CbteTipo><Resultado>{header}</Resultado></FeCabResp><FeDetResp>{details}</FeDetResp>{errors}</FECAESolicitarResult></Body></Envelope>";

    private static WsfeCaeReply Parse(string xml) =>
        WsfeCaeResponseParser.Parse(xml, 1, 1, 18, 2, 80, "20123456786", "20261002");

    [Fact]
    public void Approval_requires_follow_up_consultation()
    {
        var reply = Parse(Response("A", $"<FECAEDetResponse>{ValidDetail}</FECAEDetResponse>"));
        Assert.Equal(WsfeCaeOutcome.ApprovedPendingConsultation, reply.Outcome);
        Assert.Equal("12345678901234", reply.Cae);
        Assert.NotNull(reply.CaeDueDate);
    }

    [Fact]
    public void Clear_rejection_is_not_approval()
    {
        var rejected = ValidDetail.Replace("<Resultado>A</Resultado>", "<Resultado>R</Resultado>")
            .Replace("<CAE>12345678901234</CAE>", "<CAE></CAE>");
        Assert.Equal(WsfeCaeOutcome.Rejected,
            Parse(Response("R", $"<FECAEDetResponse>{rejected}</FECAEDetResponse>")).Outcome);
    }

    [Fact]
    public void General_rejection_is_distinguished()
    {
        var xml = Response("R", "", "<Errors><Err><Code>1005</Code></Err></Errors>");
        Assert.Equal(WsfeCaeOutcome.Rejected, Parse(xml).Outcome);
    }

    [Theory]
    [InlineData("<CbteDesde>19</CbteDesde>", "<CbteDesde>18</CbteDesde>")]
    [InlineData("<DocNro>20123456780</DocNro>", "<DocNro>20123456786</DocNro>")]
    [InlineData("<Concepto>1</Concepto>", "<Concepto>2</Concepto>")]
    [InlineData("<CAE>123</CAE>", "<CAE>12345678901234</CAE>")]
    public void Mismatched_or_incomplete_approval_is_unknown(string replacement, string original)
    {
        var detail = ValidDetail.Replace(original, replacement);
        Assert.Equal(WsfeCaeOutcome.Unknown,
            Parse(Response("A", $"<FECAEDetResponse>{detail}</FECAEDetResponse>")).Outcome);
    }

    [Fact]
    public void Multiple_details_are_unknown()
    {
        var detail = $"<FECAEDetResponse>{ValidDetail}</FECAEDetResponse>";
        Assert.Equal(WsfeCaeOutcome.Unknown, Parse(Response("A", detail + detail)).Outcome);
    }

    [Fact]
    public void Soap_fault_and_untrusted_xml_are_unknown()
    {
        Assert.Equal(WsfeCaeOutcome.Unknown, Parse("<Envelope><Fault><faultstring>Error</faultstring></Fault></Envelope>").Outcome);
        Assert.Equal(WsfeCaeOutcome.Unknown, Parse("<Envelope").Outcome);
        Assert.Equal(WsfeCaeOutcome.Unknown, Parse("<!DOCTYPE a [<!ENTITY x SYSTEM 'file:///etc/passwd'>]><a>&x;</a>").Outcome);
    }
}
