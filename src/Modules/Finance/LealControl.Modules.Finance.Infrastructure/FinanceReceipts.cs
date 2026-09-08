using LealControl.BuildingBlocks.Security;
using LealControl.Modules.Finance.Application.Collections;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Finance.Infrastructure;

public static class FinanceReceipts
{
    public static IEndpointRouteBuilder MapFinanceReceiptEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/finance/collections").WithTags("Finance Collections").RequirePolicyOnWrites("RequireFinance");

        // List receipts
        group.MapGet("", async (FinanceDbContext db, LealControl.BuildingBlocks.Tenancy.ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var receipts = await db.CollectionReceipts
                .AsNoTracking()
                .Where(x => x.TenantId == tenantId)
                .OrderByDescending(x => x.ReceiptDateUtc)
                .ThenByDescending(x => x.CreatedAtUtc)
                .Take(250)
                .ToListAsync(ct);

            var receiptIds = receipts.Select(x => x.Id).ToList();

            var linesSummary = await db.CollectionReceiptLines
                .AsNoTracking()
                .Where(x => x.TenantId == tenantId && receiptIds.Contains(x.ReceiptId))
                .GroupBy(x => x.ReceiptId)
                .Select(g => new { ReceiptId = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.ReceiptId, x => x.Count, ct);

            var imputationsSummary = await db.CollectionReceiptImputations
                .AsNoTracking()
                .Where(x => x.TenantId == tenantId && receiptIds.Contains(x.ReceiptId))
                .GroupBy(x => x.ReceiptId)
                .Select(g => new { ReceiptId = g.Key, Count = g.Count(), Invoices = string.Join(", ", g.Select(i => i.InvoiceNumber)) })
                .ToDictionaryAsync(x => x.ReceiptId, ct);

            var result = receipts.Select(r => new
            {
                r.Id,
                r.CustomerId,
                r.AccountId,
                r.InvoiceId,
                r.ReceiptNumber,
                r.Amount,
                r.Currency,
                r.InvoiceAmount,
                r.InvoiceCurrency,
                r.InvoiceExchangeRate,
                r.PaymentExchangeRate,
                r.SuggestedAdjustmentArs,
                r.SuggestedAdjustmentType,
                r.ReceiptDateUtc,
                r.Description,
                r.Status,
                r.CreatedAtUtc,
                LinesCount = linesSummary.TryGetValue(r.Id, out var lc) ? lc : 0,
                InvoicesCount = imputationsSummary.TryGetValue(r.Id, out var imp) ? imp.Count : (r.InvoiceId.HasValue ? 1 : 0),
                InvoicesSummary = imputationsSummary.TryGetValue(r.Id, out var imp2) ? imp2.Invoices : ""
            });

            return Results.Ok(result);
        });

        // Get single receipt with detail
        group.MapGet("/{id:guid}", async (Guid id, FinanceDbContext db, LealControl.BuildingBlocks.Tenancy.ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var receipt = await db.CollectionReceipts.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            if (receipt is null) return Results.NotFound("Recibo de cobro inexistente.");

            var lines = await db.CollectionReceiptLines.AsNoTracking().Where(x => x.ReceiptId == id && x.TenantId == tenantId).ToListAsync(ct);
            var imputations = await db.CollectionReceiptImputations.AsNoTracking().Where(x => x.ReceiptId == id && x.TenantId == tenantId).ToListAsync(ct);

            return Results.Ok(new
            {
                receipt.Id,
                receipt.CustomerId,
                receipt.AccountId,
                receipt.InvoiceId,
                receipt.ReceiptNumber,
                receipt.Amount,
                receipt.Currency,
                receipt.InvoiceAmount,
                receipt.InvoiceCurrency,
                receipt.InvoiceExchangeRate,
                receipt.PaymentExchangeRate,
                receipt.SuggestedAdjustmentArs,
                receipt.SuggestedAdjustmentType,
                receipt.ReceiptDateUtc,
                receipt.Description,
                receipt.Status,
                receipt.CreatedAtUtc,
                Lines = lines,
                Imputations = imputations
            });
        });

        group.MapPost("", async (CreateCollectionReceiptCommand body, ISender sender, CancellationToken ct) =>
        {
            var result = await sender.Send(body, ct);
            return result.ToCreatedOrBadRequest(x => $"/api/v1/finance/collections/{x.Id}");
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
            var result = await FinanceVoid.VoidCollectionReceiptAsync(id, body, db, tenant.TenantId.Value, ct);
            var voided = await db.CollectionReceipts.AsNoTracking()
                .AnyAsync(x => x.Id == id && x.TenantId == tenant.TenantId.Value && x.Status == "Voided", ct);
            if (voided)
            {
                await FinanceAccountingPublisher.TryReverseAsync(
                    accounting, id.ToString(), body.Reason ?? "", loggerFactory.CreateLogger("FinanceAccounting"), ct);
            }
            return result;
        });

        var detail = endpoints.MapGroup("/api/v1/finance").WithTags("Finance Detail").RequirePolicyOnWrites("RequireFinance");
        detail.MapGet("/accounts/{accountId:guid}/movements-detail", async (Guid accountId, FinanceDbContext db, LealControl.BuildingBlocks.Tenancy.ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var account = await db.Accounts.AsNoTracking().SingleOrDefaultAsync(x => x.Id == accountId && x.TenantId == tenantId, ct);
            if (account is null) return Results.NotFound("Cuenta financiera inexistente.");
            var rows = await db.Movements.AsNoTracking().Where(x => x.AccountId == accountId && x.TenantId == tenantId).OrderBy(x => x.OperationDateUtc).ThenBy(x => x.CreatedAtUtc).ToListAsync(ct);
            var conceptIds = rows.Where(x => x.ConceptId.HasValue).Select(x => x.ConceptId!.Value).Distinct().ToList();
            var concepts = await db.FinancialConcepts.AsNoTracking().Where(x => x.TenantId == tenantId && conceptIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, x => x.Name, ct);
            var running = account.OpeningBalance;
            var result = rows.Select(x =>
            {
                running += x.Kind == FinancialMovementKind.Credit ? x.Amount : -x.Amount;
                return new
                {
                    x.Id,
                    x.OperationDateUtc,
                    x.Description,
                    x.ExternalReference,
                    x.Kind,
                    x.Amount,
                    x.Currency,
                    x.ReportedBalance,
                    SystemBalance = running,
                    Difference = x.ReportedBalance.HasValue ? running - x.ReportedBalance.Value : (decimal?)null,
                    x.ReconciliationStatus,
                    x.ConceptId,
                    ConceptName = x.ConceptId.HasValue && concepts.TryGetValue(x.ConceptId.Value, out var name) ? name : null,
                    x.ClassificationStatus
                };
            }).Reverse();
            return Results.Ok(result);
        });

        return endpoints;
    }
}
