using System.Net.Http.Headers;
using System.Collections.Generic;
using LealControl.Modules.Crm.Infrastructure.Http;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Testcontainers.PostgreSql;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class CrmWebApplicationFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public static readonly Guid DemoTenantId = Guid.Parse("11111111-1111-1111-1111-111111111111");

    private readonly string _environment;
    private readonly Dictionary<string, string> _settings;

    public CrmWebApplicationFactory()
        : this("Development")
    {
    }

    public static CrmWebApplicationFactory ForEnvironment(string environment) => new(environment);

    public static CrmWebApplicationFactory WithSettings(string environment, Dictionary<string, string> settings) => new(environment, settings);

    private CrmWebApplicationFactory(string environment, Dictionary<string, string>? settings = null)
    {
        _environment = environment;
        _settings = settings ?? [];
    }

    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder()
        .WithImage("postgres:16-alpine")
        .WithDatabase("lealcontrol_tests")
        .WithUsername("leal")
        .WithPassword("leal")
        .Build();

    public async Task InitializeAsync() => await _postgres.StartAsync();

    public new async Task DisposeAsync()
    {
        await _postgres.DisposeAsync();
        await base.DisposeAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(_environment);
        builder.UseSetting("ConnectionStrings:Database", _postgres.GetConnectionString());
        builder.UseSetting("Jwt:Secret", "DevOnly_LealControl_Local_JWT_Key_Not_For_Production_Use_32b!");
        builder.UseSetting("Jwt:Issuer", "lealcontrol");
        builder.UseSetting("Jwt:Audience", "lealcontrol-web");
        builder.UseSetting("Jwt:LifetimeHours", "8");
        foreach (var setting in _settings)
        {
            builder.UseSetting(setting.Key, setting.Value);
        }
    }

    public HttpClient CreateAuthenticatedClient(Guid? tenantId = null, string role = "Admin")
    {
        var client = CreateClient();
        var tid = tenantId ?? DemoTenantId;
        var token = SimpleJwt.CreateToken(Guid.NewGuid(), "it@lealcontrol.com", "IT Admin", role, tid, "Empresa Test");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }
}
