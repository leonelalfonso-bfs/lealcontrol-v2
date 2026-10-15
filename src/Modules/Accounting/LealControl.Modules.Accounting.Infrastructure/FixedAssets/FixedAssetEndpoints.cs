using LealControl.BuildingBlocks.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Accounting.Infrastructure.FixedAssets;

/// <summary>
/// Registro de bienes de uso y amortización mensual en línea recta: un asiento por mes con la amortización
/// de cada bien (gasto contra amortización acumulada). El alta y la venta del bien se registran aparte.
/// </summary>
internal static class FixedAssetEndpoints
{
    public const string SourceModule = "Depreciation";

    public static RouteGroupBuilder MapFixedAssetEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("/fixed-assets", async (ITenantContext tenant, AccountingDbContext db, CancellationToken ct) =>
        {
            await PrepareAsync(db, tenant.TenantId, ct);
            var assets = await db.FixedAssets.AsNoTracking().Where(a => a.TenantId == tenant.TenantId).OrderBy(a => a.Code).ToListAsync(ct);
            return Results.Ok(assets.Select(View));
        });

        group.MapPost("/fixed-assets", async (FixedAssetRequest req, ITenantContext tenant, AccountingDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await PrepareAsync(db, tenantId, ct);
            if (await ValidateAsync(db, tenantId, req, null, ct) is { } error) return Problem(error);
            var asset = new FixedAsset { TenantId = tenantId };
            Apply(asset, req);
            db.FixedAssets.Add(asset);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/accounting/fixed-assets/{asset.Id}", View(asset));
        });

        group.MapPut("/fixed-assets/{id:guid}", async (Guid id, FixedAssetRequest req, ITenantContext tenant, AccountingDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var asset = await db.FixedAssets.FirstOrDefaultAsync(a => a.Id == id && a.TenantId == tenantId, ct);
            if (asset is null) return Results.NotFound();
            // Ya amortizado, los datos que definen la amortización no cambian: se corregiría el pasado.
            if (asset.AccumulatedDepreciation > 0m && (req.Cost != asset.Cost || req.ResidualValue != asset.ResidualValue
                || req.UsefulLifeMonths != asset.UsefulLifeMonths || Day(req.AcquisitionDate) != asset.AcquisitionDate))
                return Problem("El bien ya tiene amortizaciones: el costo, el valor residual, la vida útil y la fecha de alta no se cambian.");
            if (await ValidateAsync(db, tenantId, req, id, ct) is { } error) return Problem(error);
            Apply(asset, req);
            await db.SaveChangesAsync(ct);
            return Results.Ok(View(asset));
        });

        group.MapPost("/fixed-assets/{id:guid}/dispose", async (Guid id, FixedAssetDisposalRequest req, ITenantContext tenant, AccountingDbContext db, CancellationToken ct) =>
        {
            var asset = await db.FixedAssets.FirstOrDefaultAsync(a => a.Id == id && a.TenantId == tenant.TenantId, ct);
            if (asset is null) return Results.NotFound();
            var date = Day(req.Date);
            if (asset.Status == "Disposed") return Problem("El bien ya está dado de baja.");
            if (date < asset.AcquisitionDate) return Problem("La baja no puede ser anterior al alta.");
            if (asset.DepreciatedThrough is { } through && date < through)
                return Problem($"Ya se amortizó hasta {through:MM/yyyy}: la baja va desde ese mes.");
            asset.Status = "Disposed";
            asset.DisposedAt = date;
            await db.SaveChangesAsync(ct);
            return Results.Ok(View(asset));
        });

        group.MapPost("/fixed-assets/depreciation/preview", async (DepreciationRequest req, ITenantContext tenant, AccountingDbContext db, CancellationToken ct) =>
        {
            await PrepareAsync(db, tenant.TenantId, ct);
            if (MonthEnd(req.Date) is not { } monthEnd) return Problem("Elegí el último día del mes a amortizar.");
            return Results.Ok(await PreviewAsync(db, tenant.TenantId, monthEnd, ct));
        });

        group.MapPost("/fixed-assets/depreciation", async (DepreciationRequest req, HttpContext http, ITenantContext tenant, AccountingDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await PrepareAsync(db, tenantId, ct);
            if (MonthEnd(req.Date) is not { } monthEnd) return Problem("Elegí el último día del mes a amortizar.");
            if (await db.IsPeriodLockedAsync(tenantId, monthEnd, ct))
                return Problem($"El período {monthEnd:MM/yyyy} está cerrado con candado.");

            await using var tx = await db.Database.BeginTransactionAsync(ct);
            var lastNumber = await db.LockEntryNumberingAsync(tenantId, ct);
            var preview = await PreviewAsync(db, tenantId, monthEnd, ct);
            if (preview.ExistingEntryNumber is { } existing)
                return Problem($"{monthEnd:MM/yyyy} ya tiene amortización (asiento N° {existing}).");
            var rows = preview.Rows.Where(r => r.Amount > 0m).ToList();
            if (rows.Count == 0) return Problem("No hay amortizaciones para registrar en ese mes.");

            var accounts = await db.Accounts.AsNoTracking().Where(a => a.TenantId == tenantId).ToDictionaryAsync(a => a.Code, ct);
            var entry = new JournalEntry
            {
                TenantId = tenantId, EntryNumber = lastNumber + 1, Date = monthEnd,
                Concept = $"Amortización de bienes de uso {monthEnd:MM/yyyy}", EntryType = "Adjustment",
                SourceModule = SourceModule, SourceDocumentId = $"dep-{monthEnd:yyyy-MM}", Status = "Posted",
                CreatedBy = http.User.FindFirst("name")?.Value ?? http.User.FindFirst("email")?.Value ?? "Usuario",
                CreatedAtUtc = DateTime.UtcNow
            };
            foreach (var g in rows.GroupBy(r => r.ExpenseAccountCode))
                entry.Lines.Add(Line(entry, accounts[g.Key], g.Sum(r => r.Amount), 0m, null));
            foreach (var r in rows)
                entry.Lines.Add(Line(entry, accounts[r.AccumulatedAccountCode], 0m, r.Amount, $"{r.Code} {r.Name}"));
            entry.TotalDebit = entry.Lines.Sum(l => l.Debit);
            entry.TotalCredit = entry.Lines.Sum(l => l.Credit);
            db.JournalEntries.Add(entry);

            var ids = rows.Select(r => r.AssetId).ToList();
            foreach (var asset in await db.FixedAssets.Where(a => ids.Contains(a.Id)).ToListAsync(ct))
            {
                asset.AccumulatedDepreciation += rows.Single(r => r.AssetId == asset.Id).Amount;
                asset.DepreciatedThrough = monthEnd;
            }
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return Results.Created($"/api/v1/accounting/journal-entries/{entry.Id}", new { entry.Id, entry.EntryNumber, total = entry.TotalDebit });
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

    private static DateTime Day(DateTime date) => DateTime.SpecifyKind(date.Date, DateTimeKind.Utc);

    private static DateTime? MonthEnd(DateTime date)
    {
        var day = Day(date);
        return day.Day == DateTime.DaysInMonth(day.Year, day.Month) ? day : null;
    }

    private static object View(FixedAsset a) => new
    {
        a.Id, a.Code, a.Name, a.AcquisitionDate, a.Cost, a.ResidualValue, a.UsefulLifeMonths, a.AssetAccountCode,
        a.AccumulatedAccountCode, a.ExpenseAccountCode, a.AccumulatedDepreciation, a.DepreciatedThrough, a.Status, a.DisposedAt,
        a.Notes, a.MonthlyDepreciation, BookValue = a.Cost - a.AccumulatedDepreciation
    };

    private static void Apply(FixedAsset asset, FixedAssetRequest req)
    {
        asset.Code = req.Code.Trim();
        asset.Name = req.Name.Trim();
        asset.AcquisitionDate = Day(req.AcquisitionDate);
        asset.Cost = req.Cost;
        asset.ResidualValue = req.ResidualValue;
        asset.UsefulLifeMonths = req.UsefulLifeMonths;
        asset.AssetAccountCode = req.AssetAccountCode.Trim();
        asset.AccumulatedAccountCode = req.AccumulatedAccountCode.Trim();
        asset.ExpenseAccountCode = string.IsNullOrWhiteSpace(req.ExpenseAccountCode) ? "5.2.08" : req.ExpenseAccountCode.Trim();
        asset.Notes = string.IsNullOrWhiteSpace(req.Notes) ? null : req.Notes.Trim();
    }

    private static async Task<string?> ValidateAsync(AccountingDbContext db, TenantId tenantId, FixedAssetRequest req, Guid? id, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.Code) || string.IsNullOrWhiteSpace(req.Name)) return "Indicá el código y el nombre del bien.";
        if (req.AcquisitionDate == default) return "Indicá la fecha de alta.";
        if (req.Cost <= 0m || decimal.Round(req.Cost, 2) != req.Cost) return "El costo tiene que ser mayor a cero, con hasta dos decimales.";
        if (req.ResidualValue < 0m || req.ResidualValue >= req.Cost) return "El valor residual va de cero a menos que el costo.";
        if (req.UsefulLifeMonths is < 1 or > 600) return "La vida útil va de 1 a 600 meses.";
        var code = req.Code.Trim();
        if (await db.FixedAssets.AnyAsync(a => a.TenantId == tenantId && a.Code == code && a.Id != id, ct))
            return $"Ya hay un bien con el código {code}.";
        var codes = new[] { req.AssetAccountCode, req.AccumulatedAccountCode, string.IsNullOrWhiteSpace(req.ExpenseAccountCode) ? "5.2.08" : req.ExpenseAccountCode }
            .Select(c => (c ?? "").Trim()).ToList();
        var valid = await db.Accounts.AsNoTracking()
            .Where(a => a.TenantId == tenantId && codes.Contains(a.Code) && a.IsDirectPosting && a.IsActive)
            .Select(a => a.Code).ToListAsync(ct);
        var missing = codes.Where(c => !valid.Contains(c)).ToList();
        return missing.Count > 0 ? $"Las cuentas {string.Join(", ", missing)} no existen o no son imputables." : null;
    }

    private static JournalEntryLine Line(JournalEntry entry, Account account, decimal debit, decimal credit, string? memo) => new()
    {
        JournalEntryId = entry.Id, TenantId = entry.TenantId, AccountId = account.Id, AccountCode = account.Code, AccountName = account.Name,
        Debit = debit, Credit = credit, Currency = "ARS", ExchangeRate = 1m, Memo = memo
    };

    /// <summary>Por bien: lo que corresponde amortizar hasta ese mes menos lo ya amortizado (se ponen al día los meses que falten).</summary>
    private static async Task<DepreciationPreview> PreviewAsync(AccountingDbContext db, TenantId tenantId, DateTime monthEnd, CancellationToken ct)
    {
        // También los dados de baja: si falta amortizar hasta el mes de la baja, se pone al día.
        var assets = await db.FixedAssets.AsNoTracking()
            .Where(a => a.TenantId == tenantId && a.AcquisitionDate <= monthEnd)
            .OrderBy(a => a.Code).ToListAsync(ct);
        var rows = assets.Select(a => new DepreciationRow(a.Id, a.Code, a.Name, a.ExpenseAccountCode, a.AccumulatedAccountCode,
            Math.Max(0m, a.AccumulatedAt(monthEnd) - a.AccumulatedDepreciation))).ToList();
        var existing = await db.JournalEntries.AsNoTracking()
            .Where(e => e.TenantId == tenantId && e.SourceModule == SourceModule && e.SourceDocumentId == $"dep-{monthEnd:yyyy-MM}")
            .Select(e => (int?)e.EntryNumber).FirstOrDefaultAsync(ct);
        return new DepreciationPreview(monthEnd, rows, rows.Sum(r => r.Amount), existing);
    }
}

public sealed record FixedAssetRequest(
    string Code, string Name, DateTime AcquisitionDate, decimal Cost, decimal ResidualValue, int UsefulLifeMonths,
    string AssetAccountCode, string AccumulatedAccountCode, string? ExpenseAccountCode, string? Notes);

public sealed record FixedAssetDisposalRequest(DateTime Date);

public sealed record DepreciationRequest(DateTime Date);

public sealed record DepreciationRow(Guid AssetId, string Code, string Name, string ExpenseAccountCode, string AccumulatedAccountCode, decimal Amount);

public sealed record DepreciationPreview(DateTime Date, IReadOnlyList<DepreciationRow> Rows, decimal Total, int? ExistingEntryNumber);
