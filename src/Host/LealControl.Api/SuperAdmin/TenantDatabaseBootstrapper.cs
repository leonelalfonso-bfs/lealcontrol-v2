using LealControl.Modules.Accounting.Infrastructure;
using LealControl.Modules.Communications.Infrastructure.Persistence;
using LealControl.Modules.Crm.Infrastructure.Persistence;
using LealControl.Modules.Finance.Infrastructure;
using LealControl.Modules.Fleet.Infrastructure;
using LealControl.Modules.HumanResources.Infrastructure;
using LealControl.Modules.Metrology.Infrastructure;
using LealControl.Modules.Quality.Infrastructure;
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
            try
            {
                await EnsureDatabaseSchemaAsync(defaultConnectionString, dbName, cancellationToken);
            }
            catch (Exception ex)
            {
                Log.Error(ex, "Fallo EnsureDatabaseSchemaAsync en base {DbName}; se continúa con el resto de tenants.", dbName);
            }
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
            // Probe crm.customers (no public.tenant_users): al provisionar ya existe tenant_users
            // y eso hacía saltar MigrateAsync → directorio CRM 500 en tenants nuevos.
            await MigrateModuleAsync(crm, () => crm.EnsureCrmTablesAsync(), "CRM", "crm.customers", dbName, cancellationToken);
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
            try
            {
                await finance.EnsureFinanceTablesAsync(cancellationToken);
            }
            catch (PostgresException ex) when (
                ex.SqlState == PostgresErrorCodes.UniqueViolation
                || ex.SqlState == PostgresErrorCodes.DuplicateObject
                || ex.SqlState == PostgresErrorCodes.DuplicateTable)
            {
                Log.Warning(ex, "Base {DbName}: EnsureFinanceTables concurrente ({SqlState}); se reintenta.", dbName, ex.SqlState);
                await Task.Delay(150, cancellationToken);
                await finance.EnsureFinanceTablesAsync(cancellationToken);
            }
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

        await using (var quality = CreateContext<QualityDbContext>(connectionString, QualityDbContext.Schema))
        {
            await quality.EnsureQualityTablesAsync(cancellationToken);
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
        var applied = (await db.Database.GetAppliedMigrationsAsync(cancellationToken)).ToList();
        var pending = (await db.Database.GetPendingMigrationsAsync(cancellationToken)).ToList();

        // Sin historial EF: siempre migrar (tenant nuevo / Testcontainers). Un sondeo
        // fallido o un stub incompleto de crm.customers no debe omitir MigrateAsync
        // (e5a3979 → POST /api/v1/crm/customers 500 en CI).
        if (pending.Count > 0 && applied.Count == 0)
        {
            var legacyExists = await LegacySchemaExistsAsync(db, legacyProbeTable, cancellationToken);
            if (legacyExists)
            {
                Log.Warning(
                    "Base {DbName}: módulo {Module} legacy ({Probe}) sin historial EF y {PendingCount} pendiente(s). Se omite MigrateAsync; EnsureTables completa huecos.",
                    dbName,
                    moduleName,
                    legacyProbeTable,
                    pending.Count);
            }
            else
            {
                await MigrateResilientAsync(db, moduleName, dbName, cancellationToken);
            }

            await EnsureTablesResilientAsync(ensureTablesAsync, moduleName, dbName, cancellationToken);
            return;
        }

        // Ya hay historial: aplicar pendientes aunque existan tablas (opportunities/activities).
        if (pending.Count > 0)
        {
            await MigrateResilientAsync(db, moduleName, dbName, cancellationToken);
        }

        await EnsureTablesResilientAsync(ensureTablesAsync, moduleName, dbName, cancellationToken);
    }

    private static async Task MigrateResilientAsync(
        DbContext db,
        string moduleName,
        string dbName,
        CancellationToken cancellationToken)
    {
        try
        {
            await db.Database.MigrateAsync(cancellationToken);
        }
        catch (PostgresException ex) when (
            ex.SqlState == PostgresErrorCodes.DuplicateTable
            || ex.SqlState == PostgresErrorCodes.UniqueViolation
            || ex.SqlState == PostgresErrorCodes.DuplicateObject
            || ex.SqlState == PostgresErrorCodes.DuplicateSchema
            || ex.SqlState == PostgresErrorCodes.DuplicateColumn)
        {
            Log.Warning(
                ex,
                "Base {DbName}: módulo {Module} — MigrateAsync chocó con objetos ya existentes ({SqlState}). Continuando con EnsureTables.",
                dbName,
                moduleName,
                ex.SqlState);
        }
        catch (Exception ex)
        {
            Log.Fatal(ex, "Fallo MigrateAsync del módulo {Module} en base {DbName}. Reconciliar __ef_migrations_history.", moduleName, dbName);
            throw;
        }
    }

    private static async Task EnsureTablesResilientAsync(
        Func<Task> ensureTablesAsync,
        string moduleName,
        string dbName,
        CancellationToken cancellationToken)
    {
        try
        {
            await ensureTablesAsync();
        }
        catch (PostgresException ex) when (
            ex.SqlState == PostgresErrorCodes.UniqueViolation
            || ex.SqlState == PostgresErrorCodes.DuplicateObject
            || ex.SqlState == PostgresErrorCodes.DuplicateTable)
        {
            Log.Warning(
                ex,
                "Base {DbName}: módulo {Module} — EnsureTables concurrente ({SqlState}); se reintenta una vez.",
                dbName,
                moduleName,
                ex.SqlState);
            await Task.Delay(150, cancellationToken);
            await ensureTablesAsync();
        }
    }

    private static async Task<bool> LegacySchemaExistsAsync(DbContext db, string qualifiedTable, CancellationToken cancellationToken)
    {
        var parts = qualifiedTable.Split('.', 2);
        if (parts.Length != 2 || string.IsNullOrWhiteSpace(parts[0]) || string.IsNullOrWhiteSpace(parts[1]))
        {
            return false;
        }

        try
        {
            var connection = db.Database.GetDbConnection();
            await using var command = connection.CreateCommand();
            command.CommandText = """
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.tables
                    WHERE table_schema = @schema AND table_name = @table
                )
                """;

            var schema = command.CreateParameter();
            schema.ParameterName = "schema";
            schema.Value = parts[0];
            command.Parameters.Add(schema);

            var table = command.CreateParameter();
            table.ParameterName = "table";
            table.Value = parts[1];
            command.Parameters.Add(table);

            if (connection.State != System.Data.ConnectionState.Open)
            {
                await connection.OpenAsync(cancellationToken);
            }

            var result = await command.ExecuteScalarAsync(cancellationToken);
            return result is true || result is bool flag && flag;
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "No se pudo sondear {Probe}; se asume que no hay esquema legacy y se migrará.", qualifiedTable);
            return false;
        }
    }

    private static TContext CreateContext<TContext>(string connectionString, string migrationsHistorySchema)
        where TContext : DbContext
    {
        var assemblyName = typeof(TContext).Assembly.GetName().Name
            ?? throw new InvalidOperationException($"No se pudo resolver el assembly de {typeof(TContext).Name}.");
        var options = new DbContextOptionsBuilder<TContext>()
            .UseNpgsql(connectionString, npgsql =>
            {
                npgsql.MigrationsHistoryTable("__ef_migrations_history", migrationsHistorySchema);
                npgsql.MigrationsAssembly(assemblyName);
            })
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
