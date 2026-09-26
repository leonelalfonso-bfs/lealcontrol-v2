using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Communications.Infrastructure.Persistence;
using LealControl.Modules.Communications.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Testcontainers.PostgreSql;
using Xunit;

namespace LealControl.Modules.Communications.Tests;

public sealed class CommunicationsSyncBackgroundServiceTests
{
    [Fact]
    public async Task BackgroundSyncIsOffByDefault()
    {
        var catalog = new FakeCatalog([]);
        using var services = Services(catalog);
        var connections = new FakeConnections("");
        using var worker = new CommunicationsSyncBackgroundService(
            services, connections, new ConfigurationBuilder().Build(),
            NullLogger<CommunicationsSyncBackgroundService>.Instance);

        await worker.StartAsync(CancellationToken.None);
        await worker.StopAsync(CancellationToken.None);

        Assert.Equal(0, catalog.Calls);
        Assert.Empty(connections.Resolved);
    }

    [Fact]
    public async Task SyncResolvesEveryTenantAndDoesNotUseDefaultTenant()
    {
        await using var postgres = new PostgreSqlBuilder()
            .WithImage("postgres:16-alpine")
            .WithDatabase("communications_tenants_tests")
            .WithUsername("leal")
            .WithPassword("leal")
            .Build();
        await postgres.StartAsync();
        var options = new DbContextOptionsBuilder<CommunicationsDbContext>()
            .UseNpgsql(postgres.GetConnectionString()).Options;
        await using (var setup = new CommunicationsDbContext(options))
            await setup.EnsureTablesCreatedAsync();

        var ids = new[] { Guid.NewGuid(), Guid.NewGuid() };
        var catalog = new FakeCatalog(ids);
        using var services = Services(catalog);
        var connections = new FakeConnections(postgres.GetConnectionString());
        using var worker = new CommunicationsSyncBackgroundService(
            services, connections, new ConfigurationBuilder().Build(),
            NullLogger<CommunicationsSyncBackgroundService>.Instance);

        await worker.SyncAllActiveMailAccountsAsync(CancellationToken.None);

        Assert.Equal(1, catalog.Calls);
        Assert.Equal(ids, connections.Resolved);
        Assert.DoesNotContain(Guid.Empty, connections.Resolved);
    }

    private static ServiceProvider Services(FakeCatalog catalog) => new ServiceCollection()
        .AddSingleton<ICommunicationsTenantCatalog>(catalog)
        .AddDataProtection()
        .Services
        .AddScoped<MailSecretProtector>()
        .AddScoped<MailTransportService>()
        .AddScoped<MailSyncService>()
        .AddScoped<ConversationService>()
        .BuildServiceProvider();

    private sealed class FakeCatalog(IReadOnlyList<Guid> ids) : ICommunicationsTenantCatalog
    {
        public int Calls { get; private set; }
        public Task<IReadOnlyList<Guid>> ListEnabledTenantIdsAsync(CancellationToken cancellationToken = default)
        {
            Calls++;
            return Task.FromResult(ids);
        }
    }

    private sealed class FakeConnections(string connectionString) : ITenantConnectionProvider
    {
        public List<Guid> Resolved { get; } = [];
        public string GetConnectionString(TenantId tenantId) => GetConnectionStringAsync(tenantId).Result;
        public Task<string> GetConnectionStringAsync(TenantId tenantId, CancellationToken cancellationToken = default)
        {
            Resolved.Add(tenantId.Value);
            return Task.FromResult(connectionString);
        }
        public void InvalidateCache(TenantId tenantId) { }
    }
}
