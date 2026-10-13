using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Notices;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Sales.Domain.Quotes;
using LealControl.Modules.Sales.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Sales.Infrastructure.Notices;

internal static class NoticeText
{
    public static readonly CultureInfo Ar = CultureInfo.GetCultureInfo("es-AR");
    public static string Money(string currency, decimal amount) =>
        $"{(currency == "ARS" ? "$" : currency)} {amount.ToString("N2", Ar)}";

    /// <summary>Hasta <paramref name="max"/> renglones y, si hay más, uno que lo dice.</summary>
    public static IReadOnlyList<NoticeItem> Cap(List<NoticeItem> items, int max, string link) =>
        items.Count <= max ? items : [.. items.Take(max), new NoticeItem($"Y {items.Count - max} más", null, link, NoticeSeverity.Info)];
}

/// <summary>Aviso: facturas vencidas con saldo pendiente.</summary>
public sealed class OverdueInvoiceNotices : INoticeProvider
{
    public string Code => "sales.overdue-invoices";
    public string Module => "sales";
    public int MinimumLevel => 1;
    public NoticeSensitivity Sensitivity => NoticeSensitivity.Amounts;
    public string Label => "Facturas vencidas sin cobrar";
    public string Description => "Facturas autorizadas que pasaron su vencimiento y todavía tienen saldo.";
    public bool DefaultOn => true;

    public async Task<IReadOnlyList<NoticeItem>> GetAsync(NoticeContext context, CancellationToken cancellationToken)
    {
        await using var db = new SalesDbContext(new DbContextOptionsBuilder<SalesDbContext>().UseNpgsql(context.ConnectionString).Options);
        var tenant = new TenantId(context.TenantId);
        var today = context.Today.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        var overdue = await db.Invoices.AsNoTracking()
            .Where(i => i.TenantId == tenant && i.Status == "Authorized" && i.DueDate < today && !i.InvoiceType.StartsWith("NC"))
            .Select(i => new { i.Id, i.FormattedNumber, i.CustomerId, i.CustomerName, i.DueDate, i.Currency })
            .ToListAsync(cancellationToken);
        if (overdue.Count == 0) return [];

        var balances = await ReceivableBalances.ComputeAsync(db, tenant, cancellationToken);
        var items = overdue
            .Select(i => new { Invoice = i, Pending = balances.TryGetValue(i.Id, out var b) ? b.Pending : 0m })
            .Where(x => x.Pending > 0.01m)
            .OrderBy(x => x.Invoice.DueDate)
            .Select(x =>
            {
                var days = context.Today.DayNumber - DateOnly.FromDateTime(x.Invoice.DueDate).DayNumber;
                return new NoticeItem(
                    $"{x.Invoice.FormattedNumber} · {x.Invoice.CustomerName}",
                    $"Venció hace {days} días · saldo {NoticeText.Money(x.Invoice.Currency, x.Pending)}",
                    $"/finanzas/cuenta-corriente?cuenta={x.Invoice.CustomerId}",
                    days > 30 ? NoticeSeverity.Critical : NoticeSeverity.Warning);
            })
            .ToList();
        return NoticeText.Cap(items, 25, "/facturas");
    }
}

/// <summary>Aviso: presupuestos enviados que vencen en los próximos días (o vencieron hace poco).</summary>
public sealed class ExpiringQuoteNotices : INoticeProvider
{
    public string Code => "sales.quotes-expiring";
    public string Module => "sales";
    public int MinimumLevel => 1;
    public NoticeSensitivity Sensitivity => NoticeSensitivity.None;
    public string Label => "Presupuestos por vencer";
    public string Description => "Presupuestos enviados que vencen en los próximos 3 días o vencieron en los últimos 3, para hacer el seguimiento.";
    public bool DefaultOn => true;

    public async Task<IReadOnlyList<NoticeItem>> GetAsync(NoticeContext context, CancellationToken cancellationToken)
    {
        await using var db = new SalesDbContext(new DbContextOptionsBuilder<SalesDbContext>().UseNpgsql(context.ConnectionString).Options);
        var tenant = new TenantId(context.TenantId);
        var quotes = await db.Quotes.AsNoTracking()
            .Where(q => q.TenantId == tenant && q.Status == QuoteStatus.Sent)
            .Select(q => new { q.Id, q.QuoteNumber, q.Revision, q.CreatedAtUtc, q.ValidDays })
            .ToListAsync(cancellationToken);
        var items = quotes
            .Select(q => new { Quote = q, Expires = DateOnly.FromDateTime(q.CreatedAtUtc.AddHours(-3)).AddDays(q.ValidDays) })
            .Select(x => new { x.Quote, x.Expires, Days = x.Expires.DayNumber - context.Today.DayNumber })
            .Where(x => x.Days is >= -3 and <= 3)
            .OrderBy(x => x.Days)
            .Select(x => new NoticeItem(
                $"Presupuesto {x.Quote.QuoteNumber} (rev. {x.Quote.Revision})",
                x.Days < 0 ? $"Venció el {x.Expires:dd/MM/yyyy}" : x.Days == 0 ? "Vence hoy" : $"Vence el {x.Expires:dd/MM/yyyy}",
                $"/presupuestos/{x.Quote.Id}",
                x.Days < 0 ? NoticeSeverity.Warning : NoticeSeverity.Info))
            .ToList();
        return NoticeText.Cap(items, 25, "/presupuestos");
    }
}
