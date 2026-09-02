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
        var movementIds = lines.Where(x => x.BankMovementId.HasValue).Select(x => x.BankMovementId!.Value).ToList();
        var movements = await db.Movements.Where(x => x.TenantId == tenantId && (movementIds.Contains(x.Id) || (x.LinkedEntityType == "CollectionReceipt" && x.LinkedEntityId == id))).ToListAsync(ct);
        foreach (var m in movements)
        {
            m.ReconciliationStatus = FinancialReconciliationStatus.Available;
            m.LinkedEntityType = null;
            m.LinkedEntityId = null;
        }

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

    public static async Task<IResult> VoidPaymentOrderAsync(
        Guid id, VoidFinanceDocumentRequest body, FinanceDbContext db, Guid tenantId, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(body.Reason))
            return Results.BadRequest("El motivo de anulación es obligatorio.");

        var order = await db.PaymentOrders.SingleOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
        if (order is null) return Results.NotFound("Orden de pago inexistente.");
        if (order.Status == "Voided") return Results.Conflict("La orden ya está anulada.");

        if (await FinanceAccountingGuard.IsPeriodClosedAsync(tenantId, order.PaymentDateUtc, ct))
            return Results.Conflict("No se puede anular: el período contable está cerrado.");

        var lines = await db.PaymentOrderLines.Where(x => x.PaymentOrderId == id && x.TenantId == tenantId).ToListAsync(ct);
        var movementIds = lines.Where(x => x.BankMovementId.HasValue).Select(x => x.BankMovementId!.Value).ToList();
        var movements = await db.Movements.Where(x => x.TenantId == tenantId && (movementIds.Contains(x.Id) || (x.LinkedEntityType == "PaymentOrder" && x.LinkedEntityId == id))).ToListAsync(ct);
        foreach (var m in movements)
        {
            m.ReconciliationStatus = FinancialReconciliationStatus.Available;
            m.LinkedEntityType = null;
            m.LinkedEntityId = null;
        }

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
        order.VoidReason = body.Reason.Trim();
        order.VoidedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return Results.Ok(new { order.Id, order.Status, order.VoidReason });
    }
}
