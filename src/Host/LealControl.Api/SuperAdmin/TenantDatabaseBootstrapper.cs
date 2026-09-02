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
            await MigrateModuleAsync(crm, () => crm.EnsureCrmTablesAsync(), "CRM", "public.tenant_users", dbName, cancellationToken);
        }

        await using (var sales = CreateContext<SalesDbContext>(connectionString, SalesDbContext.Schema))
        {
            await MigrateModuleAsync(sales, () => sales.EnsureTablesCreatedAsync(cancellationToken), "Sales", "sales.invoices", dbName, cancellationToken);
        }

        await using (var communications = CreateContext<CommunicationsDbContext>(connectionString, CommunicationsDbContext.Schema))
        {
            await MigrateModuleAsync(
                communications,
                () => communications.EnsureTablesCreatedAsync(cancellationToken),
                "Communications",
                "communications.mail_accounts",
                dbName,
                cancellationToken);
        }

        await using (var finance = CreateContext<FinanceDbContext>(connectionString, FinanceDbContext.Schema))
        {
            await finance.EnsureFinanceTablesAsync(cancellationToken);
        }

        await using (var hr = CreateContext<HumanResourcesDbContext>(connectionString, HumanResourcesDbContext.Schema))
        {
            await hr.EnsureHrTablesAsync(cancellationToken);
        }

        await using (var fleet = CreateContext<FleetDbContext>(connectionString, FleetDbContext.Schema))
        {
            await fleet.EnsureFleetTablesAsync(cancellationToken);
        }

        await using (var accounting = CreateContext<AccountingDbContext>(connectionString, "accounting"))
        {
            await accounting.EnsureAccountingTablesAsync(cancellationToken);
        }

        await using (var metrology = new MetrologyDbContext(
            new DbContextOptionsBuilder<MetrologyDbContext>()
                .UseNpgsql(connectionString, b => b.MigrationsAssembly(typeof(MetrologyDbContext).Assembly.FullName))
                .Options))
        {
            await metrology.EnsureMetrologyTablesAsync(cancellationToken);
        }

        Log.Information("Esquema verificado para base de datos {DbName}", dbName);
    }

    private static async Task MigrateModuleAsync<TContext>(
        TContext db,
        Func<Task> ensureTablesAsync,
        string moduleName,
        string legacyProbeTable,
        string dbName,
        CancellationToken cancellationToken)
        where TContext : DbContext
    {
        var legacyExists = await LegacySchemaExistsAsync(db, legacyProbeTable, cancellationToken);
        if (legacyExists)
        {
            var pending = (await db.Database.GetPendingMigrationsAsync(cancellationToken)).ToList();
            if (pending.Count > 0)
            {
                Log.Warning(
                    "Base {DbName}: módulo {Module} con esquema legacy ({Probe}) y {PendingCount} migración(es) pendiente(s). Se omite MigrateAsync; reconciliar __ef_migrations_history cuando sea posible.",
                    dbName,
                    moduleName,
                    legacyProbeTable,
                    pending.Count);
            }

            await ensureTablesAsync();
            return;
        }

        try
        {
            var pending = await db.Database.GetPendingMigrationsAsync(cancellationToken);
            if (pending.Any())
            {
                await db.Database.MigrateAsync(cancellationToken);
            }
        }
        catch (PostgresException ex) when (ex.SqlState == PostgresErrorCodes.DuplicateTable)
        {
            Log.Warning(
                ex,
                "Base {DbName}: módulo {Module} — MigrateAsync chocó con tablas ya existentes. Continuando con EnsureTables.",
                dbName,
                moduleName);
        }
        catch (Exception ex)
        {
            Log.Fatal(ex, "Fallo MigrateAsync del módulo {Module} en base {DbName}. Reconciliar __ef_migrations_history.", moduleName, dbName);
            throw;
        }

        await ensureTablesAsync();
    }

    private static async Task<bool> LegacySchemaExistsAsync(DbContext db, string qualifiedTable, CancellationToken cancellationToken)
    {
        await using var command = db.Database.GetDbConnection().CreateCommand();
        command.CommandText = "SELECT to_regclass(@qualified) IS NOT NULL";
        var parameter = command.CreateParameter();
        parameter.ParameterName = "qualified";
        parameter.Value = qualifiedTable;
        command.Parameters.Add(parameter);

        if (command.Connection?.State != System.Data.ConnectionState.Open)
        {
            await command.Connection!.OpenAsync(cancellationToken);
        }

        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result is bool exists && exists;
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
