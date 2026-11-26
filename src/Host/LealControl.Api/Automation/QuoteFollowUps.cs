using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using LealControl.Api.SuperAdmin;
using LealControl.BuildingBlocks.Notices;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.BuildingBlocks.Time;
using LealControl.Modules.Communications.Infrastructure.Persistence;
using LealControl.Modules.Crm.Domain.Activities;
using LealControl.Modules.Crm.Domain.Customers;
using LealControl.Modules.Crm.Domain.Opportunities;
using LealControl.Modules.Crm.Infrastructure.Persistence;
using LealControl.Modules.Sales.Domain.Quotes;
using LealControl.Modules.Sales.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace LealControl.Api.Automation;

/// <summary>Un presupuesto enviado que el cliente todavía no contestó.</summary>
public sealed record UnansweredQuote(
    Guid Id, string Number, int Revision, Guid CustomerId, string CustomerName, Guid? OpportunityId,
    DateTime SentAtUtc, decimal Total, string Currency, DateTime? FollowUpCreatedAtUtc);

/// <summary>
/// Seguimiento de presupuestos: un presupuesto enviado queda "sin respuesta" cuando pasaron
/// <see cref="BusinessDays"/> días hábiles, sigue en estado Enviado (no se aceptó, rechazó ni pasó a pedido) y el
/// cliente no escribió un mail después del envío (en una conversación vinculada a ese cliente).
/// </summary>
public static class QuoteFollowUp
{
    public const int BusinessDays = 5;

    /// <summary>Solo se crean actividades para envíos de los últimos 30 días: lo más viejo queda en el aviso.</summary>
    public static readonly TimeSpan AutomaticWindow = TimeSpan.FromDays(30);

    public static async Task<List<UnansweredQuote>> FindAsync(string connectionString, Guid tenantId, DateTime nowUtc, CancellationToken ct)
    {
        var cutoff = ArgentinaTime.BusinessCutoff(nowUtc, BusinessDays * 24);
        var tenant = new TenantId(tenantId);
        await using var sales = new SalesDbContext(new DbContextOptionsBuilder<SalesDbContext>().UseNpgsql(connectionString).Options);
        var quotes = await sales.Quotes.AsNoTracking()
            .Where(q => q.TenantId == tenant && q.Status == QuoteStatus.Sent && q.SentAtUtc != null && q.SentAtUtc <= cutoff)
            .ToListAsync(ct);
        if (quotes.Count == 0) return [];

        var customerIds = quotes.Select(q => q.CustomerId).Distinct().ToList();
        var lastMailFrom = await LastIncomingMailAsync(connectionString, tenantId, customerIds, ct);

        await using var crm = new CrmDbContext(new DbContextOptionsBuilder<CrmDbContext>().UseNpgsql(connectionString).Options);
        var crmIds = customerIds.Select(id => new CustomerId(id)).ToList();
        var names = await crm.Customers.AsNoTracking().Where(c => crmIds.Contains(c.Id))
            .ToDictionaryAsync(c => c.Id.Value, c => c.TradeName ?? c.LegalName, ct);

        return quotes
            .Where(q => !(lastMailFrom.TryGetValue(q.CustomerId, out var last) && last > q.SentAtUtc!.Value))
            .OrderBy(q => q.SentAtUtc)
            .Select(q => new UnansweredQuote(q.Id.Value, q.QuoteNumber, q.Revision, q.CustomerId, names.GetValueOrDefault(q.CustomerId, "Cliente"),
                q.OpportunityId, q.SentAtUtc!.Value, q.Total, q.Currency, q.FollowUpCreatedAtUtc))
            .ToList();
    }

    /// <summary>El último mail recibido de cada cliente, en conversaciones vinculadas a él.</summary>
    private static async Task<Dictionary<Guid, DateTime>> LastIncomingMailAsync(string connectionString, Guid tenantId, List<Guid> customerIds, CancellationToken ct)
    {
        try
        {
            await using var comms = new CommunicationsDbContext(new DbContextOptionsBuilder<CommunicationsDbContext>().UseNpgsql(connectionString).Options);
            return await comms.Conversations.AsNoTracking()
                .Where(c => c.TenantId == tenantId && c.RelatedCustomerId != null && customerIds.Contains(c.RelatedCustomerId.Value) && c.LastIncomingAtUtc != null)
                .GroupBy(c => c.RelatedCustomerId!.Value)
                .Select(g => new { g.Key, Last = g.Max(c => c.LastIncomingAtUtc!.Value) })
                .ToDictionaryAsync(x => x.Key, x => x.Last, ct);
        }
        catch (PostgresException ex) when (ex.SqlState == PostgresErrorCodes.UndefinedTable)
        {
            return []; // La empresa todavía no usa la bandeja de entrada.
        }
    }

    /// <summary>
    /// Crea en el CRM la actividad "llamar para seguimiento", para hoy, de cada presupuesto sin respuesta que todavía no
    /// la tiene. Devuelve cuántas creó.
    /// </summary>
    public static async Task<int> CreateActivitiesAsync(string connectionString, Guid tenantId, DateTime nowUtc, CancellationToken ct)
    {
        var pending = (await FindAsync(connectionString, tenantId, nowUtc, ct))
            .Where(q => q.FollowUpCreatedAtUtc == null && q.SentAtUtc >= nowUtc - AutomaticWindow)
            .ToList();
        if (pending.Count == 0) return 0;

        var tenant = new TenantId(tenantId);
        var today = ArgentinaTime.TodayAsUtcDate(nowUtc);
        await using var crm = new CrmDbContext(new DbContextOptionsBuilder<CrmDbContext>().UseNpgsql(connectionString).Options);
        var opportunityIds = pending.Where(q => q.OpportunityId != null).Select(q => new OpportunityId(q.OpportunityId!.Value)).ToList();
        var owners = await crm.Opportunities.AsNoTracking().Where(o => opportunityIds.Contains(o.Id))
            .ToDictionaryAsync(o => o.Id.Value, o => o.OwnerId, ct);

        foreach (var quote in pending)
        {
            var sent = ArgentinaTime.Now(new DateTimeOffset(quote.SentAtUtc, TimeSpan.Zero)).ToString("dd/MM", CultureInfo.InvariantCulture);
            var activity = Activity.Log(tenant, ActivityType.Call,
                $"Seguimiento del presupuesto {quote.Number} (rev. {quote.Revision}): enviado el {sent}, sin respuesta del cliente.",
                new CustomerId(quote.CustomerId), null, quote.OpportunityId is { } opp ? new OpportunityId(opp) : null,
                quote.OpportunityId is { } o && owners.TryGetValue(o, out var owner) ? owner : null,
                today, nowUtc, today);
            if (activity.IsSuccess) crm.Activities.Add(activity.Value);
        }
        await crm.SaveChangesAsync(ct);

        await using var sales = new SalesDbContext(new DbContextOptionsBuilder<SalesDbContext>().UseNpgsql(connectionString).Options);
        var ids = pending.Select(q => new QuoteId(q.Id)).ToList();
        foreach (var quote in await sales.Quotes.Where(q => ids.Contains(q.Id)).ToListAsync(ct)) quote.MarkFollowUpCreated(nowUtc);
        await sales.SaveChangesAsync(ct);
        return pending.Count;
    }
}

/// <summary>Aviso: presupuestos enviados sin respuesta del cliente.</summary>
public sealed class UnansweredQuoteNotices(TimeProvider clock) : INoticeProvider
{
    private static readonly CultureInfo Ar = CultureInfo.GetCultureInfo("es-AR");

    public string Code => "sales.quotes-unanswered";
    public string Module => "sales";
    public int MinimumLevel => 1;
    public NoticeSensitivity Sensitivity => NoticeSensitivity.Amounts;
    public string Label => "Presupuestos sin respuesta";
    public string Description => $"Presupuestos enviados hace {QuoteFollowUp.BusinessDays} días hábiles o más que siguen sin aceptarse ni rechazarse, y el cliente no volvió a escribir.";
    public bool DefaultOn => true;

    public async Task<IReadOnlyList<NoticeItem>> GetAsync(NoticeContext context, CancellationToken cancellationToken)
    {
        var quotes = await QuoteFollowUp.FindAsync(context.ConnectionString, context.TenantId, clock.GetUtcNow().UtcDateTime, cancellationToken);
        var items = quotes.Select(q =>
        {
            var days = context.Today.DayNumber - DateOnly.FromDateTime(ArgentinaTime.Now(new DateTimeOffset(q.SentAtUtc, TimeSpan.Zero)).DateTime).DayNumber;
            var money = $"{(q.Currency == "ARS" ? "$" : q.Currency)} {q.Total.ToString("N2", Ar)}";
            return new NoticeItem($"{q.Number} · {q.CustomerName}", $"Enviado hace {days} días · {money}", $"/presupuestos/{q.Id}",
                days > 20 ? NoticeSeverity.Critical : NoticeSeverity.Warning);
        }).ToList();
        return items.Count <= 25 ? items : [.. items.Take(25), new NoticeItem($"Y {items.Count - 25} más", null, "/presupuestos", NoticeSeverity.Info)];
    }
}

/// <summary>Cada hora, en días hábiles, crea las actividades de seguimiento de los presupuestos sin respuesta.</summary>
public sealed class QuoteFollowUpBackgroundService(IServiceProvider services, TimeProvider clock, ILogger<QuoteFollowUpBackgroundService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromMinutes(2), stoppingToken);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunOnceAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Seguimiento de presupuestos: error general");
            }
            await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
        }
    }

    private async Task RunOnceAsync(CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        if (ArgentinaTime.Now(now).DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday) return;

        using var scope = services.CreateScope();
        var master = scope.ServiceProvider.GetRequiredService<MasterDbContext>();
        var connections = scope.ServiceProvider.GetRequiredService<ITenantConnectionProvider>();
        var tenants = await master.Tenants.AsNoTracking()
            .Where(x => x.IsActive && (x.Status == "Active" || x.Status == "Trial")).Select(x => x.Id).ToListAsync(ct);
        foreach (var tenantId in tenants)
        {
            try
            {
                var cs = await connections.GetConnectionStringAsync(new TenantId(tenantId), ct);
                var created = await QuoteFollowUp.CreateActivitiesAsync(cs, tenantId, now.UtcDateTime, ct);
                if (created > 0) logger.LogInformation("Seguimiento de presupuestos: {Count} actividades creadas (empresa {TenantId})", created, tenantId);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "Seguimiento de presupuestos falló para la empresa {TenantId}", tenantId);
            }
        }
    }
}
