using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class AuthSecurityTests : IAsyncLifetime
{
    private readonly CrmWebApplicationFactory _factory = CrmWebApplicationFactory.ForEnvironment("Production");

    public Task InitializeAsync() => _factory.InitializeAsync();

    public Task DisposeAsync() => _factory.DisposeAsync();

    [Fact]
    public async Task Login_does_not_create_development_admin_in_production()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            email = "admin@lealcontrol.com",
            password = "admin123"
        });

        response.StatusCode.Should().NotBe(HttpStatusCode.OK);
    }
}