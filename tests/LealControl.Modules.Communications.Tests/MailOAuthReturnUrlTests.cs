using LealControl.Modules.Communications.Infrastructure.Services;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace LealControl.Modules.Communications.Tests;

public sealed class MailOAuthReturnUrlTests
{
    private static MailOAuthService Service() => new(
        new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["FrontendBaseUrl"] = "https://erp.example.com"
        }).Build(),
        new MailSecretProtector(new EphemeralDataProtectionProvider()),
        null!);

    [Theory]
    [InlineData("/configuracion/comunicaciones", "https://erp.example.com/configuracion/comunicaciones?oauth=ok")]
    [InlineData("", "https://erp.example.com/configuracion/comunicaciones?oauth=ok")]
    [InlineData("https://evil.example/x", "https://erp.example.com/configuracion/comunicaciones?oauth=ok")]
    [InlineData("//evil.example/x", "https://erp.example.com/configuracion/comunicaciones?oauth=ok")]
    [InlineData("/\\evil.example", "https://erp.example.com/configuracion/comunicaciones?oauth=ok")]
    public void Return_url_stays_inside_the_erp(string returnPath, string expected) =>
        Assert.Equal(expected, Service().ResolveFrontendReturnUrl(returnPath, "oauth=ok"));
}
