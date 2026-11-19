using System;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Security;
using LealControl.BuildingBlocks.Results;
using LealControl.Modules.Accounting.Contracts.Posting;
using LealControl.Modules.Sales.Application.Purchases;
using LealControl.Modules.Sales.Infrastructure.Accounting;
using LealControl.Modules.Sales.Infrastructure.Persistence.Purchases;
using LealControl.Modules.Sales.Domain.Purchases;
using LealControl.Modules.Sales.Infrastructure.Persistence;
using LealControl.BuildingBlocks.Tenancy;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace LealControl.Modules.Sales.Infrastructure.Http;

public static class PurchaseEndpoints
{
    public static void MapPurchaseEndpoints(this IEndpointRouteBuilder app)
    {
        var purchases = app.MapGroup("/api/v1/purchases").WithTags("Purchases").RequirePolicyOnWrites("RequirePurchases");

        // Purchase Orders
        purchases.MapGet("/orders", async (string? search, string? status, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new ListPurchaseOrdersQuery(search, status), ct);
            return result.ToHttp();
        });

        purchases.MapGet("/orders/{id:guid}", async (Guid id, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new GetPurchaseOrderQuery(id), ct);
            return result.ToHttp();
        });

        // RequireAuthorization runs in AuthorizationMiddleware (before body binding),
        // so forbidden writers get 403 instead of 400 from invalid/partial JSON.
        purchases.MapPost("/orders", async (CreatePurchaseOrderCommand body, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(body, ct);
            return result.IsSuccess
                ? Results.Created($"/api/v1/purchases/orders/{result.Value.Id}", result.Value)
                : result.ToHttp();
        }).RequireAuthorization("RequirePurchases");

        purchases.MapPut("/orders/{id:guid}/status", async (Guid id, UpdateStatusRequest body, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new UpdatePurchaseOrderStatusCommand(id, body.Status), ct);
            return result.ToHttp();
        });

        // Purchase Receptions (Remitos de Proveedor)
        purchases.MapGet("/receptions", async (string? search, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new ListPurchaseReceptionsQuery(search), ct);
            return result.ToHttp();
        });

        purchases.MapGet("/receptions/{id:guid}", async (Guid id, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new GetPurchaseReceptionQuery(id), ct);
            return result.ToHttp();
        });

        purchases.MapPost("/receptions", async (CreatePurchaseReceptionCommand body, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(body, ct);
            return result.IsSuccess
                ? Results.Created($"/api/v1/purchases/receptions/{result.Value.Id}", result.Value)
                : result.ToHttp();
        });

        purchases.MapPost("/receptions/{id:guid}/cancel", async (Guid id, CancelPurchaseBody? body, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new CancelPurchaseReceptionCommand(id, body?.Reason), ct);
            return result.ToHttp();
        }).RequireAuthorization("RequirePurchases");

        // Purchase Invoices (Facturas de Proveedor)
        purchases.MapGet("/invoices", async (string? search, string? status, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new ListPurchaseInvoicesQuery(search, status), ct);
            return result.ToHttp();
        });

        // Período sugerido para una factura de esa fecha: su mes, o el primer mes abierto si está cerrado.
        purchases.MapGet("/invoices/imputation-period", async (DateTime issueDate, IAccountingPostingGateway accounting, CancellationToken ct) =>
        {
            var locked = await accounting.LockedMonthsAsync(ct);
            var (period, _) = PurchaseQueryHandlers.ResolveImputation(issueDate, null, locked);
            return Results.Ok(new
            {
                Period = period,
                IssueMonthLocked = period != PurchaseInvoice.MonthOf(issueDate),
                LockedMonths = locked.OrderBy(m => m).Select(m => m.ToString("yyyy-MM"))
            });
        });

        // Cambiar el período de una compra cargada (por ejemplo, la de un mes que después se cerró).
        purchases.MapPut("/invoices/{id:guid}/imputation-period", async (Guid id, ImputationPeriodRequest body, SalesDbContext db, ITenantContext tenant,
            IAccountingPostingGateway accounting, CancellationToken ct) =>
        {
            var invoice = await db.Set<PurchaseInvoice>().Include(x => x.Items).FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenant.TenantId, ct);
            if (invoice is null) return Results.NotFound(new { detail = "Factura de compra no encontrada." });
            if (invoice.Status == "Cancelled") return Results.BadRequest(new { detail = "La factura está anulada." });
            if (await accounting.IsPostedAsync(AccountingSourceModules.Purchases, id.ToString(), ct))
                return Results.Conflict(new { detail = "La factura ya tiene asiento: para moverla de período, anulala y volvé a cargarla." });
            var (period, error) = PurchaseQueryHandlers.ResolveImputation(invoice.IssueDate, body.Period, await accounting.LockedMonthsAsync(ct));
            if ((error ?? invoice.ImputeTo(period)) is { } failure) return Results.BadRequest(new { detail = failure });
            await db.SaveChangesAsync(ct);
            // Si ya estaba en la cola contable, se actualiza su fecha; si no, se publica al contabilizar el período.
            var unpublished = await accounting.FilterUnpublishedAsync(AccountingSourceModules.Purchases, [id.ToString()], ct);
            if (!unpublished.Contains(id.ToString()))
                await accounting.PostAsync(SalesAccountingDocumentSource.PurchaseDocument(invoice), ct);
            return Results.Ok(new { invoice.Id, invoice.ImputationPeriod });
        });

        purchases.MapGet("/invoices/{id:guid}", async (Guid id, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new GetPurchaseInvoiceQuery(id), ct);
            return result.ToHttp();
        });

        purchases.MapPost("/invoices", async (CreatePurchaseInvoiceCommand body, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(body, ct);
            return result.IsSuccess
                ? Results.Created($"/api/v1/purchases/invoices/{result.Value.Id}", result.Value)
                : result.ToHttp();
        });

        purchases.MapPost("/invoices/{id:guid}/cancel", async (Guid id, CancelPurchaseBody? body, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new CancelPurchaseInvoiceCommand(id, body?.Reason), ct);
            return result.ToHttp();
        }).RequireAuthorization("RequirePurchases");

        purchases.MapPost("/invoices/{id:guid}/link-reception", async (Guid id, LinkReceptionBody body, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new LinkPurchaseInvoiceReceptionCommand(id, body.ReceptionId), ct);
            return result.ToHttp();
        }).RequireAuthorization("RequirePurchases");

        // ARCA Mis Comprobantes Recibidos
        purchases.MapGet("/arca/vouchers", async (string? status, string? search, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new ListArcaVouchersQuery(status, search), ct);
            return result.ToHttp();
        });

        purchases.MapPost("/arca/import", async (ImportArcaRequest body, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new ImportArcaCsvCommand(body.CsvContent), ct);
            return result.ToHttp();
        });

        purchases.MapPost("/arca/vouchers/{id:guid}/ignore", async (Guid id, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new IgnoreArcaVoucherCommand(id), ct);
            return result.ToHttp();
        });

        // Purchase Requests (Requisiciones Internas)
        purchases.MapGet("/requests", async (string? search, string? status, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new ListPurchaseRequestsQuery(search, status), ct);
            return result.ToHttp();
        });

        purchases.MapGet("/requests/{id:guid}", async (Guid id, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new GetPurchaseRequestQuery(id), ct);
            return result.ToHttp();
        });

        purchases.MapPost("/requests", async (CreatePurchaseRequestCommand body, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(body, ct);
            return result.IsSuccess
                ? Results.Created($"/api/v1/purchases/requests/{result.Value.Id}", result.Value)
                : result.ToHttp();
        });

        purchases.MapPost("/requests/{id:guid}/approve", async (Guid id, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new ApprovePurchaseRequestCommand(id), ct);
            return result.ToHttp();
        });

        purchases.MapPost("/requests/{id:guid}/reject", async (Guid id, RejectRequest body, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new RejectPurchaseRequestCommand(id, body.Reason), ct);
            return result.ToHttp();
        });

        // Supplier Quotations (Presupuestos de Proveedores)
        purchases.MapPost("/requests/{id:guid}/quotations", async (Guid id, AddPurchaseQuotationCommand body, ISender sender, CancellationToken ct) =>
        {
            var cmd = body with { PurchaseRequestId = id };
            var result = await sender.Send(cmd, ct);
            return result.ToHttp();
        });

        purchases.MapPost("/requests/{id:guid}/quotations/{quotationId:guid}/select", async (Guid id, Guid quotationId, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new SelectPurchaseQuotationCommand(id, quotationId), ct);
            return result.ToHttp();
        });

        purchases.MapDelete("/requests/{id:guid}/quotations/{quotationId:guid}", async (Guid id, Guid quotationId, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(new DeletePurchaseQuotationCommand(id, quotationId), ct);
            return result.ToHttp();
        });

        purchases.MapPurchaseArcaChecks();

        purchases.MapGet("/orders/{id:guid}/reconciliation", async (Guid id, SalesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var order = await db.Set<PurchaseOrder>().Include(x => x.Items).AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenant.TenantId, ct);
            if (order is null) return Results.NotFound(new { detail = "Orden de compra no encontrada." });
            var receptions = await db.Set<PurchaseReception>().Include(x => x.Items).AsNoTracking()
                .Where(x => x.PurchaseOrderId == id && x.TenantId == tenant.TenantId && x.Status != "Cancelled").ToListAsync(ct);
            var invoices = await db.Set<PurchaseInvoice>().Include(x => x.Items).AsNoTracking()
                .Where(x => x.PurchaseOrderId == id && x.TenantId == tenant.TenantId && x.Status != "Cancelled").ToListAsync(ct);
            var rows = order.Items.Select(item => new { productId = item.ProductId, code = item.Code, ordered = item.Quantity, received = receptions.SelectMany(x => x.Items).Where(x => x.ProductId == item.ProductId).Sum(x => x.Quantity), invoiced = invoices.SelectMany(x => x.Items).Where(x => x.ProductId == item.ProductId).Sum(x => x.Quantity), orderedAmount = item.Total, invoicedAmount = invoices.SelectMany(x => x.Items).Where(x => x.ProductId == item.ProductId).Sum(x => x.Total) }).ToList();
            return Results.Ok(new { orderId = id, status = rows.Any(x => x.received > x.ordered || x.invoicedAmount > x.orderedAmount) ? "WithDifferences" : "Matched", rows });
        });
    }

    public sealed record UpdateStatusRequest(string Status);
    public sealed record ImputationPeriodRequest(DateTime Period);
    public sealed record ImportArcaRequest(string CsvContent);
    public sealed record RejectRequest(string Reason);
    public sealed record CancelPurchaseBody(string? Reason);
    public sealed record LinkReceptionBody(Guid ReceptionId);
}
