using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Accounting.Infrastructure.FiscalYears;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Accounting.Infrastructure.Inflation;

/// <summary>
/// Ajuste por inflación (RT 6, método simplificado): las cuentas marcadas como no monetarias se reexpresan a
/// moneda de cierre con el índice FACPCE; cada movimiento se multiplica por índice de cierre / índice de su mes.
/// El ajuste de esas cuentas va contra RECPAM, que resulta de la exposición de las partidas monetarias.
/// Se calcula dentro del ejercicio, partiendo del asiento de apertura (ya en moneda del cierre anterior), y
/// cada corrida registra solo lo que falta respecto de los ajustes del ejercicio ya registrados.
/// </summary>
internal static class InflationEndpoints
{
    public const string SourceModule = "Inflation";
    public const string EntryType = "InflationAdjustment";
    public const string RecpamAccountCode = "4.2.04";

    public static RouteGroupBuilder MapInflationEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("/inflation-indices", async (ITenantContext tenant, AccountingDbContext db, CancellationToken ct) =>
        {
            await db.EnsureAccountingTablesAsync(ct);
            var rows = await db.InflationIndices.AsNoTracking().Where(i => i.TenantId == tenant.TenantId)
                .OrderByDescending(i => i.Year).ThenByDescending(i => i.Month)
                .Select(i => new { i.Year, i.Month, i.Value }).ToListAsync(ct);
            return Results.Ok(rows);
        });

        group.MapPut("/inflation-indices", async (List<InflationIndexRequest> req, ITenantContext tenant, AccountingDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureAccountingTablesAsync(ct);
            if (req is null || req.Count == 0) return Problem("Cargá al menos un índice.");
            if (req.FirstOrDefault(r => r.Month is < 1 or > 12 || r.Year is < 1990 or > 2100 || r.Value <= 0m) is { } bad)
                return Problem($"Índice inválido: {bad.Month:D2}/{bad.Year} = {bad.Value}.");
            if (req.GroupBy(r => (r.Year, r.Month)).FirstOrDefault(g => g.Count() > 1) is { } dup)
                return Problem($"El mes {dup.Key.Month:D2}/{dup.Key.Year} está repetido.");
            var existing = await db.InflationIndices.Where(i => i.TenantId == tenantId).ToListAsync(ct);
            foreach (var r in req)
            {
                var row = existing.FirstOrDefault(i => i.Year == r.Year && i.Month == r.Month);
                if (row is null)
                {
                    row = new InflationIndex { TenantId = tenantId, Year = r.Year, Month = r.Month };
                    db.InflationIndices.Add(row);
                }
                row.Value = r.Value;
                row.UpdatedAtUtc = DateTime.UtcNow;
            }
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { Saved = req.Count });
        });

        // Marca como no monetarias las cuentas que lo son en el plan inicial: bienes de cambio, bienes de uso,
        // patrimonio neto y resultados (salvo los financieros, que se presentan netos del RECPAM).
        group.MapPost("/inflation-adjustment/suggest-accounts", async (ITenantContext tenant, AccountingDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await PrepareAsync(db, tenantId, ct);
            var accounts = await db.Accounts.Where(a => a.TenantId == tenantId).ToListAsync(ct);
            var marked = 0;
            foreach (var a in accounts)
            {
                var nonMonetary = a.Code.StartsWith("1.1.04") || a.Code.StartsWith("1.2.") || a.Code.StartsWith("3.")
                    || ((a.Code.StartsWith("4.") || a.Code.StartsWith("5.")) && !a.Code.StartsWith("4.2") && !a.Code.StartsWith("5.3"));
                if (nonMonetary && !a.AdjustsForInflation)
                {
                    a.AdjustsForInflation = true;
                    marked++;
                }
            }
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { Marked = marked, Total = accounts.Count(a => a.AdjustsForInflation) });
        });

        group.MapPost("/inflation-adjustment/preview", async (InflationAdjustmentRequest req, ITenantContext tenant, AccountingDbContext db, CancellationToken ct) =>
        {
            await PrepareAsync(db, tenant.TenantId, ct);
            if (MonthEnd(req.Date) is not { } date) return Problem("Elegí el último día del mes a ajustar.");
            return Results.Ok(await PreviewAsync(db, tenant.TenantId, date, ct));
        });

        group.MapPost("/inflation-adjustment", async (InflationAdjustmentRequest req, HttpContext http, ITenantContext tenant, AccountingDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await PrepareAsync(db, tenantId, ct);
            if (MonthEnd(req.Date) is not { } date) return Problem("Elegí el último día del mes a ajustar.");
            if (await db.IsPeriodLockedAsync(tenantId, date, ct))
                return Problem($"El período {date:MM/yyyy} está cerrado con candado.");

            await using var tx = await db.Database.BeginTransactionAsync(ct);
            var lastNumber = await db.LockEntryNumberingAsync(tenantId, ct);
            var preview = await PreviewAsync(db, tenantId, date, ct);
            if (preview.MissingIndices.Count > 0)
                return Problem($"Faltan los índices de {string.Join(", ", preview.MissingIndices)}.");
            if (preview.ExistingEntryNumber is { } existing)
                return Problem($"{date:MM/yyyy} ya tiene ajuste por inflación (asiento N° {existing}).");
            var rows = preview.Rows.Where(r => r.Adjustment != 0m).ToList();
            if (rows.Count == 0) return Problem("No hay nada para ajustar.");

            var accounts = await db.Accounts.AsNoTracking().Where(a => a.TenantId == tenantId).ToDictionaryAsync(a => a.Code, ct);
            if (!accounts.TryGetValue(RecpamAccountCode, out var recpam))
                return Problem($"Falta la cuenta {RecpamAccountCode} (RECPAM) en el plan de cuentas.");
            var entry = new JournalEntry
            {
                TenantId = tenantId, EntryNumber = lastNumber + 1, Date = date,
                Concept = $"Ajuste por inflación {date:MM/yyyy} (índice {preview.ClosingIndex:N4})", EntryType = EntryType,
                SourceModule = SourceModule, SourceDocumentId = $"axi-{date:yyyy-MM}", Status = "Posted",
                CreatedBy = http.User.FindFirst("name")?.Value ?? http.User.FindFirst("email")?.Value ?? "Usuario",
                CreatedAtUtc = DateTime.UtcNow
            };
            foreach (var r in rows)
                entry.Lines.Add(Line(entry, accounts[r.AccountCode], r.Adjustment));
            entry.Lines.Add(Line(entry, recpam, -rows.Sum(r => r.Adjustment)));
            entry.TotalDebit = entry.Lines.Sum(l => l.Debit);
            entry.TotalCredit = entry.Lines.Sum(l => l.Credit);
            db.JournalEntries.Add(entry);
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return Results.Created($"/api/v1/accounting/journal-entries/{entry.Id}", new { entry.Id, entry.EntryNumber, recpam = preview.Recpam });
        });

        return group;
    }

    private static async Task PrepareAsync(AccountingDbContext db, TenantId tenantId, CancellationToken ct)
    {
        await db.EnsureAccountingTablesAsync(ct);
        await db.SeedDefaultChartOfAccountsAsync(tenantId, ct);
        await db.SeedDefaultJournalTemplatesAsync(tenantId, ct);
    }

    private static IResult Problem(string message) => Results.BadRequest(new { message });

    private static DateTime? MonthEnd(DateTime date)
    {
        var day = DateTime.SpecifyKind(date.Date, DateTimeKind.Utc);
        return day.Day == DateTime.DaysInMonth(day.Year, day.Month) ? day : null;
    }

    private static JournalEntryLine Line(JournalEntry entry, Account account, decimal signed) => new()
    {
        JournalEntryId = entry.Id, TenantId = entry.TenantId, AccountId = account.Id, AccountCode = account.Code, AccountName = account.Name,
        Debit = signed > 0m ? signed : 0m, Credit = signed < 0m ? -signed : 0m, Currency = "ARS", ExchangeRate = 1m
    };

    private static async Task<InflationPreview> PreviewAsync(AccountingDbContext db, TenantId tenantId, DateTime date, CancellationToken ct)
    {
        var until = date.AddDays(1);
        var endMonth = (await db.GetOrCreateTenantSettingsAsync(tenantId, ct)).FiscalYearEndMonth;
        var fy = FiscalYears.FiscalYears.For(date, endMonth);
        var previous = fy.Previous(endMonth);
        var openingKey = FiscalYears.FiscalYears.DocumentId(previous, FiscalYears.FiscalYears.Opening);

        var accounts = await db.Accounts.AsNoTracking()
            .Where(a => a.TenantId == tenantId && a.AdjustsForInflation && a.IsDirectPosting)
            .OrderBy(a => a.Code).ToListAsync(ct);
        var ids = accounts.Select(a => a.Id).ToList();
        var lines = await db.JournalEntries.AsNoTracking()
            .Where(e => e.TenantId == tenantId && e.Date < until && e.EntryType != "Closing")
            .SelectMany(e => e.Lines.Where(l => ids.Contains(l.AccountId))
                .Select(l => new { e.Date, e.EntryType, e.SourceDocumentId, l.AccountId, Net = l.Debit - l.Credit }))
            .ToListAsync(ct);

        // Con apertura (ejercicio anterior cerrado), los saldos iniciales ya están en moneda del cierre anterior.
        var hasOpening = lines.Any(l => l.SourceDocumentId == openingKey);
        var previousCloseMonth = new DateTime(previous.End.Year, previous.End.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var basis = lines.Where(l => l.EntryType != EntryType && (!hasOpening || l.Date >= fy.Start))
            .Select(l => (l.AccountId, Month: l.SourceDocumentId == openingKey ? previousCloseMonth : new DateTime(l.Date.Year, l.Date.Month, 1, 0, 0, 0, DateTimeKind.Utc), l.Net))
            .ToList();
        var alreadyAdjusted = lines.Where(l => l.EntryType == EntryType && l.Date >= fy.Start)
            .GroupBy(l => l.AccountId).ToDictionary(g => g.Key, g => g.Sum(l => l.Net));

        var indices = await db.InflationIndices.AsNoTracking().Where(i => i.TenantId == tenantId)
            .ToDictionaryAsync(i => new DateTime(i.Year, i.Month, 1, 0, 0, 0, DateTimeKind.Utc), i => i.Value, ct);
        var closingMonth = new DateTime(date.Year, date.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var needed = basis.Select(b => b.Month).Append(closingMonth).Distinct().OrderBy(m => m).ToList();
        var missing = needed.Where(m => !indices.ContainsKey(m)).Select(m => m.ToString("MM/yyyy")).ToList();
        var closingIndex = indices.GetValueOrDefault(closingMonth);

        var rows = new List<InflationRow>();
        if (missing.Count == 0)
        {
            foreach (var a in accounts)
            {
                var own = basis.Where(b => b.AccountId == a.Id).ToList();
                var historical = own.Sum(b => b.Net);
                var restated = Math.Round(own.Sum(b => b.Net * closingIndex / indices[b.Month]), 2, MidpointRounding.AwayFromZero);
                var adjustment = restated - historical - alreadyAdjusted.GetValueOrDefault(a.Id);
                if (historical != 0m || adjustment != 0m)
                    rows.Add(new InflationRow(a.Code, a.Name, historical, restated, adjustment));
            }
        }

        var existing = await db.JournalEntries.AsNoTracking()
            .Where(e => e.TenantId == tenantId && e.SourceModule == SourceModule && e.SourceDocumentId == $"axi-{date:yyyy-MM}")
            .Select(e => (int?)e.EntryNumber).FirstOrDefaultAsync(ct);
        return new InflationPreview(date, fy.Label, closingIndex, accounts.Count, rows, -rows.Sum(r => r.Adjustment), missing, existing);
    }
}

public sealed record InflationIndexRequest(int Year, int Month, decimal Value);

public sealed record InflationAdjustmentRequest(DateTime Date);

/// <summary>Saldo histórico (con signo: positivo deudor), reexpresado y ajuste a registrar.</summary>
public sealed record InflationRow(string AccountCode, string AccountName, decimal Historical, decimal Restated, decimal Adjustment);

/// <summary>RECPAM con signo de asiento: positivo es pérdida (al Debe).</summary>
public sealed record InflationPreview(
    DateTime Date, string FiscalYear, decimal ClosingIndex, int MarkedAccounts, IReadOnlyList<InflationRow> Rows,
    decimal Recpam, IReadOnlyList<string> MissingIndices, int? ExistingEntryNumber);
