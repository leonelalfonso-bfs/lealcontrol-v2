using System.Net;
using LealControl.Api.Security;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace LealControl.Modules.Communications.Tests;

public sealed class CommunicationsInboxGateMiddlewareTests
{
    [Theory]
    [InlineData("/api/v1/communications", HttpStatusCode.NotFound)]
    [InlineData("/api/v1/communications/accounts-extra", HttpStatusCode.NotFound)]
    [InlineData("/api/v1/communications/conversations", HttpStatusCode.NotFound)]
    [InlineData("/api/v1/communications/whatsapp/send", HttpStatusCode.NotFound)]
    [InlineData("/api/v1/communications/meta/config", HttpStatusCode.NotFound)]
    [InlineData("/api/communications/whatsapp/webhook", HttpStatusCode.OK)]
    [InlineData("/api/communications/meta/webhook", HttpStatusCode.OK)]
    [InlineData("/api/communications/public/media/123", HttpStatusCode.OK)]
    [InlineData("/api/v1/communications/accounts", HttpStatusCode.OK)]
    [InlineData("/api/v1/communications/accounts/123/send", HttpStatusCode.OK)]
    [InlineData("/api/v1/communications/messages", HttpStatusCode.OK)]
    [InlineData("/api/v1/sales/quotes", HttpStatusCode.OK)]
    public async Task DisabledInboxBlocksOnlyInboxRoutes(string path, HttpStatusCode expected)
    {
        using var server = Server(false);
        using var response = await server.CreateClient().GetAsync(path);
        Assert.Equal(expected, response.StatusCode);
    }

    [Fact]
    public async Task MissingSettingKeepsInboxClosed()
    {
        using var server = Server(null);
        using var response = await server.CreateClient().GetAsync("/api/v1/communications/conversations");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Theory]
    [InlineData("/api/v1/communications/conversations")]
    [InlineData("/api/communications/meta/webhook")]
    public async Task EnabledInboxAllowsInboxRoutes(string path)
    {
        using var server = Server(true);
        using var response = await server.CreateClient().GetAsync(path);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    private static TestServer Server(bool? enabled) => new(new WebHostBuilder()
        .ConfigureAppConfiguration((_, builder) => builder.AddInMemoryCollection(enabled.HasValue
            ? new Dictionary<string, string?> { ["Communications:InboxEnabled"] = enabled.Value.ToString() }
            : new Dictionary<string, string?>()))
        .Configure(app =>
        {
            app.UseMiddleware<CommunicationsInboxGateMiddleware>();
            app.Run(context =>
            {
                context.Response.StatusCode = StatusCodes.Status200OK;
                return Task.CompletedTask;
            });
        }));
}
