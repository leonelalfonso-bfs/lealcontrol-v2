using LealControl.BuildingBlocks.Security;
using LealControl.Modules.Finance.Application.Payments;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Finance.Infrastructure;

public static class FinancePayments
{
    public static IEndpointRouteBuilder MapFinancePaymentEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/finance/payments").WithTags("Finance Payment Orders").RequirePolicyOnWrites("RequireFinance");

        // List payment orders
        group.MapGet("", async (FinanceDbContext db, LealControl.BuildingBlocks.Tenancy.ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var orders = await db.PaymentOrders
                .AsNoTracking()
                .Where(x => x.TenantId == tenantId)
                .OrderByDescending(x => x.PaymentDateUtc)
                .ThenByDescending(x => x.CreatedAtUtc)
                .Take(250)
                .ToListAsync(ct);

            var orderIds = orders.Select(x => x.Id).ToList();

            var linesSummary = await db.PaymentOrderLines
                .AsNoTracking()
                .Where(x => x.TenantId == tenantId && orderIds.Contains(x.PaymentOrderId))
                .GroupBy(x => x.PaymentOrderId)
                .Select(g => new { OrderId = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.OrderId, x => x.Count, ct);

            var imputationsSummary = await db.PaymentOrderImputations
                .AsNoTracking()
                .Where(x => x.TenantId == tenantId && orderIds.Contains(x.PaymentOrderId))
                .GroupBy(x => x.PaymentOrderId)
                .Select(g => new { OrderId = g.Key, Count = g.Count(), Invoices = string.Join(", ", g.Select(i => i.InvoiceNumber)) })
                .ToDictionaryAsync(x => x.OrderId, ct);

            var result = orders.Select(o => new
            {
                o.Id,
                o.SupplierId,
                o.SupplierName,
                o.SupplierTaxId,
                o.OrderNumber,
                o.Amount,
                o.Currency,
                o.PaymentDateUtc,
                o.Notes,
                o.Status,
                o.CreatedAtUtc,
                LinesCount = linesSummary.TryGetValue(o.Id, out var lc) ? lc : 0,
                InvoicesCount = imputationsSummary.TryGetValue(o.Id, out var imp) ? imp.Count : 0,
                InvoicesSummary = imputationsSummary.TryGetValue(o.Id, out var imp2) ? imp2.Invoices : ""
            });

            return Results.Ok(result);
        });

        // Get single payment order with detail
        group.MapGet("/{id:guid}", async (Guid id, FinanceDbContext db, LealControl.BuildingBlocks.Tenancy.ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var order = await db.PaymentOrders.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            if (order is null) return Results.NotFound("Orden de pago inexistente.");

            var lines = await db.PaymentOrderLines.AsNoTracking().Where(x => x.PaymentOrderId == id && x.TenantId == tenantId).ToListAsync(ct);
            var imputations = await db.PaymentOrderImputations.AsNoTracking().Where(x => x.PaymentOrderId == id && x.TenantId == tenantId).ToListAsync(ct);

            return Results.Ok(new
            {
                order.Id,
                order.SupplierId,
                order.SupplierName,
                order.SupplierTaxId,
                order.OrderNumber,
                order.Amount,
                order.Currency,
                order.PaymentDateUtc,
                order.Notes,
                order.Status,
                order.CreatedAtUtc,
                Lines = lines,
                Imputations = imputations
            });
        });

        group.MapPost("", async (CreatePaymentOrderCommand body, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(body, ct);
            return result.ToCreatedOrBadRequest(x => $"/api/v1/finance/payments/{x.Id}");
        });

        group.MapPost("/{id:guid}/void", async (
            Guid id,
            VoidFinanceDocumentRequest body,
            FinanceDbContext db,
            LealControl.BuildingBlocks.Tenancy.ITenantContext tenant,
            LealControl.Modules.Accounting.Contracts.Posting.IAccountingPostingGateway accounting,
            Microsoft.Extensions.Logging.ILoggerFactory loggerFactory,
            CancellationToken ct) =>
        {
            var result = await FinanceVoid.VoidPaymentOrderAsync(id, body, db, tenant.TenantId.Value, ct);
            var voided = await db.PaymentOrders.AsNoTracking()
                .AnyAsync(x => x.Id == id && x.TenantId == tenant.TenantId.Value && x.Status == "Voided", ct);
            if (voided)
            {
                await FinanceAccountingPublisher.TryReverseAsync(
                    accounting, id.ToString(), body.Reason ?? "", loggerFactory.CreateLogger("FinanceAccounting"), ct);
            }
            return result;
        });

        return endpoints;
    }
}

