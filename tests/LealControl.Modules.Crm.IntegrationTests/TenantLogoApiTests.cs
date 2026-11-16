using System.Net;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>El logo de la empresa baja como imagen aparte (selector del login), sin sesión y cacheable.</summary>
public sealed class TenantLogoApiTests : IAsyncLifetime
{
    private readonly CrmWebApplicationFactory _factory = new();
    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    [Fact]
    public async Task Tenant_logo_is_served_as_an_image_without_session()
    {
        using var authed = _factory.CreateAuthenticatedClient();
        (await authed.GetAsync("/api/v1/company/settings")).EnsureSuccessStatusCode();
        var png = new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A };
        await using (var db = new NpgsqlConnection(_factory.Services.GetRequiredService<IConfiguration>().GetConnectionString("Database")))
        {
            await db.OpenAsync();
            await using var cmd = new NpgsqlCommand("""UPDATE public.tenant_settings SET "LogoUrl" = @logo WHERE "TenantId" = @tenant""", db);
            cmd.Parameters.AddWithValue("logo", "data:image/png;base64," + Convert.ToBase64String(png));
            cmd.Parameters.AddWithValue("tenant", CrmWebApplicationFactory.DemoTenantId);
            Assert.Equal(1, await cmd.ExecuteNonQueryAsync());
        }

        using var anonymous = _factory.CreateClient();
        using var response = await anonymous.GetAsync($"/api/v1/public/tenants/{CrmWebApplicationFactory.DemoTenantId}/logo");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("image/png", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal(png, await response.Content.ReadAsByteArrayAsync());
        Assert.Contains("max-age", response.Headers.CacheControl?.ToString());

        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync($"/api/v1/public/tenants/{Guid.NewGuid()}/logo")).StatusCode);
    }
}
