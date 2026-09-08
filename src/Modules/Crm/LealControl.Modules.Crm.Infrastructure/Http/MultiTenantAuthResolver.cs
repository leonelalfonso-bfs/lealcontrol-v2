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
    bool IsTechnicalDirector = false);

public static class MultiTenantAuthResolver
{
    public static async Task<IReadOnlyList<TenantMembership>> FindAllAsync(
        string masterConnectionString,
        string email,
        string? password,
        CancellationToken cancellationToken = default)
    {
        var emailLower = email.Trim().ToLowerInvariant();
        var results = new Dictionary<Guid, TenantMembership>();

        foreach (var membership in await FindInDatabaseAsync(masterConnectionString, emailLower, password, skipDatabase: null, cancellationToken))
        {
            results[membership.TenantId] = membership;
        }

        var masterBuilder = new NpgsqlConnectionStringBuilder(masterConnectionString);
        var defaultDatabase = masterBuilder.Database ?? string.Empty;

        var tenants = await ListDedicatedTenantsAsync(masterConnectionString, cancellationToken);
        foreach (var (_, _, dbName) in tenants)
        {
            if (string.IsNullOrWhiteSpace(dbName)
                || string.Equals(dbName, defaultDatabase, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var tenantConn = new NpgsqlConnectionStringBuilder(masterConnectionString) { Database = dbName }.ConnectionString;
            foreach (var membership in await FindInDatabaseAsync(tenantConn, emailLower, password, skipDatabase: null, cancellationToken))
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
            .Select(m => new TenantSummaryDto(m.TenantId, m.LegalName, m.TradeName, m.DocumentNumber))
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
                active.IsTechnicalDirector),
            new UserDto(active.UserId, active.FullName, active.Email, active.Role, active.AllowedModulesJson, active.IsTechnicalDirector),
            new TenantSummaryDto(active.TenantId, active.LegalName, active.TradeName, active.DocumentNumber),
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

            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
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

                var (legalName, tradeName, docNumber) = await ResolveTenantLabelsAsync(
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
                    isTechnicalDirector));
            }
        }
        catch
        {
            // Database unavailable or schema mismatch.
        }

        return results;
    }

    private static async Task<(string LegalName, string? TradeName, string DocumentNumber)> ResolveTenantLabelsAsync(
        string connectionString,
        Guid tenantId,
        CancellationToken cancellationToken)
    {
        try
        {
            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync(cancellationToken);

            // master_tenants lives in the default/catalog database
            await using var masterCmd = new NpgsqlCommand(
                @"SELECT ""Name"" FROM public.master_tenants WHERE ""Id"" = @id LIMIT 1", conn);
            masterCmd.Parameters.AddWithValue("id", tenantId);
            var masterName = await masterCmd.ExecuteScalarAsync(cancellationToken) as string;
            if (!string.IsNullOrWhiteSpace(masterName))
            {
                return (masterName, masterName, string.Empty);
            }

            // Shared schema (LegalName)
            try
            {
                await using var legalCmd = new NpgsqlCommand(
                    @"SELECT ""LegalName"", ""TradeName"", ""DocumentNumber""
                      FROM public.tenant_settings WHERE ""TenantId"" = @id LIMIT 1", conn);
                legalCmd.Parameters.AddWithValue("id", tenantId);
                await using var reader = await legalCmd.ExecuteReaderAsync(cancellationToken);
                if (await reader.ReadAsync(cancellationToken))
                {
                    return (
                        reader.IsDBNull(0) ? "LEAL CONTROL ERP" : reader.GetString(0),
                        reader.IsDBNull(1) ? null : reader.GetString(1),
                        reader.IsDBNull(2) ? string.Empty : reader.GetString(2));
                }
            }
            catch
            {
                // Column LegalName may not exist on provisioned tenant DBs.
            }

            // Provisioned tenant schema (CompanyName)
            try
            {
                await using var companyCmd = new NpgsqlCommand(
                    @"SELECT ""CompanyName"", ""TradeName"", ""DocumentNumber""
                      FROM public.tenant_settings WHERE ""TenantId"" = @id LIMIT 1", conn);
                companyCmd.Parameters.AddWithValue("id", tenantId);
                await using var reader = await companyCmd.ExecuteReaderAsync(cancellationToken);
                if (await reader.ReadAsync(cancellationToken))
                {
                    return (
                        reader.IsDBNull(0) ? "LEAL CONTROL ERP" : reader.GetString(0),
                        reader.IsDBNull(1) ? null : reader.GetString(1),
                        reader.IsDBNull(2) ? string.Empty : reader.GetString(2));
                }
            }
            catch
            {
                // Ignore schema differences between shared and dedicated DBs.
            }
        }
        catch
        {
            // Ignore lookup errors — login should still succeed.
        }

        return ("LEAL CONTROL ERP", null, string.Empty);
    }
}
