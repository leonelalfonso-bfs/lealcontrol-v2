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

internal static class AccountingJournalEndpoints
{
    public static RouteGroupBuilder MapAccountingJournalEndpoints(this RouteGroupBuilder group)
    {
        // ====================================================================
        // 3. Journal Entries (Libro Diario)
        // ====================================================================
        group.MapGet("/journal-entries", async (
            [FromQuery] DateTime? startDate,
            [FromQuery] DateTime? endDate,
            [FromQuery] string? sourceModule,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            await db.EnsureAccountingTablesAsync(ct);
            var query = db.JournalEntries
                .AsNoTracking()
                .Include(j => j.Lines)
                .Where(j => j.TenantId == tenantId);

            if (startDate.HasValue) query = query.Where(j => j.Date >= startDate.Value.ToUniversalTime());
            if (endDate.HasValue) query = query.Where(j => j.Date <= endDate.Value.ToUniversalTime());
            if (!string.IsNullOrWhiteSpace(sourceModule)) query = query.Where(j => j.SourceModule.ToLower() == sourceModule.ToLower());

            var entries = await query.OrderByDescending(j => j.Date).ThenByDescending(j => j.EntryNumber).Take(150).ToListAsync(ct);
            return Results.Ok(entries);
        });

        group.MapPost("/journal-entries", async (
            CreateJournalEntryRequest req,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;

            // Check if period is locked
            var date = req.Date != default ? req.Date : DateTime.UtcNow;
            var isLocked = await db.Periods.AnyAsync(p =>
                p.TenantId == tenantId &&
                p.Year == date.Year &&
                p.Month == date.Month &&
                p.Status == "Locked", ct);

            if (isLocked)
            {
                return Results.BadRequest(new { message = $"El período fiscal {date.Month:D2}/{date.Year} se encuentra cerrado con candado contable." });
            }

            if (req.Lines == null || req.Lines.Count < 2)
            {
                return Results.BadRequest(new { message = "Un asiento contable requiere al menos 2 líneas (partida doble)." });
            }

            var totalDebit = req.Lines.Sum(l => l.Debit);
            var totalCredit = req.Lines.Sum(l => l.Credit);

            if (Math.Abs(totalDebit - totalCredit) > 0.01m)
            {
                return Results.BadRequest(new { message = $"El asiento está desbalanceado. Debe: {totalDebit:N2} | Haber: {totalCredit:N2} | Dif: {totalDebit - totalCredit:N2}" });
            }

            var maxNumber = await db.JournalEntries.Where(j => j.TenantId == tenantId).MaxAsync(j => (int?)j.EntryNumber, ct) ?? 0;

            var entry = new JournalEntry
            {
                TenantId = tenantId,
                EntryNumber = maxNumber + 1,
                Date = date,
                Concept = req.Concept.Trim(),
                EntryType = req.EntryType ?? "Standard",
                SourceModule = req.SourceModule ?? "Manual",
                SourceDocumentId = req.SourceDocumentId,
                Status = "Posted",
                TotalDebit = totalDebit,
                TotalCredit = totalCredit,
                CreatedBy = req.CreatedBy ?? "Usuario",
                CreatedAtUtc = DateTime.UtcNow
            };

            foreach (var lineReq in req.Lines)
            {
                entry.Lines.Add(new JournalEntryLine
                {
                    JournalEntryId = entry.Id,
                    TenantId = tenantId,
                    AccountId = lineReq.AccountId,
                    AccountCode = lineReq.AccountCode.Trim(),
                    AccountName = lineReq.AccountName.Trim(),
                    Debit = lineReq.Debit,
                    Credit = lineReq.Credit,
                    Currency = lineReq.Currency ?? "ARS",
                    ExchangeRate = lineReq.ExchangeRate > 0 ? lineReq.ExchangeRate : 1,
                    CostCenterId = lineReq.CostCenterId,
                    CostCenterCode = lineReq.CostCenterCode,
                    CostCenterName = lineReq.CostCenterName,
                    Memo = lineReq.Memo
                });
            }

            db.JournalEntries.Add(entry);
            await db.SaveChangesAsync(ct);

            return Results.Created($"/api/v1/accounting/journal-entries/{entry.Id}", entry);
        });

        return group;
    }
}
