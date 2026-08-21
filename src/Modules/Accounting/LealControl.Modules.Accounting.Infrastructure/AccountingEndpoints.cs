using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Accounting.Infrastructure;

public static class AccountingEndpoints
{
    public static IEndpointRouteBuilder MapAccountingModule(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/accounting").WithTags("Accounting & Finance Professional");

        // 1. Chart of Accounts (Plan de Cuentas)
        group.MapGet("/accounts", async (ITenantContext tenantContext, AccountingDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            await db.SeedDefaultChartOfAccountsAsync(tenantId, ct);

            var accounts = await db.Accounts
                .AsNoTracking()
                .Where(a => a.TenantId == tenantId)
                .OrderBy(a => a.Code)
                .ToListAsync(ct);

            return Results.Ok(accounts);
        });

        group.MapPost("/accounts", async (
            CreateAccountRequest req,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(req.Code) || string.IsNullOrWhiteSpace(req.Name))
            {
                return Results.BadRequest(new { message = "Código y nombre de la cuenta son obligatorios." });
            }

            var tenantId = tenantContext.TenantId;
            var exists = await db.Accounts.AnyAsync(a => a.TenantId == tenantId && a.Code == req.Code.Trim(), ct);
            if (exists)
            {
                return Results.BadRequest(new { message = $"Ya existe una cuenta con el código {req.Code}." });
            }

            var account = new Account(
                Guid.NewGuid(),
                tenantId,
                req.Code.Trim(),
                req.Name.Trim(),
                req.AccountType ?? "Asset",
                req.Level > 0 ? req.Level : 4,
                req.ParentCode,
                req.IsDirectPosting,
                req.Currency ?? "ARS",
                req.AdjustsForInflation);

            db.Accounts.Add(account);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/accounting/accounts/{account.Id}", account);
        });

        group.MapPut("/accounts/{id:guid}", async (
            Guid id,
            UpdateAccountRequest req,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            var account = await db.Accounts.FirstOrDefaultAsync(a => a.Id == id && a.TenantId == tenantId, ct);
            if (account == null) return Results.NotFound(new { message = "Cuenta no encontrada." });

            account.Name = req.Name.Trim();
            account.IsDirectPosting = req.IsDirectPosting;
            account.AdjustsForInflation = req.AdjustsForInflation;
            account.IsActive = req.IsActive;

            await db.SaveChangesAsync(ct);
            return Results.Ok(account);
        });

        // 2. Journal Entries (Libro Diario)
        group.MapGet("/journal-entries", async (
            [FromQuery] DateTime? startDate,
            [FromQuery] DateTime? endDate,
            [FromQuery] string? sourceModule,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            var query = db.JournalEntries
                .AsNoTracking()
                .Include(j => j.Lines)
                .Where(j => j.TenantId == tenantId);

            if (startDate.HasValue) query = query.Where(j => j.Date >= startDate.Value.ToUniversalTime());
            if (endDate.HasValue) query = query.Where(j => j.Date <= endDate.Value.ToUniversalTime());
            if (!string.IsNullOrWhiteSpace(sourceModule)) query = query.Where(j => j.SourceModule.ToLower() == sourceModule.ToLower());

            var entries = await query.OrderByDescending(j => j.Date).ThenByDescending(j => j.EntryNumber).Take(100).ToListAsync(ct);
            return Results.Ok(entries);
        });

        group.MapPost("/journal-entries", async (
            CreateJournalEntryRequest req,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            if (req == null || req.Lines == null || req.Lines.Count < 2)
            {
                return Results.BadRequest(new { message = "Un asiento contable debe tener al menos 2 renglones (partida doble)." });
            }

            var totalDebit = req.Lines.Sum(l => l.Debit);
            var totalCredit = req.Lines.Sum(l => l.Credit);

            if (Math.Abs(totalDebit - totalCredit) > 0.01m)
            {
                return Results.BadRequest(new
                {
                    message = $"El asiento está desbalanceado. Total Debe: ${totalDebit:N2} | Total Haber: ${totalCredit:N2} | Diferencia: ${Math.Abs(totalDebit - totalCredit):N2}"
                });
            }

            var tenantId = tenantContext.TenantId;

            // Check if period is locked
            var date = req.Date != default ? req.Date.ToUniversalTime() : DateTime.UtcNow;
            var isLocked = await db.Periods.AnyAsync(p => p.TenantId == tenantId && p.Year == date.Year && p.Month == date.Month && p.Status == "Locked", ct);
            if (isLocked)
            {
                return Results.BadRequest(new { message = $"El período fiscal {date.Month:D2}/{date.Year} se encuentra bloqueado / cerrado." });
            }

            // Compute next entry number
            var lastEntryNumber = await db.JournalEntries
                .Where(j => j.TenantId == tenantId && j.Date.Year == date.Year)
                .MaxAsync(j => (int?)j.EntryNumber, ct) ?? 0;

            var entry = new JournalEntry
            {
                TenantId = tenantId,
                EntryNumber = lastEntryNumber + 1,
                Date = date,
                Concept = string.IsNullOrWhiteSpace(req.Concept) ? "Asiento Diario" : req.Concept.Trim(),
                EntryType = req.EntryType ?? "Standard",
                SourceModule = req.SourceModule ?? "Manual",
                SourceDocumentId = req.SourceDocumentId,
                Status = "Posted",
                TotalDebit = totalDebit,
                TotalCredit = totalCredit,
                CreatedBy = req.CreatedBy ?? "Usuario ERP",
                CreatedAtUtc = DateTime.UtcNow
            };

            foreach (var lineReq in req.Lines)
            {
                entry.Lines.Add(new JournalEntryLine
                {
                    JournalEntryId = entry.Id,
                    TenantId = tenantId,
                    AccountId = lineReq.AccountId,
                    AccountCode = lineReq.AccountCode,
                    AccountName = lineReq.AccountName,
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

        // 3. General Ledger (Libro Mayor por Cuenta)
        group.MapGet("/ledger", async (
            [FromQuery] string accountCode,
            [FromQuery] DateTime? startDate,
            [FromQuery] DateTime? endDate,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(accountCode))
            {
                return Results.BadRequest(new { message = "El código de cuenta es obligatorio." });
            }

            var tenantId = tenantContext.TenantId;
            var account = await db.Accounts.FirstOrDefaultAsync(a => a.TenantId == tenantId && a.Code == accountCode.Trim(), ct);
            if (account == null) return Results.NotFound(new { message = "Cuenta contable no encontrada." });

            var query = db.JournalEntryLines
                .AsNoTracking()
                .Where(l => l.TenantId == tenantId && l.AccountCode == accountCode.Trim());

            if (startDate.HasValue) query = query.Where(l => db.JournalEntries.Any(j => j.Id == l.JournalEntryId && j.Date >= startDate.Value.ToUniversalTime()));
            if (endDate.HasValue) query = query.Where(l => db.JournalEntries.Any(j => j.Id == l.JournalEntryId && j.Date <= endDate.Value.ToUniversalTime()));

            var lines = await query.ToListAsync(ct);

            var totalDebit = lines.Sum(l => l.Debit);
            var totalCredit = lines.Sum(l => l.Credit);
            var isDebtorNature = account.AccountType == "Asset" || account.AccountType == "Expense";
            var balance = isDebtorNature ? (totalDebit - totalCredit) : (totalCredit - totalDebit);

            return Results.Ok(new
            {
                account,
                totalDebit,
                totalCredit,
                balance,
                nature = isDebtorNature ? "Deudor" : "Acreedor",
                movementsCount = lines.Count,
                lines
            });
        });

        // 4. Trial Balance (Balance de Sumas y Saldos a 8 Columnas)
        group.MapGet("/trial-balance", async (
            [FromQuery] DateTime? startDate,
            [FromQuery] DateTime? endDate,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            await db.SeedDefaultChartOfAccountsAsync(tenantId, ct);

            var accounts = await db.Accounts
                .AsNoTracking()
                .Where(a => a.TenantId == tenantId)
                .OrderBy(a => a.Code)
                .ToListAsync(ct);

            var query = db.JournalEntryLines
                .AsNoTracking()
                .Where(l => l.TenantId == tenantId);

            var movements = await query.ToListAsync(ct);

            var rows = accounts.Select(a =>
            {
                var acctLines = movements.Where(m => m.AccountCode.StartsWith(a.Code)).ToList();
                var sumDebit = acctLines.Sum(l => l.Debit);
                var sumCredit = acctLines.Sum(l => l.Credit);

                var isDebtor = a.AccountType == "Asset" || a.AccountType == "Expense";
                var debitBalance = (sumDebit > sumCredit) ? sumDebit - sumCredit : 0;
                var creditBalance = (sumCredit > sumDebit) ? sumCredit - sumDebit : 0;

                // Patrimoniales
                var assetBalance = a.AccountType == "Asset" ? debitBalance : 0;
                var liabilityEquityBalance = (a.AccountType == "Liability" || a.AccountType == "Equity") ? creditBalance : 0;

                // De Resultados
                var lossBalance = a.AccountType == "Expense" ? debitBalance : 0;
                var gainBalance = a.AccountType == "Income" ? creditBalance : 0;

                return new
                {
                    a.Code,
                    a.Name,
                    a.AccountType,
                    a.Level,
                    a.IsDirectPosting,
                    SumDebit = sumDebit,
                    SumCredit = sumCredit,
                    DebitBalance = debitBalance,
                    CreditBalance = creditBalance,
                    AssetBalance = assetBalance,
                    LiabilityEquityBalance = liabilityEquityBalance,
                    LossBalance = lossBalance,
                    GainBalance = gainBalance
                };
            }).ToList();

            var totalSumDebit = rows.Where(r => r.Level == 1).Sum(r => r.SumDebit);
            var totalSumCredit = rows.Where(r => r.Level == 1).Sum(r => r.SumCredit);

            return Results.Ok(new
            {
                totalSumDebit,
                totalSumCredit,
                isBalanced = Math.Abs(totalSumDebit - totalSumCredit) < 0.01m,
                rows
            });
        });

        // 5. Income Statement (Estado de Resultados / P&L Dinámico)
        group.MapGet("/income-statement", async (
            [FromQuery] DateTime? startDate,
            [FromQuery] DateTime? endDate,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            var lines = await db.JournalEntryLines
                .AsNoTracking()
                .Where(l => l.TenantId == tenantId)
                .ToListAsync(ct);

            var revenues = lines.Where(l => l.AccountCode.StartsWith("4.")).Sum(l => l.Credit - l.Debit);
            var cogs = lines.Where(l => l.AccountCode.StartsWith("5.1")).Sum(l => l.Debit - l.Credit);
            var grossMargin = revenues - cogs;

            var opex = lines.Where(l => l.AccountCode.StartsWith("5.2")).Sum(l => l.Debit - l.Credit);
            var ebitda = grossMargin - opex;

            var financialExpenses = lines.Where(l => l.AccountCode.StartsWith("5.3")).Sum(l => l.Debit - l.Credit);
            var netIncome = ebitda - financialExpenses;

            return Results.Ok(new
            {
                revenues,
                cogs,
                grossMargin,
                grossMarginPct = revenues > 0 ? Math.Round((grossMargin / revenues) * 100, 1) : 0,
                opex,
                ebitda,
                ebitdaPct = revenues > 0 ? Math.Round((ebitda / revenues) * 100, 1) : 0,
                financialExpenses,
                netIncome,
                netIncomePct = revenues > 0 ? Math.Round((netIncome / revenues) * 100, 1) : 0
            });
        });

        // 6. Cost Centers
        group.MapGet("/cost-centers", async (ITenantContext tenantContext, AccountingDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            var list = await db.CostCenters.AsNoTracking().Where(c => c.TenantId == tenantId).OrderBy(c => c.Code).ToListAsync(ct);
            return Results.Ok(list);
        });

        group.MapPost("/cost-centers", async (
            CreateCostCenterRequest req,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(req.Code) || string.IsNullOrWhiteSpace(req.Name))
            {
                return Results.BadRequest(new { message = "Código y nombre del centro de costo son obligatorios." });
            }

            var tenantId = tenantContext.TenantId;
            var cc = new CostCenter
            {
                TenantId = tenantId,
                Code = req.Code.Trim().ToUpperInvariant(),
                Name = req.Name.Trim(),
                Category = req.Category ?? "Administration",
                IsActive = true,
                CreatedAtUtc = DateTime.UtcNow
            };

            db.CostCenters.Add(cc);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/accounting/cost-centers/{cc.Id}", cc);
        });

        // 7. Fiscal Periods & Period Lock (Candado Fiscal)
        group.MapGet("/periods", async (ITenantContext tenantContext, AccountingDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            var list = await db.Periods.AsNoTracking().Where(p => p.TenantId == tenantId).OrderByDescending(p => p.Year).ThenByDescending(p => p.Month).ToListAsync(ct);
            return Results.Ok(list);
        });

        group.MapPost("/periods/lock", async (
            LockPeriodRequest req,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
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
                    LockedBy = req.Lock ? req.User : null
                };
                db.Periods.Add(period);
            }
            else
            {
                period.Status = req.Lock ? "Locked" : "Open";
                period.LockedAtUtc = req.Lock ? DateTime.UtcNow : null;
                period.LockedBy = req.Lock ? req.User : null;
            }

            await db.SaveChangesAsync(ct);
            return Results.Ok(period);
        });

        // 8. Libro IVA Digital (Exportación Oficial ARCA TXT)
        group.MapGet("/reports/iva-digital-sales", (
            [FromQuery] int year,
            [FromQuery] int month) =>
        {
            var filename = $"LIBRO_IVA_DIGITAL_VENTAS_CBTE_{year}{month:D2}.txt";
            var content = new StringBuilder();
            content.AppendLine($"{year}{month:D2}01|001|00004|00001234|30715489629|LEAL CONTROL ERP S.A.|12100.00|0.00|10000.00|2100.00|0.00|0.00|PES|1.000000|1");

            var bytes = Encoding.UTF8.GetBytes(content.ToString());
            return Results.File(bytes, "text/plain", filename);
        });

        group.MapGet("/reports/iva-digital-purchases", (
            [FromQuery] int year,
            [FromQuery] int month) =>
        {
            var filename = $"LIBRO_IVA_DIGITAL_COMPRAS_CBTE_{year}{month:D2}.txt";
            var content = new StringBuilder();
            content.AppendLine($"{year}{month:D2}01|001|00001|00054321|30689123458|YPF DIRECTO S.A.|24200.00|0.00|20000.00|4200.00|0.00|0.00|PES|1.000000|1");

            var bytes = Encoding.UTF8.GetBytes(content.ToString());
            return Results.File(bytes, "text/plain", filename);
        });

        // 9. Auto-Posting Engine (Motor de Asientos Automáticos)
        group.MapPost("/auto-post/invoice", async (
            AutoPostInvoiceRequest req,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            await db.SeedDefaultChartOfAccountsAsync(tenantId, ct);

            var existing = await db.JournalEntries.FirstOrDefaultAsync(e =>
                e.TenantId == tenantId && e.SourceModule == "Sales" && e.SourceDocumentId == req.InvoiceId.ToString(), ct);
            if (existing != null)
            {
                return Results.Ok(new { message = "El comprobante ya fue contabilizado previamente.", entryId = existing.Id });
            }

            var accounts = await db.Accounts.Where(a => a.TenantId == tenantId).ToListAsync(ct);
            var deudores = accounts.FirstOrDefault(a => a.Code == "1.1.02.001") ?? accounts.First(a => a.AccountType == "Asset");
            var ventas = accounts.FirstOrDefault(a => a.Code == "4.1.01") ?? accounts.First(a => a.AccountType == "Income");
            var ivaDebito = accounts.FirstOrDefault(a => a.Code == "2.1.02.001") ?? accounts.First(a => a.AccountType == "Liability");

            var maxNumber = await db.JournalEntries.Where(e => e.TenantId == tenantId).MaxAsync(e => (int?)e.EntryNumber, ct) ?? 0;

            var entry = new JournalEntry
            {
                TenantId = tenantId,
                EntryNumber = maxNumber + 1,
                Date = req.Date,
                Concept = $"Factura de Venta {req.InvoiceNumber} - {req.CustomerName}",
                EntryType = "Automated",
                SourceModule = "Sales",
                SourceDocumentId = req.InvoiceId.ToString(),
                Status = "Posted",
                TotalDebit = req.TotalAmount,
                TotalCredit = req.TotalAmount,
                CreatedBy = "Sistema (Auto-Posting)",
                CreatedAtUtc = DateTime.UtcNow
            };

            entry.Lines.Add(new JournalEntryLine
            {
                JournalEntryId = entry.Id,
                TenantId = tenantId,
                AccountId = deudores.Id,
                AccountCode = deudores.Code,
                AccountName = deudores.Name,
                Debit = req.TotalAmount,
                Credit = 0,
                Memo = $"Cobro/Crédito cta cte {req.CustomerName}"
            });

            entry.Lines.Add(new JournalEntryLine
            {
                JournalEntryId = entry.Id,
                TenantId = tenantId,
                AccountId = ventas.Id,
                AccountCode = ventas.Code,
                AccountName = ventas.Name,
                Debit = 0,
                Credit = req.NetAmount,
                Memo = $"Ingreso por ventas netas {req.InvoiceNumber}"
            });

            if (req.VatAmount > 0)
            {
                entry.Lines.Add(new JournalEntryLine
                {
                    JournalEntryId = entry.Id,
                    TenantId = tenantId,
                    AccountId = ivaDebito.Id,
                    AccountCode = ivaDebito.Code,
                    AccountName = ivaDebito.Name,
                    Debit = 0,
                    Credit = req.VatAmount,
                    Memo = $"IVA Débito Fiscal s/{req.InvoiceNumber}"
                });
            }

            db.JournalEntries.Add(entry);
            await db.SaveChangesAsync(ct);

            return Results.Created($"/api/v1/accounting/journal-entries/{entry.Id}", new { message = "Asiento automático generado con éxito.", entryId = entry.Id, entryNumber = entry.EntryNumber });
        });

        group.MapPost("/auto-post/purchase", async (
            AutoPostPurchaseRequest req,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            await db.SeedDefaultChartOfAccountsAsync(tenantId, ct);

            var existing = await db.JournalEntries.FirstOrDefaultAsync(e =>
                e.TenantId == tenantId && e.SourceModule == "Purchases" && e.SourceDocumentId == req.PurchaseId.ToString(), ct);
            if (existing != null)
            {
                return Results.Ok(new { message = "La compra ya fue contabilizada.", entryId = existing.Id });
            }

            var accounts = await db.Accounts.Where(a => a.TenantId == tenantId).ToListAsync(ct);
            var costoMercaderia = accounts.FirstOrDefault(a => a.Code == "5.1.01") ?? accounts.First(a => a.AccountType == "Expense");
            var ivaCredito = accounts.FirstOrDefault(a => a.Code == "1.1.05.001") ?? accounts.First(a => a.AccountType == "Asset");
            var proveedores = accounts.FirstOrDefault(a => a.Code == "2.1.01.001") ?? accounts.First(a => a.AccountType == "Liability");

            var maxNumber = await db.JournalEntries.Where(e => e.TenantId == tenantId).MaxAsync(e => (int?)e.EntryNumber, ct) ?? 0;

            var entry = new JournalEntry
            {
                TenantId = tenantId,
                EntryNumber = maxNumber + 1,
                Date = req.Date,
                Concept = $"Factura Compra {req.InvoiceNumber} - {req.SupplierName}",
                EntryType = "Automated",
                SourceModule = "Purchases",
                SourceDocumentId = req.PurchaseId.ToString(),
                Status = "Posted",
                TotalDebit = req.TotalAmount,
                TotalCredit = req.TotalAmount,
                CreatedBy = "Sistema (Auto-Posting)",
                CreatedAtUtc = DateTime.UtcNow
            };

            entry.Lines.Add(new JournalEntryLine
            {
                JournalEntryId = entry.Id,
                TenantId = tenantId,
                AccountId = costoMercaderia.Id,
                AccountCode = costoMercaderia.Code,
                AccountName = costoMercaderia.Name,
                Debit = req.NetAmount,
                Credit = 0,
                Memo = $"Compra mercaderías {req.SupplierName}"
            });

            if (req.VatAmount > 0)
            {
                entry.Lines.Add(new JournalEntryLine
                {
                    JournalEntryId = entry.Id,
                    TenantId = tenantId,
                    AccountId = ivaCredito.Id,
                    AccountCode = ivaCredito.Code,
                    AccountName = ivaCredito.Name,
                    Debit = req.VatAmount,
                    Credit = 0,
                    Memo = $"IVA Crédito Fiscal s/{req.InvoiceNumber}"
                });
            }

            entry.Lines.Add(new JournalEntryLine
            {
                JournalEntryId = entry.Id,
                TenantId = tenantId,
                AccountId = proveedores.Id,
                AccountCode = proveedores.Code,
                AccountName = proveedores.Name,
                Debit = 0,
                Credit = req.TotalAmount,
                Memo = $"Deuda comercial {req.SupplierName}"
            });

            db.JournalEntries.Add(entry);
            await db.SaveChangesAsync(ct);

            return Results.Created($"/api/v1/accounting/journal-entries/{entry.Id}", new { message = "Asiento de compra generado.", entryId = entry.Id, entryNumber = entry.EntryNumber });
        });

        group.MapPost("/auto-post/receipt", async (
            AutoPostReceiptRequest req,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            await db.SeedDefaultChartOfAccountsAsync(tenantId, ct);

            var existing = await db.JournalEntries.FirstOrDefaultAsync(e =>
                e.TenantId == tenantId && e.SourceModule == "Finance" && e.SourceDocumentId == req.ReceiptId.ToString(), ct);
            if (existing != null)
            {
                return Results.Ok(new { message = "El recibo ya fue contabilizado.", entryId = existing.Id });
            }

            var accounts = await db.Accounts.Where(a => a.TenantId == tenantId).ToListAsync(ct);
            var deudores = accounts.FirstOrDefault(a => a.Code == "1.1.02.001") ?? accounts.First(a => a.AccountType == "Asset");
            
            var destAccount = req.PaymentMethod?.ToLower() switch
            {
                "transfer" or "banco" or "bank" => accounts.FirstOrDefault(a => a.Code == "1.1.01.002") ?? accounts.First(a => a.AccountType == "Asset"),
                "check" or "cheque" or "echeq" => accounts.FirstOrDefault(a => a.Code == "1.1.01.004") ?? accounts.First(a => a.AccountType == "Asset"),
                "mercadopago" or "mp" or "psp" => accounts.FirstOrDefault(a => a.Code == "1.1.01.006") ?? accounts.First(a => a.AccountType == "Asset"),
                _ => accounts.FirstOrDefault(a => a.Code == "1.1.01.001") ?? accounts.First(a => a.AccountType == "Asset")
            };

            var maxNumber = await db.JournalEntries.Where(e => e.TenantId == tenantId).MaxAsync(e => (int?)e.EntryNumber, ct) ?? 0;

            var entry = new JournalEntry
            {
                TenantId = tenantId,
                EntryNumber = maxNumber + 1,
                Date = req.Date,
                Concept = $"Cobranza Recibo {req.ReceiptNumber} - {req.CustomerName}",
                EntryType = "Automated",
                SourceModule = "Finance",
                SourceDocumentId = req.ReceiptId.ToString(),
                Status = "Posted",
                TotalDebit = req.Amount,
                TotalCredit = req.Amount,
                CreatedBy = "Sistema (Auto-Posting)",
                CreatedAtUtc = DateTime.UtcNow
            };

            entry.Lines.Add(new JournalEntryLine
            {
                JournalEntryId = entry.Id,
                TenantId = tenantId,
                AccountId = destAccount.Id,
                AccountCode = destAccount.Code,
                AccountName = destAccount.Name,
                Debit = req.Amount,
                Credit = 0,
                Memo = $"Cobranza {req.PaymentMethod ?? "Efectivo"} s/recibo {req.ReceiptNumber}"
            });

            entry.Lines.Add(new JournalEntryLine
            {
                JournalEntryId = entry.Id,
                TenantId = tenantId,
                AccountId = deudores.Id,
                AccountCode = deudores.Code,
                AccountName = deudores.Name,
                Debit = 0,
                Credit = req.Amount,
                Memo = $"Cancelación saldo cliente {req.CustomerName}"
            });

            db.JournalEntries.Add(entry);
            await db.SaveChangesAsync(ct);

            return Results.Created($"/api/v1/accounting/journal-entries/{entry.Id}", new { message = "Asiento de cobranza generado.", entryId = entry.Id, entryNumber = entry.EntryNumber });
        });

        // 10. Bank Reconciliation (Conciliación Bancaria Inteligente)
        group.MapGet("/bank-statements", async (ITenantContext tenantContext, AccountingDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            var statements = await db.BankStatements
                .AsNoTracking()
                .Where(s => s.TenantId == tenantId)
                .OrderByDescending(s => s.PeriodEndDate)
                .ToListAsync(ct);
            return Results.Ok(statements);
        });

        group.MapGet("/bank-statements/{id:guid}", async (Guid id, ITenantContext tenantContext, AccountingDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            var statement = await db.BankStatements
                .AsNoTracking()
                .Include(s => s.Lines)
                .FirstOrDefaultAsync(s => s.Id == id && s.TenantId == tenantId, ct);
            if (statement == null) return Results.NotFound(new { message = "Extracto bancario no encontrado." });
            return Results.Ok(statement);
        });

        group.MapPost("/bank-statements/upload", async (UploadBankStatementRequest req, ITenantContext tenantContext, AccountingDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            if (req.Lines == null || req.Lines.Count == 0)
            {
                return Results.BadRequest(new { message = "El extracto no contiene movimientos válidos." });
            }

            var statement = new BankStatement
            {
                TenantId = tenantId,
                BankName = req.BankName ?? "Banco Galicia",
                AccountNumber = req.AccountNumber ?? "",
                Currency = req.Currency ?? "ARS",
                PeriodStartDate = req.PeriodStartDate != default ? req.PeriodStartDate : req.Lines.Min(l => l.TransactionDate),
                PeriodEndDate = req.PeriodEndDate != default ? req.PeriodEndDate : req.Lines.Max(l => l.TransactionDate),
                InitialBalance = req.InitialBalance,
                FinalBalance = req.FinalBalance,
                TotalLines = req.Lines.Count,
                ReconciledLines = 0,
                Status = "Open",
                CreatedAtUtc = DateTime.UtcNow
            };

            foreach (var lineReq in req.Lines)
            {
                statement.Lines.Add(new BankStatementLine
                {
                    BankStatementId = statement.Id,
                    TenantId = tenantId,
                    TransactionDate = lineReq.TransactionDate,
                    Description = lineReq.Description.Trim(),
                    ReferenceNumber = lineReq.ReferenceNumber?.Trim(),
                    Debit = lineReq.Debit,
                    Credit = lineReq.Credit,
                    Balance = lineReq.Balance,
                    IsReconciled = false
                });
            }

            db.BankStatements.Add(statement);
            await db.SaveChangesAsync(ct);

            return Results.Created($"/api/v1/accounting/bank-statements/{statement.Id}", statement);
        });

        group.MapPost("/bank-statements/{id:guid}/auto-match", async (Guid id, ITenantContext tenantContext, AccountingDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            var statement = await db.BankStatements
                .Include(s => s.Lines)
                .FirstOrDefaultAsync(s => s.Id == id && s.TenantId == tenantId, ct);
            if (statement == null) return Results.NotFound(new { message = "Extracto no encontrado." });

            var bankAccountCodes = new[] { "1.1.01.002", "1.1.01.003", "1.1.01.004", "1.1.01.005", "1.1.01.006" };
            var journalLines = await db.JournalEntryLines
                .Where(j => j.TenantId == tenantId && bankAccountCodes.Contains(j.AccountCode))
                .ToListAsync(ct);

            int matchedCount = 0;
            foreach (var line in statement.Lines.Where(l => !l.IsReconciled))
            {
                var targetDebitInERP = line.Credit;
                var targetCreditInERP = line.Debit;

                var candidate = journalLines.FirstOrDefault(j =>
                    ((targetDebitInERP > 0 && j.Debit == targetDebitInERP) || (targetCreditInERP > 0 && j.Credit == targetCreditInERP)));

                if (candidate != null)
                {
                    line.IsReconciled = true;
                    line.MatchedJournalEntryId = candidate.JournalEntryId;
                    line.MatchedJournalEntryLineId = candidate.Id;
                    line.MatchType = "SmartMatch";
                    line.MatchNotes = $"Conciliado con {candidate.AccountName} ({candidate.Memo})";
                    matchedCount++;
                }
            }

            statement.ReconciledLines = statement.Lines.Count(l => l.IsReconciled);
            statement.Status = statement.ReconciledLines == statement.TotalLines && statement.TotalLines > 0 ? "Reconciled" : (statement.ReconciledLines > 0 ? "InProgress" : "Open");

            await db.SaveChangesAsync(ct);
            return Results.Ok(new { message = $"Se conciliaron automáticamente {matchedCount} movimientos.", totalReconciled = statement.ReconciledLines, statementStatus = statement.Status });
        });

        group.MapPost("/bank-statements/lines/{lineId:guid}/quick-post", async (
            Guid lineId,
            QuickPostBankFeeRequest req,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            var line = await db.BankStatementLines.FirstOrDefaultAsync(l => l.Id == lineId && l.TenantId == tenantId, ct);
            if (line == null) return Results.NotFound(new { message = "Línea no encontrada." });

            var accounts = await db.Accounts.Where(a => a.TenantId == tenantId).ToListAsync(ct);
            var banco = accounts.FirstOrDefault(a => a.Code == "1.1.01.002") ?? accounts.First(a => a.AccountType == "Asset");
            
            var gastoAccount = req.FeeType switch
            {
                "TaxLey25413" => accounts.FirstOrDefault(a => a.Code == "5.3.02") ?? accounts.First(a => a.AccountType == "Expense"),
                _ => accounts.FirstOrDefault(a => a.Code == "5.3.01") ?? accounts.First(a => a.AccountType == "Expense")
            };

            var maxNumber = await db.JournalEntries.Where(e => e.TenantId == tenantId).MaxAsync(e => (int?)e.EntryNumber, ct) ?? 0;
            var amount = line.Debit > 0 ? line.Debit : line.Credit;

            var entry = new JournalEntry
            {
                TenantId = tenantId,
                EntryNumber = maxNumber + 1,
                Date = line.TransactionDate,
                Concept = $"Gasto Bancario Extracto: {line.Description}",
                EntryType = "Automated",
                SourceModule = "Finance",
                SourceDocumentId = line.Id.ToString(),
                Status = "Posted",
                TotalDebit = amount,
                TotalCredit = amount,
                CreatedBy = "Sistema (Conciliación)",
                CreatedAtUtc = DateTime.UtcNow
            };

            entry.Lines.Add(new JournalEntryLine
            {
                JournalEntryId = entry.Id,
                TenantId = tenantId,
                AccountId = gastoAccount.Id,
                AccountCode = gastoAccount.Code,
                AccountName = gastoAccount.Name,
                Debit = amount,
                Credit = 0,
                Memo = line.Description
            });

            entry.Lines.Add(new JournalEntryLine
            {
                JournalEntryId = entry.Id,
                TenantId = tenantId,
                AccountId = banco.Id,
                AccountCode = banco.Code,
                AccountName = banco.Name,
                Debit = 0,
                Credit = amount,
                Memo = $"Débito bancario {line.Description}"
            });

            db.JournalEntries.Add(entry);
            line.IsReconciled = true;
            line.MatchedJournalEntryId = entry.Id;
            line.MatchType = "AutoPosted";
            line.MatchNotes = $"Asiento automático Nº {entry.EntryNumber}";

            var stmt = await db.BankStatements.FirstOrDefaultAsync(s => s.Id == line.BankStatementId, ct);
            if (stmt != null)
            {
                stmt.ReconciledLines = await db.BankStatementLines.CountAsync(l => l.BankStatementId == stmt.Id && l.IsReconciled, ct) + 1;
            }

            await db.SaveChangesAsync(ct);
            return Results.Ok(new { message = "Gasto registrado y conciliado con éxito.", entryId = entry.Id });
        });

        return endpoints;
    }
}

public sealed record CreateAccountRequest(string Code, string Name, string? AccountType, int Level, string? ParentCode, bool IsDirectPosting, string? Currency, bool AdjustsForInflation);
public sealed record UpdateAccountRequest(string Name, bool IsDirectPosting, bool AdjustsForInflation, bool IsActive);
public sealed record CreateJournalEntryRequest(DateTime Date, string Concept, string? EntryType, string? SourceModule, string? SourceDocumentId, string? CreatedBy, List<JournalEntryLineRequest> Lines);
public sealed record JournalEntryLineRequest(Guid AccountId, string AccountCode, string AccountName, decimal Debit, decimal Credit, string? Currency, decimal ExchangeRate, Guid? CostCenterId, string? CostCenterCode, string? CostCenterName, string? Memo);
public sealed record CreateCostCenterRequest(string Code, string Name, string? Category);
public sealed record LockPeriodRequest(int Year, int Month, bool Lock, string? User);
public sealed record AutoPostInvoiceRequest(Guid InvoiceId, string InvoiceNumber, string CustomerName, DateTime Date, decimal NetAmount, decimal VatAmount, decimal TotalAmount);
public sealed record AutoPostPurchaseRequest(Guid PurchaseId, string InvoiceNumber, string SupplierName, DateTime Date, decimal NetAmount, decimal VatAmount, decimal TotalAmount);
public sealed record AutoPostReceiptRequest(Guid ReceiptId, string ReceiptNumber, string CustomerName, DateTime Date, decimal Amount, string? PaymentMethod);
public sealed record UploadBankStatementRequest(string? BankName, string? AccountNumber, string? Currency, DateTime PeriodStartDate, DateTime PeriodEndDate, decimal InitialBalance, decimal FinalBalance, List<UploadBankStatementLineRequest> Lines);
public sealed record UploadBankStatementLineRequest(DateTime TransactionDate, string Description, string? ReferenceNumber, decimal Debit, decimal Credit, decimal Balance);
public sealed record QuickPostBankFeeRequest(string FeeType);
