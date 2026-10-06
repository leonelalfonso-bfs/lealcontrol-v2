using System.Net;
using LealControl.Modules.Crm.Infrastructure.Arca;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class ArcaPadronFaultTests
{
    private sealed class Transport(HttpStatusCode status, string body) : HttpMessageHandler, IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(this, disposeHandler: false);
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) =>
            Task.FromResult(new HttpResponseMessage(status) { Content = new StringContent(body) });
    }

    [Theory]
    [InlineData(200)]
    [InlineData(500)]
    public async Task Soap_fault_exposes_the_reason_even_with_http_500(int status)
    {
        using var transport = new Transport((HttpStatusCode)status,
            "<soap:Envelope xmlns:soap='http://schemas.xmlsoap.org/soap/envelope/'><soap:Body><soap:Fault>" +
            "<faultcode>soap:Server</faultcode><faultstring>ValidacionDeToken: CUIT no autorizado</faultstring>" +
            "</soap:Fault></soap:Body></soap:Envelope>");
        var client = new ArcaPadronClient(transport, NullLogger<ArcaPadronClient>.Instance);
        var result = await client.GetPersonaAsync("secret-test-token", "secret-test-sign", "20123456786", "30715489629", false, default);
        Assert.False(result.IsSuccess);
        Assert.Contains("ValidacionDeToken: CUIT no autorizado", result.Error.Message);
        Assert.DoesNotContain("secret-test", result.Error.Message);
        Assert.DoesNotContain("Envelope", result.Error.Message);
    }

    [Fact]
    public async Task Non_soap_http_failure_does_not_expose_the_response_body()
    {
        using var transport = new Transport(HttpStatusCode.InternalServerError, "<html>private proxy details</html>");
        var client = new ArcaPadronClient(transport, NullLogger<ArcaPadronClient>.Instance);
        var result = await client.GetPersonaAsync("test", "test", "20123456786", "30715489629", false, default);
        Assert.False(result.IsSuccess);
        Assert.Equal("Constancia de inscripción HTTP 500.", result.Error.Message);
        Assert.DoesNotContain("private proxy", result.Error.Message);
    }
}
