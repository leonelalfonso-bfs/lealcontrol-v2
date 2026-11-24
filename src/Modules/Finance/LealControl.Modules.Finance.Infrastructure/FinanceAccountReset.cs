using LealControl.BuildingBlocks.Security;
using LealControl.BuildingBlocks.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Finance.Infrastructure;

public sealed record ResetStatementRequest(string ConfirmName);

/// <summary>
/// Volver a cargar el extracto de una cuenta desde cero: borra los movimientos importados y los lotes de
/// importación (así el mismo archivo se puede volver a subir), sin perder lo que ya está registrado.
/// <list type="bullet">
/// <item>Un importado emparejado con un movimiento del sistema (recibo, orden de pago, depósito de cheque…) se
/// borra y el del sistema vuelve a "pendiente de banco": al reimportar se empareja solo.</item>
/// <item>Un importado al que apunta un documento (cheque, renglón de recibo u orden de pago, transferencia,
/// rendición) y que no tiene movimiento del sistema queda como movimiento del sistema pendiente, con el mismo
/// id: el documento no pierde el vínculo y el renglón del extracto lo vuelve a encontrar.</item>
/// <item>El resto (gastos bancarios, impuestos, clasificaciones) se borra: las reglas los vuelven a sugerir.</item>
/// </list>
/// </summary>
internal static class FinanceAccountReset
{
    public static void MapAccountResetEndpoints(IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/finance/accounts").WithTags("Finance").RequirePolicyOnWrites("RequireFinance");

        group.MapGet("/{accountId:guid}/reset-statement", async (Guid accountId, FinanceDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var plan = await PlanAsync(db, tenant.TenantId.Value, accountId, ct);
            return plan is null ? Results.NotFound("Cuenta inexistente.") : Results.Ok(plan.Summary);
        });

        group.MapPost("/{accountId:guid}/reset-statement", async (Guid accountId, ResetStatementRequest body, FinanceDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var plan = await PlanAsync(db, tenantId, accountId, ct);
            if (plan is null) return Results.NotFound("Cuenta inexistente.");
            if (!string.Equals(body.ConfirmName?.Trim(), plan.Summary.AccountName.Trim(), StringComparison.OrdinalIgnoreCase))
                return Results.BadRequest("Escribí el nombre exacto de la cuenta para confirmar.");

            await using var tx = await db.Database.BeginTransactionAsync(ct);
            foreach (var (system, imported) in plan.Unmatched)
            {
                system.ReconciliationStatus = FinancialReconciliationStatus.PendingBank;
                system.MatchedMovementId = null;
                await RepointAsync(db, tenantId, imported, system.Id, ct);
            }
            foreach (var kept in plan.Kept)
            {
                kept.Origin = FinancialMovementOrigin.System;
                kept.ReconciliationStatus = FinancialReconciliationStatus.PendingBank;
                kept.ImportId = null;
                kept.ReportedBalance = null;
                kept.MatchedMovementId = null;
            }
            db.Movements.RemoveRange(plan.Deleted);
            db.BankStatementImports.RemoveRange(await db.BankStatementImports.Where(x => x.TenantId == tenantId && x.AccountId == accountId).ToListAsync(ct));
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return Results.Ok(plan.Summary);
        });
    }

    public sealed record ResetSummary(string AccountName, int Imported, int Deleted, int KeptAsPending, int SystemBackToPending, int Imports, DateTime? From, DateTime? To);

    private sealed record Plan(ResetSummary Summary, List<FinancialMovement> Deleted, List<FinancialMovement> Kept, List<(FinancialMovement System, Guid Imported)> Unmatched);

    private static async Task<Plan?> PlanAsync(FinanceDbContext db, Guid tenantId, Guid accountId, CancellationToken ct)
    {
        var account = await db.Accounts.AsNoTracking().SingleOrDefaultAsync(x => x.Id == accountId && x.TenantId == tenantId, ct);
        if (account is null) return null;
        var imported = await db.Movements.Where(x => x.TenantId == tenantId && x.AccountId == accountId && x.Origin == FinancialMovementOrigin.Imported).ToListAsync(ct);
        var ids = imported.Select(x => x.Id).ToList();

        var matchedSystem = await db.Movements
            .Where(x => x.TenantId == tenantId && x.Origin == FinancialMovementOrigin.System && x.MatchedMovementId != null && ids.Contains(x.MatchedMovementId.Value))
            .ToListAsync(ct);
        var representedBySystem = matchedSystem.Select(x => x.MatchedMovementId!.Value).ToHashSet();

        var referenced = (await db.ReceivedCheques.Where(x => x.TenantId == tenantId && x.BankMovementId != null && ids.Contains(x.BankMovementId.Value)).Select(x => x.BankMovementId!.Value).ToListAsync(ct))
            .Concat(await db.PaymentOrderLines.Where(x => x.TenantId == tenantId && x.BankMovementId != null && ids.Contains(x.BankMovementId.Value)).Select(x => x.BankMovementId!.Value).ToListAsync(ct))
            .Concat(await db.CollectionReceiptLines.Where(x => x.TenantId == tenantId && x.BankMovementId != null && ids.Contains(x.BankMovementId.Value)).Select(x => x.BankMovementId!.Value).ToListAsync(ct))
            .Concat(await db.ExpenseReportLines.Where(x => x.TenantId == tenantId && x.MovementId != null && ids.Contains(x.MovementId.Value)).Select(x => x.MovementId!.Value).ToListAsync(ct))
            .Concat(await db.PaymentBatchItems.Where(x => x.TenantId == tenantId && ids.Contains(x.MovementId)).Select(x => x.MovementId).ToListAsync(ct))
            .ToHashSet();

        var kept = imported.Where(x => !representedBySystem.Contains(x.Id)
            && (referenced.Contains(x.Id) || x.TransferId != null || x.LinkedEntityType != null)).ToList();
        var keptIds = kept.Select(x => x.Id).ToHashSet();
        var deleted = imported.Where(x => !keptIds.Contains(x.Id)).ToList();
        var imports = await db.BankStatementImports.CountAsync(x => x.TenantId == tenantId && x.AccountId == accountId, ct);

        var summary = new ResetSummary(account.Name, imported.Count, deleted.Count, kept.Count, matchedSystem.Count, imports,
            imported.Count == 0 ? null : imported.Min(x => x.OperationDateUtc), imported.Count == 0 ? null : imported.Max(x => x.OperationDateUtc));
        return new Plan(summary, deleted, kept, matchedSystem.Select(x => (x, x.MatchedMovementId!.Value)).ToList());
    }

    /// <summary>Los documentos que apuntaban al importado pasan a apuntar al movimiento del sistema que lo representa.</summary>
    private static async Task RepointAsync(FinanceDbContext db, Guid tenantId, Guid importedId, Guid systemId, CancellationToken ct)
    {
        foreach (var c in await db.ReceivedCheques.Where(x => x.TenantId == tenantId && x.BankMovementId == importedId).ToListAsync(ct)) c.BankMovementId = systemId;
        foreach (var l in await db.PaymentOrderLines.Where(x => x.TenantId == tenantId && x.BankMovementId == importedId).ToListAsync(ct)) l.BankMovementId = systemId;
        foreach (var l in await db.CollectionReceiptLines.Where(x => x.TenantId == tenantId && x.BankMovementId == importedId).ToListAsync(ct)) l.BankMovementId = systemId;
        foreach (var l in await db.ExpenseReportLines.Where(x => x.TenantId == tenantId && x.MovementId == importedId).ToListAsync(ct)) l.MovementId = systemId;
        foreach (var i in await db.PaymentBatchItems.Where(x => x.TenantId == tenantId && x.MovementId == importedId).ToListAsync(ct)) i.MovementId = systemId;
    }
}
