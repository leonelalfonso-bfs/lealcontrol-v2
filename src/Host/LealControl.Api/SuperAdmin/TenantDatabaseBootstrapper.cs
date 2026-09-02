using LealControl.Modules.Accounting.Infrastructure;
using LealControl.Modules.Communications.Infrastructure.Persistence;
using LealControl.Modules.Crm.Infrastructure.Persistence;
using LealControl.Modules.Finance.Infrastructure;
using LealControl.Modules.Fleet.Infrastructure;
using LealControl.Modules.HumanResources.Infrastructure;
using LealControl.Modules.Metrology.Infrastructure;
using LealControl.Modules.Sales.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Npgsql;
using Serilog;

namespace LealControl.Api.SuperAdmin;

public static class TenantDatabaseBootstrapper
{
    public static async Task InitializeAllAsync(
        IServiceProvider services,
        IConfiguration configuration,
        IHostEnvironment environment,
        CancellationToken cancellationToken = default)
    {
        await using var scope = services.CreateAsyncScope();
        var sp = scope.ServiceProvider;

        var masterDb = sp.GetRequiredService<MasterDbContext>();
        await masterDb.EnsureMasterTablesCreatedAsync(environment, configuration, cancellationToken);

        var defaultConnectionString = configuration.GetConnectionString("Database")
            ?? throw new InvalidOperationException("Falta ConnectionStrings:Database.");
        var defaultDbName = new NpgsqlConnectionStringBuilder(defaultConnectionString).Database
            ?? throw new InvalidOperationException("La connection string debe incluir Database.");

        await SyncDefaultTenantDbNameAsync(masterDb, defaultDbName, cancellationToken);

        var databaseNames = await masterDb.Tenants
            .AsNoTracking()
            .Where(t => t.IsActive && !string.IsNullOrWhiteSpace(t.DbName))
            .Select(t => t.DbName)
            .Distinct()
            .ToListAsync(cancellationToken);

        if (!databaseNames.Contains(defaultDbName, StringComparer.OrdinalIgnoreCase))
        {
            databaseNames.Add(defaultDbName);
        }

        foreach (var dbName in databaseNames.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            await EnsureDatabaseSchemaAsync(defaultConnectionString, dbName, cancellationToken);
        }
    }

    private static async Task SyncDefaultTenantDbNameAsync(
        MasterDbContext masterDb,
        string defaultDbName,
        CancellationToken cancellationToken)
    {
        var defaultTenantId = Guid.Parse("11111111-1111-1111-1111-111111111111");
        var tenant = await masterDb.Tenants.FirstOrDefaultAsync(t => t.Id == defaultTenantId, cancellationToken);
        if (tenant == null || string.Equals(tenant.DbName, defaultDbName, StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        tenant.DbName = defaultDbName;
        await masterDb.SaveChangesAsync(cancellationToken);
        Log.Information("Tenant demo actualizado: DbName → {DbName}", defaultDbName);
    }

    internal static async Task EnsureDatabaseSchemaAsync(
        string baseConnectionString,
        string dbName,
        CancellationToken cancellationToken)
    {
        var connectionString = BuildConnectionString(baseConnectionString, dbName);

        await using (var crm = CreateContext<CrmDbContext>(connectionString, CrmDbContext.Schema))
        {
            await crm.Database.MigrateAsync(cancellationToken);
            await crm.EnsureCrmTablesAsync();
        }

        await using (var sales = CreateContext<SalesDbContext>(connectionString, SalesDbContext.Schema))
        {
            await sales.Database.MigrateAsync(cancellationToken);
            await sales.EnsureTablesCreatedAsync();
        }

        await using (var communications = CreateContext<CommunicationsDbContext>(connectionString, CommunicationsDbContext.Schema))
        {
            await communications.Database.MigrateAsync(cancellationToken);
            await communications.EnsureTablesCreatedAsync();
        }

        await using (var finance = CreateContext<FinanceDbContext>(connectionString, FinanceDbContext.Schema))
        {
            await finance.EnsureFinanceTablesAsync();
        }

        await using (var hr = CreateContext<HumanResourcesDbContext>(connectionString, HumanResourcesDbContext.Schema))
        {
            await hr.EnsureHrTablesAsync();
        }

        await using (var fleet = CreateContext<FleetDbContext>(connectionString, FleetDbContext.Schema))
        {
            await fleet.EnsureFleetTablesAsync();
        }

        await using (var accounting = CreateContext<AccountingDbContext>(connectionString, "accounting"))
        {
            await accounting.EnsureAccountingTablesAsync();
        }

        await using (var metrology = new MetrologyDbContext(
            new DbContextOptionsBuilder<MetrologyDbContext>()
                .UseNpgsql(connectionString, b => b.MigrationsAssembly(typeof(MetrologyDbContext).Assembly.FullName))
                .Options))
        {
            await metrology.EnsureMetrologyTablesAsync();
        }

        Log.Information("Esquema verificado para base de datos {DbName}", dbName);
    }

    private static TContext CreateContext<TContext>(string connectionString, string migrationsHistorySchema)
        where TContext : DbContext
    {
        var options = new DbContextOptionsBuilder<TContext>()
            .UseNpgsql(connectionString, npgsql =>
                npgsql.MigrationsHistoryTable("__ef_migrations_history", migrationsHistorySchema))
            .Options;

        return (TContext)Activator.CreateInstance(typeof(TContext), options)!;
    }

    private static string BuildConnectionString(string baseConnectionString, string dbName)
    {
        var builder = new NpgsqlConnectionStringBuilder(baseConnectionString)
        {
            Database = dbName
        };
        return builder.ConnectionString;
    }
}
