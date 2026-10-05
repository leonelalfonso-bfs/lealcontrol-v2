using System.Net;
using System.Xml.Linq;
using LealControl.Modules.Crm.Infrastructure.Arca;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class ArcaPadronEndpointTests
{
    private sealed class Transport : HttpMessageHandler, IHttpClientFactory
    {
        internal Uri? Url;
        internal string? Body;
        public HttpClient CreateClient(string name) => new(this, disposeHandler: false);
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Url = request.RequestUri;
            Body = await request.Content!.ReadAsStringAsync(ct);
            return new(HttpStatusCode.OK) { Content = new StringContent(
                "<Envelope><Body><razonSocial>Cliente de prueba</razonSocial></Body></Envelope>") };
        }
    }

    [Theory]
    [InlineData(false, "https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5")]
    [InlineData(true, "https://aws.arca.gob.ar/sr-padron/webservices/personaServiceA5")]
    public async Task Lookup_uses_the_endpoint_of_the_selected_environment_and_the_represented_cuit(
        bool production, string expectedUrl)
    {
        using var transport = new Transport();
        var client = new ArcaPadronClient(transport, NullLogger<ArcaPadronClient>.Instance);
        var result = await client.GetPersonaAsync("fake-token", "fake-sign", "20123456786",
            "30715489629", production, default);
        Assert.True(result.IsSuccess);
        Assert.Equal(expectedUrl, transport.Url!.AbsoluteUri);
        var xml = XDocument.Parse(transport.Body!);
        Assert.Equal("20123456786", xml.Descendants().Single(e => e.Name.LocalName == "cuitRepresentada").Value);
        Assert.Equal("30715489629", xml.Descendants().Single(e => e.Name.LocalName == "idPersona").Value);
    }
}
