using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Finance.Infrastructure;

internal static class FinanceMovementLinkValidator
{
    public static async Task<(bool Ok, string? Error, FinancialMovement? Movement)> ValidateForCollectionAsync(
        FinanceDbContext db,
        Guid tenantId,
        Guid movementId,
        Guid? expectedConceptId,
        CancellationToken ct)
    {
        var movement = await db.Movements.SingleOrDefaultAsync(x => x.Id == movementId && x.TenantId == tenantId, ct);
        if (movement is null)
            return (false, "Movimiento bancario inexistente.", null);

        if (movement.Kind != FinancialMovementKind.Credit)
            return (false, "El movimiento debe ser un ingreso (crédito).", null);

        if (movement.ReconciliationStatus == FinancialReconciliationStatus.Reconciled)
            return (false, "El movimiento ya está conciliado con otro documento.", null);

        if (movement.ClassificationStatus != FinancialClassificationStatus.Confirmed)
            return (false, "Solo se pueden usar movimientos con concepto confirmado. Revisá la bandeja de clasificación.", null);

        if (!movement.ConceptId.HasValue)
            return (false, "El movimiento no tiene concepto asignado.", null);

        if (expectedConceptId.HasValue && expectedConceptId.Value != Guid.Empty && movement.ConceptId != expectedConceptId)
            return (false, "El movimiento no pertenece a la cartera (concepto) seleccionada.", null);

        var concept = await db.FinancialConcepts.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == movement.ConceptId && x.TenantId == tenantId && x.IsActive, ct);
        if (concept is null)
            return (false, "El concepto del movimiento no es válido o está inactivo.", null);

        if (concept.Direction is not FinancialConceptDirection.Income and not FinancialConceptDirection.Both)
            return (false, $"El concepto «{concept.Name}» no es válido para cobranzas (debe ser de ingreso).", null);

        if (concept.UsableIn != FinancialConceptUsableIn.Receipt)
            return (false, $"El concepto «{concept.Name}» no pertenece a la cartera de recibos.", null);

        return (true, null, movement);
    }

    public static async Task<(bool Ok, string? Error, FinancialMovement? Movement)> ValidateForPaymentAsync(
        FinanceDbContext db,
        Guid tenantId,
        Guid movementId,
        Guid? expectedConceptId,
        CancellationToken ct)
    {
        var movement = await db.Movements.SingleOrDefaultAsync(x => x.Id == movementId && x.TenantId == tenantId, ct);
        if (movement is null)
            return (false, "Movimiento bancario inexistente.", null);

        if (movement.Kind != FinancialMovementKind.Debit)
            return (false, "El movimiento debe ser un egreso (débito).", null);

        if (movement.ReconciliationStatus == FinancialReconciliationStatus.Reconciled)
            return (false, "El movimiento ya está conciliado con otro documento.", null);

        if (movement.ClassificationStatus != FinancialClassificationStatus.Confirmed)
            return (false, "Solo se pueden usar movimientos con concepto confirmado. Revisá la bandeja de clasificación.", null);

        if (!movement.ConceptId.HasValue)
            return (false, "El movimiento no tiene concepto asignado.", null);

        if (expectedConceptId.HasValue && expectedConceptId.Value != Guid.Empty && movement.ConceptId != expectedConceptId)
            return (false, "El movimiento no pertenece a la cartera (concepto) seleccionada.", null);

        var concept = await db.FinancialConcepts.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == movement.ConceptId && x.TenantId == tenantId && x.IsActive, ct);
        if (concept is null)
            return (false, "El concepto del movimiento no es válido o está inactivo.", null);

        if (concept.Direction is not FinancialConceptDirection.Expense and not FinancialConceptDirection.Both)
            return (false, $"El concepto «{concept.Name}» no es válido para pagos (debe ser de egreso).", null);

        if (concept.UsableIn != FinancialConceptUsableIn.PaymentOrder)
            return (false, $"El concepto «{concept.Name}» no pertenece a la cartera de órdenes de pago.", null);

        return (true, null, movement);
    }
}
