using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Communications.Infrastructure.Domain;
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
        // Each account opts in independently. The legacy global switch remains supported.
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
        var globalSyncEnabled = _configuration.GetValue<bool>("Communications:BackgroundSyncEnabled");

        foreach (var tenantId in tenantIds)
        {
            try
            {
                await SyncTenantAsync(tenantId, globalSyncEnabled, ct);
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

    internal static IQueryable<MailAccount> EligibleAccounts(CommunicationsDbContext db, Guid tenantId, bool globalSyncEnabled) =>
        db.MailAccounts.Where(x => x.TenantId == tenantId && x.IsActive && (x.AutoSyncEnabled || globalSyncEnabled));

    private async Task SyncTenantAsync(Guid tenantId, bool globalSyncEnabled, CancellationToken ct)
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

        var accounts = await EligibleAccounts(db, tenantId, globalSyncEnabled)
            .OrderBy(x => x.UpdatedAtUtc)
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
