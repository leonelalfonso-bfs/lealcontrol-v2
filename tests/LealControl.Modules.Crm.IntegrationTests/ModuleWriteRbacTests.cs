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
            """{"name":"Caja Test","currency":"ARS","type":"Cash","openingBalance":0}""",
            Encoding.UTF8,
            "application/json");
        var response = await client.PostAsync("/api/v1/finance/accounts", content);
        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Comercial_user_cannot_create_purchase_order()
    {
        var client = _factory.CreateAuthenticatedClient(role: "Comercial");
        var supplierId = Guid.NewGuid();
        using var content = new StringContent(
            $$"""
            {
              "supplierId":"{{supplierId}}",
              "supplierName":"Proveedor",
              "supplierDocument":"30111222333",
              "currency":"ARS",
              "exchangeRate":1,
              "items":[{"code":"P1","description":"Item","quantity":1,"unitPrice":10,"discountPercent":0,"taxRate":21}]
            }
            """,
            Encoding.UTF8,
            "application/json");
        var response = await client.PostAsync("/api/v1/purchases/orders", content);
        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }
}
