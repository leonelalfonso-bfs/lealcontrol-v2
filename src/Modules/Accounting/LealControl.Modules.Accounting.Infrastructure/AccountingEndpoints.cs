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

        // ====================================================================
        // 1. Chart of Accounts (Plan de Cuentas Editable)
        // ====================================================================
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
                req.ParentCode?.Trim(),
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

            if (!string.IsNullOrWhiteSpace(req.Code) && req.Code.Trim() != account.Code)
            {
                var codeExists = await db.Accounts.AnyAsync(a => a.TenantId == tenantId && a.Code == req.Code.Trim() && a.Id != id, ct);
                if (codeExists)
                {
                    return Results.BadRequest(new { message = $"Ya existe otra cuenta con el código {req.Code}." });
                }
                account.Code = req.Code.Trim();
            }

            account.Name = req.Name.Trim();
            if (!string.IsNullOrWhiteSpace(req.AccountType)) account.AccountType = req.AccountType.Trim();
            if (req.Level > 0) account.Level = req.Level;
            account.ParentCode = req.ParentCode?.Trim();
            account.IsDirectPosting = req.IsDirectPosting;
            if (!string.IsNullOrWhiteSpace(req.Currency)) account.Currency = req.Currency.Trim();
            account.AdjustsForInflation = req.AdjustsForInflation;
            account.IsActive = req.IsActive;

            await db.SaveChangesAsync(ct);
            return Results.Ok(account);
        });

        group.MapDelete("/accounts/{id:guid}", async (
            Guid id,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            var account = await db.Accounts.FirstOrDefaultAsync(a => a.Id == id && a.TenantId == tenantId, ct);
            if (account == null) return Results.NotFound(new { message = "Cuenta no encontrada." });

            // Validate if has recorded journal entry lines
            var hasLines = await db.JournalEntryLines.AnyAsync(l => l.TenantId == tenantId && (l.AccountId == id || l.AccountCode == account.Code), ct);
            if (hasLines)
            {
                return Results.BadRequest(new { message = $"No se puede eliminar la cuenta '{account.Code} - {account.Name}' porque ya posee movimientos en el Libro Diario. Puede desactivarla para que no se use en nuevos asientos." });
            }

            // Validate if has dependent sub-accounts
            var hasChildren = await db.Accounts.AnyAsync(a => a.TenantId == tenantId && a.ParentCode == account.Code, ct);
            if (hasChildren)
            {
                return Results.BadRequest(new { message = $"No se puede eliminar la cuenta '{account.Code}' porque contiene subcuentas dependientes. Elimine o reubique las subcuentas primero." });
            }

            db.Accounts.Remove(account);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { message = "Cuenta eliminada correctamente." });
        });

        // ====================================================================
        // 2. Accounting Mapping (Matriz de Enlace Contable Dinámico)
        // ====================================================================
        group.MapGet("/mapping", async (ITenantContext tenantContext, AccountingDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            await db.SeedDefaultChartOfAccountsAsync(tenantId, ct);
            var mapping = await db.GetOrCreateMappingAsync(tenantId, ct);
            return Results.Ok(mapping);
        });

        group.MapPut("/mapping", async (UpdateMappingRequest req, ITenantContext tenantContext, AccountingDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            var mapping = await db.GetOrCreateMappingAsync(tenantId, ct);

            mapping.SalesRevenueAccountCode = req.SalesRevenueAccountCode.Trim();
            mapping.SalesVatDebitAccountCode = req.SalesVatDebitAccountCode.Trim();
            mapping.AccountsReceivableAccountCode = req.AccountsReceivableAccountCode.Trim();
            mapping.PurchaseExpenseAccountCode = req.PurchaseExpenseAccountCode.Trim();
            mapping.PurchaseVatCreditAccountCode = req.PurchaseVatCreditAccountCode.Trim();
            mapping.AccountsPayableAccountCode = req.AccountsPayableAccountCode.Trim();
            mapping.CashAccountCode = req.CashAccountCode.Trim();
            mapping.BankAccountCode = req.BankAccountCode.Trim();
            mapping.ChecksInHandAccountCode = req.ChecksInHandAccountCode.Trim();
            mapping.PspDigitalAccountCode = req.PspDigitalAccountCode.Trim();
            mapping.BankExpensesAccountCode = req.BankExpensesAccountCode.Trim();
            mapping.BankTaxAccountCode = req.BankTaxAccountCode.Trim();
            mapping.RetainedEarningsAccountCode = req.RetainedEarningsAccountCode.Trim();
            mapping.ExchangeDifferenceGainAccountCode = req.ExchangeDifferenceGainAccountCode.Trim();
            mapping.ExchangeDifferenceLossAccountCode = req.ExchangeDifferenceLossAccountCode.Trim();
            mapping.SalariesExpenseAccountCode = req.SalariesExpenseAccountCode.Trim();
            mapping.SocialSecurityExpenseAccountCode = req.SocialSecurityExpenseAccountCode.Trim();
            mapping.SalariesPayableAccountCode = req.SalariesPayableAccountCode.Trim();
            mapping.SocialSecurityPayableAccountCode = req.SocialSecurityPayableAccountCode.Trim();
            mapping.UpdatedAtUtc = DateTime.UtcNow;

            await db.SaveChangesAsync(ct);
            return Results.Ok(mapping);
        });

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

        // ====================================================================
        // 4. General Ledger (Libro Mayor)
        // ====================================================================
        group.MapGet("/general-ledger", async (
            [FromQuery] string? accountCode,
            [FromQuery] DateTime? startDate,
            [FromQuery] DateTime? endDate,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            var from = startDate ?? DateTime.UtcNow.AddMonths(-1);
            var to = endDate ?? DateTime.UtcNow;

            var accountsQuery = db.Accounts.AsNoTracking().Where(a => a.TenantId == tenantId && a.IsDirectPosting);
            if (!string.IsNullOrWhiteSpace(accountCode))
            {
                accountsQuery = accountsQuery.Where(a => a.Code == accountCode.Trim());
            }
            var accounts = await accountsQuery.OrderBy(a => a.Code).ToListAsync(ct);

            var ledgerReport = new List<object>();

            foreach (var acc in accounts)
            {
                // Balance before 'from'
                var prevLines = await db.JournalEntryLines
                    .AsNoTracking()
                    .Where(l => l.TenantId == tenantId && l.AccountCode == acc.Code)
                    .Join(db.JournalEntries.Where(j => j.Date < from.ToUniversalTime()),
                          line => line.JournalEntryId,
                          entry => entry.Id,
                          (line, entry) => new { line.Debit, line.Credit })
                    .ToListAsync(ct);

                var prevDebit = prevLines.Sum(x => x.Debit);
                var prevCredit = prevLines.Sum(x => x.Credit);
                var initialBalance = (acc.AccountType == "Asset" || acc.AccountType == "Expense")
                    ? prevDebit - prevCredit
                    : prevCredit - prevDebit;

                // Movements in range
                var periodMovements = await db.JournalEntryLines
                    .AsNoTracking()
                    .Where(l => l.TenantId == tenantId && l.AccountCode == acc.Code)
                    .Join(db.JournalEntries.Where(j => j.Date >= from.ToUniversalTime() && j.Date <= to.ToUniversalTime()),
                          line => line.JournalEntryId,
                          entry => entry.Id,
                          (line, entry) => new
                          {
                              entry.EntryNumber,
                              entry.Date,
                              entry.Concept,
                              entry.SourceModule,
                              line.Debit,
                              line.Credit,
                              line.Memo,
                              line.CostCenterName
                          })
                    .OrderBy(x => x.Date)
                    .ThenBy(x => x.EntryNumber)
                    .ToListAsync(ct);

                var runningBalance = initialBalance;
                var movementRows = new List<object>();

                foreach (var m in periodMovements)
                {
                    if (acc.AccountType == "Asset" || acc.AccountType == "Expense")
                        runningBalance += (m.Debit - m.Credit);
                    else
                        runningBalance += (m.Credit - m.Debit);

                    movementRows.Add(new
                    {
                        m.EntryNumber,
                        m.Date,
                        m.Concept,
                        m.SourceModule,
                        m.Debit,
                        m.Credit,
                        RunningBalance = runningBalance,
                        m.Memo,
                        m.CostCenterName
                    });
                }

                ledgerReport.Add(new
                {
                    Account = acc,
                    InitialBalance = initialBalance,
                    TotalDebit = periodMovements.Sum(x => x.Debit),
                    TotalCredit = periodMovements.Sum(x => x.Credit),
                    FinalBalance = runningBalance,
                    Movements = movementRows
                });
            }

            return Results.Ok(ledgerReport);
        });

        // ====================================================================
        // 5. Balance de Sumas y Saldos a 8 Columnas (Trial Balance)
        // ====================================================================
        group.MapGet("/trial-balance", async (
            [FromQuery] DateTime? startDate,
            [FromQuery] DateTime? endDate,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            await db.SeedDefaultChartOfAccountsAsync(tenantId, ct);

            var accounts = await db.Accounts.AsNoTracking().Where(a => a.TenantId == tenantId).OrderBy(a => a.Code).ToListAsync(ct);

            var linesQuery = db.JournalEntryLines.AsNoTracking().Where(l => l.TenantId == tenantId);
            if (startDate.HasValue)
            {
                linesQuery = linesQuery.Join(db.JournalEntries.Where(j => j.Date >= startDate.Value.ToUniversalTime()),
                    l => l.JournalEntryId, j => j.Id, (l, j) => l);
            }
            if (endDate.HasValue)
            {
                linesQuery = linesQuery.Join(db.JournalEntries.Where(j => j.Date <= endDate.Value.ToUniversalTime()),
                    l => l.JournalEntryId, j => j.Id, (l, j) => l);
            }

            var movements = await linesQuery
                .GroupBy(l => l.AccountCode)
                .Select(g => new
                {
                    AccountCode = g.Key,
                    TotalDebit = g.Sum(x => x.Debit),
                    TotalCredit = g.Sum(x => x.Credit)
                })
                .ToListAsync(ct);

            var movDict = movements.ToDictionary(m => m.AccountCode);

            var trialBalanceRows = new List<object>();
            decimal totalDebitSum = 0, totalCreditSum = 0;
            decimal totalDebtorBalance = 0, totalCreditorBalance = 0;
            decimal totalAssetBalance = 0, totalLiabilityEquityBalance = 0;
            decimal totalLossBalance = 0, totalGainBalance = 0;

            foreach (var acc in accounts.Where(a => a.IsDirectPosting))
            {
                movDict.TryGetValue(acc.Code, out var mov);
                var debit = mov?.TotalDebit ?? 0;
                var credit = mov?.TotalCredit ?? 0;

                totalDebitSum += debit;
                totalCreditSum += credit;

                decimal debtorBalance = 0;
                decimal creditorBalance = 0;

                if (debit >= credit)
                {
                    debtorBalance = debit - credit;
                    totalDebtorBalance += debtorBalance;
                }
                else
                {
                    creditorBalance = credit - debit;
                    totalCreditorBalance += creditorBalance;
                }

                decimal assetBalance = 0;
                decimal liabilityEquityBalance = 0;
                decimal lossBalance = 0;
                decimal gainBalance = 0;

                switch (acc.AccountType)
                {
                    case "Asset":
                        assetBalance = debtorBalance - creditorBalance;
                        totalAssetBalance += assetBalance;
                        break;
                    case "Liability":
                    case "Equity":
                        liabilityEquityBalance = creditorBalance - debtorBalance;
                        totalLiabilityEquityBalance += liabilityEquityBalance;
                        break;
                    case "Expense":
                        lossBalance = debtorBalance - creditorBalance;
                        totalLossBalance += lossBalance;
                        break;
                    case "Income":
                        gainBalance = creditorBalance - debtorBalance;
                        totalGainBalance += gainBalance;
                        break;
                }

                trialBalanceRows.Add(new
                {
                    Code = acc.Code,
                    Name = acc.Name,
                    AccountType = acc.AccountType,
                    Debit = debit,
                    Credit = credit,
                    DebtorBalance = debtorBalance,
                    CreditorBalance = creditorBalance,
                    AssetBalance = assetBalance,
                    LiabilityEquityBalance = liabilityEquityBalance,
                    LossBalance = lossBalance,
                    GainBalance = gainBalance
                });
            }

            var netProfitFromIncome = totalGainBalance - totalLossBalance;
            var netProfitFromEquity = totalAssetBalance - totalLiabilityEquityBalance;

            return Results.Ok(new
            {
                Rows = trialBalanceRows,
                Totals = new
                {
                    TotalDebitSum = totalDebitSum,
                    TotalCreditSum = totalCreditSum,
                    TotalDebtorBalance = totalDebtorBalance,
                    TotalCreditorBalance = totalCreditorBalance,
                    TotalAssetBalance = totalAssetBalance,
                    TotalLiabilityEquityBalance = totalLiabilityEquityBalance,
                    TotalLossBalance = totalLossBalance,
                    TotalGainBalance = totalGainBalance,
                    NetProfitFromIncome = netProfitFromIncome,
                    NetProfitFromEquity = netProfitFromEquity,
                    IsBalanced = Math.Abs(totalDebitSum - totalCreditSum) < 0.01m &&
                                 Math.Abs(totalDebtorBalance - totalCreditorBalance) < 0.01m &&
                                 Math.Abs(netProfitFromIncome - netProfitFromEquity) < 0.05m
                }
            });
        });

        // ====================================================================
        // 6. Estado de Resultados (P&L) & Tablero
        // ====================================================================
        group.MapGet("/pnl-statement", async (
            [FromQuery] int? year,
            [FromQuery] int? month,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            var selectedYear = year ?? DateTime.UtcNow.Year;

            var entriesQuery = db.JournalEntries.AsNoTracking().Where(j => j.TenantId == tenantId && j.Date.Year == selectedYear);
            if (month.HasValue && month > 0)
            {
                entriesQuery = entriesQuery.Where(j => j.Date.Month == month.Value);
            }

            var incomeExpenseLines = await db.JournalEntryLines
                .AsNoTracking()
                .Where(l => l.TenantId == tenantId)
                .Join(entriesQuery, l => l.JournalEntryId, j => j.Id, (l, j) => l)
                .Join(db.Accounts.Where(a => a.TenantId == tenantId),
                      l => l.AccountCode,
                      a => a.Code,
                      (l, a) => new { l.AccountCode, l.AccountName, a.AccountType, l.Debit, l.Credit })
                .Where(x => x.AccountType == "Income" || x.AccountType == "Expense")
                .ToListAsync(ct);

            var totalSales = incomeExpenseLines.Where(x => x.AccountType == "Income" && x.AccountCode.StartsWith("4.1")).Sum(x => x.Credit - x.Debit);
            var otherIncome = incomeExpenseLines.Where(x => x.AccountType == "Income" && !x.AccountCode.StartsWith("4.1")).Sum(x => x.Credit - x.Debit);
            var cmv = incomeExpenseLines.Where(x => x.AccountType == "Expense" && x.AccountCode.StartsWith("5.1")).Sum(x => x.Debit - x.Credit);
            var operationalExpenses = incomeExpenseLines.Where(x => x.AccountType == "Expense" && x.AccountCode.StartsWith("5.2")).Sum(x => x.Debit - x.Credit);
            var financialExpenses = incomeExpenseLines.Where(x => x.AccountType == "Expense" && x.AccountCode.StartsWith("5.3")).Sum(x => x.Debit - x.Credit);

            var grossMargin = totalSales - cmv;
            var ebitda = grossMargin - operationalExpenses;
            var netProfit = ebitda + otherIncome - financialExpenses;

            return Results.Ok(new
            {
                Period = new { Year = selectedYear, Month = month },
                TotalSales = totalSales,
                CostOfGoodsSold = cmv,
                GrossMargin = grossMargin,
                GrossMarginPercentage = totalSales > 0 ? (grossMargin / totalSales) * 100 : 0,
                OperationalExpenses = operationalExpenses,
                Ebitda = ebitda,
                EbitdaPercentage = totalSales > 0 ? (ebitda / totalSales) * 100 : 0,
                OtherIncome = otherIncome,
                FinancialExpenses = financialExpenses,
                NetProfit = netProfit,
                NetProfitPercentage = totalSales > 0 ? (netProfit / totalSales) * 100 : 0
            });
        });

        // ====================================================================
        // 7. Auto-Posting Automático Dinámico (Ventas, Compras, Cobranzas)
        // ====================================================================
        group.MapPost("/auto-post/invoice", async (
            AutoPostInvoiceRequest req,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            await db.SeedDefaultChartOfAccountsAsync(tenantId, ct);
            var mapping = await db.GetOrCreateMappingAsync(tenantId, ct);

            var existing = await db.JournalEntries.FirstOrDefaultAsync(e =>
                e.TenantId == tenantId && e.SourceModule == "Sales" && e.SourceDocumentId == req.InvoiceId.ToString(), ct);
            if (existing != null)
            {
                return Results.Ok(new { message = "La factura ya fue contabilizada.", entryId = existing.Id });
            }

            var accounts = await db.Accounts.Where(a => a.TenantId == tenantId).ToListAsync(ct);
            var deudores = accounts.FirstOrDefault(a => a.Code == mapping.AccountsReceivableAccountCode) ?? accounts.First(a => a.AccountType == "Asset");
            var ventas = accounts.FirstOrDefault(a => a.Code == mapping.SalesRevenueAccountCode) ?? accounts.First(a => a.AccountType == "Income");
            var ivaDebito = accounts.FirstOrDefault(a => a.Code == mapping.SalesVatDebitAccountCode) ?? accounts.First(a => a.AccountType == "Liability");

            var maxNumber = await db.JournalEntries.Where(e => e.TenantId == tenantId).MaxAsync(e => (int?)e.EntryNumber, ct) ?? 0;

            var entry = new JournalEntry
            {
                TenantId = tenantId,
                EntryNumber = maxNumber + 1,
                Date = req.Date,
                Concept = $"Venta Factura {req.InvoiceNumber} - {req.CustomerName}",
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
                Memo = $"Crédito cliente {req.CustomerName}"
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
                Memo = $"Ingreso ventas netas {req.InvoiceNumber}"
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
            var mapping = await db.GetOrCreateMappingAsync(tenantId, ct);

            var existing = await db.JournalEntries.FirstOrDefaultAsync(e =>
                e.TenantId == tenantId && e.SourceModule == "Purchases" && e.SourceDocumentId == req.PurchaseId.ToString(), ct);
            if (existing != null)
            {
                return Results.Ok(new { message = "La compra ya fue contabilizada.", entryId = existing.Id });
            }

            var accounts = await db.Accounts.Where(a => a.TenantId == tenantId).ToListAsync(ct);
            var gasto = accounts.FirstOrDefault(a => a.Code == mapping.PurchaseExpenseAccountCode) ?? accounts.First(a => a.AccountType == "Expense");
            var ivaCredito = accounts.FirstOrDefault(a => a.Code == mapping.PurchaseVatCreditAccountCode) ?? accounts.First(a => a.AccountType == "Asset");
            var proveedores = accounts.FirstOrDefault(a => a.Code == mapping.AccountsPayableAccountCode) ?? accounts.First(a => a.AccountType == "Liability");

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
                AccountId = gasto.Id,
                AccountCode = gasto.Code,
                AccountName = gasto.Name,
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
            var mapping = await db.GetOrCreateMappingAsync(tenantId, ct);

            var existing = await db.JournalEntries.FirstOrDefaultAsync(e =>
                e.TenantId == tenantId && e.SourceModule == "Finance" && e.SourceDocumentId == req.ReceiptId.ToString(), ct);
            if (existing != null)
            {
                return Results.Ok(new { message = "El recibo ya fue contabilizado.", entryId = existing.Id });
            }

            var accounts = await db.Accounts.Where(a => a.TenantId == tenantId).ToListAsync(ct);
            var deudores = accounts.FirstOrDefault(a => a.Code == mapping.AccountsReceivableAccountCode) ?? accounts.First(a => a.AccountType == "Asset");
            
            var destCode = req.PaymentMethod?.ToLower() switch
            {
                "transfer" or "banco" or "bank" => mapping.BankAccountCode,
                "check" or "cheque" or "echeq" => mapping.ChecksInHandAccountCode,
                "mercadopago" or "mp" or "psp" => mapping.PspDigitalAccountCode,
                _ => mapping.CashAccountCode
            };

            var destAccount = accounts.FirstOrDefault(a => a.Code == destCode) ?? accounts.First(a => a.AccountType == "Asset");
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

        // ====================================================================
        // 8. Fase 2: Asistente de Cierre Anual & Refundición de Resultados
        // ====================================================================
        group.MapPost("/year-end-closing", async (
            YearEndClosingRequest req,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            await db.SeedDefaultChartOfAccountsAsync(tenantId, ct);
            var mapping = await db.GetOrCreateMappingAsync(tenantId, ct);

            var closingDate = req.ClosingDate != default ? req.ClosingDate : new DateTime(req.Year, 12, 31, 23, 59, 59, DateTimeKind.Utc);

            // Fetch all entries for that year
            var entriesQuery = db.JournalEntries.AsNoTracking().Where(j => j.TenantId == tenantId && j.Date.Year == req.Year && j.Date <= closingDate);

            var lines = await db.JournalEntryLines
                .AsNoTracking()
                .Where(l => l.TenantId == tenantId)
                .Join(entriesQuery, l => l.JournalEntryId, j => j.Id, (l, j) => l)
                .Join(db.Accounts.Where(a => a.TenantId == tenantId),
                      l => l.AccountCode,
                      a => a.Code,
                      (l, a) => new { l.AccountCode, l.AccountName, a.AccountType, a.Id, l.Debit, l.Credit })
                .ToListAsync(ct);

            var accounts = await db.Accounts.Where(a => a.TenantId == tenantId).ToListAsync(ct);
            var retainedEarningsAcc = accounts.FirstOrDefault(a => a.Code == mapping.RetainedEarningsAccountCode) ?? accounts.First(a => a.AccountType == "Equity");

            // 1. Asiento de Refundición de Cuentas de Resultado (Ingresos y Gastos)
            var resultAccountsGrouped = lines
                .Where(x => x.AccountType == "Income" || x.AccountType == "Expense")
                .GroupBy(x => new { x.AccountCode, x.AccountName, x.AccountType, x.Id })
                .Select(g => new
                {
                    g.Key.Id,
                    g.Key.AccountCode,
                    g.Key.AccountName,
                    g.Key.AccountType,
                    TotalDebit = g.Sum(x => x.Debit),
                    TotalCredit = g.Sum(x => x.Credit)
                })
                .ToList();

            var maxNumber = await db.JournalEntries.Where(e => e.TenantId == tenantId).MaxAsync(e => (int?)e.EntryNumber, ct) ?? 0;

            var refundicionEntry = new JournalEntry
            {
                TenantId = tenantId,
                EntryNumber = maxNumber + 1,
                Date = closingDate,
                Concept = $"Asiento de Refundición de Cuentas de Resultado - Ejercicio {req.Year}",
                EntryType = "Closing",
                SourceModule = "Accounting",
                Status = "Posted",
                CreatedBy = "Sistema (Cierre Anual)",
                CreatedAtUtc = DateTime.UtcNow
            };

            decimal netIncome = 0;

            foreach (var item in resultAccountsGrouped)
            {
                if (item.AccountType == "Income")
                {
                    var netGain = item.TotalCredit - item.TotalDebit;
                    if (netGain != 0)
                    {
                        refundicionEntry.Lines.Add(new JournalEntryLine
                        {
                            JournalEntryId = refundicionEntry.Id,
                            TenantId = tenantId,
                            AccountId = item.Id,
                            AccountCode = item.AccountCode,
                            AccountName = item.AccountName,
                            Debit = netGain > 0 ? netGain : 0,
                            Credit = netGain < 0 ? Math.Abs(netGain) : 0,
                            Memo = $"Cancelación por cierre ejercicio {req.Year}"
                        });
                        netIncome += netGain;
                    }
                }
                else if (item.AccountType == "Expense")
                {
                    var netLoss = item.TotalDebit - item.TotalCredit;
                    if (netLoss != 0)
                    {
                        refundicionEntry.Lines.Add(new JournalEntryLine
                        {
                            JournalEntryId = refundicionEntry.Id,
                            TenantId = tenantId,
                            AccountId = item.Id,
                            AccountCode = item.AccountCode,
                            AccountName = item.AccountName,
                            Debit = netLoss < 0 ? Math.Abs(netLoss) : 0,
                            Credit = netLoss > 0 ? netLoss : 0,
                            Memo = $"Cancelación por cierre ejercicio {req.Year}"
                        });
                        netIncome -= netLoss;
                    }
                }
            }

            // Balance entry to Retained Earnings
            if (netIncome != 0)
            {
                refundicionEntry.Lines.Add(new JournalEntryLine
                {
                    JournalEntryId = refundicionEntry.Id,
                    TenantId = tenantId,
                    AccountId = retainedEarningsAcc.Id,
                    AccountCode = retainedEarningsAcc.Code,
                    AccountName = retainedEarningsAcc.Name,
                    Debit = netIncome < 0 ? Math.Abs(netIncome) : 0,
                    Credit = netIncome > 0 ? netIncome : 0,
                    Memo = $"Resultado Neto del Ejercicio {req.Year}"
                });
            }

            refundicionEntry.TotalDebit = refundicionEntry.Lines.Sum(l => l.Debit);
            refundicionEntry.TotalCredit = refundicionEntry.Lines.Sum(l => l.Credit);

            if (refundicionEntry.Lines.Count > 0)
            {
                db.JournalEntries.Add(refundicionEntry);
                await db.SaveChangesAsync(ct);
            }

            return Results.Ok(new
            {
                message = $"Cierre de ejercicio {req.Year} ejecutado con éxito.",
                refundicionEntryId = refundicionEntry.Id,
                entryNumber = refundicionEntry.EntryNumber,
                netIncome = netIncome,
                linesCount = refundicionEntry.Lines.Count
            });
        });

        // ====================================================================
        // 9. Fase 2: Auto-Posting de Devengamiento de Sueldos y F.931
        // ====================================================================
        group.MapPost("/auto-post/payroll", async (
            AutoPostPayrollRequest req,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            await db.SeedDefaultChartOfAccountsAsync(tenantId, ct);
            var mapping = await db.GetOrCreateMappingAsync(tenantId, ct);

            var accounts = await db.Accounts.Where(a => a.TenantId == tenantId).ToListAsync(ct);
            var sueldosGasto = accounts.FirstOrDefault(a => a.Code == mapping.SalariesExpenseAccountCode) ?? accounts.First(a => a.AccountType == "Expense");
            var cargasGasto = accounts.FirstOrDefault(a => a.Code == mapping.SocialSecurityExpenseAccountCode) ?? accounts.First(a => a.AccountType == "Expense");
            var sueldosPagar = accounts.FirstOrDefault(a => a.Code == mapping.SalariesPayableAccountCode) ?? accounts.First(a => a.AccountType == "Liability");
            var cargasPagar = accounts.FirstOrDefault(a => a.Code == mapping.SocialSecurityPayableAccountCode) ?? accounts.First(a => a.AccountType == "Liability");

            var totalDebit = req.TotalGrossSalaries + req.TotalEmployerContributions;
            var totalCredit = req.TotalNetSalaries + req.TotalSocialSecurityToPay;

            var maxNumber = await db.JournalEntries.Where(e => e.TenantId == tenantId).MaxAsync(e => (int?)e.EntryNumber, ct) ?? 0;

            var entry = new JournalEntry
            {
                TenantId = tenantId,
                EntryNumber = maxNumber + 1,
                Date = req.Date != default ? req.Date : DateTime.UtcNow,
                Concept = $"Devengamiento Sueldos y Cargas Sociales - {req.PeriodDescription}",
                EntryType = "Automated",
                SourceModule = "Payroll",
                Status = "Posted",
                TotalDebit = totalDebit,
                TotalCredit = totalCredit,
                CreatedBy = "Sistema (Liquidación Sueldos)",
                CreatedAtUtc = DateTime.UtcNow
            };

            // Debe: Gastos de Personal
            entry.Lines.Add(new JournalEntryLine
            {
                JournalEntryId = entry.Id,
                TenantId = tenantId,
                AccountId = sueldosGasto.Id,
                AccountCode = sueldosGasto.Code,
                AccountName = sueldosGasto.Name,
                Debit = req.TotalGrossSalaries,
                Credit = 0,
                CostCenterId = req.CostCenterId,
                Memo = $"Sueldos brutos {req.PeriodDescription}"
            });

            // Debe: Contribuciones Patronales
            entry.Lines.Add(new JournalEntryLine
            {
                JournalEntryId = entry.Id,
                TenantId = tenantId,
                AccountId = cargasGasto.Id,
                AccountCode = cargasGasto.Code,
                AccountName = cargasGasto.Name,
                Debit = req.TotalEmployerContributions,
                Credit = 0,
                CostCenterId = req.CostCenterId,
                Memo = $"Cargas patronales {req.PeriodDescription}"
            });

            // Haber: Sueldos a Pagar (Netos)
            entry.Lines.Add(new JournalEntryLine
            {
                JournalEntryId = entry.Id,
                TenantId = tenantId,
                AccountId = sueldosPagar.Id,
                AccountCode = sueldosPagar.Code,
                AccountName = sueldosPagar.Name,
                Debit = 0,
                Credit = req.TotalNetSalaries,
                Memo = $"Haberes netos a pagar {req.PeriodDescription}"
            });

            // Haber: Cargas Sociales F.931 a Pagar
            entry.Lines.Add(new JournalEntryLine
            {
                JournalEntryId = entry.Id,
                TenantId = tenantId,
                AccountId = cargasPagar.Id,
                AccountCode = cargasPagar.Code,
                AccountName = cargasPagar.Name,
                Debit = 0,
                Credit = req.TotalSocialSecurityToPay,
                Memo = $"Aportes y contribuciones F.931 {req.PeriodDescription}"
            });

            db.JournalEntries.Add(entry);
            await db.SaveChangesAsync(ct);

            return Results.Created($"/api/v1/accounting/journal-entries/{entry.Id}", new { message = "Asiento de sueldos generado con éxito.", entryId = entry.Id, entryNumber = entry.EntryNumber });
        });

        // ====================================================================
        // 10. Fase 3: Analítica por Centros de Costo (P&L Multidimensional)
        // ====================================================================
        group.MapGet("/reports/cost-center-pnl", async (
            [FromQuery] int? year,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            var selectedYear = year ?? DateTime.UtcNow.Year;

            var entries = db.JournalEntries.AsNoTracking().Where(j => j.TenantId == tenantId && j.Date.Year == selectedYear);

            var lines = await db.JournalEntryLines
                .AsNoTracking()
                .Where(l => l.TenantId == tenantId)
                .Join(entries, l => l.JournalEntryId, j => j.Id, (l, j) => l)
                .Join(db.Accounts.Where(a => a.TenantId == tenantId),
                      l => l.AccountCode,
                      a => a.Code,
                      (l, a) => new { l.AccountCode, a.AccountType, l.CostCenterCode, l.CostCenterName, l.Debit, l.Credit })
                .Where(x => x.AccountType == "Income" || x.AccountType == "Expense")
                .ToListAsync(ct);

            var costCenters = await db.CostCenters.AsNoTracking().Where(c => c.TenantId == tenantId).ToListAsync(ct);

            var breakdown = costCenters.Select(cc =>
            {
                var ccLines = lines.Where(l => l.CostCenterCode == cc.Code).ToList();
                var income = ccLines.Where(l => l.AccountType == "Income").Sum(l => l.Credit - l.Debit);
                var expense = ccLines.Where(l => l.AccountType == "Expense").Sum(l => l.Debit - l.Credit);
                var margin = income - expense;

                return new
                {
                    CostCenterCode = cc.Code,
                    CostCenterName = cc.Name,
                    Category = cc.Category,
                    Income = income,
                    Expense = expense,
                    NetMargin = margin,
                    MarginPercentage = income > 0 ? (margin / income) * 100 : 0
                };
            }).ToList();

            var unassignedLines = lines.Where(l => string.IsNullOrWhiteSpace(l.CostCenterCode)).ToList();
            var unassignedIncome = unassignedLines.Where(l => l.AccountType == "Income").Sum(l => l.Credit - l.Debit);
            var unassignedExpense = unassignedLines.Where(l => l.AccountType == "Expense").Sum(l => l.Debit - l.Credit);

            return Results.Ok(new
            {
                Year = selectedYear,
                CostCenters = breakdown,
                Unassigned = new
                {
                    Income = unassignedIncome,
                    Expense = unassignedExpense,
                    NetMargin = unassignedIncome - unassignedExpense
                }
            });
        });

        // ====================================================================
        // 11. Conciliación Bancaria Inteligente
        // ====================================================================
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

        group.MapPost("/bank-statements/lines/{lineId:guid}/quick-post", async (
            Guid lineId,
            QuickPostBankFeeRequest req,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            var mapping = await db.GetOrCreateMappingAsync(tenantId, ct);

            var line = await db.BankStatementLines.FirstOrDefaultAsync(l => l.Id == lineId && l.TenantId == tenantId, ct);
            if (line == null) return Results.NotFound(new { message = "Línea no encontrada." });

            var accounts = await db.Accounts.Where(a => a.TenantId == tenantId).ToListAsync(ct);
            var banco = accounts.FirstOrDefault(a => a.Code == mapping.BankAccountCode) ?? accounts.First(a => a.AccountType == "Asset");
            
            var gastoAccountCode = req.FeeType switch
            {
                "TaxLey25413" => mapping.BankTaxAccountCode,
                _ => mapping.BankExpensesAccountCode
            };

            var gastoAccount = accounts.FirstOrDefault(a => a.Code == gastoAccountCode) ?? accounts.First(a => a.AccountType == "Expense");
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

        return endpoints;
    }
}

public sealed record CreateAccountRequest(string Code, string Name, string? AccountType, int Level, string? ParentCode, bool IsDirectPosting, string? Currency, bool AdjustsForInflation);
public sealed record UpdateAccountRequest(string? Code, string Name, string? AccountType, int Level, string? ParentCode, bool IsDirectPosting, string? Currency, bool AdjustsForInflation, bool IsActive);
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
