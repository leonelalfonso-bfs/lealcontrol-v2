using System.Net;
using LealControl.Modules.Crm.Infrastructure.Arca;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class ArcaPadronBusinessErrorTests
{
    private sealed class Transport(string body) : HttpMessageHandler, IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(this, disposeHandler: false);
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) =>
            Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(body) });
    }

    [Theory]
    [InlineData("errorConstancia")]
    [InlineData("errorRegimenGeneral")]
    [InlineData("errorMonotributo")]
    public async Task Missing_person_data_reports_the_official_business_reason(string block)
    {
        using var transport = new Transport($"<Envelope><Body><personaReturn><{block}>" +
            $"<error>No existe persona con ese Id</error><idPersona>20123456786</idPersona></{block}>" +
            "</personaReturn></Body></Envelope>");
        var client = new ArcaPadronClient(transport, NullLogger<ArcaPadronClient>.Instance);
        var result = await client.GetPersonaAsync("fake-token", "fake-sign", "20123456786", "30715489629", false, default);
        Assert.False(result.IsSuccess);
        Assert.Equal("ARCA respondió: No existe persona con ese Id", result.Error.Message);
        Assert.DoesNotContain("sin razón social", result.Error.Message);
        Assert.DoesNotContain("fake-token", result.Error.Message);
    }

    [Fact]
    public async Task Optional_tax_block_error_does_not_discard_available_person_data()
    {
        using var transport = new Transport("<Envelope><Body><personaReturn>" +
            "<datosGenerales><razonSocial>Cliente prueba</razonSocial></datosGenerales>" +
            "<errorMonotributo><error>No registra monotributo</error></errorMonotributo>" +
            "</personaReturn></Body></Envelope>");
        var client = new ArcaPadronClient(transport, NullLogger<ArcaPadronClient>.Instance);
        var result = await client.GetPersonaAsync("test", "test", "20123456786", "30715489629", false, default);
        Assert.True(result.IsSuccess);
    }
}
