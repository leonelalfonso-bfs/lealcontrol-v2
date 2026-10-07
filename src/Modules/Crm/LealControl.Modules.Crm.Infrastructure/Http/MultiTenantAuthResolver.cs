using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using LealControl.Modules.Crm.Domain.Settings;
using Npgsql;

namespace LealControl.Modules.Crm.Infrastructure.Http;

public sealed record TenantMembership(
    Guid TenantId,
    string LegalName,
    string? TradeName,
    string DocumentNumber,
    Guid UserId,
    string FullName,
    string Email,
    string Role,
    string? AllowedModulesJson,
    bool IsTechnicalDirector = false,
    string? LogoUrl = null);

public static class MultiTenantAuthResolver
{
    private const int MaxParallelTenantLookups = 8;

    /// <summary>
    /// Busca las membresías del email. Con <paramref name="onlyTenantIds"/> se limita a esas
    /// empresas (las verificadas con contraseña al iniciar sesión) y no consulta las demás bases.
    /// </summary>
    public static async Task<IReadOnlyList<TenantMembership>> FindAllAsync(
        string masterConnectionString,
        string email,
        string? password,
        CancellationToken cancellationToken = default,
        IReadOnlySet<Guid>? onlyTenantIds = null)
    {
        var emailLower = email.Trim().ToLowerInvariant();
        var masterBuilder = new NpgsqlConnectionStringBuilder(masterConnectionString);
        var defaultDatabase = masterBuilder.Database ?? string.Empty;

        var tenants = await ListDedicatedTenantsAsync(masterConnectionString, cancellationToken);
        var dedicatedDatabases = tenants
            .Where(t => onlyTenantIds is null || onlyTenantIds.Contains(t.Id))
            .Select(t => t.DbName)
            .Where(dbName => !string.IsNullOrWhiteSpace(dbName)
                && !string.Equals(dbName, defaultDatabase, StringComparison.OrdinalIgnoreCase))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var connectionStrings = new List<string> { masterConnectionString };
        connectionStrings.AddRange(dedicatedDatabases.Select(dbName =>
            new NpgsqlConnectionStringBuilder(masterConnectionString) { Database = dbName }.ConnectionString));

        // Cada base es independiente: consultarlas en paralelo evita que el login crezca
        // linealmente con la cantidad de empresas.
        using var throttle = new SemaphoreSlim(MaxParallelTenantLookups);
        var lookups = connectionStrings.Select(async connectionString =>
        {
            await throttle.WaitAsync(cancellationToken);
            try
            {
                return await FindInDatabaseAsync(connectionString, emailLower, password, skipDatabase: null, cancellationToken);
            }
            finally
            {
                throttle.Release();
            }
        });

        var results = new Dictionary<Guid, TenantMembership>();
        foreach (var membership in (await Task.WhenAll(lookups)).SelectMany(m => m))
        {
            if (onlyTenantIds is null || onlyTenantIds.Contains(membership.TenantId))
            {
                results[membership.TenantId] = membership;
            }
        }

        return results.Values
            .OrderBy(m => m.LegalName, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public static List<TenantSummaryDto> ToSummaries(IEnumerable<TenantMembership> memberships) =>
        memberships
            .Select(m => new TenantSummaryDto(m.TenantId, m.LegalName, m.TradeName, m.DocumentNumber, m.LogoUrl))
            .ToList();

    public static AuthResponse ToAuthResponse(TenantMembership active, IReadOnlyList<TenantMembership> all) =>
        new(
            SimpleJwt.CreateToken(
                active.UserId,
                active.Email,
                active.FullName,
                active.Role,
                active.TenantId,
                active.LegalName,
                active.AllowedModulesJson,
                active.IsTechnicalDirector,
                all.Select(m => m.TenantId)),
            new UserDto(active.UserId, active.FullName, active.Email, active.Role, active.AllowedModulesJson, active.IsTechnicalDirector),
            new TenantSummaryDto(active.TenantId, active.LegalName, active.TradeName, active.DocumentNumber, active.LogoUrl),
            ToSummaries(all));

    private static async Task<List<(Guid Id, string Name, string DbName)>> ListDedicatedTenantsAsync(
        string masterConnectionString,
        CancellationToken cancellationToken)
    {
        var tenants = new List<(Guid Id, string Name, string DbName)>();
        try
        {
            await using var masterConn = new NpgsqlConnection(masterConnectionString);
            await masterConn.OpenAsync(cancellationToken);

            await using var listCmd = new NpgsqlCommand(
                @"SELECT ""Id"", ""Name"", ""DbName"" FROM public.master_tenants WHERE ""IsActive"" = true",
                masterConn);
            await using var reader = await listCmd.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                tenants.Add((reader.GetGuid(0), reader.GetString(1), reader.GetString(2)));
            }
        }
        catch
        {
            // master_tenants may not exist in local dev without master schema
        }

        return tenants;
    }

    private static async Task<List<TenantMembership>> FindInDatabaseAsync(
        string connectionString,
        string emailLower,
        string? password,
        string? skipDatabase,
        CancellationToken cancellationToken)
    {
        var results = new List<TenantMembership>();
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            return results;
        }

        var builder = new NpgsqlConnectionStringBuilder(connectionString);
        if (!string.IsNullOrWhiteSpace(skipDatabase)
            && string.Equals(builder.Database, skipDatabase, StringComparison.OrdinalIgnoreCase))
        {
            return results;
        }

        try
        {
            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync(cancellationToken);

            // Avoid depending on optional columns (IsTechnicalDirector) so login works on
            // freshly provisioned tenant DBs whose EnsureCrmTables batch may have failed mid-way.
            const string sql = @"
                SELECT u.""TenantId"", u.""Id"", u.""PasswordHash"", u.""Role"", u.""FullName"", u.""AllowedModulesJson""
                FROM public.tenant_users u
                WHERE lower(u.""Email"") = @email AND u.""IsActive"" = true";

            await using var cmd = new NpgsqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("email", emailLower);

            var legacyHashUserIds = new List<Guid>();
            await using (var reader = await cmd.ExecuteReaderAsync(cancellationToken))
            while (await reader.ReadAsync(cancellationToken))
            {
                var tenantId = reader.GetGuid(0);
                var userId = reader.GetGuid(1);
                var pwdHash = reader.IsDBNull(2) ? string.Empty : reader.GetString(2);
                var role = reader.IsDBNull(3) ? "Admin" : reader.GetString(3);
                var fullName = reader.GetString(4);
                var allowedModulesJson = reader.IsDBNull(5) ? null : reader.GetString(5);
                var isTechnicalDirector = false;

                if (password != null && !PasswordSecurity.VerifyPassword(password, pwdHash))
                {
                    continue;
                }

                if (password != null && PasswordSecurity.IsLegacyHash(pwdHash))
                {
                    legacyHashUserIds.Add(userId);
                }

                var (legalName, tradeName, docNumber, logoUrl) = await ResolveTenantLabelsAsync(
                    connectionString, tenantId, cancellationToken);

                results.Add(new TenantMembership(
                    tenantId,
                    legalName,
                    tradeName,
                    docNumber,
                    userId,
                    fullName,
                    emailLower,
                    role,
                    allowedModulesJson,
                    isTechnicalDirector,
                    logoUrl));
            }

            // Hash heredado (SHA-256 con sal fija): se reemplaza por PBKDF2 en el primer login válido.
            foreach (var userId in legacyHashUserIds)
            {
                await using var rehash = new NpgsqlCommand(
                    @"UPDATE public.tenant_users SET ""PasswordHash"" = @hash WHERE ""Id"" = @id",
                    conn);
                rehash.Parameters.AddWithValue("hash", PasswordSecurity.HashPassword(password!));
                rehash.Parameters.AddWithValue("id", userId);
                await rehash.ExecuteNonQueryAsync(cancellationToken);
            }
        }
        catch
        {
            // Database unavailable or schema mismatch.
        }

        return results;
    }

    internal static bool IsProductPlaceholder(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return true;
        var v = value.Trim();
        return v.Equals("Empresa", StringComparison.OrdinalIgnoreCase)
            || v.Equals("LEAL CONTROL", StringComparison.OrdinalIgnoreCase)
            || v.StartsWith("LEAL CONTROL ERP", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// El nombre comercial de la empresa gana sobre la razón social y sobre el nombre de catálogo.
    /// </summary>
    internal static (string LegalName, string? TradeName) ChooseCompanyLabels(
        string? companyName,
        string? legalName,
        string? tradeName,
        string? catalogName)
    {
        var trade = FirstRealName(tradeName, companyName, legalName, catalogName);
        var legal = FirstRealName(legalName, companyName, tradeName, catalogName) ?? trade ?? "Empresa";
        if (string.Equals(trade, legal, StringComparison.OrdinalIgnoreCase))
            trade = null;
        return (legal, trade);
    }

    private static string? FirstRealName(params string?[] values)
    {
        foreach (var value in values)
        {
            if (!IsProductPlaceholder(value))
                return value!.Trim();
        }

        foreach (var value in values)
        {
            if (!string.IsNullOrWhiteSpace(value))
                return value.Trim();
        }

        return null;
    }

    private static async Task<(string LegalName, string? TradeName, string DocumentNumber, string? LogoUrl)> ResolveTenantLabelsAsync(
        string connectionString,
        Guid tenantId,
        CancellationToken cancellationToken)
    {
        string? companyName = null;
        string? legalName = null;
        string? tradeName = null;
        var documentNumber = string.Empty;
        string? logoUrl = null;
        string? catalogName = null;

        try
        {
            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync(cancellationToken);

            (companyName, legalName, tradeName, documentNumber, logoUrl) =
                await ReadCompanySettingsAsync(conn, tenantId, cancellationToken);

            try
            {
                await using var masterCmd = new NpgsqlCommand(
                    @"SELECT ""Name"" FROM public.master_tenants WHERE ""Id"" = @id LIMIT 1", conn);
                masterCmd.Parameters.AddWithValue("id", tenantId);
                catalogName = await masterCmd.ExecuteScalarAsync(cancellationToken) as string;
            }
            catch
            {
                // La base de la empresa no tiene el catálogo maestro.
            }
        }
        catch
        {
            // Ignore lookup errors — login should still succeed.
        }

        var (legal, trade) = ChooseCompanyLabels(companyName, legalName, tradeName, catalogName);
        return (legal, trade, documentNumber, logoUrl);
    }

    private static async Task<(string? CompanyName, string? LegalName, string? TradeName, string DocumentNumber, string? LogoUrl)> ReadCompanySettingsAsync(
        NpgsqlConnection conn,
        Guid tenantId,
        CancellationToken cancellationToken)
    {
        string[][] attempts =
        [
            ["CompanyName", "LegalName", "TradeName", "DocumentNumber", "LogoUrl"],
            ["LegalName", "TradeName", "DocumentNumber", "LogoUrl"],
            ["CompanyName", "TradeName", "DocumentNumber"],
            ["LegalName", "TradeName", "DocumentNumber"]
        ];

        foreach (var columns in attempts)
        {
            try
            {
                var list = string.Join(", ", columns.Select(c => $@"""{c}"""));
                await using var cmd = new NpgsqlCommand(
                    $@"SELECT {list} FROM public.tenant_settings WHERE ""TenantId"" = @id LIMIT 1", conn);
                cmd.Parameters.AddWithValue("id", tenantId);
                await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
                if (!await reader.ReadAsync(cancellationToken))
                    return (null, null, null, string.Empty, null);

                string? Read(string column)
                {
                    var ordinal = reader.GetOrdinal(column);
                    return reader.IsDBNull(ordinal) ? null : reader.GetString(ordinal);
                }

                return (
                    columns.Contains("CompanyName") ? Read("CompanyName") : null,
                    columns.Contains("LegalName") ? Read("LegalName") : null,
                    columns.Contains("TradeName") ? Read("TradeName") : null,
                    (columns.Contains("DocumentNumber") ? Read("DocumentNumber") : null) ?? string.Empty,
                    columns.Contains("LogoUrl") ? Read("LogoUrl") : null);
            }
            catch
            {
                // Esquema distinto entre bases compartidas y dedicadas.
            }
        }

        return (null, null, null, string.Empty, null);
    }
}
