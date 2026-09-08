using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using FluentAssertions;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class TenantProvisioningTests : IAsyncLifetime
{
    private const string SuperAdminEmail = "superadmin.integration@lealcontrol.local";
    private const string SuperAdminPassword = "IntegrationSuperAdmin!2026";
    private const string TenantAdminPassword = "IntegrationTenant!2026";

    private readonly CrmWebApplicationFactory _factory = CrmWebApplicationFactory.WithSettings(
        "Development",
        new Dictionary<string, string>
        {
            ["SUPERADMIN_BOOTSTRAP_EMAIL"] = SuperAdminEmail,
            ["SUPERADMIN_BOOTSTRAP_PASSWORD"] = SuperAdminPassword
        });

    public Task InitializeAsync() => _factory.InitializeAsync();

    public Task DisposeAsync() => _factory.DisposeAsync();

    [Fact]
    public async Task SuperAdmin_provisioned_tenant_admin_can_login_and_load_me()
    {
        var client = _factory.CreateClient();
        var stamp = Guid.NewGuid().ToString("N")[..8];
        var tenantName = $"Empresa Integracion {stamp}";
        var slug = $"empresa-integracion-{stamp}";
        var adminEmail = $"admin-{stamp}@integration.local";

        var superLogin = await client.PostAsJsonAsync("/api/v1/superadmin/auth/login", new
        {
            email = SuperAdminEmail,
            password = SuperAdminPassword
        });
        superLogin.StatusCode.Should().Be(HttpStatusCode.OK);
        var superAuth = await superLogin.Content.ReadFromJsonAsync<AuthEnvelope>();
        superAuth!.Token.Should().NotBeNullOrWhiteSpace();

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", superAuth.Token);
        var provision = await client.PostAsJsonAsync("/api/v1/superadmin/tenants", new
        {
            name = tenantName,
            slug,
            planCode = "pyme",
            adminFullName = "Administrador Integracion",
            adminEmail,
            adminPassword = TenantAdminPassword,
            adminPhone = "+5491100000000",
            monthlyPriceArs = 95000m,
            monthlyPriceUsd = 95m
        });
        provision.StatusCode.Should().Be(HttpStatusCode.Created);

        client.DefaultRequestHeaders.Authorization = null;
        var login = await client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            email = adminEmail,
            password = TenantAdminPassword
        });
        login.StatusCode.Should().Be(HttpStatusCode.OK);
        var tenantAuth = await login.Content.ReadFromJsonAsync<AuthEnvelope>();
        tenantAuth!.Token.Should().NotBeNullOrWhiteSpace();
        tenantAuth.Tenant!.Id.Should().NotBe(Guid.Empty);

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", tenantAuth.Token);
        client.DefaultRequestHeaders.Add("X-Tenant-Id", tenantAuth.Tenant.Id.ToString());
        var me = await client.GetAsync("/api/v1/auth/me");
        me.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    private sealed record AuthEnvelope(string Token, TenantEnvelope? Tenant);
    private sealed record TenantEnvelope(Guid Id, string LegalName, string? TradeName, string DocumentNumber);
}
