using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Accounting.Contracts.Posting;
using LealControl.Modules.Sales.Application.Purchases;
using LealControl.Modules.Sales.Domain.Inventory;
using LealControl.Modules.Sales.Domain.Invoices;
using LealControl.Modules.Sales.Domain.Products;
using LealControl.Modules.Sales.Domain.Purchases;
using LealControl.Modules.Sales.Infrastructure.Persistence;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Sales.Infrastructure.Http;

public sealed record OperationalResetRequest(string Confirm);

/// <summary>
/// La parte de Compras y Ventas del reinicio operativo (la de Tesorería está en Finanzas). Borra todo Compras
/// (solicitudes, cotizaciones, órdenes, recepciones, facturas de proveedor, constataciones y comprobantes
/// importados de ARCA) y los comprobantes de venta sin CAE. Antes: revierte los asientos de las facturas de
/// compra, anula las recepciones (el stock baja en lo que entró) y devuelve al stock lo que habían descontado
/// los borradores de venta. No toca facturas con CAE, presupuestos, pedidos, remitos, clientes ni productos.
/// </summary>
public static class PurchasesOperationalReset
{
    public const string ConfirmPhrase = "BORRAR COMPRAS Y FINANZAS";

    public sealed record Summary(int PurchaseInvoices, int PurchaseOrders, int Receptions, int Requests, int Quotations,
        int ArcaVouchers, int SalesDrafts);

    public static void MapPurchasesOperationalReset(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/purchases/operational-reset").WithTags("Purchases");

        group.MapGet("", async (SalesDbContext db, ITenantContext tenant, CancellationToken ct) =>
            Results.Ok(await CountAsync(db, tenant.TenantId, ct))).RequireAuthorization("RequireAdmin");

        group.MapPost("", async (OperationalResetRequest body, SalesDbContext db, ITenantContext tenant, ISender sender,
            IAccountingPostingGateway accounting, CancellationToken ct) =>
        {
            if (!string.Equals(body.Confirm?.Trim(), ConfirmPhrase, StringComparison.OrdinalIgnoreCase))
                return Results.BadRequest($"Escribí \"{ConfirmPhrase}\" para confirmar.");
            var t = tenant.TenantId;
            var summary = await CountAsync(db, t, ct);

            foreach (var id in await db.PurchaseInvoices.Where(x => x.TenantId == t).Select(x => x.Id).ToListAsync(ct))
                await accounting.ReverseAsync(AccountingSourceModules.Purchases, id.ToString(), "Reinicio de Compras", ct);

            // La anulación de cada recepción ya baja el stock y deja el movimiento inverso en el kardex.
            foreach (var id in await db.PurchaseReceptions.Where(x => x.TenantId == t && x.Status != "Cancelled").Select(x => x.Id).ToListAsync(ct))
            {
                var cancelled = await sender.Send(new CancelPurchaseReceptionCommand(id, "Reinicio de Compras"), ct);
                if (cancelled.IsFailure) return Results.Problem($"No se pudo anular una recepción: {cancelled.Error.Message}");
            }
            db.ChangeTracker.Clear();

            await using var tx = await db.Database.BeginTransactionAsync(ct);
            await RemoveSalesDraftsAsync(db, t, ct);

            var purchaseInvoices = db.PurchaseInvoices.Where(x => x.TenantId == t).Select(x => x.Id);
            await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM purchases.purchase_invoice_arca_checks WHERE tenant_id = {t.Value}", ct);
            await db.PurchaseArcaVouchers.Where(x => x.TenantId == t).ExecuteDeleteAsync(ct);
            await db.Set<PurchaseInvoiceItem>().Where(i => purchaseInvoices.Contains(i.PurchaseInvoiceId)).ExecuteDeleteAsync(ct);
            await db.PurchaseInvoices.Where(x => x.TenantId == t).ExecuteDeleteAsync(ct);
            var receptions = db.PurchaseReceptions.Where(x => x.TenantId == t).Select(x => x.Id);
            await db.Set<PurchaseReceptionItem>().Where(i => receptions.Contains(i.PurchaseReceptionId)).ExecuteDeleteAsync(ct);
            await db.PurchaseReceptions.Where(x => x.TenantId == t).ExecuteDeleteAsync(ct);
            var orders = db.PurchaseOrders.Where(x => x.TenantId == t).Select(x => x.Id);
            await db.Set<PurchaseOrderItem>().Where(i => orders.Contains(i.PurchaseOrderId)).ExecuteDeleteAsync(ct);
            await db.PurchaseOrders.Where(x => x.TenantId == t).ExecuteDeleteAsync(ct);
            await db.PurchaseQuotations.Where(x => x.TenantId == t).ExecuteDeleteAsync(ct);
            var requests = db.PurchaseRequests.Where(x => x.TenantId == t).Select(x => x.Id);
            await db.Set<PurchaseRequestItem>().Where(i => requests.Contains(i.PurchaseRequestId)).ExecuteDeleteAsync(ct);
            await db.PurchaseRequests.Where(x => x.TenantId == t).ExecuteDeleteAsync(ct);
            await tx.CommitAsync(ct);
            return Results.Ok(summary);
        }).RequireAuthorization("RequireAdmin");
    }

    /// <summary>
    /// Comprobantes de venta sin CAE. Un borrador vigente (Draft o rechazado) que descontó stock lo devuelve; uno
    /// anulado no, porque o ya lo devolvió o lo reemplazó el comprobante autorizado que hereda ese movimiento.
    /// El remito que facturaba vuelve a quedar por facturar.
    /// </summary>
    private static async Task RemoveSalesDraftsAsync(SalesDbContext db, TenantId t, CancellationToken ct)
    {
        var drafts = await db.Invoices.Where(i => i.TenantId == t && i.Cae == null && i.Status != "Authorized").ToListAsync(ct);
        if (drafts.Count == 0) return;
        var ids = drafts.Select(i => i.Id).ToList();
        var live = drafts.Where(i => i.Status != "Cancelled").Select(i => i.Id).ToList();

        var movements = await db.StockMovements
            .Where(m => m.TenantId == t && m.ReferenceId != null && live.Contains(m.ReferenceId.Value)
                        && (m.MovementType == "SaleInvoiceDirect" || m.MovementType == "CreditNoteReturn"))
            .ToListAsync(ct);
        foreach (var m in movements)
        {
            var stock = await db.StockItems.FirstOrDefaultAsync(s => s.TenantId == t && s.ProductId == m.ProductId
                && (m.WarehouseId == null || s.WarehouseId == m.WarehouseId), ct);
            var before = stock?.PhysicalStock ?? 0;
            var after = before - m.Quantity;
            stock?.AdjustStock(after, stock.MinimumStock, stock.WarehouseLocation, stock.WarehouseId, stock.WarehouseName);
            var product = await db.Products.FirstOrDefaultAsync(p => p.Id == new ProductId(m.ProductId) && p.TenantId == t, ct);
            if (product is { TrackStock: true }) product.AdjustStock(-m.Quantity);
            db.StockMovements.Add(StockMovement.Create(t, m.ProductId, "SaleDraftDeleted", -m.Quantity, before, after,
                m.WarehouseId, m.WarehouseName, referenceId: m.ReferenceId, referenceType: m.ReferenceType,
                referenceNumber: m.ReferenceNumber, operatorName: "Sistema", notes: $"Borrador sin CAE {m.ReferenceNumber} borrado"));
        }

        foreach (var remito in await db.Remitos.Where(r => r.TenantId == t && r.InvoiceId != null && ids.Contains(r.InvoiceId.Value)).ToListAsync(ct))
            remito.ClearInvoice();
        await db.SaveChangesAsync(ct);

        await db.FiscalAuthorizationAttempts.Where(a => a.TenantId == t && ids.Contains(a.InvoiceId)).ExecuteDeleteAsync(ct);
        await db.Set<InvoiceItem>().Where(i => ids.Contains(i.InvoiceId)).ExecuteDeleteAsync(ct);
        await db.Invoices.Where(i => ids.Contains(i.Id)).ExecuteDeleteAsync(ct);
    }

    private static async Task<Summary> CountAsync(SalesDbContext db, TenantId t, CancellationToken ct) => new(
        await db.PurchaseInvoices.CountAsync(x => x.TenantId == t, ct),
        await db.PurchaseOrders.CountAsync(x => x.TenantId == t, ct),
        await db.PurchaseReceptions.CountAsync(x => x.TenantId == t, ct),
        await db.PurchaseRequests.CountAsync(x => x.TenantId == t, ct),
        await db.PurchaseQuotations.CountAsync(x => x.TenantId == t, ct),
        await db.PurchaseArcaVouchers.CountAsync(x => x.TenantId == t, ct),
        await db.Invoices.CountAsync(i => i.TenantId == t && i.Cae == null && i.Status != "Authorized", ct));
}
