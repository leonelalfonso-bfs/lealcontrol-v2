using LealControl.BuildingBlocks.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Accounting.Infrastructure.FxRevaluation;

/// <summary>
/// Revaluación de fin de mes de las cuentas en moneda extranjera (caja y bancos en dólares): el saldo en
/// dólares se valúa a la cotización de cierre y la diferencia con el saldo en pesos va a diferencia de cambio.
/// Los créditos y deudas en dólares no se revalúan acá: su diferencia se documenta con notas de débito o crédito.
/// </summary>
internal static class FxRevaluationEndpoints
{
    public const string SourceModule = "Revaluation";

    public static RouteGroupBuilder MapFxRevaluationEndpoints(this RouteGroupBuilder group)
    {
        group.MapPost("/fx-revaluation/preview", async (FxRevaluationRequest req, ITenantContext tenant, AccountingDbContext db, CancellationToken ct) =>
        {
            if (Validate(req) is { } error) return Results.BadRequest(new { error });
            await db.EnsureAccountingTablesAsync(ct);
            return Results.Ok(await PreviewAsync(db, tenant.TenantId, req, ct));
        });

        group.MapPost("/fx-revaluation", async (FxRevaluationRequest req, HttpContext http, ITenantContext tenant, AccountingDbContext db, CancellationToken ct) =>
        {
            if (Validate(req) is { } error) return Results.BadRequest(new { error });
            await db.EnsureAccountingTablesAsync(ct);
            var tenantId = tenant.TenantId;
            var date = Day(req.Date);
            if (await db.IsPeriodLockedAsync(tenantId, date, ct))
                return Results.BadRequest(new { error = $"El período {date.Month:D2}/{date.Year} está cerrado con candado." });

            await using var tx = await db.Database.BeginTransactionAsync(ct);
            var lastNumber = await db.LockEntryNumberingAsync(tenantId, ct);
            var preview = await PreviewAsync(db, tenantId, req, ct);
            if (preview.ExistingEntryNumber is { } existing)
                return Results.BadRequest(new { error = $"{date.Month:D2}/{date.Year} ya tiene revaluación (asiento N° {existing})." });
            var rows = preview.Rows.Where(r => r.Difference != 0m).ToList();
            if (rows.Count == 0)
                return Results.BadRequest(new { error = "No hay diferencias para revaluar." });

            var mapping = await db.GetOrCreateMappingAsync(tenantId, ct);
            var net = rows.Sum(r => r.Difference);
            var resultCode = net > 0m ? mapping.ExchangeDifferenceGainAccountCode : mapping.ExchangeDifferenceLossAccountCode;
            var resultAccount = await db.Accounts.AsNoTracking()
                .FirstOrDefaultAsync(a => a.TenantId == tenantId && a.Code == resultCode && a.IsDirectPosting && a.IsActive, ct);
            if (resultAccount is null)
                return Results.BadRequest(new { error = $"Falta la cuenta imputable {resultCode} de diferencia de cambio en el plan de cuentas." });

            var entry = new JournalEntry
            {
                TenantId = tenantId,
                EntryNumber = lastNumber + 1,
                Date = date,
                Concept = $"Revaluación de moneda extranjera {date.Month:D2}/{date.Year} a $ {req.Rate:N4}",
                EntryType = "Adjustment",
                SourceModule = SourceModule,
                SourceDocumentId = Key(date),
                Status = "Posted",
                CreatedBy = http.User.FindFirst("name")?.Value ?? http.User.FindFirst("email")?.Value ?? "Usuario",
                CreatedAtUtc = DateTime.UtcNow
            };
            foreach (var r in rows)
            {
                // Solo cambia el valor en pesos: el saldo en dólares queda igual (importe original 0).
                entry.Lines.Add(new JournalEntryLine
                {
                    JournalEntryId = entry.Id, TenantId = tenantId, AccountId = r.AccountId, AccountCode = r.AccountCode, AccountName = r.AccountName,
                    Debit = r.Difference > 0m ? r.Difference : 0m, Credit = r.Difference < 0m ? -r.Difference : 0m,
                    Currency = r.Currency, ExchangeRate = req.Rate, OriginalAmount = 0m,
                    Memo = $"{r.Currency} {r.ForeignBalance:N2} a $ {req.Rate:N4}"
                });
            }
            entry.Lines.Add(new JournalEntryLine
            {
                JournalEntryId = entry.Id, TenantId = tenantId, AccountId = resultAccount.Id, AccountCode = resultAccount.Code, AccountName = resultAccount.Name,
                Debit = net < 0m ? -net : 0m, Credit = net > 0m ? net : 0m, Currency = "ARS", ExchangeRate = 1m
            });
            entry.TotalDebit = entry.Lines.Sum(l => l.Debit);
            entry.TotalCredit = entry.Lines.Sum(l => l.Credit);

            db.JournalEntries.Add(entry);
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return Results.Created($"/api/v1/accounting/journal-entries/{entry.Id}", new { entry.Id, entry.EntryNumber, net });
        });

        return group;
    }

    private static string? Validate(FxRevaluationRequest req)
    {
        if (req.Date == default) return "Indicá la fecha de cierre.";
        if (req.Rate <= 1m) return "Indicá la cotización de cierre.";
        if (decimal.Round(req.Rate, 6) != req.Rate) return "La cotización va con hasta seis decimales.";
        return null;
    }

    private static DateTime Day(DateTime date) => DateTime.SpecifyKind(date.Date, DateTimeKind.Utc);

    private static string Key(DateTime date) => $"fx-{date:yyyy-MM}";

    /// <summary>
    /// Para cada cuenta imputable en moneda extranjera: saldo en esa moneda (suma de los importes originales)
    /// y saldo en pesos hasta la fecha, y la diferencia contra el saldo valuado a la cotización de cierre.
    /// </summary>
    private static async Task<FxRevaluationPreview> PreviewAsync(AccountingDbContext db, TenantId tenantId, FxRevaluationRequest req, CancellationToken ct)
    {
        var date = Day(req.Date);
        var until = date.AddDays(1);
        var accounts = await db.Accounts.AsNoTracking()
            .Where(a => a.TenantId == tenantId && a.Currency != "ARS" && a.IsDirectPosting)
            .OrderBy(a => a.Code).ToListAsync(ct);
        var ids = accounts.Select(a => a.Id).ToList();
        var lines = await db.JournalEntries.AsNoTracking()
            .Where(e => e.TenantId == tenantId && e.Date < until)
            .SelectMany(e => e.Lines)
            .Where(l => ids.Contains(l.AccountId))
            .Select(l => new { l.AccountId, l.Debit, l.Credit, l.Currency, l.OriginalAmount })
            .ToListAsync(ct);

        var rows = accounts.Select(a =>
        {
            var own = lines.Where(l => l.AccountId == a.Id).ToList();
            var foreign = own.Where(l => l.Currency == a.Currency).Sum(l => (l.Debit > 0m ? 1m : -1m) * (l.OriginalAmount ?? 0m));
            var book = own.Sum(l => l.Debit - l.Credit);
            var target = Math.Round(foreign * req.Rate, 2, MidpointRounding.AwayFromZero);
            return new FxRevaluationRow(a.Id, a.Code, a.Name, a.Currency, foreign, book, target, target - book);
        }).ToList();

        var existing = await db.JournalEntries.AsNoTracking()
            .Where(e => e.TenantId == tenantId && e.SourceModule == SourceModule && e.SourceDocumentId == Key(date))
            .Select(e => (int?)e.EntryNumber).FirstOrDefaultAsync(ct);
        return new FxRevaluationPreview(date, req.Rate, rows, rows.Sum(r => r.Difference), existing);
    }
}

public sealed record FxRevaluationRequest(DateTime Date, decimal Rate);

public sealed record FxRevaluationRow(
    Guid AccountId, string AccountCode, string AccountName, string Currency,
    decimal ForeignBalance, decimal BookBalance, decimal RevaluedBalance, decimal Difference);

public sealed record FxRevaluationPreview(DateTime Date, decimal Rate, IReadOnlyList<FxRevaluationRow> Rows, decimal NetDifference, int? ExistingEntryNumber);
