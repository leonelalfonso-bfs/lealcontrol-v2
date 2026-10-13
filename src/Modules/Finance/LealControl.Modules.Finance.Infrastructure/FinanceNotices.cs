using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Notices;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Finance.Infrastructure;

/// <summary>Aviso: cheques recibidos en cartera que ya se pueden depositar o están por vencer.</summary>
public sealed class ChequesToDepositNotices : INoticeProvider
{
    public string Code => "finance.cheques-to-deposit";
    public string Module => "finance";
    public int MinimumLevel => 1;
    public NoticeSensitivity Sensitivity => NoticeSensitivity.Amounts;
    public string Label => "Cheques para depositar";
    public string Description => "Cheques recibidos en cartera cuya fecha de pago es hoy, ya pasó o llega en los próximos 3 días.";
    public bool DefaultOn => true;

    public async Task<IReadOnlyList<NoticeItem>> GetAsync(NoticeContext context, CancellationToken cancellationToken)
    {
        await using var db = new FinanceDbContext(new DbContextOptionsBuilder<FinanceDbContext>().UseNpgsql(context.ConnectionString).Options);
        var limit = context.Today.AddDays(3).ToDateTime(new TimeOnly(23, 59), DateTimeKind.Utc);
        var cheques = await db.ReceivedCheques.AsNoTracking()
            .Where(c => c.TenantId == context.TenantId && c.Direction == ChequeDirection.Received
                && c.Status == ReceivedChequeStatus.Available && c.DueDateUtc != null && c.DueDateUtc <= limit)
            .OrderBy(c => c.DueDateUtc)
            .ToListAsync(cancellationToken);
        var ar = CultureInfo.GetCultureInfo("es-AR");
        return cheques.Take(25).Select(c =>
        {
            var due = DateOnly.FromDateTime(c.DueDateUtc!.Value);
            var days = due.DayNumber - context.Today.DayNumber;
            var amount = $"{(c.Currency == "ARS" ? "$" : c.Currency)} {c.Amount.ToString("N2", ar)}";
            return new NoticeItem(
                $"Cheque {c.CheckNumber} · {c.IssuerName ?? c.ReceivedFrom ?? "sin emisor"}",
                (days < 0 ? $"Se puede depositar desde el {due:dd/MM/yyyy}" : days == 0 ? "Se puede depositar hoy" : $"Fecha de pago {due:dd/MM/yyyy}") + $" · {amount}",
                "/finanzas/echeqs",
                days <= 0 ? NoticeSeverity.Warning : NoticeSeverity.Info);
        }).ToList();
    }
}
