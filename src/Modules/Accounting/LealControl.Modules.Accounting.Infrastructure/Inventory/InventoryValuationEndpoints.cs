using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Accounting.Contracts.Inventory;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Accounting.Infrastructure.Inventory;

/// <summary>
/// Costo de ventas por diferencia de inventario: a fin de mes las existencias se valúan al último costo de
/// compra y la cuenta Mercaderías se ajusta a ese valor contra Costo de Mercaderías Vendidas. Como las
/// compras van a "Compras", el costo de ventas del período queda en Compras + CMV (existencia inicial − final).
/// </summary>
internal static class InventoryValuationEndpoints
{
    public const string SourceModule = "Inventory";
    public const string InventoryAccountCode = "1.1.04.001";
    public const string CostOfSalesAccountCode = "5.1.01";

    public static RouteGroupBuilder MapInventoryValuationEndpoints(this RouteGroupBuilder group)
    {
        group.MapPost("/inventory-valuation/preview", async (InventoryValuationRequest req, ITenantContext tenant, AccountingDbContext db, IInventoryValuationSource source, CancellationToken ct) =>
        {
            if (Validate(req) is { } error) return Results.BadRequest(new { message = error });
            await db.EnsureAccountingTablesAsync(ct);
            await db.SeedDefaultChartOfAccountsAsync(tenant.TenantId, ct);
            return Results.Ok(await PreviewAsync(db, tenant.TenantId, source, req, ct));
        });

        group.MapPost("/inventory-valuation", async (InventoryValuationRequest req, HttpContext http, ITenantContext tenant, AccountingDbContext db, IInventoryValuationSource source, CancellationToken ct) =>
        {
            if (Validate(req) is { } error) return Results.BadRequest(new { message = error });
            var tenantId = tenant.TenantId;
            await db.EnsureAccountingTablesAsync(ct);
            await db.SeedDefaultChartOfAccountsAsync(tenantId, ct);
            var date = Day(req.Date);
            if (await db.IsPeriodLockedAsync(tenantId, date, ct))
                return Results.BadRequest(new { message = $"El período {date.Month:D2}/{date.Year} está cerrado con candado." });

            await using var tx = await db.Database.BeginTransactionAsync(ct);
            var lastNumber = await db.LockEntryNumberingAsync(tenantId, ct);
            var preview = await PreviewAsync(db, tenantId, source, req, ct);
            if (preview.ExistingEntryNumber is { } existing)
                return Results.BadRequest(new { message = $"{date.Month:D2}/{date.Year} ya tiene ajuste de existencias (asiento N° {existing})." });
            if (preview.Difference == 0m)
                return Results.BadRequest(new { message = "Las existencias ya coinciden con la cuenta Mercaderías." });

            var accounts = await db.Accounts.AsNoTracking()
                .Where(a => a.TenantId == tenantId && (a.Code == InventoryAccountCode || a.Code == CostOfSalesAccountCode) && a.IsDirectPosting && a.IsActive)
                .ToDictionaryAsync(a => a.Code, ct);
            if (!accounts.TryGetValue(InventoryAccountCode, out var inventory) || !accounts.TryGetValue(CostOfSalesAccountCode, out var costOfSales))
                return Results.BadRequest(new { message = $"Faltan las cuentas imputables {InventoryAccountCode} (Mercaderías) y {CostOfSalesAccountCode} (CMV) en el plan de cuentas." });

            var diff = preview.Difference;
            var entry = new JournalEntry
            {
                TenantId = tenantId,
                EntryNumber = lastNumber + 1,
                Date = date,
                Concept = $"Variación de existencias - stock al {date:dd/MM/yyyy}",
                EntryType = "Adjustment",
                SourceModule = SourceModule,
                SourceDocumentId = Key(date),
                Status = "Posted",
                CreatedBy = http.User.FindFirst("name")?.Value ?? http.User.FindFirst("email")?.Value ?? "Usuario",
                CreatedAtUtc = DateTime.UtcNow,
                TotalDebit = Math.Abs(diff),
                TotalCredit = Math.Abs(diff)
            };
            // Más stock que en libros: Mercaderías al Debe y baja el costo; menos stock: al revés.
            entry.Lines.Add(Line(entry, diff > 0m ? inventory : costOfSales, Math.Abs(diff), 0m, $"Existencia final {preview.InventoryValue:N2}"));
            entry.Lines.Add(Line(entry, diff > 0m ? costOfSales : inventory, 0m, Math.Abs(diff), null));
            db.JournalEntries.Add(entry);
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return Results.Created($"/api/v1/accounting/journal-entries/{entry.Id}", new { entry.Id, entry.EntryNumber, difference = diff });
        });

        return group;
    }

    private static JournalEntryLine Line(JournalEntry entry, Account account, decimal debit, decimal credit, string? memo) => new()
    {
        JournalEntryId = entry.Id, TenantId = entry.TenantId, AccountId = account.Id, AccountCode = account.Code, AccountName = account.Name,
        Debit = debit, Credit = credit, Currency = "ARS", ExchangeRate = 1m, Memo = memo
    };

    private static string? Validate(InventoryValuationRequest req)
    {
        if (req.Date == default) return "Indicá la fecha del inventario.";
        if (req.UsdRate is <= 1m) return "La cotización del dólar, si se indica, tiene que ser mayor a 1.";
        return null;
    }

    private static DateTime Day(DateTime date) => DateTime.SpecifyKind(date.Date, DateTimeKind.Utc);

    private static string Key(DateTime date) => $"inv-{date:yyyy-MM}";

    private static async Task<InventoryValuationPreview> PreviewAsync(
        AccountingDbContext db, TenantId tenantId, IInventoryValuationSource source, InventoryValuationRequest req, CancellationToken ct)
    {
        var date = Day(req.Date);
        var until = date.AddDays(1);
        var lines = await source.ValueAsync(until.AddTicks(-1), req.UsdRate, ct);
        var value = lines.Sum(l => l.ValueArs);
        var book = await db.JournalEntries.AsNoTracking()
            .Where(e => e.TenantId == tenantId && e.Date < until)
            .SelectMany(e => e.Lines)
            .Where(l => l.AccountCode == InventoryAccountCode)
            .SumAsync(l => (decimal?)(l.Debit - l.Credit), ct) ?? 0m;
        var existing = await db.JournalEntries.AsNoTracking()
            .Where(e => e.TenantId == tenantId && e.SourceModule == SourceModule && e.SourceDocumentId == Key(date))
            .Select(e => (int?)e.EntryNumber).FirstOrDefaultAsync(ct);
        return new InventoryValuationPreview(date, lines, value, book, value - book, lines.Count(l => l.CostSource == "Missing"), existing);
    }
}

public sealed record InventoryValuationRequest(DateTime Date, decimal? UsdRate);

public sealed record InventoryValuationPreview(
    DateTime Date, IReadOnlyList<InventoryValuationLine> Lines, decimal InventoryValue, decimal BookBalance,
    decimal Difference, int WithoutCost, int? ExistingEntryNumber);
