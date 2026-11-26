using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Notices;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Domain.Opportunities;
using LealControl.Modules.Crm.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Crm.Infrastructure.Notices;

/// <summary>Aviso: actividades del CRM sin hacer que vencen hoy o ya vencieron (incluye los seguimientos automáticos).</summary>
public sealed class DueActivityNotices : INoticeProvider
{
    public string Code => "crm.activities-due";
    public string Module => "sales";
    public int MinimumLevel => 1;
    public NoticeSensitivity Sensitivity => NoticeSensitivity.None;
    public string Label => "Actividades vencidas y de hoy";
    public string Description => "Llamados, visitas y seguimientos del CRM que vencen hoy o ya vencieron sin marcarse como hechos.";
    public bool DefaultOn => true;

    public async Task<IReadOnlyList<NoticeItem>> GetAsync(NoticeContext context, CancellationToken cancellationToken)
    {
        await using var db = new CrmDbContext(new DbContextOptionsBuilder<CrmDbContext>().UseNpgsql(context.ConnectionString).Options);
        var tenant = new TenantId(context.TenantId);
        var limit = context.Today.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc).AddDays(1);
        var due = await db.Activities.AsNoTracking()
            .Where(a => a.TenantId == tenant && !a.IsDone && a.DueDate != null && a.DueDate < limit)
            .OrderBy(a => a.DueDate)
            .Select(a => new { a.Description, a.DueDate, a.CustomerId, a.OpportunityId })
            .Take(100)
            .ToListAsync(cancellationToken);
        if (due.Count == 0) return [];

        var customerIds = due.Where(a => a.CustomerId != null).Select(a => a.CustomerId!.Value).Distinct().ToList();
        var names = await db.Customers.AsNoTracking().Where(c => customerIds.Contains(c.Id))
            .ToDictionaryAsync(c => c.Id, c => c.TradeName ?? c.LegalName, cancellationToken);

        var items = due.Select(a =>
        {
            var day = DateOnly.FromDateTime(a.DueDate!.Value);
            var late = context.Today.DayNumber - day.DayNumber;
            var who = a.CustomerId is { } cid && names.TryGetValue(cid, out var name) ? $"{name} · " : "";
            return new NoticeItem(
                $"{who}{a.Description}",
                late <= 0 ? "Para hoy" : late == 1 ? "Venció ayer" : $"Venció el {day:dd/MM/yyyy}",
                a.OpportunityId is not null ? $"/oportunidades/{a.OpportunityId.Value.Value}" : a.CustomerId is not null ? $"/clientes/{a.CustomerId.Value.Value}" : "/oportunidades",
                late > 3 ? NoticeSeverity.Critical : late > 0 ? NoticeSeverity.Warning : NoticeSeverity.Info);
        }).ToList();
        return items.Count <= 25 ? items : [.. items.Take(25), new NoticeItem($"Y {items.Count - 25} más", null, "/oportunidades", NoticeSeverity.Info)];
    }
}

/// <summary>Aviso: oportunidades abiertas sin movimiento (ni cambios ni actividades) en sus días de "enfriamiento".</summary>
public sealed class StaleOpportunityNotices : INoticeProvider
{
    public const int DefaultDays = 15;

    public string Code => "crm.stale-opportunities";
    public string Module => "sales";
    public int MinimumLevel => 1;
    public NoticeSensitivity Sensitivity => NoticeSensitivity.None;
    public string Label => "Oportunidades sin movimiento";
    public string Description => $"Oportunidades abiertas sin cambios ni actividades en {DefaultDays} días (o los que tenga configurados cada una).";
    public bool DefaultOn => true;

    public async Task<IReadOnlyList<NoticeItem>> GetAsync(NoticeContext context, CancellationToken cancellationToken)
    {
        await using var db = new CrmDbContext(new DbContextOptionsBuilder<CrmDbContext>().UseNpgsql(context.ConnectionString).Options);
        var tenant = new TenantId(context.TenantId);
        var open = await db.Opportunities.AsNoTracking()
            .Where(o => o.TenantId == tenant && o.Stage != OpportunityStage.Won && o.Stage != OpportunityStage.Lost)
            .Select(o => new
            {
                o.Id, o.Title, o.Stage, o.RottingDays, o.UpdatedAtUtc,
                LastActivity = db.Activities.Where(a => a.TenantId == tenant && a.OpportunityId == o.Id).Max(a => (DateTime?)a.CreatedAtUtc)
            })
            .ToListAsync(cancellationToken);

        var today = context.Today.DayNumber;
        var items = open
            .Select(o => new { o.Id, o.Title, o.Stage, Days = today - DateOnly.FromDateTime(Max(o.UpdatedAtUtc, o.LastActivity).AddHours(-3)).DayNumber, Limit = o.RottingDays ?? DefaultDays })
            .Where(o => o.Days >= o.Limit)
            .OrderByDescending(o => o.Days)
            .Select(o => new NoticeItem(o.Title, $"{StageName(o.Stage)} · sin movimiento hace {o.Days} días", $"/oportunidades/{o.Id.Value}",
                o.Days >= o.Limit * 2 ? NoticeSeverity.Critical : NoticeSeverity.Warning))
            .ToList();
        return items.Count <= 25 ? items : [.. items.Take(25), new NoticeItem($"Y {items.Count - 25} más", null, "/oportunidades", NoticeSeverity.Info)];
    }

    private static DateTime Max(DateTime a, DateTime? b) => b is { } x && x > a ? x : a;

    private static string StageName(OpportunityStage stage) => stage switch
    {
        OpportunityStage.Lead or OpportunityStage.Qualified => "Por cotizar",
        OpportunityStage.Proposal => "Presupuestado",
        OpportunityStage.Negotiation => "En negociación",
        _ => stage.ToString()
    };
}
