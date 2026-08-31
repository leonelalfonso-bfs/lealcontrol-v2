using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Infrastructure.Http;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Npgsql;
using Testcontainers.PostgreSql;
using Xunit;

namespace LealControl.QA.Infrastructure;

public sealed class QaWebApplicationFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder()
        .WithImage("postgres:16-alpine")
        .WithDatabase("lealcontrol_qa_test")
        .WithUsername("leal_qa")
        .WithPassword("leal_qa_pass")
        .Build();

    public string ConnectionString => _postgres.GetConnectionString();

    public async Task InitializeAsync()
    {
        await _postgres.StartAsync();

        // Security Guard verification
        QaSecurityGuard.AssertExecutionPermitted("Development", ConnectionString);

        // Pre-create database schemas required by Leal Control modules
        await using var conn = new NpgsqlConnection(ConnectionString);
        await conn.OpenAsync();
        var schemas = new[] { "crm", "sales", "purchases", "finance", "accounting", "metrology", "fleet", "hr", "directory" };
        foreach (var schema in schemas)
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
        builder.UseSetting("QA_TEST_CENTER_ENABLED", "true");
        builder.UseSetting("Jwt:Secret", "DevOnly_LealControl_Local_JWT_Key_Not_For_Production_Use_32b!");
        builder.UseSetting("Jwt:Issuer", "lealcontrol");
        builder.UseSetting("Jwt:Audience", "lealcontrol-web");
        builder.UseSetting("Jwt:LifetimeHours", "8");
    }

    public HttpClient CreateAuthenticatedClient(Guid tenantId, Guid userId, string role = "Admin", string name = "QA Admin")
    {
        var client = CreateClient();
        var token = SimpleJwt.CreateToken(userId, "qa@lealcontrol.com", name, role, tenantId, "Empresa QA S.A.");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        client.DefaultRequestHeaders.Add("X-Tenant-Id", tenantId.ToString());
        return client;
    }
}
