using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Finance.Infrastructure;

internal sealed record ReconciliationMatchSuggestion(
    Guid ImportedMovementId,
    Guid SystemMovementId,
    decimal Amount,
    DateTime ImportedDateUtc,
    DateTime SystemDateUtc,
    string ImportedDescription,
    string SystemDescription,
    string? SystemLinkedEntityType,
    Guid? SystemLinkedEntityId);

internal static class FinanceReconciliationMatcher
{
    private static readonly TimeSpan DateTolerance = FinanceReconciliationTray.DateTolerance;

    public static async Task<List<ReconciliationMatchSuggestion>> FindSuggestionsAsync(
        FinanceDbContext db,
        Guid tenantId,
        Guid accountId,
        Guid? importId,
        CancellationToken ct)
    {
        var importedQuery = db.Movements.AsNoTracking()
            .Where(x => x.TenantId == tenantId
                        && x.AccountId == accountId
                        && x.Origin == FinancialMovementOrigin.Imported
                        && x.ReconciliationStatus != FinancialReconciliationStatus.MatchedToImport
                        && x.ReconciliationStatus != FinancialReconciliationStatus.Reconciled);

        if (importId.HasValue)
        {
            importedQuery = importedQuery.Where(x => x.ImportId == importId.Value);
        }

        var imported = await importedQuery.ToListAsync(ct);
        if (imported.Count == 0)
        {
            return [];
        }

        var system = await db.Movements.AsNoTracking()
            .Where(x => x.TenantId == tenantId
                        && x.AccountId == accountId
                        && x.Origin == FinancialMovementOrigin.System
                        && x.ReconciliationStatus == FinancialReconciliationStatus.PendingBank)
            .ToListAsync(ct);

        var suggestions = new List<ReconciliationMatchSuggestion>();
        var usedSystem = new HashSet<Guid>();

        foreach (var imp in imported.OrderBy(x => x.OperationDateUtc))
        {
            var candidates = FinanceImport.FindSystemCandidates(system, imp, usedSystem);
            // Solo sugerir cuando hay un candidato claro; si hay varios, el preview ya lo marcó ambiguo.
            if (candidates.Count != 1)
            {
                continue;
            }

            var match = candidates[0];
            usedSystem.Add(match.Id);
            suggestions.Add(new ReconciliationMatchSuggestion(
                imp.Id,
                match.Id,
                imp.Amount,
                imp.OperationDateUtc,
                match.OperationDateUtc,
                imp.Description,
                match.Description,
                match.LinkedEntityType,
                match.LinkedEntityId));
        }

        return suggestions;
    }

    public static async Task<(bool Ok, string? Error)> UnmatchAsync(
        FinanceDbContext db,
        Guid tenantId,
        Guid importedMovementId,
        CancellationToken ct)
    {
        var imported = await db.Movements.SingleOrDefaultAsync(
            x => x.Id == importedMovementId && x.TenantId == tenantId, ct);
        if (imported is null)
        {
            return (false, "Movimiento del extracto inexistente.");
        }

        var system = await db.Movements.SingleOrDefaultAsync(
            x => x.TenantId == tenantId && x.MatchedMovementId == importedMovementId, ct);
        if (system is null)
        {
            return (false, "No hay movimiento del sistema vinculado a este importado.");
        }

        imported.LinkedEntityType = null;
        imported.LinkedEntityId = null;
        imported.ReconciliationStatus = FinancialReconciliationStatus.Available;

        system.ReconciliationStatus = FinancialReconciliationStatus.PendingBank;
        system.MatchedMovementId = null;

        await db.SaveChangesAsync(ct);
        return (true, null);
    }
}
