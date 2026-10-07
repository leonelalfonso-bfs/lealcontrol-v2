using System.Net;
using LealControl.Modules.Crm.Contracts.Fiscal;
using LealControl.Modules.Crm.Infrastructure.Arca;
using LealControl.Modules.Sales.Infrastructure.Fiscal;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class WsfeCaeTransportTests
{
    private static readonly WsfeVoucherData Data = FiscalTestData.ServiceA(due: "20261010");

    [Fact]
    public async Task Approved_http_response_is_only_pending_consultation()
    {
        var calls = 0;
        var handler = new Handler(async request =>
        {
            calls++;
            Assert.Equal(HttpMethod.Post, request.Method);
            Assert.Equal("https://wswhomo.afip.gov.ar/wsfev1/service.asmx", request.RequestUri?.ToString());
            Assert.Contains("FECAESolicitar", request.Headers.GetValues("SOAPAction").Single());
            var body = await request.Content!.ReadAsStringAsync();
            Assert.Contains("<ar:CbteDesde>42</ar:CbteDesde>", body);
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(ApprovedXml)
            };
        });
        var transport = Create(handler);
        var reply = await transport.SubmitAsync("token", "sign", "30715489629", false,
            Data, 3, 42, CancellationToken.None);
        Assert.Equal(1, calls);
        Assert.Equal(WsfeCaeOutcome.ApprovedPendingConsultation, reply.Outcome);
        Assert.Equal("12345678901234", reply.Cae);
    }

    [Fact]
    public async Task Http_failure_is_unknown_without_retry()
    {
        var calls = 0;
        var transport = Create(new Handler(_ =>
        {
            calls++;
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.ServiceUnavailable));
        }));
        var reply = await transport.SubmitAsync("token", "sign", "30715489629", true,
            Data, 3, 42, CancellationToken.None);
        Assert.Equal(1, calls);
        Assert.Equal(WsfeCaeOutcome.Unknown, reply.Outcome);
    }

    [Fact]
    public async Task Network_exception_is_unknown_without_retry()
    {
        var calls = 0;
        var transport = Create(new Handler(_ =>
        {
            calls++;
            throw new HttpRequestException("simulated network loss");
        }));
        var reply = await transport.SubmitAsync("token", "sign", "30715489629", false,
            Data, 3, 42, CancellationToken.None);
        Assert.Equal(1, calls);
        Assert.Equal(WsfeCaeOutcome.Unknown, reply.Outcome);
    }

    private static WsfeCaeTransport Create(HttpMessageHandler handler) =>
        new(new Factory(new HttpClient(handler)), NullLogger<WsfeCaeTransport>.Instance);

    private sealed class Factory(HttpClient client) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name)
        {
            Assert.Equal("arca", name);
            return client;
        }
    }

    private sealed class Handler(Func<HttpRequestMessage, Task<HttpResponseMessage>> action)
        : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken) => action(request);
    }

    private const string ApprovedXml = """
        <Envelope><Body><FECAESolicitarResult>
        <FeCabResp><PtoVta>3</PtoVta><CbteTipo>1</CbteTipo><CantReg>1</CantReg><Resultado>A</Resultado></FeCabResp>
        <FeDetResp><FECAEDetResponse>
        <CbteDesde>42</CbteDesde><CbteHasta>42</CbteHasta><DocTipo>80</DocTipo>
        <Concepto>2</Concepto><DocNro>20123456786</DocNro><CbteFch>20261002</CbteFch>
        <Resultado>A</Resultado><CAE>12345678901234</CAE><CAEFchVto>20261012</CAEFchVto>
        </FECAEDetResponse></FeDetResp>
        </FECAESolicitarResult></Body></Envelope>
        """;
}
