using System.Security.Claims;
using LealControl.Modules.Crm.Contracts.Fiscal;
using LealControl.Modules.Sales.Infrastructure.Fiscal;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class ArcaFiscalGatewayTests : IAsyncLifetime
{
    private readonly CrmWebApplicationFactory _factory = new();
    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    [Fact]
    public async Task Tenant_without_certificate_cannot_submit_or_confirm_voucher()
    {
        using var client = _factory.CreateAuthenticatedClient();
        using var scope = _factory.Services.CreateScope();
        var accessor = scope.ServiceProvider.GetRequiredService<IHttpContextAccessor>();
        var context = new DefaultHttpContext();
        context.User = new ClaimsPrincipal(new ClaimsIdentity(
        [
            new Claim("tenant_id", CrmWebApplicationFactory.DemoTenantId.ToString()),
            new Claim(ClaimTypes.Role, "Admin")
        ], "Test"));
        accessor.HttpContext = context;
        try
        {
            var gateway = scope.ServiceProvider.GetRequiredService<IArcaFiscalGateway>();
            var numbering = await gateway.GetLastAuthorizedAsync(1, 1, CancellationToken.None);
            Assert.False(numbering.Ok);

            var data = new WsfeInvoiceAServicePreparation.Data(
                "20123456786", 80, 1, 1, 2, "20261002", "20261001", "20261002",
                "20261010", 0.83m, 0.17m, 1.00m, 5, "PES", 1m);
            var submission = await gateway.SubmitCaeAsync(data, 1, 1,
                "30715489629", false, CancellationToken.None);
            Assert.Equal(WsfeCaeOutcome.Unknown, submission.Outcome);

            var observation = await gateway.GetVoucherAsync(1, 1, 1,
                "30715489629", false, CancellationToken.None);
            Assert.False(observation.Confirmed);
        }
        finally
        {
            accessor.HttpContext = null;
        }
    }

    [Fact]
    public async Task Invalid_numbering_is_rejected_before_authentication()
    {
        using var client = _factory.CreateAuthenticatedClient();
        using var scope = _factory.Services.CreateScope();
        var gateway = scope.ServiceProvider.GetRequiredService<IArcaFiscalGateway>();
        Assert.False((await gateway.GetLastAuthorizedAsync(0, 1, CancellationToken.None)).Ok);
        Assert.False((await gateway.GetLastAuthorizedAsync(1, 6, CancellationToken.None)).Ok);
        Assert.False((await gateway.GetVoucherAsync(1, 1, 0,
            "30715489629", false, CancellationToken.None)).Confirmed);
    }
}
