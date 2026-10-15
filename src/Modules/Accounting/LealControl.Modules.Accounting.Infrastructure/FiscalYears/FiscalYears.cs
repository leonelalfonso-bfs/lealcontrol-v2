using LealControl.BuildingBlocks.Tenancy;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Accounting.Infrastructure.FiscalYears;

/// <summary>Un ejercicio contable: del primer día del mes siguiente al cierre anterior al último día del mes de cierre.</summary>
public sealed record FiscalYear(DateTime Start, DateTime End)
{
    /// <summary>Primer instante fuera del ejercicio (las fechas de los asientos se comparan con &lt;).</summary>
    public DateTime EndExclusive => End.AddDays(1);

    public string Key => $"fy-{End:yyyy-MM-dd}";

    public string Label => $"{Start:dd/MM/yyyy} al {End:dd/MM/yyyy}";

    public FiscalYear Next(int endMonth) => FiscalYears.For(EndExclusive, endMonth);

    public FiscalYear Previous(int endMonth) => FiscalYears.For(Start.AddDays(-1), endMonth);

    public IEnumerable<(int Year, int Month)> Months()
    {
        for (var m = Start; m <= End; m = m.AddMonths(1))
            yield return (m.Year, m.Month);
    }
}

/// <summary>
/// Ejercicios de cada empresa según su mes de cierre, y los asientos del cierre: refundición de resultados,
/// cierre patrimonial y apertura del ejercicio siguiente.
/// </summary>
public static class FiscalYears
{
    public const string SourceModule = "FiscalYear";
    public const string Result = "refundicion";
    public const string Closing = "cierre";
    public const string Opening = "apertura";

    public static FiscalYear For(DateTime date, int endMonth)
    {
        var year = date.Month > endMonth ? date.Year + 1 : date.Year;
        var end = new DateTime(year, endMonth, DateTime.DaysInMonth(year, endMonth), 0, 0, 0, DateTimeKind.Utc);
        var start = new DateTime(year - 1, endMonth, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(1);
        return new FiscalYear(start, end);
    }

    public static string DocumentId(FiscalYear fy, string kind) => $"{fy.Key}:{kind}";

    public static Task<bool> IsClosedAsync(AccountingDbContext db, TenantId tenantId, FiscalYear fy, CancellationToken ct) =>
        db.JournalEntries.AnyAsync(e => e.TenantId == tenantId && e.SourceModule == SourceModule
                                        && e.SourceDocumentId == DocumentId(fy, Closing), ct);

    /// <summary>True si la fecha cae en un ejercicio ya cerrado (sus meses no se reabren sueltos).</summary>
    public static async Task<bool> IsInClosedYearAsync(AccountingDbContext db, TenantId tenantId, DateTime date, CancellationToken ct)
    {
        var settings = await db.GetOrCreateTenantSettingsAsync(tenantId, ct);
        return await IsClosedAsync(db, tenantId, For(date, settings.FiscalYearEndMonth), ct);
    }

    public static Task<bool> HasEntriesAsync(AccountingDbContext db, TenantId tenantId, FiscalYear fy, CancellationToken ct) =>
        db.JournalEntries.AnyAsync(e => e.TenantId == tenantId && e.Date >= fy.Start && e.Date < fy.EndExclusive
                                        && e.SourceModule != SourceModule, ct);

    /// <summary>
    /// Arma los tres asientos del cierre (sin número ni grabar):
    /// refundición (resultados contra Resultado del Ejercicio), cierre (todas las cuentas patrimoniales a cero)
    /// y apertura (al día siguiente, el cierre invertido con el resultado pasado a Resultados no Asignados).
    /// </summary>
    public static async Task<IReadOnlyList<JournalEntry>> BuildClosingEntriesAsync(
        AccountingDbContext db, TenantId tenantId, FiscalYear fy, string resultAccountCode, string retainedAccountCode,
        string createdBy, CancellationToken ct)
    {
        var accounts = await db.Accounts.AsNoTracking().Where(a => a.TenantId == tenantId).ToDictionaryAsync(a => a.Id, ct);
        var resultAccount = accounts.Values.FirstOrDefault(a => a.Code == resultAccountCode && a.IsDirectPosting)
            ?? throw new InvalidOperationException($"Falta la cuenta imputable {resultAccountCode} (resultado del ejercicio) en el plan de cuentas.");
        var retainedAccount = accounts.Values.FirstOrDefault(a => a.Code == retainedAccountCode && a.IsDirectPosting)
            ?? throw new InvalidOperationException($"Falta la cuenta imputable {retainedAccountCode} (resultados no asignados) en el plan de cuentas.");

        var lines = await db.JournalEntries.AsNoTracking()
            .Where(e => e.TenantId == tenantId && e.Date < fy.EndExclusive)
            .SelectMany(e => e.Lines.Select(l => new { e.Date, l.AccountId, l.Debit, l.Credit, l.Currency, l.OriginalAmount }))
            .ToListAsync(ct);

        static bool IsResult(Account a) => a.AccountType is "Income" or "Expense";

        // 1. Refundición: el saldo de cada cuenta de resultado del ejercicio, al lado contrario.
        var result = NewEntry(tenantId, fy.End, $"Refundición de cuentas de resultado - Ejercicio {fy.Label}", "Closing", DocumentId(fy, Result), createdBy);
        foreach (var g in lines.Where(l => l.Date >= fy.Start && accounts.TryGetValue(l.AccountId, out var a) && IsResult(a))
                     .GroupBy(l => l.AccountId))
        {
            var balance = g.Sum(l => l.Debit - l.Credit);
            if (balance != 0m) AddLine(result, accounts[g.Key], -balance);
        }
        // Cancelar las cuentas de resultado deja al Debe la ganancia del ejercicio: va al Haber del resultado.
        var profit = result.Lines.Sum(l => l.Debit - l.Credit);
        if (profit != 0m) AddLine(result, resultAccount, -profit);

        // 2. Cierre: cada cuenta patrimonial (con la refundición incluida) queda en cero, también en su moneda.
        var closing = NewEntry(tenantId, fy.End, $"Asiento de cierre - Ejercicio {fy.Label}", "Closing", DocumentId(fy, Closing), createdBy);
        var patrimonial = lines.Where(l => accounts.TryGetValue(l.AccountId, out var a) && !IsResult(a))
            .Select(l => (l.AccountId, Balance: l.Debit - l.Credit,
                Foreign: l.Currency != "ARS" && l.Currency == accounts[l.AccountId].Currency ? (l.Debit > 0m ? 1m : -1m) * (l.OriginalAmount ?? 0m) : 0m))
            .Concat(result.Lines.Where(l => l.AccountId == resultAccount.Id).Select(l => (l.AccountId, Balance: l.Debit - l.Credit, Foreign: 0m)));
        foreach (var g in patrimonial.GroupBy(x => x.AccountId))
        {
            var balance = g.Sum(x => x.Balance);
            var foreign = g.Sum(x => x.Foreign);
            if (balance != 0m || foreign != 0m) AddLine(closing, accounts[g.Key], -balance, -foreign);
        }

        // 3. Apertura: el cierre invertido; el resultado del ejercicio pasa a Resultados no Asignados.
        var opening = NewEntry(tenantId, fy.EndExclusive, $"Asiento de apertura - Ejercicio {fy.Next(fy.End.Month).Label}", "Opening", DocumentId(fy, Opening), createdBy);
        foreach (var g in closing.Lines.GroupBy(l => l.AccountId == resultAccount.Id ? retainedAccount.Id : l.AccountId))
        {
            var account = accounts[g.Key];
            var balance = g.Sum(l => l.Credit - l.Debit);
            var foreign = g.Sum(l => (l.Debit > 0m ? -1m : 1m) * (l.OriginalAmount ?? 0m));
            if (balance != 0m || foreign != 0m) AddLine(opening, account, balance, foreign);
        }

        var entries = new[] { result, closing, opening }.Where(e => e.Lines.Count > 0).ToList();
        foreach (var e in entries)
        {
            e.TotalDebit = e.Lines.Sum(l => l.Debit);
            e.TotalCredit = e.Lines.Sum(l => l.Credit);
            if (e.TotalDebit != e.TotalCredit)
                throw new InvalidOperationException($"{e.Concept}: no cuadra (Debe {e.TotalDebit:N2} / Haber {e.TotalCredit:N2}). Revisá el balance de sumas y saldos.");
        }
        return entries;
    }

    private static JournalEntry NewEntry(TenantId tenantId, DateTime date, string concept, string type, string documentId, string createdBy) => new()
    {
        TenantId = tenantId, Date = date, Concept = concept, EntryType = type, SourceModule = SourceModule,
        SourceDocumentId = documentId, Status = "Posted", CreatedBy = createdBy, CreatedAtUtc = DateTime.UtcNow
    };

    /// <summary>Una línea por el importe con signo (positivo al Debe); en moneda extranjera, con su importe original.</summary>
    private static void AddLine(JournalEntry entry, Account account, decimal signedAmount, decimal signedForeign = 0m)
    {
        // Una línea sin importe en pesos cuenta como del Haber al sumar saldos en moneda extranjera.
        var debit = signedAmount > 0m;
        entry.Lines.Add(new JournalEntryLine
        {
            JournalEntryId = entry.Id, TenantId = entry.TenantId, AccountId = account.Id, AccountCode = account.Code, AccountName = account.Name,
            Debit = signedAmount > 0m ? signedAmount : 0m, Credit = signedAmount < 0m ? -signedAmount : 0m,
            Currency = signedForeign != 0m ? account.Currency : "ARS",
            ExchangeRate = 1m,
            // El saldo en moneda extranjera se suma con el signo del lado de la línea.
            OriginalAmount = signedForeign != 0m ? (debit ? signedForeign : -signedForeign) : null
        });
    }
}
