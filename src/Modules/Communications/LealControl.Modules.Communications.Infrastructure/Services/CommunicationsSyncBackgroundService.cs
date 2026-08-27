using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using LealControl.Modules.Communications.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace LealControl.Modules.Communications.Infrastructure.Services;

public sealed class CommunicationsSyncBackgroundService : BackgroundService
{
    private readonly IServiceProvider _services;
    private readonly ILogger<CommunicationsSyncBackgroundService> _logger;
    private static readonly TimeSpan Interval = TimeSpan.FromMinutes(5);

    public CommunicationsSyncBackgroundService(IServiceProvider services, ILogger<CommunicationsSyncBackgroundService> logger)
    {
        _services = services;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await SyncAllActiveMailAccountsAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error en sync automático de correo");
            }

            await Task.Delay(Interval, stoppingToken);
        }
    }

    private async Task SyncAllActiveMailAccountsAsync(CancellationToken ct)
    {
        using var scope = _services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CommunicationsDbContext>();
        var mailSync = scope.ServiceProvider.GetRequiredService<MailSyncService>();
        var conversationService = scope.ServiceProvider.GetRequiredService<ConversationService>();

        var accounts = await db.MailAccounts
            .Where(x => x.IsActive)
            .OrderBy(x => x.LastSyncAtUtc)
            .Take(20)
            .ToListAsync(ct);

        foreach (var account in accounts)
        {
            try
            {
                var added = await mailSync.SyncAccountAsync(db, conversationService, account, ct);
                if (added > 0)
                {
                    _logger.LogInformation("Sync automático: {Count} correos nuevos para {Email}", added, account.EmailAddress);
                }
            }
            catch (Exception ex)
            {
                account.RecordError(ex.Message, DateTime.UtcNow);
                await db.SaveChangesAsync(ct);
                _logger.LogWarning(ex, "Sync automático falló para cuenta {Email}", account.EmailAddress);
            }
        }
    }
}
