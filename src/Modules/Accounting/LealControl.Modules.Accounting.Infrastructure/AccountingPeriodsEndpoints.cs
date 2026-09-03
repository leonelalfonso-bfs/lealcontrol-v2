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

internal static class AccountingPeriodsEndpoints
{
    public static RouteGroupBuilder MapAccountingPeriodsEndpoints(this RouteGroupBuilder group)
    {
        // ====================================================================
        // 11. Conciliación tesorería vs mayor (el extracto vive en Finanzas)
        // ====================================================================
        const string extractMovedToFinance =
            "El extracto bancario se importa en Finanzas. Comisiones y gastos se confirman ahí (concepto COMISION) y se contabilizan por plantilla.";

        group.MapGet("/treasury-reconciliation", async (
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            await db.EnsureAccountingTablesAsync(ct);
            await db.SeedDefaultChartOfAccountsAsync(tenantId, ct);
            var mapping = await db.GetOrCreateMappingAsync(tenantId, ct);

            var codes = new[]
            {
                mapping.CashAccountCode,
                mapping.BankAccountCode,
                mapping.ChecksInHandAccountCode,
                mapping.PspDigitalAccountCode
            }.Where(c => !string.IsNullOrWhiteSpace(c)).Distinct().ToList();

            var accounts = await db.Accounts.AsNoTracking()
                .Where(a => a.TenantId == tenantId && codes.Contains(a.Code))
                .ToListAsync(ct);

            var lines = await db.JournalEntryLines.AsNoTracking()
                .Where(l => l.TenantId == tenantId && codes.Contains(l.AccountCode))
                .GroupBy(l => l.AccountCode)
                .Select(g => new { Code = g.Key, Debit = g.Sum(x => x.Debit), Credit = g.Sum(x => x.Credit) })
                .ToListAsync(ct);
            var byCode = lines.ToDictionary(x => x.Code, StringComparer.OrdinalIgnoreCase);

            var rows = accounts.Select(a =>
            {
                byCode.TryGetValue(a.Code, out var mov);
                var debit = mov?.Debit ?? 0;
                var credit = mov?.Credit ?? 0;
                var ledgerBalance = a.AccountType is "Asset" or "Expense" ? debit - credit : credit - debit;
                return new
                {
                    a.Code,
                    a.Name,
                    a.AccountType,
                    a.Currency,
                    LedgerDebit = debit,
                    LedgerCredit = credit,
                    LedgerBalance = ledgerBalance,
                    Role = a.Code == mapping.CashAccountCode ? "Cash"
                        : a.Code == mapping.BankAccountCode ? "Bank"
                        : a.Code == mapping.ChecksInHandAccountCode ? "ChecksInHand"
                        : a.Code == mapping.PspDigitalAccountCode ? "Psp" : "Other"
                };
            }).OrderBy(r => r.Code).ToList();

            return Results.Ok(new
            {
                message = extractMovedToFinance,
                financeReconciliationPath = "/finanzas/conciliacion",
                rows
            });
        });

        group.MapGet("/bank-statements", () =>
            Results.Json(new { message = extractMovedToFinance }, statusCode: 410));

        group.MapGet("/bank-statements/{id:guid}", (Guid id) =>
        {
            _ = id;
            return Results.Json(new { message = extractMovedToFinance }, statusCode: 410);
        });

        group.MapPost("/bank-statements/upload", () =>
            Results.Json(new { message = extractMovedToFinance }, statusCode: 410));

        group.MapPost("/bank-statements/{id:guid}/auto-match", (Guid id) =>
        {
            _ = id;
            return Results.Json(new { message = extractMovedToFinance }, statusCode: 410);
        });

        group.MapPost("/bank-statements/lines/{lineId:guid}/quick-post", (Guid lineId) =>
        {
            _ = lineId;
            return Results.Json(new { message = extractMovedToFinance + " Confirmá el concepto COMISION en Finanzas." }, statusCode: 410);
        });

        // ====================================================================
        // 12. Period Lock & ARCA Digital VAT
        // ====================================================================

        group.MapGet("/periods", async (ITenantContext tenantContext, AccountingDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            var periods = await db.Periods.AsNoTracking().Where(p => p.TenantId == tenantId).OrderByDescending(p => p.Year).ThenByDescending(p => p.Month).ToListAsync(ct);
            return Results.Ok(periods);
        });

        group.MapPost("/periods/lock", async (LockPeriodRequest req, ITenantContext tenantContext, AccountingDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            var period = await db.Periods.FirstOrDefaultAsync(p => p.TenantId == tenantId && p.Year == req.Year && p.Month == req.Month, ct);
            if (period == null)
            {
                period = new FiscalYearPeriod
                {
                    TenantId = tenantId,
                    Year = req.Year,
                    Month = req.Month,
                    Status = req.Lock ? "Locked" : "Open",
                    LockedAtUtc = req.Lock ? DateTime.UtcNow : null,
                    LockedBy = req.Lock ? req.User ?? "Contador" : null
                };
                db.Periods.Add(period);
            }
            else
            {
                period.Status = req.Lock ? "Locked" : "Open";
                period.LockedAtUtc = req.Lock ? DateTime.UtcNow : null;
                period.LockedBy = req.Lock ? req.User ?? "Contador" : null;
            }

            await db.SaveChangesAsync(ct);
            return Results.Ok(period);
        });

        // ====================================================================
        // 13. Centros de Costos (Cost Centers)
        // ====================================================================
        group.MapGet("/cost-centers", async (ITenantContext tenantContext, AccountingDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            await db.SeedDefaultChartOfAccountsAsync(tenantId, ct);
            var costCenters = await db.CostCenters
                .AsNoTracking()
                .Where(c => c.TenantId == tenantId)
                .OrderBy(c => c.Code)
                .ToListAsync(ct);
            return Results.Ok(costCenters);
        });

        group.MapPost("/cost-centers", async (
            CreateCostCenterRequest req,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            var exists = await db.CostCenters.AnyAsync(c => c.TenantId == tenantId && c.Code == req.Code.Trim(), ct);
            if (exists)
            {
                return Results.BadRequest(new { message = $"Ya existe un centro de costos con el código {req.Code}." });
            }

            var costCenter = new CostCenter(
                Guid.NewGuid(),
                tenantId,
                req.Code.Trim(),
                req.Name.Trim(),
                req.Category ?? "Administration");

            db.CostCenters.Add(costCenter);
            await db.SaveChangesAsync(ct);

            return Results.Created($"/api/v1/accounting/cost-centers/{costCenter.Id}", costCenter);
        });

        return group;
    }
}
