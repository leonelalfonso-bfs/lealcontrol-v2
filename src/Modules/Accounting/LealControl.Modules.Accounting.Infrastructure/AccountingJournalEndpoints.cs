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
            HttpContext http,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            static IResult Problem(string message) => Results.BadRequest(new { message });

            if (string.IsNullOrWhiteSpace(req.Concept)) return Problem("Indicá el concepto del asiento.");
            if (req.Lines is null || req.Lines.Count < 2) return Problem("Un asiento contable requiere al menos 2 líneas (partida doble).");
            var entryType = string.IsNullOrWhiteSpace(req.EntryType) ? "Standard" : req.EntryType.Trim();
            if (entryType is not ("Standard" or "Adjustment" or "Opening"))
                return Problem("Un asiento manual es común, de ajuste o de apertura.");

            var date = req.Date != default ? DateTime.SpecifyKind(req.Date, DateTimeKind.Utc) : DateTime.UtcNow;
            if (await db.IsPeriodLockedAsync(tenantId, date, ct))
                return Problem($"El período fiscal {date.Month:D2}/{date.Year} se encuentra cerrado con candado contable.");

            // Las cuentas se toman de la base (no del nombre que manda la pantalla): imputables y activas.
            var accountIds = req.Lines.Select(l => l.AccountId).Where(id => id != Guid.Empty).ToHashSet();
            var accountCodes = req.Lines.Where(l => l.AccountId == Guid.Empty).Select(l => (l.AccountCode ?? "").Trim()).ToHashSet();
            var accounts = await db.Accounts.AsNoTracking()
                .Where(a => a.TenantId == tenantId && (accountIds.Contains(a.Id) || accountCodes.Contains(a.Code)))
                .ToListAsync(ct);
            var costCenterIds = req.Lines.Where(l => l.CostCenterId is not null).Select(l => l.CostCenterId!.Value).ToHashSet();
            var costCenters = await db.CostCenters.AsNoTracking()
                .Where(c => c.TenantId == tenantId && costCenterIds.Contains(c.Id)).ToDictionaryAsync(c => c.Id, ct);

            var lines = new List<JournalEntryLine>();
            foreach (var (l, i) in req.Lines.Select((l, i) => (l, i + 1)))
            {
                var account = l.AccountId != Guid.Empty
                    ? accounts.FirstOrDefault(a => a.Id == l.AccountId)
                    : accounts.FirstOrDefault(a => a.Code == (l.AccountCode ?? "").Trim());
                if (account is null) return Problem($"Línea {i}: la cuenta no existe.");
                if (!account.IsDirectPosting) return Problem($"Línea {i}: la cuenta {account.Code} {account.Name} es de agrupación, no imputable.");
                if (!account.IsActive) return Problem($"Línea {i}: la cuenta {account.Code} {account.Name} está inactiva.");
                if (l.Debit < 0 || l.Credit < 0) return Problem($"Línea {i}: los importes no pueden ser negativos.");
                if ((l.Debit > 0) == (l.Credit > 0)) return Problem($"Línea {i}: cargá el importe en el debe o en el haber (uno solo).");
                if (decimal.Round(l.Debit, 2) != l.Debit || decimal.Round(l.Credit, 2) != l.Credit)
                    return Problem($"Línea {i}: los importes van con hasta dos decimales.");
                CostCenter? costCenter = null;
                if (l.CostCenterId is { } ccId && !costCenters.TryGetValue(ccId, out costCenter))
                    return Problem($"Línea {i}: el centro de costo no existe.");
                // Debe y Haber van en pesos; una línea en otra moneda guarda además el importe original.
                var currency = string.IsNullOrWhiteSpace(l.Currency) ? "ARS" : l.Currency.Trim().ToUpperInvariant();
                var foreign = currency != "ARS";
                if (foreign && l.ExchangeRate <= 1m)
                    return Problem($"Línea {i}: una línea en {currency} necesita la cotización.");
                lines.Add(new JournalEntryLine
                {
                    TenantId = tenantId,
                    AccountId = account.Id,
                    AccountCode = account.Code,
                    AccountName = account.Name,
                    Debit = l.Debit,
                    Credit = l.Credit,
                    Currency = currency,
                    ExchangeRate = foreign ? l.ExchangeRate : 1m,
                    OriginalAmount = foreign ? Math.Round((l.Debit + l.Credit) / l.ExchangeRate, 2, MidpointRounding.AwayFromZero) : null,
                    CostCenterId = costCenter?.Id,
                    CostCenterCode = costCenter?.Code,
                    CostCenterName = costCenter?.Name,
                    Memo = string.IsNullOrWhiteSpace(l.Memo) ? null : l.Memo.Trim()
                });
            }

            var totalDebit = lines.Sum(l => l.Debit);
            var totalCredit = lines.Sum(l => l.Credit);
            if (totalDebit != totalCredit)
                return Problem($"El asiento está desbalanceado. Debe: {totalDebit:N2} | Haber: {totalCredit:N2} | Dif: {totalDebit - totalCredit:N2}");

            var entry = new JournalEntry
            {
                TenantId = tenantId,
                Date = date,
                Concept = req.Concept.Trim(),
                EntryType = entryType,
                SourceModule = "Manual",
                Status = "Posted",
                TotalDebit = totalDebit,
                TotalCredit = totalCredit,
                // El autor es el usuario conectado, no lo que informe la pantalla.
                CreatedBy = http.User.FindFirst("name")?.Value ?? http.User.FindFirst("email")?.Value ?? "Usuario",
                CreatedAtUtc = DateTime.UtcNow
            };
            foreach (var line in lines)
            {
                line.JournalEntryId = entry.Id;
                entry.Lines.Add(line);
            }

            await using var tx = await db.Database.BeginTransactionAsync(ct);
            entry.EntryNumber = await db.LockEntryNumberingAsync(tenantId, ct) + 1;
            db.JournalEntries.Add(entry);
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return Results.Created($"/api/v1/accounting/journal-entries/{entry.Id}", entry);
        });

        return group;
    }
}
