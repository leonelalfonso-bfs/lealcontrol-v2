using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Tenancy;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace LealControl.Api.SuperAdmin;

public interface ITenantProvisionerService
{
    Task<(bool Success, string DbName, string Message)> ProvisionTenantAsync(
        string name,
        string slug,
        string planCode,
        string adminFullName,
        string adminEmail,
        string adminPassword,
        string? adminPhone,
        decimal monthlyPriceArs,
        decimal monthlyPriceUsd,
        string? enabledModulesJson = null,
        CancellationToken cancellationToken = default);

    Task SyncTenantUsersModulesAsync(string dbName, string enabledModulesJson, CancellationToken cancellationToken = default);

    Task<byte[]> ExportDatabaseDumpGzipAsync(string dbName, CancellationToken cancellationToken = default);
    Task<decimal> GetDatabaseSizeMbAsync(string dbName, CancellationToken cancellationToken = default);
}

public sealed class TenantProvisionerService : ITenantProvisionerService
{
    private readonly MasterDbContext _masterDb;
    private readonly string _defaultConnectionString;
    private readonly ITenantConnectionProvider _connectionProvider;
    private readonly ILogger<TenantProvisionerService> _logger;

    public TenantProvisionerService(
        MasterDbContext masterDb,
        IConfiguration configuration,
        ITenantConnectionProvider connectionProvider,
        ILogger<TenantProvisionerService> logger)
    {
        _masterDb = masterDb;
        _defaultConnectionString = configuration.GetConnectionString("Database")
            ?? "Host=localhost;Port=5432;Database=lealcontrol;Username=leal;Password=leal";
        _connectionProvider = connectionProvider;
        _logger = logger;
    }

    public async Task<(bool Success, string DbName, string Message)> ProvisionTenantAsync(
        string name,
        string slug,
        string planCode,
        string adminFullName,
        string adminEmail,
        string adminPassword,
        string? adminPhone,
        decimal monthlyPriceArs,
        decimal monthlyPriceUsd,
        string? enabledModulesJson = null,
        CancellationToken cancellationToken = default)
    {
        var cleanSlug = SanitizeSlug(slug);
        var dbName = "leal_tenant_" + cleanSlug.Replace("-", "_");
        var modulesJson = NormalizeModulesJson(enabledModulesJson);

        // Check if slug exists
        var exists = await _masterDb.Tenants.AnyAsync(t => t.Slug == cleanSlug, cancellationToken);
        if (exists)
        {
            return (false, dbName, "Ya existe una empresa con el identificador '" + cleanSlug + "'.");
        }

        try
        {
            // 1. Create Physical Database in PostgreSQL
            await CreatePhysicalDatabaseIfNotExists(dbName, cancellationToken);

            var tenantId = Guid.NewGuid();

            // 2. Initialize Tables and Schema inside the new database
            var tenantConnString = BuildTenantConnectionString(dbName);
            await InitializeTenantSchemaAndAdmin(tenantConnString, tenantId, name, adminFullName, adminEmail, adminPassword, modulesJson, cancellationToken);
            await TenantDatabaseBootstrapper.EnsureDatabaseSchemaAsync(_defaultConnectionString, dbName, cancellationToken);

            // 3. Register in Master DB
            var tenant = new MasterTenant
            {
                Id = tenantId,
                Name = name,
                Slug = cleanSlug,
                DbName = dbName,
                PlanCode = planCode,
                Status = "Active",
                AdminFullName = adminFullName,
                AdminEmail = adminEmail,
                AdminPhone = adminPhone,
                MonthlyPriceArs = monthlyPriceArs,
                MonthlyPriceUsd = monthlyPriceUsd,
                EnabledModulesJson = modulesJson,
                CreatedAtUtc = DateTime.UtcNow,
                IsActive = true
            };

            _masterDb.Tenants.Add(tenant);
            await _masterDb.SaveChangesAsync(cancellationToken);

            _connectionProvider.InvalidateCache(new TenantId(tenantId));

            _logger.LogInformation("Successfully provisioned tenant {TenantName} with database {DbName}", name, dbName);
            return (true, dbName, "Base de datos '" + dbName + "' y empresa creadas exitosamente.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error provisioning database {DbName} for tenant {TenantName}", dbName, name);
            return (false, dbName, "Error al crear la base de datos: " + ex.Message);
        }
    }

    public async Task SyncTenantUsersModulesAsync(string dbName, string enabledModulesJson, CancellationToken cancellationToken = default)
    {
        var modulesJson = NormalizeModulesJson(enabledModulesJson);
        var tenantConn = BuildTenantConnectionString(dbName);
        await using var conn = new NpgsqlConnection(tenantConn);
        await conn.OpenAsync(cancellationToken);

        await using var cmd = new NpgsqlCommand(
            """
            UPDATE public.tenant_users
            SET "AllowedModulesJson" = @modules
            WHERE "IsActive" = TRUE;
            """, conn);
        cmd.Parameters.AddWithValue("modules", modulesJson);
        var updated = await cmd.ExecuteNonQueryAsync(cancellationToken);
        _logger.LogInformation("Sincronizados módulos de {Count} usuario(s) en {DbName}", updated, dbName);
    }

    internal static string NormalizeModulesJson(string? enabledModulesJson)
    {
        // CRM/Comunicaciones fuera del catálogo hasta estabilizar (se reactivan en staging luego).
        var disabled = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "crm" };
        if (!string.Equals(Environment.GetEnvironmentVariable("Communications__InboxEnabled"), "true", StringComparison.OrdinalIgnoreCase))
            disabled.Add("communications");
        const string fallback = """["sales","purchases","inventory","finance","fleet","hr"]""";
        if (string.IsNullOrWhiteSpace(enabledModulesJson))
            return fallback;

        try
        {
            var parsed = System.Text.Json.JsonSerializer.Deserialize<string[]>(enabledModulesJson);
            if (parsed is null || parsed.Length == 0)
                return fallback;

            var cleaned = parsed
                .Where(m => !string.IsNullOrWhiteSpace(m))
                .Select(m => m.Trim().ToLowerInvariant())
                .Where(m => !disabled.Contains(m))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray();

            return cleaned.Length == 0
                ? fallback
                : System.Text.Json.JsonSerializer.Serialize(cleaned);
        }
        catch
        {
            return fallback;
        }
    }

    public async Task<decimal> GetDatabaseSizeMbAsync(string dbName, CancellationToken cancellationToken = default)
    {
        try
        {
            using var conn = new NpgsqlConnection(_defaultConnectionString);
            await conn.OpenAsync(cancellationToken);
            using var cmd = new NpgsqlCommand("SELECT pg_database_size(@dbName)", conn);
            cmd.Parameters.AddWithValue("dbName", dbName);
            var result = await cmd.ExecuteScalarAsync(cancellationToken);
            if (result != null && long.TryParse(result.ToString(), out var bytes))
            {
                return Math.Round((decimal)bytes / (1024 * 1024), 2);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not fetch database size for {DbName}", dbName);
        }
        return 0;
    }

    public async Task<byte[]> ExportDatabaseDumpGzipAsync(string dbName, CancellationToken cancellationToken = default)
    {
        try
        {
            var dumpScript = await GenerateSqlScriptDumpAsync(dbName, cancellationToken);
            var uncompressedBytes = Encoding.UTF8.GetBytes(dumpScript);

            using var memoryStream = new MemoryStream();
            using (var gzip = new GZipStream(memoryStream, CompressionMode.Compress, true))
            {
                await gzip.WriteAsync(uncompressedBytes, 0, uncompressedBytes.Length, cancellationToken);
            }
            return memoryStream.ToArray();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating database backup for {DbName}", dbName);
            throw;
        }
    }

    private async Task CreatePhysicalDatabaseIfNotExists(string dbName, CancellationToken cancellationToken)
    {
        var masterBuilder = new NpgsqlConnectionStringBuilder(_defaultConnectionString)
        {
            Database = "postgres"
        };

        NpgsqlConnection? conn = null;
        try
        {
            conn = new NpgsqlConnection(masterBuilder.ConnectionString);
            await conn.OpenAsync(cancellationToken);
        }
        catch
        {
            conn = new NpgsqlConnection(_defaultConnectionString);
            await conn.OpenAsync(cancellationToken);
        }

        using (conn)
        {
            using var checkCmd = new NpgsqlCommand("SELECT 1 FROM pg_database WHERE datname = @name", conn);
            checkCmd.Parameters.AddWithValue("name", dbName);
            var exists = await checkCmd.ExecuteScalarAsync(cancellationToken);
            if (exists == null)
            {
                var sql = "CREATE DATABASE \"" + dbName + "\" WITH ENCODING = 'UTF8'";
                using var createCmd = new NpgsqlCommand(sql, conn);
                await createCmd.ExecuteNonQueryAsync(cancellationToken);
                _logger.LogInformation("Created physical PostgreSQL database {DbName}", dbName);
            }
        }
    }

    private async Task InitializeTenantSchemaAndAdmin(
        string tenantConnString,
        Guid tenantId,
        string companyName,
        string adminFullName,
        string adminEmail,
        string adminPassword,
        string enabledModulesJson,
        CancellationToken cancellationToken)
    {
        using var conn = new NpgsqlConnection(tenantConnString);
        await conn.OpenAsync(cancellationToken);

        var initSql = @"
            CREATE SCHEMA IF NOT EXISTS crm;
            CREATE SCHEMA IF NOT EXISTS sales;
            CREATE SCHEMA IF NOT EXISTS finance;
            CREATE SCHEMA IF NOT EXISTS fleet;
            CREATE SCHEMA IF NOT EXISTS hr;

            CREATE TABLE IF NOT EXISTS public.tenant_settings (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""CompanyName"" character varying(160) NOT NULL,
                ""LegalName"" character varying(256) NOT NULL DEFAULT 'LEAL CONTROL ERP S.A.',
                ""TradeName"" character varying(160),
                ""DocumentType"" character varying(20) NOT NULL DEFAULT 'Cuit',
                ""DocumentNumber"" character varying(20) NOT NULL DEFAULT '30715489629',
                ""TaxCondition"" character varying(64) NOT NULL DEFAULT 'ResponsableInscripto',
                ""IibbRegime"" character varying(64) NOT NULL DEFAULT 'ConvenioMultilateral',
                ""IibbNumber"" character varying(64),
                ""ActivityStartDate"" character varying(32),
                ""Email"" character varying(128),
                ""Phone"" character varying(64),
                ""WhatsApp"" character varying(64),
                ""Website"" character varying(256),
                ""FiscalStreet"" character varying(256),
                ""FiscalCity"" character varying(128),
                ""FiscalProvince"" character varying(64),
                ""FiscalPostalCode"" character varying(20),
                ""LogoUrl"" text,
                ""ArcaCertificateCrt"" text,
                ""ArcaCertificateKey"" text,
                ""ArcaEnvironment"" character varying(32) NOT NULL DEFAULT 'Homologacion',
                ""ArcaSignerCuit"" character varying(20),
                ""BankName"" character varying(128),
                ""BankCbu"" character varying(64),
                ""BankAlias"" character varying(64),
                ""DefaultQuoteValidDays"" integer NOT NULL DEFAULT 15,
                ""DefaultDeliveryDays"" integer NOT NULL DEFAULT 7,
                ""DefaultWarranty"" character varying(256),
                ""DefaultPaymentTerms"" character varying(256),
                ""CreatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now(),
                ""UpdatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now()
            );

            ALTER TABLE public.tenant_settings ADD COLUMN IF NOT EXISTS ""LegalName"" character varying(256) NOT NULL DEFAULT 'LEAL CONTROL ERP S.A.';

            CREATE TABLE IF NOT EXISTS public.tenant_users (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""FullName"" character varying(128) NOT NULL,
                ""Email"" character varying(128) NOT NULL,
                ""Role"" character varying(64) NOT NULL DEFAULT 'Administrador',
                ""PasswordHash"" character varying(256),
                ""IsActive"" boolean NOT NULL DEFAULT true,
                ""AllowedModulesJson"" text DEFAULT '[]',
                ""IsTechnicalDirector"" boolean NOT NULL DEFAULT false,
                ""CreatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now(),
                ""LastLoginUtc"" timestamp with time zone
            );

            ALTER TABLE public.tenant_users ADD COLUMN IF NOT EXISTS ""AllowedModulesJson"" text DEFAULT '[]';
            ALTER TABLE public.tenant_users ADD COLUMN IF NOT EXISTS ""IsTechnicalDirector"" boolean NOT NULL DEFAULT false;
        ";

        using (var cmd = new NpgsqlCommand(initSql, conn))
        {
            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }

        // Insert initial Admin User and Settings
        var insertSettingsSql = @"
            INSERT INTO public.tenant_settings (""Id"", ""TenantId"", ""CompanyName"", ""LegalName"", ""TradeName"", ""Email"")
            VALUES (@id, @tenantId, @compName, @compName, @compName, @email)
            ON CONFLICT DO NOTHING;
        ";
        using (var cmd = new NpgsqlCommand(insertSettingsSql, conn))
        {
            cmd.Parameters.AddWithValue("id", Guid.NewGuid());
            cmd.Parameters.AddWithValue("tenantId", tenantId);
            cmd.Parameters.AddWithValue("compName", companyName);
            cmd.Parameters.AddWithValue("email", adminEmail);
            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }

        var insertUserSql = @"
            INSERT INTO public.tenant_users (""Id"", ""TenantId"", ""FullName"", ""Email"", ""Role"", ""PasswordHash"", ""AllowedModulesJson"")
            VALUES (@id, @tenantId, @fullName, @email, 'Administrador', @pwdHash, @modules)
            ON CONFLICT DO NOTHING;
        ";
        using (var cmd = new NpgsqlCommand(insertUserSql, conn))
        {
            cmd.Parameters.AddWithValue("id", Guid.NewGuid());
            cmd.Parameters.AddWithValue("tenantId", tenantId);
            cmd.Parameters.AddWithValue("fullName", adminFullName);
            cmd.Parameters.AddWithValue("email", adminEmail.Trim().ToLowerInvariant());
            cmd.Parameters.AddWithValue("pwdHash", MasterDbContext.HashPassword(adminPassword));
            cmd.Parameters.AddWithValue("modules", enabledModulesJson);
            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }
    }

    private async Task<string> GenerateSqlScriptDumpAsync(string dbName, CancellationToken cancellationToken)
    {
        var sb = new StringBuilder();
        var tablesExported = 0;
        var tablesFailed = 0;

        sb.AppendLine("-- LEAL Control ERP v2.0 - Copia de Seguridad Automatica");
        sb.AppendLine("-- Base de datos: " + dbName);
        sb.AppendLine("-- Fecha de exportacion: " + DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss") + " UTC");
        sb.AppendLine("-- Tablas exportadas: (pendiente)");
        sb.AppendLine("-- Tablas fallidas: (pendiente)");
        sb.AppendLine();

        var tenantConn = BuildTenantConnectionString(dbName);
        using var conn = new NpgsqlConnection(tenantConn);
        await conn.OpenAsync(cancellationToken);

        var schemas = new[]
        {
            "public", "crm", "sales", "purchases", "finance", "fleet", "hr",
            "accounting", "communications", "metrology", "quality"
        };

        var tables = new List<string>();
        foreach (var schema in schemas)
        {
            await using var listCmd = new NpgsqlCommand(
                """
                SELECT quote_ident(table_schema) || '.' || quote_ident(table_name)
                FROM information_schema.tables
                WHERE table_schema = @schema AND table_type = 'BASE TABLE'
                ORDER BY table_name
                """, conn);
            listCmd.Parameters.AddWithValue("schema", schema);
            await using var listReader = await listCmd.ExecuteReaderAsync(cancellationToken);
            while (await listReader.ReadAsync(cancellationToken))
            {
                tables.Add(listReader.GetString(0));
            }
        }

        foreach (var table in tables)
        {
            try
            {
                await using var cmd = new NpgsqlCommand("SELECT * FROM " + table, conn);
                await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);

                sb.AppendLine("-- Table: " + table);
                var rowCount = 0;
                while (await reader.ReadAsync(cancellationToken))
                {
                    var cols = new StringBuilder();
                    var vals = new StringBuilder();
                    for (var i = 0; i < reader.FieldCount; i++)
                    {
                        if (i > 0)
                        {
                            cols.Append(", ");
                            vals.Append(", ");
                        }

                        cols.Append('"').Append(reader.GetName(i)).Append('"');
                        if (reader.IsDBNull(i))
                        {
                            vals.Append("NULL");
                        }
                        else
                        {
                            var val = reader.GetValue(i);
                            vals.Append(val switch
                            {
                                string s => "'" + s.Replace("'", "''") + "'",
                                DateTime dt => "'" + dt.ToString("yyyy-MM-dd HH:mm:ss.fffZ") + "'",
                                bool b => b ? "TRUE" : "FALSE",
                                _ => val.ToString()
                            });
                        }
                    }

                    sb.AppendLine("INSERT INTO " + table + " (" + cols + ") VALUES (" + vals + ") ON CONFLICT DO NOTHING;");
                    rowCount++;
                }

                sb.AppendLine("-- Rows: " + rowCount);
                sb.AppendLine();
                tablesExported++;
            }
            catch (Exception ex)
            {
                tablesFailed++;
                _logger.LogError(ex, "Error exportando tabla {Table} de {DbName}", table, dbName);
                sb.AppendLine("-- ERROR exportando " + table + ": " + ex.Message.Replace('\n', ' '));
                sb.AppendLine();
            }
        }

        var dump = sb.ToString()
            .Replace("-- Tablas exportadas: (pendiente)", "-- Tablas exportadas: " + tablesExported, StringComparison.Ordinal)
            .Replace("-- Tablas fallidas: (pendiente)", "-- Tablas fallidas: " + tablesFailed, StringComparison.Ordinal);

        return dump;
    }

    private string BuildTenantConnectionString(string dbName)
    {
        var builder = new NpgsqlConnectionStringBuilder(_defaultConnectionString)
        {
            Database = dbName
        };
        return builder.ConnectionString;
    }

    private static string SanitizeSlug(string slug)
    {
        if (string.IsNullOrWhiteSpace(slug)) return "empresa-" + Guid.NewGuid().ToString("N").Substring(0, 6);
        var clean = slug.ToLowerInvariant().Trim();
        var sb = new StringBuilder();
        foreach (var c in clean)
        {
            if (char.IsLetterOrDigit(c)) sb.Append(c);
            else if (c == ' ' || c == '_' || c == '-') sb.Append('-');
        }
        var res = sb.ToString().Trim('-');
        return string.IsNullOrWhiteSpace(res) ? "empresa-" + Guid.NewGuid().ToString("N").Substring(0, 6) : res;
    }
}
