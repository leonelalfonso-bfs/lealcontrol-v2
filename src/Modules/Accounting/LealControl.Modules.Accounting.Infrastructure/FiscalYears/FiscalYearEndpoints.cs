using LealControl.BuildingBlocks.Tenancy;
using LealControl.BuildingBlocks.Time;
using LealControl.Modules.Accounting.Contracts.Posting;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Accounting.Infrastructure.FiscalYears;

/// <summary>Ejercicios de la empresa: estado, cierre (refundición, cierre y apertura), reapertura y Libro Diario.</summary>
internal static class FiscalYearEndpoints
{
    public static RouteGroupBuilder MapFiscalYearEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("/fiscal-years", async (ITenantContext tenant, AccountingDbContext db, TimeProvider clock, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureAccountingTablesAsync(ct);
            var endMonth = (await db.GetOrCreateTenantSettingsAsync(tenantId, ct)).FiscalYearEndMonth;
            var today = ArgentinaTime.TodayAsUtcDate(clock.GetUtcNow());
            var first = await db.JournalEntries.AsNoTracking().Where(e => e.TenantId == tenantId)
                .MinAsync(e => (DateTime?)e.Date, ct) ?? today;
            var current = FiscalYears.For(today, endMonth);

            var years = new List<object>();
            for (var fy = FiscalYears.For(first, endMonth); fy.Start <= current.Start; fy = fy.Next(endMonth))
            {
                var y = fy;
                var closingEntries = await db.JournalEntries.AsNoTracking()
                    .Where(e => e.TenantId == tenantId && e.SourceModule == FiscalYears.SourceModule && e.SourceDocumentId!.StartsWith(y.Key + ":"))
                    .OrderBy(e => e.EntryNumber).Select(e => e.EntryNumber).ToListAsync(ct);
                var profit = await db.JournalEntries.AsNoTracking()
                    .Where(e => e.TenantId == tenantId && e.Date >= y.Start && e.Date < y.EndExclusive && e.SourceModule != FiscalYears.SourceModule)
                    .SelectMany(e => e.Lines)
                    .Join(db.Accounts.Where(a => a.TenantId == tenantId && (a.AccountType == "Income" || a.AccountType == "Expense")),
                        l => l.AccountId, a => a.Id, (l, a) => l.Credit - l.Debit)
                    .SumAsync(x => (decimal?)x, ct) ?? 0m;
                var pending = await db.PendingDocuments.AsNoTracking()
                    .CountAsync(d => d.TenantId == tenantId && d.DocumentDateUtc >= y.Start && d.DocumentDateUtc < y.EndExclusive
                                     && (d.Status == AccountingPendingDocumentStatuses.Pending || d.Status == AccountingPendingDocumentStatuses.Error), ct);
                years.Add(new
                {
                    y.Start, y.End, y.Label,
                    Status = closingEntries.Count > 0 ? "Closed" : "Open",
                    ClosingEntryNumbers = closingEntries,
                    Result = profit,
                    PendingDocuments = pending
                });
            }
            years.Reverse();
            return Results.Ok(new { FiscalYearEndMonth = endMonth, Years = years });
        });

        group.MapPost("/fiscal-years/close", async (
            FiscalYearRequest req, HttpContext http, ITenantContext tenant, AccountingDbContext db,
            IEnumerable<IAccountingDocumentSource> sources, TimeProvider clock, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureAccountingTablesAsync(ct);
            await db.SeedDefaultChartOfAccountsAsync(tenantId, ct);
            var endMonth = (await db.GetOrCreateTenantSettingsAsync(tenantId, ct)).FiscalYearEndMonth;
            if (Year(req.End, endMonth) is not { } fy)
                return Problem($"La fecha no es un cierre de ejercicio: la empresa cierra el último día del mes {endMonth}.");

            if (fy.End >= ArgentinaTime.TodayAsUtcDate(clock.GetUtcNow()))
                return Problem($"El ejercicio {fy.Label} todavía no terminó.");

            await using (await db.LockPostingRunAsync(tenantId, ct))
            {
                // Lo de Ventas y Compras que todavía no entró a la cola, entra ahora (y queda pendiente si no se contabilizó).
                foreach (var source in sources)
                    await source.PublishPendingAsync(fy.Start, fy.EndExclusive.AddTicks(-1), ct);

                if (await FiscalYears.IsClosedAsync(db, tenantId, fy, ct))
                    return Problem($"El ejercicio {fy.Label} ya está cerrado.");
                var previous = fy.Previous(endMonth);
                if (await FiscalYears.HasEntriesAsync(db, tenantId, previous, ct) && !await FiscalYears.IsClosedAsync(db, tenantId, previous, ct))
                    return Problem($"Cerrá primero el ejercicio anterior ({previous.Label}).");
                var pending = await db.PendingDocuments.CountAsync(d => d.TenantId == tenantId && d.DocumentDateUtc >= fy.Start && d.DocumentDateUtc < fy.EndExclusive
                    && (d.Status == AccountingPendingDocumentStatuses.Pending || d.Status == AccountingPendingDocumentStatuses.Error), ct);
                if (pending > 0)
                    return Problem($"Hay {pending} comprobante(s) del ejercicio sin contabilizar. Contabilizá el período antes de cerrar.");
                if (!await FiscalYears.HasEntriesAsync(db, tenantId, fy, ct))
                    return Problem($"El ejercicio {fy.Label} no tiene movimientos.");
                if (await db.IsPeriodLockedAsync(tenantId, fy.EndExclusive, ct))
                    return Problem($"El mes {fy.EndExclusive:MM/yyyy} (donde va la apertura) está cerrado con candado.");

                var mapping = await db.GetOrCreateMappingAsync(tenantId, ct);
                var user = User(http);
                IReadOnlyList<JournalEntry> entries;
                try
                {
                    entries = await FiscalYears.BuildClosingEntriesAsync(db, tenantId, fy, mapping.RetainedEarningsAccountCode, "3.2.01", user, ct);
                }
                catch (InvalidOperationException ex)
                {
                    return Problem(ex.Message);
                }

                await using var tx = await db.Database.BeginTransactionAsync(ct);
                var number = await db.LockEntryNumberingAsync(tenantId, ct);
                foreach (var entry in entries)
                {
                    entry.EntryNumber = ++number;
                    db.JournalEntries.Add(entry);
                }
                await SetLockAsync(db, tenantId, fy, true, user, ct);
                await db.SaveChangesAsync(ct);
                await tx.CommitAsync(ct);
                return Results.Ok(new { fy.Label, EntryNumbers = entries.Select(e => e.EntryNumber) });
            }
        });

        group.MapPost("/fiscal-years/reopen", async (FiscalYearRequest req, HttpContext http, ITenantContext tenant, AccountingDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureAccountingTablesAsync(ct);
            var endMonth = (await db.GetOrCreateTenantSettingsAsync(tenantId, ct)).FiscalYearEndMonth;
            if (Year(req.End, endMonth) is not { } fy)
                return Problem($"La fecha no es un cierre de ejercicio: la empresa cierra el último día del mes {endMonth}.");
            if (!await FiscalYears.IsClosedAsync(db, tenantId, fy, ct))
                return Problem($"El ejercicio {fy.Label} no está cerrado.");
            if (await FiscalYears.IsClosedAsync(db, tenantId, fy.Next(endMonth), ct))
                return Problem("Reabrí primero el ejercicio siguiente.");
            if (await db.IsPeriodLockedAsync(tenantId, fy.EndExclusive, ct))
                return Problem($"El mes {fy.EndExclusive:MM/yyyy} (donde está la apertura) está cerrado con candado: abrilo primero.");

            await using var tx = await db.Database.BeginTransactionAsync(ct);
            await db.LockEntryNumberingAsync(tenantId, ct);
            var entries = await db.JournalEntries.Include(e => e.Lines)
                .Where(e => e.TenantId == tenantId && e.SourceModule == FiscalYears.SourceModule && e.SourceDocumentId!.StartsWith(fy.Key + ":"))
                .ToListAsync(ct);
            db.JournalEntries.RemoveRange(entries);
            await SetLockAsync(db, tenantId, fy, false, User(http), ct);
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return Results.Ok(new { fy.Label, Removed = entries.Count });
        });

        group.MapGet("/journal-book", async (DateTime from, DateTime to, ITenantContext tenant, AccountingDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureAccountingTablesAsync(ct);
            var start = DateTime.SpecifyKind(from.Date, DateTimeKind.Utc);
            var until = DateTime.SpecifyKind(to.Date, DateTimeKind.Utc).AddDays(1);
            if (until <= start || until > start.AddYears(2).AddDays(1))
                return Problem("Elegí un período válido (hasta dos años).");
            var endMonth = (await db.GetOrCreateTenantSettingsAsync(tenantId, ct)).FiscalYearEndMonth;

            // El número de orden es correlativo dentro de cada ejercicio, en orden de fecha.
            var fy = FiscalYears.For(start, endMonth);
            var entries = await db.JournalEntries.AsNoTracking().Include(e => e.Lines)
                .Where(e => e.TenantId == tenantId && e.Date >= fy.Start && e.Date < until)
                .OrderBy(e => e.Date).ThenBy(e => e.EntryNumber)
                .ToListAsync(ct);
            var rows = new List<object>();
            var order = 0;
            foreach (var e in entries)
            {
                while (e.Date >= fy.EndExclusive) { fy = fy.Next(endMonth); order = 0; }
                order++;
                if (e.Date < start) continue;
                rows.Add(new
                {
                    Order = order, FiscalYear = fy.Label, e.Id, e.EntryNumber, e.Date, e.Concept, e.EntryType, e.SourceModule,
                    e.TotalDebit, e.TotalCredit,
                    Lines = e.Lines.OrderByDescending(l => l.Debit > 0m).ThenBy(l => l.AccountCode).Select(l => new
                    {
                        l.AccountCode, l.AccountName, l.Debit, l.Credit, l.Memo, l.Currency, l.OriginalAmount
                    })
                });
            }
            return Results.Ok(new
            {
                From = start, To = until.AddDays(-1), Entries = rows,
                TotalDebit = entries.Where(e => e.Date >= start).Sum(e => e.TotalDebit),
                TotalCredit = entries.Where(e => e.Date >= start).Sum(e => e.TotalCredit)
            });
        });

        return group;
    }

    private static FiscalYear? Year(DateTime end, int endMonth)
    {
        var date = DateTime.SpecifyKind(end.Date, DateTimeKind.Utc);
        var fy = FiscalYears.For(date, endMonth);
        return fy.End == date ? fy : null;
    }

    private static string User(HttpContext http) =>
        http.User.FindFirst("name")?.Value ?? http.User.FindFirst("email")?.Value ?? "Usuario";

    private static IResult Problem(string message) => Results.BadRequest(new { message });

    /// <summary>Cierra (o reabre) con candado todos los meses del ejercicio.</summary>
    private static async Task SetLockAsync(AccountingDbContext db, TenantId tenantId, FiscalYear fy, bool locked, string user, CancellationToken ct)
    {
        var periods = await db.Periods.Where(p => p.TenantId == tenantId).ToListAsync(ct);
        foreach (var (year, month) in fy.Months())
        {
            var period = periods.FirstOrDefault(p => p.Year == year && p.Month == month);
            if (period is null)
            {
                period = new FiscalYearPeriod { TenantId = tenantId, Year = year, Month = month };
                db.Periods.Add(period);
            }
            period.Status = locked ? "Locked" : "Open";
            period.LockedAtUtc = locked ? DateTime.UtcNow : null;
            period.LockedBy = locked ? user : null;
        }
    }
}

public sealed record FiscalYearRequest(DateTime End);
