using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Communications.Infrastructure.Domain;
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
    public async Task StoppingBeforeFirstPollDoesNotQueryTenants()
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
    public async Task OnlyOptedInAccountsAreSelectedUnlessLegacyGlobalSyncIsEnabled()
    {
        await using var postgres = new PostgreSqlBuilder()
            .WithImage("postgres:16-alpine")
            .WithDatabase("communications_auto_sync_tests")
            .WithUsername("leal")
            .WithPassword("leal")
            .Build();
        await postgres.StartAsync();
        var options = new DbContextOptionsBuilder<CommunicationsDbContext>()
            .UseNpgsql(postgres.GetConnectionString()).Options;
        await using var db = new CommunicationsDbContext(options);
        await db.EnsureTablesCreatedAsync();
        await db.Database.ExecuteSqlRawAsync("ALTER TABLE communications.mail_accounts DROP COLUMN \"AutoSyncEnabled\"");
        await db.EnsureTablesCreatedAsync(); // Existing tenant databases receive the new opt-in column.

        var tenantId = Guid.NewGuid();
        MailAccount Account(Guid tenant, string email, bool active) => MailAccount.Create(
            tenant,
            new MailAccountSettings(email, email, MailProvider.Custom, MailAuthMode.Password,
                "imap.example.test", 993, true, "smtp.example.test", 587, true, null, active, false),
            "protected-secret", DateTime.UtcNow);

        var optedIn = Account(tenantId, "on@example.test", true);
        optedIn.SetAutoSyncEnabled(true, DateTime.UtcNow);
        var manual = Account(tenantId, "manual@example.test", true);
        var inactive = Account(tenantId, "inactive@example.test", false);
        inactive.SetAutoSyncEnabled(true, DateTime.UtcNow);
        var otherTenant = Account(Guid.NewGuid(), "other@example.test", true);
        otherTenant.SetAutoSyncEnabled(true, DateTime.UtcNow);
        db.MailAccounts.AddRange(optedIn, manual, inactive, otherTenant);
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        var selected = await CommunicationsSyncBackgroundService.EligibleAccounts(db, tenantId, false)
            .Select(x => x.EmailAddress).ToListAsync();
        Assert.Equal(new[] { "on@example.test" }, selected);

        var legacySelected = await CommunicationsSyncBackgroundService.EligibleAccounts(db, tenantId, true)
            .Select(x => x.EmailAddress).OrderBy(x => x).ToListAsync();
        Assert.Equal(new[] { "manual@example.test", "on@example.test" }, legacySelected);
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
