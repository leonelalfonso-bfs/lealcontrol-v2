using System.Net.Http.Headers;
using LealControl.Modules.Crm.Infrastructure.Http;
using LealControl.Modules.Finance.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Testcontainers.PostgreSql;
using Xunit;

namespace LealControl.Modules.Finance.Tests;

public sealed class FinanceWebApplicationFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public static readonly Guid DemoTenantId = Guid.Parse("11111111-1111-1111-1111-111111111111");

    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder()
        .WithImage("postgres:16-alpine")
        .WithDatabase("lealcontrol_finance_tests")
        .WithUsername("leal")
        .WithPassword("leal")
        .Build();

    public string ConnectionString => _postgres.GetConnectionString();

    public async Task InitializeAsync()
    {
        await _postgres.StartAsync();
        await using var conn = new NpgsqlConnection(ConnectionString);
        await conn.OpenAsync();
        foreach (var schema in new[] { "crm", "sales", "purchases", "finance", "accounting", "metrology", "quality", "fleet", "hr", "directory" })
        {
            await using var cmd = new NpgsqlCommand($"CREATE SCHEMA IF NOT EXISTS {schema};", conn);
            await cmd.ExecuteNonQueryAsync();
        }
    }

    public new async Task DisposeAsync()
    {
        await _postgres.DisposeAsync();
        await base.DisposeAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.UseSetting("ConnectionStrings:Database", ConnectionString);
        builder.UseSetting("Jwt:Secret", "DevOnly_LealControl_Local_JWT_Key_Not_For_Production_Use_32b!");
        builder.UseSetting("Jwt:Issuer", "lealcontrol");
        builder.UseSetting("Jwt:Audience", "lealcontrol-web");
        builder.UseSetting("Jwt:LifetimeHours", "8");
    }

    public HttpClient CreateAuthenticatedClient(Guid? tenantId = null, string role = "Admin")
    {
        var client = CreateClient();
        var tid = tenantId ?? DemoTenantId;
        var modules = """["sales","crm","purchases","inventory","finance","fleet","hr","grains","accounting"]""";
        var token = SimpleJwt.CreateToken(Guid.NewGuid(), "finance-it@lealcontrol.com", "Finance IT", role, tid, "Empresa Test", modules);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        client.DefaultRequestHeaders.Add("X-Tenant-Id", tid.ToString());
        return client;
    }

    public async Task<T> WithDbAsync<T>(Func<FinanceDbContext, Task<T>> action)
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<FinanceDbContext>();
        await db.EnsureFinanceTablesAsync();
        return await action(db);
    }

    public async Task WithDbAsync(Func<FinanceDbContext, Task> action)
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<FinanceDbContext>();
        await db.EnsureFinanceTablesAsync();
        await action(db);
    }
}
