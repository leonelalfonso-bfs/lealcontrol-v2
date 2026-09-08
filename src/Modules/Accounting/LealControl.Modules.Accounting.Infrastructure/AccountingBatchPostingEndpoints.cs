using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Security;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Accounting.Contracts.Posting;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace LealControl.Modules.Accounting.Infrastructure;

internal static class AccountingBatchPostingEndpoints
{
    public static RouteGroupBuilder MapAccountingBatchPostingEndpoints(this RouteGroupBuilder group)
    {
        // ====================================================================
        // 16. Contabilización en Lote & Auditoría (Botón Contabilizar)
        // ====================================================================
        group.MapGet("/batch-post/pending-summary", async (
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            await db.EnsureAccountingTablesAsync(ct);

            var pending = await db.PendingDocuments.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.Status == AccountingPendingDocumentStatuses.Pending)
                .GroupBy(x => x.SourceModule)
                .Select(g => new { Module = g.Key, Count = g.Count() })
                .ToListAsync(ct);

            int salesPending = pending.Where(x => x.Module == "Sales").Sum(x => x.Count);
            int purchasesPending = pending.Where(x => x.Module == "Purchases").Sum(x => x.Count);
            int financePending = pending.Where(x => x.Module == "Finance").Sum(x => x.Count);
            int inventoryPending = pending.Where(x => x.Module == "Inventory" || x.Module == "Payroll").Sum(x => x.Count);
            var total = salesPending + purchasesPending + financePending + inventoryPending;

            return Results.Ok(new UnpostedDocumentsSummaryResponse(
                total,
                salesPending,
                purchasesPending,
                financePending,
                inventoryPending,
                null,
                null
            ));
        });

        group.MapGet("/pending-documents", async (
            string? status,
            string? sourceModule,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            await db.EnsureAccountingTablesAsync(ct);
            var query = db.PendingDocuments.AsNoTracking().Where(x => x.TenantId == tenantId);
            if (!string.IsNullOrWhiteSpace(status))
            {
                query = query.Where(x => x.Status == status);
            }
            else
            {
                query = query.Where(x => x.Status == AccountingPendingDocumentStatuses.Pending
                                        || x.Status == AccountingPendingDocumentStatuses.Error);
            }

            if (!string.IsNullOrWhiteSpace(sourceModule))
            {
                query = query.Where(x => x.SourceModule == sourceModule);
            }

            var rows = await query
                .OrderByDescending(x => x.DocumentDateUtc)
                .Take(200)
                .Select(x => new
                {
                    x.Id,
                    x.SourceModule,
                    x.DocumentType,
                    x.SourceDocumentId,
                    x.DocumentNumber,
                    x.DocumentDateUtc,
                    x.Status,
                    x.LastError,
                    x.JournalEntryId,
                    x.CreatedAtUtc,
                    x.UpdatedAtUtc
                })
                .ToListAsync(ct);
            return Results.Ok(rows);
        });

        group.MapPost("/batch-post/preview", async (
            BatchPostingPreviewRequest req,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            var result = await BatchPostProcessor.PreviewAsync(req, tenantId, db, ct);
            return Results.Ok(result);
        });

        group.MapPost("/batch-post/execute", async (
            BatchPostingExecuteRequest req,
            ITenantContext tenantContext,
            AccountingDbContext db,
            ILoggerFactory loggerFactory,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            var logger = loggerFactory.CreateLogger("BatchPostExecute");
            var result = await BatchPostProcessor.ExecuteAsync(req, tenantId, db, logger, ct);
            if (result.Status == "Failed")
                return Results.Conflict(result);
            return Results.Ok(result);
        });

        group.MapGet("/batch-runs", async (
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            await db.EnsureAccountingTablesAsync(ct);

            var runs = await db.BatchRuns
                .AsNoTracking()
                .Where(r => r.TenantId == tenantId)
                .OrderByDescending(r => r.ExecutedAtUtc)
                .Take(50)
                .ToListAsync(ct);

            return Results.Ok(runs);
        });

        group.MapPost("/batch-runs/{id:guid}/revert", async (
            Guid id,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            return await BatchPostProcessor.RevertAsync(id, tenantId, db, ct);
        });

        return group;
    }
}
