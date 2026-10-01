using System.Net;
using FluentAssertions;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class ArcaLastAuthorizedApiTests : IAsyncLifetime
{
    private readonly CrmWebApplicationFactory _factory = new();

    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    [Fact]
    public async Task Commercial_user_cannot_query_official_numbering()
    {
        var client = _factory.CreateAuthenticatedClient(role: "Comercial");
        var response = await client.GetAsync(
            "/api/v1/company/settings/arca-last-authorized?pointOfSale=1&invoiceType=A");
        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Theory]
    [InlineData(0, "A")]
    [InlineData(99999, "A")]
    [InlineData(1, "M")]
    public async Task Admin_invalid_query_is_rejected_before_contacting_Arca(int point, string type)
    {
        var client = _factory.CreateAuthenticatedClient(role: "Admin");
        var response = await client.GetAsync(
            $"/api/v1/company/settings/arca-last-authorized?pointOfSale={point}&invoiceType={type}");
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }
}
