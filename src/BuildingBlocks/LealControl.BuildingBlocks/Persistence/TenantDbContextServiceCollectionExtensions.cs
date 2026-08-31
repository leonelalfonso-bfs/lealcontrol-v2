using LealControl.BuildingBlocks.Tenancy;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql.EntityFrameworkCore.PostgreSQL.Infrastructure;

namespace LealControl.BuildingBlocks.Persistence;

public static class TenantDbContextServiceCollectionExtensions
{
    public static IServiceCollection AddTenantDbContext<TContext>(
        this IServiceCollection services,
        string? migrationsHistorySchema = null,
        Action<NpgsqlDbContextOptionsBuilder>? configureNpgsql = null)
        where TContext : DbContext
    {
        services.AddDbContext<TContext>((serviceProvider, options) =>
        {
            var tenantContext = serviceProvider.GetRequiredService<ITenantContext>();
            var connectionProvider = serviceProvider.GetRequiredService<ITenantConnectionProvider>();
            var connectionString = connectionProvider.GetConnectionString(tenantContext.TenantId);

            options.UseNpgsql(connectionString, npgsql =>
            {
                if (!string.IsNullOrWhiteSpace(migrationsHistorySchema))
                {
                    npgsql.MigrationsHistoryTable("__ef_migrations_history", migrationsHistorySchema);
                }

                configureNpgsql?.Invoke(npgsql);
            });
        });

        return services;
    }
}
