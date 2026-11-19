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

        // Rubros de compra/gasto (Producto/Gasto del Libro IVA Compras).
        purchases.MapGet("/expense-categories", async (SalesDbContext db, ITenantContext tenant, CancellationToken ct) =>
            Results.Ok(await db.Set<ExpenseCategory>().AsNoTracking().Where(c => c.TenantId == tenant.TenantId)
                .OrderBy(c => c.Code).Select(c => new { c.Id, c.Code, c.Name, c.IsActive }).ToListAsync(ct)));

        purchases.MapPost("/expense-categories", async (ExpenseCategoryRequest body, SalesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            if (await ValidateCategoryAsync(body, null, db, tenant, ct) is { } invalid) return invalid;
            var category = ExpenseCategory.Create(tenant.TenantId, body.Code, body.Name);
            db.Add(category);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { category.Id, category.Code, category.Name, category.IsActive });
        });

        purchases.MapPut("/expense-categories/{id:guid}", async (Guid id, ExpenseCategoryRequest body, SalesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var category = await db.Set<ExpenseCategory>().FirstOrDefaultAsync(c => c.Id == id && c.TenantId == tenant.TenantId, ct);
            if (category is null) return Results.NotFound(new { detail = "Rubro no encontrado." });
            if (await ValidateCategoryAsync(body, id, db, tenant, ct) is { } invalid) return invalid;
            category.Update(body.Code, body.Name, body.IsActive ?? category.IsActive);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { category.Id, category.Code, category.Name, category.IsActive });
        });

        // Rubro de cada renglón de una factura ya cargada (por ejemplo, las anteriores al catálogo de rubros).
        purchases.MapPut("/invoices/{id:guid}/expense-categories", async (Guid id, CategorizeLinesRequest body, SalesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var invoice = await db.Set<PurchaseInvoice>().Include(x => x.Items).FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenant.TenantId, ct);
            if (invoice is null) return Results.NotFound(new { detail = "Factura de compra no encontrada." });
            var requested = body.Lines.Where(l => l.ExpenseCategoryId is not null).Select(l => l.ExpenseCategoryId!.Value).Distinct().ToList();
            var known = await db.Set<ExpenseCategory>().CountAsync(c => c.TenantId == tenant.TenantId && requested.Contains(c.Id), ct);
            if (known != requested.Count) return Results.BadRequest(new { detail = "Alguno de los rubros no existe." });
            foreach (var line in body.Lines)
            {
                if (invoice.Items.FirstOrDefault(i => i.Id == line.ItemId) is not { } item)
                    return Results.BadRequest(new { detail = "El renglón no es de esta factura." });
                item.Categorize(line.ExpenseCategoryId);
            }
            await db.SaveChangesAsync(ct);
            return Results.Ok(invoice.Items.Select(i => new { i.Id, i.ExpenseCategoryId }));
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

    private static async Task<IResult?> ValidateCategoryAsync(ExpenseCategoryRequest body, Guid? id, SalesDbContext db, ITenantContext tenant, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(body.Code) || string.IsNullOrWhiteSpace(body.Name))
            return Results.BadRequest(new { detail = "El rubro necesita código y nombre." });
        var code = body.Code.Trim().ToUpperInvariant();
        if (code.Length > 12) return Results.BadRequest(new { detail = "El código del rubro va hasta 12 caracteres." });
        var taken = await db.Set<ExpenseCategory>().AnyAsync(c => c.TenantId == tenant.TenantId && c.Code == code && c.Id != id, ct);
        return taken ? Results.BadRequest(new { detail = $"Ya existe el rubro {code}." }) : null;
    }
}

public sealed record CategorizeLinesRequest(IReadOnlyList<CategorizeLine> Lines);

public sealed record CategorizeLine(Guid ItemId, Guid? ExpenseCategoryId);

public sealed record ExpenseCategoryRequest(string Code, string Name, bool? IsActive = null);
