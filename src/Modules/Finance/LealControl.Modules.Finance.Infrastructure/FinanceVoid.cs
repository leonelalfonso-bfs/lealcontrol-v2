using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Finance.Infrastructure;

public sealed record VoidFinanceDocumentRequest(string Reason);

internal static class FinanceVoid
{
    public static async Task<IResult> VoidCollectionReceiptAsync(
        Guid id, VoidFinanceDocumentRequest body, FinanceDbContext db, Guid tenantId, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(body.Reason))
            return Results.BadRequest("El motivo de anulación es obligatorio.");

        var receipt = await db.CollectionReceipts.SingleOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
        if (receipt is null) return Results.NotFound("Recibo inexistente.");
        if (receipt.Status == "Voided") return Results.Conflict("El recibo ya está anulado.");

        if (await FinanceAccountingGuard.IsPeriodClosedAsync(tenantId, receipt.ReceiptDateUtc, ct))
            return Results.Conflict("No se puede anular: el período contable está cerrado.");

        var lines = await db.CollectionReceiptLines.Where(x => x.ReceiptId == id && x.TenantId == tenantId).ToListAsync(ct);
        await ReleaseMovementsAsync(db, tenantId, "CollectionReceipt", id, lines.Where(x => x.BankMovementId.HasValue).Select(x => x.BankMovementId!.Value).ToList(), ct);

        var cheques = await db.ReceivedCheques.Where(x => x.TenantId == tenantId && x.CollectionReceiptId == id).ToListAsync(ct);
        foreach (var ch in cheques)
        {
            ch.CollectionReceiptId = null;
            if (ch.Status == ReceivedChequeStatus.UsedForPayment) continue;
            ch.Status = ReceivedChequeStatus.Available;
        }

        db.CollectionReceiptImputations.RemoveRange(await db.CollectionReceiptImputations.Where(x => x.ReceiptId == id && x.TenantId == tenantId).ToListAsync(ct));
        var advances = await db.CustomerAdvances.Where(x => x.CollectionReceiptId == id && x.TenantId == tenantId).ToListAsync(ct);
        db.CustomerAdvances.RemoveRange(advances);

        receipt.Status = "Voided";
        receipt.VoidReason = body.Reason.Trim();
        receipt.VoidedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return Results.Ok(new { receipt.Id, receipt.Status, receipt.VoidReason });
    }

    /// <summary>
    /// Movimientos del documento que se anula. Los que generó el propio documento (efectivo, billetera, transferencia que el banco
    /// todavía no debitó o ya conciliada) se borran, así el saldo vuelve; los del extracto quedan disponibles para reclasificar.
    /// </summary>
    private static async Task ReleaseMovementsAsync(FinanceDbContext db, Guid tenantId, string entityType, Guid id, List<Guid> chosenIds, CancellationToken ct)
    {
        var movements = await db.Movements.Where(x => x.TenantId == tenantId && (chosenIds.Contains(x.Id) || (x.LinkedEntityType == entityType && x.LinkedEntityId == id))).ToListAsync(ct);
        foreach (var m in movements)
        {
            if (m.Origin == FinancialMovementOrigin.System && !chosenIds.Contains(m.Id))
            {
                db.Movements.Remove(m);
                continue;
            }
            m.ReconciliationStatus = FinancialReconciliationStatus.Available;
            m.LinkedEntityType = null;
            m.LinkedEntityId = null;
            m.MatchedMovementId = null;
        }
    }

    /// <param name="fromExpenseReport">La rendición, al reabrirse, anula las órdenes de sus facturas A.</param>
    public static async Task<IResult> VoidPaymentOrderAsync(
        Guid id, VoidFinanceDocumentRequest body, FinanceDbContext db, Guid tenantId, CancellationToken ct, bool fromExpenseReport = false)
    {
        if (string.IsNullOrWhiteSpace(body.Reason))
            return Results.BadRequest("El motivo de anulación es obligatorio.");

        var order = await db.PaymentOrders.SingleOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
        if (order is null) return Results.NotFound("Orden de pago inexistente.");
        if (order.Status == "Voided") return Results.Conflict("La orden ya está anulada.");

        if (await FinanceAccountingGuard.IsPeriodClosedAsync(tenantId, order.PaymentDateUtc, ct))
            return Results.Conflict("No se puede anular: el período contable está cerrado.");

        if (!fromExpenseReport && await db.ExpenseReportLines.AnyAsync(l => l.TenantId == tenantId && l.PaymentOrderId == id, ct))
            return Results.Conflict("La orden paga una factura A de una rendición aprobada: reabrí la rendición.");
        if (await db.PaymentBatchItems.AnyAsync(i => i.TenantId == tenantId && i.PaymentOrderId == id && db.PaymentBatches.Any(b => b.Id == i.BatchId && b.Status == "Generated"), ct))
            return Results.Conflict("La orden está en un lote de pagos por archivo: anulá primero el lote.");

        var lines = await db.PaymentOrderLines.Where(x => x.PaymentOrderId == id && x.TenantId == tenantId).ToListAsync(ct);
        await ReleaseMovementsAsync(db, tenantId, "PaymentOrder", id, lines.Where(x => x.BankMovementId.HasValue).Select(x => x.BankMovementId!.Value).ToList(), ct);

        var chequeIds = lines.Where(x => x.ChequeId.HasValue).Select(x => x.ChequeId!.Value).ToList();
        var cheques = await db.ReceivedCheques.Where(x => x.TenantId == tenantId && chequeIds.Contains(x.Id)).ToListAsync(ct);
        foreach (var ch in cheques)
        {
            if (ch.Status == ReceivedChequeStatus.UsedForPayment && ch.Direction == ChequeDirection.Received)
                ch.Status = ReceivedChequeStatus.Available;
            ch.PaymentOrderId = null;
        }

        db.PaymentOrderImputations.RemoveRange(await db.PaymentOrderImputations.Where(x => x.PaymentOrderId == id && x.TenantId == tenantId).ToListAsync(ct));

        order.Status = "Voided";
        // Las retenciones de la orden se anulan: dejan de acumular en el mes y no van a SICORE.
        foreach (var w in await db.Withholdings.Where(x => x.TenantId == tenantId && x.PaymentOrderId == id).ToListAsync(ct)) w.Status = "Voided";
        order.VoidReason = body.Reason.Trim();
        order.VoidedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return Results.Ok(new { order.Id, order.Status, order.VoidReason });
    }
}
