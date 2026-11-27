using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Security;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Contracts.Opportunities;
using LealControl.Modules.Crm.Domain.Opportunities;
using LealControl.Modules.Crm.Infrastructure.Persistence;
using LealControl.Modules.Sales.Domain.Orders;
using LealControl.Modules.Sales.Domain.Quotes;
using LealControl.Modules.Sales.Infrastructure.Persistence;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace LealControl.Api.Automation;

/// <summary>
/// Impide cerrar manualmente como Perdida una oportunidad que ya tiene un pedido activo en Ventas.
/// </summary>
internal sealed class SalesOpportunityLossGuard(SalesDbContext sales, ITenantContext tenant) : IOpportunityLossGuard
{
    public async Task<string?> GetBlockingReasonAsync(Guid opportunityId, CancellationToken cancellationToken = default)
    {
        try
        {
            var quoteIds = await sales.Quotes.AsNoTracking()
                .Where(q => q.TenantId == tenant.TenantId && q.OpportunityId == opportunityId)
                .Select(q => q.Id.Value)
                .ToListAsync(cancellationToken);

            var activeOrderNumber = await sales.Orders.AsNoTracking()
                .Where(o => o.TenantId == tenant.TenantId && o.Status != OrderStatus.Cancelled
                    && (o.OpportunityId == opportunityId || (o.QuoteId != null && quoteIds.Contains(o.QuoteId.Value))))
                .Select(o => o.OrderNumber)
                .FirstOrDefaultAsync(cancellationToken);

            return activeOrderNumber is null
                ? null
                : $"Esta oportunidad tiene el pedido activo {activeOrderNumber}. Anulá primero el pedido si querés marcarla como Perdida.";
        }
        catch (PostgresException ex) when (ex.SqlState == PostgresErrorCodes.UndefinedTable)
        {
            return null;
        }
    }
}

public static class CrmSalesSyncEndpoints
{
    public static IEndpointRouteBuilder MapCrmSalesSyncEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/crm/opportunities").RequireAuthorization();

        // Cadena completa de Ventas vinculada a una oportunidad (Presupuestos → Pedidos → Facturas).
        group.MapGet("/{id:guid}/sales-chain", async (
            Guid id,
            ITenantContext tenant,
            ISensitiveDataAccess access,
            SalesDbContext sales,
            CancellationToken ct) =>
        {
            var seesAmounts = access.CanSeeAmounts;
            try
            {
                var quotes = await sales.Quotes.AsNoTracking()
                    .Include(q => q.Lines)
                    .Where(q => q.TenantId == tenant.TenantId && q.OpportunityId == id)
                    .OrderByDescending(q => q.UpdatedAtUtc)
                    .ToListAsync(ct);

                var quoteIds = quotes.Select(q => q.Id.Value).ToList();

                var orders = await sales.Orders.AsNoTracking()
                    .Where(o => o.TenantId == tenant.TenantId
                        && (o.OpportunityId == id || (o.QuoteId != null && quoteIds.Contains(o.QuoteId.Value))))
                    .OrderByDescending(o => o.CreatedAtUtc)
                    .ToListAsync(ct);

                var orderIds = orders.Select(o => o.Id.Value).ToList();

                var invoices = orderIds.Count == 0
                    ? []
                    : await sales.Invoices.AsNoTracking()
                        .Where(i => i.TenantId == tenant.TenantId && i.OrderId != null && orderIds.Contains(i.OrderId.Value))
                        .OrderByDescending(i => i.IssueDate)
                        .ToListAsync(ct);

                return Results.Ok(new
                {
                    quotes = quotes.Select(q => new
                    {
                        id = q.Id.Value,
                        number = q.QuoteNumber,
                        revision = q.Revision,
                        status = q.Status.ToString(),
                        total = seesAmounts ? (decimal?)q.Total : null,
                        currency = q.Currency,
                        createdAtUtc = q.CreatedAtUtc
                    }),
                    orders = orders.Select(o => new
                    {
                        id = o.Id.Value,
                        number = o.OrderNumber,
                        status = o.Status.ToString(),
                        quoteNumber = o.QuoteNumber,
                        total = seesAmounts ? (decimal?)o.Total : null,
                        currency = o.Currency,
                        createdAtUtc = o.CreatedAtUtc
                    }),
                    invoices = invoices.Select(i => new
                    {
                        id = i.Id,
                        number = i.FormattedNumber,
                        invoiceType = i.InvoiceType,
                        status = i.Status,
                        total = seesAmounts ? (decimal?)i.Total : null,
                        currency = i.Currency,
                        issueDate = i.IssueDate
                    })
                });
            }
            catch (PostgresException ex) when (ex.SqlState == PostgresErrorCodes.UndefinedTable)
            {
                return Results.Ok(new { quotes = Array.Empty<object>(), orders = Array.Empty<object>(), invoices = Array.Empty<object>() });
            }
        });

        // Sincronización idempotente de oportunidades abiertas con presupuestos y pedidos ya existentes en Ventas.
        group.MapPost("/sync-with-sales", async (
            ITenantContext tenant,
            CrmDbContext crm,
            SalesDbContext sales,
            IOpportunityQuoteSync sync,
            CancellationToken ct) =>
        {
            var openOpps = await crm.Opportunities.AsNoTracking()
                .Where(o => o.TenantId == tenant.TenantId && o.Stage != OpportunityStage.Won && o.Stage != OpportunityStage.Lost)
                .Select(o => new { Id = o.Id.Value, o.Stage })
                .ToListAsync(ct);

            if (openOpps.Count == 0)
                return Results.Ok(new { ordersSynced = 0, quotesSynced = 0 });

            var openOppIds = openOpps.Select(o => o.Id).ToList();
            var quotes = await sales.Quotes.AsNoTracking()
                .Include(q => q.Lines)
                .Where(q => q.TenantId == tenant.TenantId && q.OpportunityId != null && openOppIds.Contains(q.OpportunityId.Value))
                .ToListAsync(ct);
            var quoteIds = quotes.Select(q => q.Id.Value).ToList();

            var activeOrders = await sales.Orders.AsNoTracking()
                .Where(o => o.TenantId == tenant.TenantId && o.Status != OrderStatus.Cancelled
                    && ((o.OpportunityId != null && openOppIds.Contains(o.OpportunityId.Value))
                        || (o.QuoteId != null && quoteIds.Contains(o.QuoteId.Value))))
                .OrderByDescending(o => o.CreatedAtUtc)
                .ToListAsync(ct);

            var quoteById = quotes.ToDictionary(q => q.Id.Value);
            var ordersSynced = 0;
            var quotesSynced = 0;
            var wonIds = new HashSet<Guid>();

            foreach (var order in activeOrders)
            {
                var oppId = order.OpportunityId
                    ?? (order.QuoteId is { } qid && quoteById.TryGetValue(qid, out var q) ? q.OpportunityId : null);
                if (oppId is null || !wonIds.Add(oppId.Value)) continue;

                if (order.Status == OrderStatus.Draft)
                    await sync.SyncQuoteProgressAsync(oppId.Value, order.Total, order.Currency, isSent: true, isAccepted: true, ct);
                else
                    await sync.MarkWonAsync(oppId.Value, order.Total, order.Currency, ct);
                ordersSynced++;
            }

            foreach (var opp in openOpps)
            {
                if (wonIds.Contains(opp.Id)) continue;
                var latestQuote = quotes
                    .Where(q => q.OpportunityId == opp.Id && q.Status is QuoteStatus.Sent or QuoteStatus.Accepted)
                    .OrderByDescending(q => q.UpdatedAtUtc)
                    .FirstOrDefault();
                if (latestQuote is null) continue;

                var needsMove = (latestQuote.Status == QuoteStatus.Accepted && opp.Stage is OpportunityStage.Lead or OpportunityStage.Qualified or OpportunityStage.Proposal)
                    || (latestQuote.Status == QuoteStatus.Sent && opp.Stage is OpportunityStage.Lead or OpportunityStage.Qualified);
                if (!needsMove) continue;

                await sync.SyncQuoteProgressAsync(
                    opp.Id, latestQuote.Total, latestQuote.Currency,
                    isSent: true,
                    isAccepted: latestQuote.Status == QuoteStatus.Accepted,
                    ct);
                quotesSynced++;
            }

            return Results.Ok(new { ordersSynced, quotesSynced });
        });

        return app;
    }
}
