using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Communications.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace LealControl.Modules.Communications.Infrastructure.Services;

public sealed class CommunicationsSyncBackgroundService : BackgroundService
{
    private readonly IServiceProvider _services;
    private readonly ITenantConnectionProvider _connections;
    private readonly IConfiguration _configuration;
    private readonly ILogger<CommunicationsSyncBackgroundService> _logger;
    private static readonly TimeSpan Interval = TimeSpan.FromMinutes(5);

    public CommunicationsSyncBackgroundService(
        IServiceProvider services,
        ITenantConnectionProvider connections,
        IConfiguration configuration,
        ILogger<CommunicationsSyncBackgroundService> logger)
    {
        _services = services;
        _connections = connections;
        _configuration = configuration;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // The module is still under development. Polling mail requires an explicit
        // switch and must never silently fall back to the default tenant database.
        if (!_configuration.GetValue<bool>("Communications:BackgroundSyncEnabled")) return;
        await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await SyncAllActiveMailAccountsAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error en sync automático de correo");
            }

            await Task.Delay(Interval, stoppingToken);
        }
    }

    internal async Task SyncAllActiveMailAccountsAsync(CancellationToken ct)
    {
        using var catalogScope = _services.CreateScope();
        var catalog = catalogScope.ServiceProvider.GetRequiredService<ICommunicationsTenantCatalog>();
        var tenantIds = await catalog.ListEnabledTenantIdsAsync(ct);

        foreach (var tenantId in tenantIds)
        {
            try
            {
                await SyncTenantAsync(tenantId, ct);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Sync automático falló para tenant {TenantId}", tenantId);
            }
        }
    }

    private async Task SyncTenantAsync(Guid tenantId, CancellationToken ct)
    {
        if (tenantId == Guid.Empty) return;
        var connectionString = await _connections.GetConnectionStringAsync(new TenantId(tenantId), ct);
        var options = new DbContextOptionsBuilder<CommunicationsDbContext>()
            .UseNpgsql(connectionString)
            .Options;

        using var scope = _services.CreateScope();
        await using var db = new CommunicationsDbContext(options);
        var mailSync = scope.ServiceProvider.GetRequiredService<MailSyncService>();
        var conversationService = scope.ServiceProvider.GetRequiredService<ConversationService>();

        var accounts = await db.MailAccounts
            .Where(x => x.TenantId == tenantId && x.IsActive)
            .OrderBy(x => x.LastSyncAtUtc)
            .Take(20)
            .ToListAsync(ct);

        foreach (var account in accounts)
        {
            try
            {
                var added = await mailSync.SyncAccountAsync(db, conversationService, account, ct);
                if (added > 0)
                    _logger.LogInformation("Sync automático: {Count} correos nuevos para tenant {TenantId}", added, tenantId);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                account.RecordError(ex.Message, DateTime.UtcNow);
                await db.SaveChangesAsync(ct);
                _logger.LogWarning(ex, "Sync automático falló para cuenta en tenant {TenantId}", tenantId);
            }
        }
    }
}
