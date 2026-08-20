using System;
using System.Collections.Concurrent;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Tenancy;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace LealControl.Api.SuperAdmin;

public interface ITenantConnectionProvider
{
    string GetConnectionString(TenantId tenantId);
    Task<string> GetConnectionStringAsync(TenantId tenantId, CancellationToken cancellationToken = default);
    void InvalidateCache(TenantId tenantId);
}

public sealed class TenantConnectionProvider : ITenantConnectionProvider
{
    private readonly string _defaultConnectionString;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<TenantConnectionProvider> _logger;
    private readonly ConcurrentDictionary<Guid, string> _dbNameCache = new();

    public TenantConnectionProvider(
        IConfiguration configuration,
        IServiceScopeFactory scopeFactory,
        ILogger<TenantConnectionProvider> logger)
    {
        _defaultConnectionString = configuration.GetConnectionString("Database")
            ?? "Host=localhost;Port=5432;Database=lealcontrol;Username=leal;Password=leal";
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    public string GetConnectionString(TenantId tenantId)
    {
        if (tenantId.Value == Guid.Empty)
        {
            return _defaultConnectionString;
        }

        if (_dbNameCache.TryGetValue(tenantId.Value, out var cachedDb))
        {
            return BuildConnectionString(cachedDb);
        }

        try
        {
            using var scope = _scopeFactory.CreateScope();
            var masterDb = scope.ServiceProvider.GetService<MasterDbContext>();
            if (masterDb != null)
            {
                var tenant = masterDb.Tenants.AsNoTracking().FirstOrDefault(t => t.Id == tenantId.Value);
                if (tenant != null && !string.IsNullOrWhiteSpace(tenant.DbName))
                {
                    _dbNameCache[tenantId.Value] = tenant.DbName;
                    return BuildConnectionString(tenant.DbName);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error resolving DbName for tenant {TenantId}, falling back to default.", tenantId.Value);
        }

        return _defaultConnectionString;
    }

    public async Task<string> GetConnectionStringAsync(TenantId tenantId, CancellationToken cancellationToken = default)
    {
        if (tenantId.Value == Guid.Empty)
        {
            return _defaultConnectionString;
        }

        if (_dbNameCache.TryGetValue(tenantId.Value, out var cachedDb))
        {
            return BuildConnectionString(cachedDb);
        }

        try
        {
            using var scope = _scopeFactory.CreateScope();
            var masterDb = scope.ServiceProvider.GetService<MasterDbContext>();
            if (masterDb != null)
            {
                var tenant = await masterDb.Tenants.AsNoTracking()
                    .FirstOrDefaultAsync(t => t.Id == tenantId.Value, cancellationToken);

                if (tenant != null && !string.IsNullOrWhiteSpace(tenant.DbName))
                {
                    _dbNameCache[tenantId.Value] = tenant.DbName;
                    return BuildConnectionString(tenant.DbName);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error resolving DbName for tenant {TenantId} async, falling back to default.", tenantId.Value);
        }

        return _defaultConnectionString;
    }

    public void InvalidateCache(TenantId tenantId)
    {
        if (tenantId.Value != Guid.Empty)
        {
            _dbNameCache.TryRemove(tenantId.Value, out _);
        }
    }

    private string BuildConnectionString(string dbName)
    {
        var builder = new NpgsqlConnectionStringBuilder(_defaultConnectionString)
        {
            Database = dbName
        };
        return builder.ConnectionString;
    }
}
