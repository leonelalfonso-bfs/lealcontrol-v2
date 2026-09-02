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

public sealed class TenantConnectionProvider : ITenantConnectionProvider
{
    private sealed record TenantRoute(string DbName, string Status);

    private readonly string _defaultConnectionString;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<TenantConnectionProvider> _logger;
    private readonly ConcurrentDictionary<Guid, TenantRoute> _routeCache = new();

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

    public string GetConnectionString(TenantId tenantId) =>
        GetConnectionStringAsync(tenantId).GetAwaiter().GetResult();

    public async Task<string> GetConnectionStringAsync(TenantId tenantId, CancellationToken cancellationToken = default)
    {
        if (tenantId.Value == Guid.Empty)
        {
            return _defaultConnectionString;
        }

        if (_routeCache.TryGetValue(tenantId.Value, out var cached))
        {
            EnsureTenantAccessible(tenantId.Value, cached.Status);
            return BuildConnectionString(cached.DbName);
        }

        var route = await ResolveTenantRouteAsync(tenantId.Value, cancellationToken);
        _routeCache[tenantId.Value] = route;
        EnsureTenantAccessible(tenantId.Value, route.Status);
        return BuildConnectionString(route.DbName);
    }

    public void InvalidateCache(TenantId tenantId)
    {
        if (tenantId.Value != Guid.Empty)
        {
            _routeCache.TryRemove(tenantId.Value, out _);
        }
    }

    private async Task<TenantRoute> ResolveTenantRouteAsync(Guid tenantId, CancellationToken cancellationToken)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var masterDb = scope.ServiceProvider.GetService<MasterDbContext>();
            if (masterDb == null)
            {
                throw TenantNotFoundException.ForTenant(tenantId);
            }

            var tenant = await masterDb.Tenants.AsNoTracking()
                .FirstOrDefaultAsync(t => t.Id == tenantId, cancellationToken);

            if (tenant == null || string.IsNullOrWhiteSpace(tenant.DbName))
            {
                throw TenantNotFoundException.ForTenant(tenantId);
            }

            return new TenantRoute(tenant.DbName, tenant.Status);
        }
        catch (TenantNotFoundException)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error resolviendo la base de datos del tenant {TenantId}.", tenantId);
            throw TenantNotFoundException.ForTenant(tenantId);
        }
    }

    private static void EnsureTenantAccessible(Guid tenantId, string status)
    {
        if (string.Equals(status, "Suspended", StringComparison.OrdinalIgnoreCase))
        {
            throw TenantNotFoundException.Suspended(tenantId);
        }

        if (string.Equals(status, "Expired", StringComparison.OrdinalIgnoreCase))
        {
            throw TenantNotFoundException.Expired(tenantId);
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
