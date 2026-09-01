using System;
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
        CancellationToken cancellationToken = default);

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
        CancellationToken cancellationToken = default)
    {
        var cleanSlug = SanitizeSlug(slug);
        var dbName = "leal_tenant_" + cleanSlug.Replace("-", "_");

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
            await InitializeTenantSchemaAndAdmin(tenantConnString, tenantId, name, adminFullName, adminEmail, adminPassword, cancellationToken);
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
                ""AllowedModulesJson"" text DEFAULT '[""sales"", ""crm"", ""purchases"", ""inventory"", ""finance"", ""fleet"", ""hr"", ""grains""]',
                ""CreatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now(),
                ""LastLoginUtc"" timestamp with time zone
            );

            ALTER TABLE public.tenant_users ADD COLUMN IF NOT EXISTS ""AllowedModulesJson"" text DEFAULT '[""sales"", ""crm"", ""purchases"", ""inventory"", ""finance"", ""fleet"", ""hr"", ""grains""]';
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
            VALUES (@id, @tenantId, @fullName, @email, 'Administrador', @pwdHash, '[""sales"", ""crm"", ""purchases"", ""inventory"", ""finance"", ""fleet"", ""hr"", ""grains""]')
            ON CONFLICT DO NOTHING;
        ";
        using (var cmd = new NpgsqlCommand(insertUserSql, conn))
        {
            cmd.Parameters.AddWithValue("id", Guid.NewGuid());
            cmd.Parameters.AddWithValue("tenantId", tenantId);
            cmd.Parameters.AddWithValue("fullName", adminFullName);
            cmd.Parameters.AddWithValue("email", adminEmail);
            cmd.Parameters.AddWithValue("pwdHash", MasterDbContext.HashPassword(adminPassword));
            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }
    }

    private async Task<string> GenerateSqlScriptDumpAsync(string dbName, CancellationToken cancellationToken)
    {
        var sb = new StringBuilder();
        sb.AppendLine("-- LEAL Control ERP v2.0 - Copia de Seguridad Automatica");
        sb.AppendLine("-- Base de datos: " + dbName);
        sb.AppendLine("-- Fecha de exportacion: " + DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss") + " UTC");
        sb.AppendLine();

        var tenantConn = BuildTenantConnectionString(dbName);
        using var conn = new NpgsqlConnection(tenantConn);
        await conn.OpenAsync(cancellationToken);

        var tables = new[]
        {
            "public.tenant_settings", "public.tenant_users",
            "crm.customers", "crm.contacts", "crm.locations", "crm.customer_equipments", "crm.customer_fiscal_rates", "crm.leads", "crm.opportunities", "crm.activities", "crm.suppliers",
            "sales.quotes", "sales.quote_items", "sales.orders", "sales.order_items", "sales.deliveries", "sales.delivery_items", "sales.invoices", "sales.invoice_items", "sales.products", "sales.product_categories", "sales.price_lists",
            "sales.GrainContracts", "sales.GrainPriceFixations", "sales.GrainDeliveries", "sales.GrainSettlements", "sales.GrainMarketPrices",
            "finance.accounts", "finance.movements", "finance.echeqs", "finance.collections",
            "fleet.vehicles", "fleet.vehicle_drivers", "fleet.vehicle_documents", "fleet.vehicle_maintenances", "fleet.vehicle_fuel_logs",
            "hr.employees", "hr.attendance_logs", "hr.salary_settlements"
        };

        foreach (var table in tables)
        {
            try
            {
                using var cmd = new NpgsqlCommand("SELECT * FROM " + table, conn);
                using var reader = await cmd.ExecuteReaderAsync(cancellationToken);

                sb.AppendLine("-- Table: " + table);
                while (await reader.ReadAsync(cancellationToken))
                {
                    var cols = new StringBuilder();
                    var vals = new StringBuilder();
                    for (int i = 0; i < reader.FieldCount; i++)
                    {
                        if (i > 0) { cols.Append(", "); vals.Append(", "); }
                        cols.Append("\"" + reader.GetName(i) + "\"");
                        if (reader.IsDBNull(i))
                        {
                            vals.Append("NULL");
                        }
                        else
                        {
                            var val = reader.GetValue(i);
                            if (val is string s) vals.Append("'" + s.Replace("'", "''") + "'");
                            else if (val is DateTime dt) vals.Append("'" + dt.ToString("yyyy-MM-dd HH:mm:ss.fffZ") + "'");
                            else if (val is bool b) vals.Append(b ? "TRUE" : "FALSE");
                            else vals.Append(val.ToString());
                        }
                    }
                    sb.AppendLine("INSERT INTO " + table + " (" + cols + ") VALUES (" + vals + ") ON CONFLICT DO NOTHING;");
                }
                sb.AppendLine();
            }
            catch
            {
                // Table may not exist yet
            }
        }

        return sb.ToString();
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
