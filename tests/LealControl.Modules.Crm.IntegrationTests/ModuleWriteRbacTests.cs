using System.Net;
using System.Text;
using FluentAssertions;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class ModuleWriteRbacTests : IAsyncLifetime
{
    private readonly CrmWebApplicationFactory _factory = new();

    public Task InitializeAsync() => _factory.InitializeAsync();

    public Task DisposeAsync() => _factory.DisposeAsync();

    [Fact]
    public async Task Comercial_user_cannot_create_finance_account()
    {
        var client = _factory.CreateAuthenticatedClient(role: "Comercial");
        using var content = new StringContent(
            """{"name":"Caja Test","currency":"ARS","type":1,"openingBalance":0}""",
            Encoding.UTF8,
            "application/json");
        var response = await client.PostAsync("/api/v1/finance/accounts", content);
        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Comercial_user_cannot_create_purchase_order()
    {
        var client = _factory.CreateAuthenticatedClient(role: "Comercial");
        using var content = new StringContent(
            """{"supplierId":null,"supplierName":"Proveedor","currency":"ARS","lines":[]}""",
            Encoding.UTF8,
            "application/json");
        var response = await client.PostAsync("/api/v1/purchases/orders", content);
        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }
}
