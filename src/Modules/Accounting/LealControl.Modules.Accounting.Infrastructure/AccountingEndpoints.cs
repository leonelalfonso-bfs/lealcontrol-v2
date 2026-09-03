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

public static class AccountingEndpoints
{
    public static IEndpointRouteBuilder MapAccountingModule(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/accounting").WithTags("Accounting & Finance Professional").RequirePolicyOnWrites("RequireAccounting");

        // ====================================================================
        // 1. Chart of Accounts (Plan de Cuentas Editable)
        // ====================================================================
        group.MapGet("/accounts", async (ITenantContext tenantContext, AccountingDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            await db.EnsureAccountingTablesAsync(ct);
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
            await db.EnsureAccountingTablesAsync(ct);
            await db.SeedDefaultChartOfAccountsAsync(tenantId, ct);
            var mapping = await db.GetOrCreateMappingAsync(tenantId, ct);
            return Results.Ok(mapping);
        });

        group.MapPut("/mapping", async (UpdateMappingRequest req, ITenantContext tenantContext, AccountingDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            await db.EnsureAccountingTablesAsync(ct);
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

        group.MapGet("/settings", async (ITenantContext tenantContext, AccountingDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            await db.EnsureAccountingTablesAsync(ct);
            var settings = await db.GetOrCreateTenantSettingsAsync(tenantId, ct);
            return Results.Ok(new { settings.AutoPostOnConfirm });
        });

        group.MapGet("/finance-account-mappings", async (ITenantContext tenantContext, AccountingDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            await db.EnsureAccountingTablesAsync(ct);
            var rows = await db.FinanceAccountMappings.AsNoTracking()
                .Where(x => x.TenantId == tenantId)
                .OrderBy(x => x.LedgerAccountCode)
                .Select(x => new { x.FinancialAccountId, x.LedgerAccountCode, x.UpdatedAtUtc })
                .ToListAsync(ct);
            return Results.Ok(rows);
        });

        group.MapPut("/finance-account-mappings", async (
            List<FinanceAccountMappingItemRequest> req,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            await db.EnsureAccountingTablesAsync(ct);
            var existing = await db.FinanceAccountMappings.Where(x => x.TenantId == tenantId).ToListAsync(ct);
            db.FinanceAccountMappings.RemoveRange(existing);

            foreach (var item in req ?? [])
            {
                if (item.FinancialAccountId == Guid.Empty || string.IsNullOrWhiteSpace(item.LedgerAccountCode))
                    continue;
                db.FinanceAccountMappings.Add(new AccountingFinanceAccountMapping
                {
                    TenantId = tenantId,
                    FinancialAccountId = item.FinancialAccountId,
                    LedgerAccountCode = item.LedgerAccountCode.Trim(),
                    UpdatedAtUtc = DateTime.UtcNow
                });
            }

            await db.SaveChangesAsync(ct);
            var rows = await db.FinanceAccountMappings.AsNoTracking()
                .Where(x => x.TenantId == tenantId)
                .Select(x => new { x.FinancialAccountId, x.LedgerAccountCode, x.UpdatedAtUtc })
                .ToListAsync(ct);
            return Results.Ok(rows);
        });

        group.MapPut("/settings", async (
            UpdateAccountingSettingsRequest req,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            await db.EnsureAccountingTablesAsync(ct);
            var settings = await db.GetOrCreateTenantSettingsAsync(tenantId, ct);
            settings.AutoPostOnConfirm = req.AutoPostOnConfirm;
            settings.UpdatedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { settings.AutoPostOnConfirm });
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
            await db.EnsureAccountingTablesAsync(ct);
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
            await db.EnsureAccountingTablesAsync(ct);
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
            await db.EnsureAccountingTablesAsync(ct);
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
        // 7. Auto-Posting de compatibilidad (pasa por gateway + plantillas)
        // ====================================================================
        group.MapPost("/auto-post/invoice", async (
            AutoPostInvoiceRequest req,
            ITenantContext tenantContext,
            AccountingDbContext db,
            IAccountingPostingGateway gateway,
            CancellationToken ct) =>
        {
            var isCreditNote = req.InvoiceNumber.Contains("NC", StringComparison.OrdinalIgnoreCase)
                               || req.InvoiceNumber.StartsWith("NC", StringComparison.OrdinalIgnoreCase);
            var docType = isCreditNote ? AccountingDocumentTypes.CreditNoteA : AccountingDocumentTypes.InvoiceA;
            var amounts = AutoPostViaGateway.InvoiceAmounts(req.NetAmount, req.VatAmount, req.TotalAmount);
            var tags = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                ["PaymentMethod"] = "Account"
            };
            var doc = new PostableDocument(
                AccountingSourceModules.Sales,
                docType,
                req.InvoiceId.ToString(),
                req.InvoiceNumber,
                req.Date,
                "ARS",
                1m,
                "Customer",
                null,
                req.CustomerName,
                null,
                amounts,
                tags);
            return await AutoPostViaGateway.EnqueueAndReportAsync(gateway, db, tenantContext.TenantId, doc, ct);
        }).WithDescription("Obsoleto: usar IAccountingPostingGateway. Queda por compatibilidad.");

        group.MapPost("/auto-post/purchase", async (
            AutoPostPurchaseRequest req,
            ITenantContext tenantContext,
            AccountingDbContext db,
            IAccountingPostingGateway gateway,
            CancellationToken ct) =>
        {
            var isCreditNote = req.InvoiceNumber.Contains("NC", StringComparison.OrdinalIgnoreCase)
                               || req.InvoiceNumber.StartsWith("NC", StringComparison.OrdinalIgnoreCase);
            var docType = isCreditNote ? AccountingDocumentTypes.CreditNoteA : AccountingDocumentTypes.InvoiceA;
            var amounts = AutoPostViaGateway.InvoiceAmounts(req.NetAmount, req.VatAmount, req.TotalAmount);
            var tags = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            var doc = new PostableDocument(
                AccountingSourceModules.Purchases,
                docType,
                req.PurchaseId.ToString(),
                req.InvoiceNumber,
                req.Date,
                "ARS",
                1m,
                "Supplier",
                null,
                req.SupplierName,
                null,
                amounts,
                tags);
            return await AutoPostViaGateway.EnqueueAndReportAsync(gateway, db, tenantContext.TenantId, doc, ct);
        }).WithDescription("Obsoleto: usar IAccountingPostingGateway. Queda por compatibilidad.");

        group.MapPost("/auto-post/receipt", async (
            AutoPostReceiptRequest req,
            ITenantContext tenantContext,
            AccountingDbContext db,
            IAccountingPostingGateway gateway,
            CancellationToken ct) =>
        {
            var method = req.PaymentMethod ?? "Cash";
            var isBank = method.Contains("transfer", StringComparison.OrdinalIgnoreCase)
                         || method.Contains("banco", StringComparison.OrdinalIgnoreCase)
                         || method.Contains("bank", StringComparison.OrdinalIgnoreCase);
            var isCheque = method.Contains("check", StringComparison.OrdinalIgnoreCase)
                           || method.Contains("cheque", StringComparison.OrdinalIgnoreCase)
                           || method.Contains("echeq", StringComparison.OrdinalIgnoreCase);
            var amounts = new Dictionary<string, decimal>(StringComparer.OrdinalIgnoreCase)
            {
                [AccountingAmountSources.Total] = req.Amount,
                [AccountingAmountSources.PaymentAmount] = req.Amount,
                [AccountingAmountSources.BankAmount] = isBank ? req.Amount : 0m,
                [AccountingAmountSources.CashAmount] = (!isBank && !isCheque) ? req.Amount : 0m,
                [AccountingAmountSources.ChequeAmount] = isCheque ? req.Amount : 0m
            };
            var tags = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                ["PaymentMethod"] = method
            };
            var doc = new PostableDocument(
                AccountingSourceModules.Finance,
                AccountingDocumentTypes.CollectionReceipt,
                req.ReceiptId.ToString(),
                req.ReceiptNumber,
                req.Date,
                "ARS",
                1m,
                "Customer",
                null,
                req.CustomerName,
                null,
                amounts,
                tags);
            return await AutoPostViaGateway.EnqueueAndReportAsync(gateway, db, tenantContext.TenantId, doc, ct);
        }).WithDescription("Obsoleto: usar IAccountingPostingGateway. Queda por compatibilidad.");

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

        // ====================================================================
        // 14. Reportes Oficiales IVA Digital (ARCA RG 4597)
        // ====================================================================
        group.MapGet("/reports/iva-digital-sales", async (
            [FromQuery] int year,
            [FromQuery] int month,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            var entries = await db.JournalEntries
                .AsNoTracking()
                .Include(j => j.Lines)
                .Where(j => j.TenantId == tenantId && j.SourceModule == "Sales" && j.Date.Year == year && j.Date.Month == month)
                .OrderBy(j => j.Date)
                .ToListAsync(ct);

            var sb = new StringBuilder();
            foreach (var e in entries)
            {
                var net = e.Lines.Where(l => l.AccountCode.StartsWith("4.")).Sum(l => l.Credit);
                var vat = e.Lines.Where(l => l.AccountCode.StartsWith("2.1.02")).Sum(l => l.Credit);
                sb.AppendLine($"{e.Date:yyyyMMdd}|001|00001|{e.EntryNumber:D8}|{e.EntryNumber:D8}|80|30000000007|CLIENTE GENERAL|{e.TotalDebit:F2}|0.00|0.00|0.00|0.00|{net:F2}|{vat:F2}|0.00|0.00|0.00|PES|1.000000|1|0");
            }

            var bytes = Encoding.UTF8.GetBytes(sb.ToString());
            return Results.File(bytes, "text/plain", $"LIBRO_IVA_DIGITAL_VENTAS_{year}_{month:D2}.txt");
        });

        group.MapGet("/reports/iva-digital-purchases", async (
            [FromQuery] int year,
            [FromQuery] int month,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            var entries = await db.JournalEntries
                .AsNoTracking()
                .Include(j => j.Lines)
                .Where(j => j.TenantId == tenantId && j.SourceModule == "Purchases" && j.Date.Year == year && j.Date.Month == month)
                .OrderBy(j => j.Date)
                .ToListAsync(ct);

            var sb = new StringBuilder();
            foreach (var e in entries)
            {
                var net = e.Lines.Where(l => l.AccountCode.StartsWith("5.")).Sum(l => l.Debit);
                var vat = e.Lines.Where(l => l.AccountCode.StartsWith("1.1.03")).Sum(l => l.Debit);
                sb.AppendLine($"{e.Date:yyyyMMdd}|001|00001|{e.EntryNumber:D8}|{e.EntryNumber:D8}|80|30000000007|PROVEEDOR GENERAL|{e.TotalCredit:F2}|0.00|0.00|0.00|0.00|{net:F2}|{vat:F2}|0.00|0.00|0.00|PES|1.000000|1|0");
            }

            var bytes = Encoding.UTF8.GetBytes(sb.ToString());
            return Results.File(bytes, "text/plain", $"LIBRO_IVA_DIGITAL_COMPRAS_{year}_{month:D2}.txt");
        });

        // ====================================================================
        // 15. Asientos Modelos (Journal Templates CRUD & Catalogue)
        // ====================================================================
        group.MapGet("/templates", async (
            [FromQuery] string? sourceModule,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            await db.EnsureAccountingTablesAsync(ct);
            await db.SeedDefaultChartOfAccountsAsync(tenantId, ct);
            await db.SeedDefaultJournalTemplatesAsync(tenantId, ct);

            var query = db.JournalTemplates
                .AsNoTracking()
                .Include(t => t.Lines)
                .Where(t => t.TenantId == tenantId);

            if (!string.IsNullOrWhiteSpace(sourceModule))
            {
                query = query.Where(t => t.SourceModule.ToLower() == sourceModule.ToLower());
            }

            var templates = await query.OrderBy(t => t.Code).ToListAsync(ct);
            var dtos = templates.Select(t => new JournalTemplateDto(
                t.Id,
                t.Code,
                t.Name,
                t.SourceModule,
                t.DocumentType,
                t.Description,
                t.Status,
                t.EntrySeries,
                t.CreatedAtUtc,
                t.UpdatedAtUtc,
                t.Lines.OrderBy(l => l.OrderIndex).Select(l => new JournalTemplateLineDto(
                    l.Id,
                    l.OrderIndex,
                    l.AccountId,
                    l.AccountCode,
                    l.AccountName,
                    l.DebitCredit,
                    l.AmountSource,
                    l.Condition,
                    l.IsInvertedSign,
                    l.MemoTemplate
                )).ToList()
            )).ToList();

            return Results.Ok(dtos);
        });

        group.MapGet("/templates/{id:guid}", async (
            Guid id,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            var t = await db.JournalTemplates
                .AsNoTracking()
                .Include(x => x.Lines)
                .FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);

            if (t == null) return Results.NotFound(new { message = "Asiento Modelo no encontrado." });

            var dto = new JournalTemplateDto(
                t.Id,
                t.Code,
                t.Name,
                t.SourceModule,
                t.DocumentType,
                t.Description,
                t.Status,
                t.EntrySeries,
                t.CreatedAtUtc,
                t.UpdatedAtUtc,
                t.Lines.OrderBy(l => l.OrderIndex).Select(l => new JournalTemplateLineDto(
                    l.Id,
                    l.OrderIndex,
                    l.AccountId,
                    l.AccountCode,
                    l.AccountName,
                    l.DebitCredit,
                    l.AmountSource,
                    l.Condition,
                    l.IsInvertedSign,
                    l.MemoTemplate
                )).ToList()
            );

            return Results.Ok(dto);
        });

        group.MapPost("/templates", async (
            CreateJournalTemplateRequest req,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(req.Code) || string.IsNullOrWhiteSpace(req.Name))
            {
                return Results.BadRequest(new { message = "El código y el nombre del asiento modelo son obligatorios." });
            }

            var tenantId = tenantContext.TenantId;
            await db.EnsureAccountingTablesAsync(ct);

            var exists = await db.JournalTemplates.AnyAsync(t => t.TenantId == tenantId && t.Code == req.Code.Trim(), ct);
            if (exists)
            {
                return Results.BadRequest(new { message = $"Ya existe un asiento modelo con el código {req.Code}." });
            }

            var template = new JournalTemplate
            {
                TenantId = tenantId,
                Code = req.Code.Trim(),
                Name = req.Name.Trim(),
                SourceModule = req.SourceModule ?? "Sales",
                DocumentType = req.DocumentType ?? "InvoiceA",
                Description = req.Description ?? string.Empty,
                Status = req.Status ?? "Active",
                EntrySeries = req.EntrySeries ?? "General",
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow
            };

            if (req.Lines != null)
            {
                int idx = 1;
                foreach (var l in req.Lines)
                {
                    template.Lines.Add(new JournalTemplateLine
                    {
                        TemplateId = template.Id,
                        TenantId = tenantId,
                        OrderIndex = l.OrderIndex > 0 ? l.OrderIndex : idx++,
                        AccountId = l.AccountId,
                        AccountCode = l.AccountCode.Trim(),
                        AccountName = l.AccountName.Trim(),
                        DebitCredit = l.DebitCredit ?? "Debit",
                        AmountSource = l.AmountSource ?? "Total",
                        Condition = l.Condition ?? "Always",
                        IsInvertedSign = l.IsInvertedSign,
                        MemoTemplate = l.MemoTemplate
                    });
                }
            }

            db.JournalTemplates.Add(template);
            await db.SaveChangesAsync(ct);

            return Results.Created($"/api/v1/accounting/templates/{template.Id}", template);
        });

        group.MapPut("/templates/{id:guid}", async (
            Guid id,
            UpdateJournalTemplateRequest req,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            var template = await db.JournalTemplates
                .Include(t => t.Lines)
                .FirstOrDefaultAsync(t => t.Id == id && t.TenantId == tenantId, ct);

            if (template == null) return Results.NotFound(new { message = "Asiento Modelo no encontrado." });

            if (!string.IsNullOrWhiteSpace(req.Code) && req.Code.Trim() != template.Code)
            {
                var codeExists = await db.JournalTemplates.AnyAsync(t => t.TenantId == tenantId && t.Code == req.Code.Trim() && t.Id != id, ct);
                if (codeExists)
                {
                    return Results.BadRequest(new { message = $"Ya existe otro asiento modelo con el código {req.Code}." });
                }
                template.Code = req.Code.Trim();
            }

            template.Name = req.Name.Trim();
            template.SourceModule = req.SourceModule ?? template.SourceModule;
            template.DocumentType = req.DocumentType ?? template.DocumentType;
            template.Description = req.Description ?? string.Empty;
            template.Status = req.Status ?? template.Status;
            template.EntrySeries = req.EntrySeries ?? template.EntrySeries;
            template.UpdatedAtUtc = DateTime.UtcNow;

            // Replace Lines
            db.JournalTemplateLines.RemoveRange(template.Lines);
            template.Lines.Clear();

            if (req.Lines != null)
            {
                int idx = 1;
                foreach (var l in req.Lines)
                {
                    template.Lines.Add(new JournalTemplateLine
                    {
                        TemplateId = template.Id,
                        TenantId = tenantId,
                        OrderIndex = l.OrderIndex > 0 ? l.OrderIndex : idx++,
                        AccountId = l.AccountId,
                        AccountCode = l.AccountCode.Trim(),
                        AccountName = l.AccountName.Trim(),
                        DebitCredit = l.DebitCredit ?? "Debit",
                        AmountSource = l.AmountSource ?? "Total",
                        Condition = l.Condition ?? "Always",
                        IsInvertedSign = l.IsInvertedSign,
                        MemoTemplate = l.MemoTemplate
                    });
                }
            }

            await db.SaveChangesAsync(ct);
            return Results.Ok(template);
        });

        group.MapDelete("/templates/{id:guid}", async (
            Guid id,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            var template = await db.JournalTemplates.FirstOrDefaultAsync(t => t.Id == id && t.TenantId == tenantId, ct);
            if (template == null) return Results.NotFound(new { message = "Asiento Modelo no encontrado." });

            db.JournalTemplates.Remove(template);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { message = "Asiento Modelo eliminado correctamente." });
        });

        group.MapGet("/templates/variables", () =>
        {
            var variables = new List<AmountSourceVariableInfo>
            {
                new("Total", "Total Comprobante", "Importe total bruto del comprobante", "General", new() { "Sales", "Purchases", "Finance" }),
                new("Net21", "Subtotal Neto Gravado (21%)", "Neto gravado al 21% de IVA", "Impuestos / IVA", new() { "Sales", "Purchases" }),
                new("Net105", "Subtotal Neto Gravado (10.5%)", "Neto gravado al 10.5% de IVA", "Impuestos / IVA", new() { "Sales", "Purchases" }),
                new("Net27", "Subtotal Neto Gravado (27%)", "Neto gravado al 27% de IVA", "Impuestos / IVA", new() { "Sales", "Purchases" }),
                new("NetExempt", "Subtotal Exento / No Gravado", "Conceptos exentos o no gravados", "Impuestos / IVA", new() { "Sales", "Purchases" }),
                new("TotalNet", "Total Neto Gravado (Suma)", "Suma de todos los netos", "General", new() { "Sales", "Purchases" }),
                new("Vat21", "IVA Débito / Crédito Fiscal (21%)", "IVA liquidado al 21%", "Impuestos / IVA", new() { "Sales", "Purchases" }),
                new("Vat105", "IVA Débito / Crédito Fiscal (10.5%)", "IVA liquidado al 10.5%", "Impuestos / IVA", new() { "Sales", "Purchases" }),
                new("Vat27", "IVA Débito / Crédito Fiscal (27%)", "IVA liquidado al 27%", "Impuestos / IVA", new() { "Sales", "Purchases" }),
                new("TotalVat", "Total IVA Liquidado (Suma)", "Suma total de IVA", "Impuestos / IVA", new() { "Sales", "Purchases" }),
                new("PerceptionIibb", "Percepción IIBB", "Percepción de Ingresos Brutos", "Percepciones", new() { "Sales", "Purchases" }),
                new("PerceptionVat", "Percepción IVA", "Percepción impositiva de IVA", "Percepciones", new() { "Sales", "Purchases" }),
                new("PerceptionEarnings", "Percepción Ganancias", "Percepción impositiva de Ganancias", "Percepciones", new() { "Sales", "Purchases" }),
                new("Withholdings", "Retenciones Sufridas / Practicadas", "Retenciones de impuestos en cobros o pagos", "Retenciones", new() { "Finance", "Sales", "Purchases" }),
                new("PaymentAmount", "Importe Medio de Pago (Caja / Banco)", "Importe neto pagado o cobrado", "Tesorería", new() { "Finance" }),
                new("CmvCost", "Costo Mercadería Vendida (CMV)", "Costo de valuación de inventario", "Stock", new() { "Sales", "Inventory" }),
                new("StockValueAdjustment", "Valor de Ajuste de Stock", "Importe monetario de ajuste de inventario", "Stock", new() { "Inventory" })
            };

            return Results.Ok(variables);
        });

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

        return endpoints;
    }
}

public sealed record CreateAccountRequest(string Code, string Name, string? AccountType, int Level, string? ParentCode, bool IsDirectPosting, string? Currency, bool AdjustsForInflation);
public sealed record UpdateAccountRequest(string? Code, string Name, string? AccountType, int Level, string? ParentCode, bool IsDirectPosting, string? Currency, bool AdjustsForInflation, bool IsActive);
public sealed record CreateJournalEntryRequest(DateTime Date, string Concept, string? EntryType, string? SourceModule, string? SourceDocumentId, string? CreatedBy, List<JournalEntryLineRequest> Lines);
public sealed record JournalEntryLineRequest(Guid AccountId, string AccountCode, string AccountName, decimal Debit, decimal Credit, string? Currency, decimal ExchangeRate, Guid? CostCenterId, string? CostCenterCode, string? CostCenterName, string? Memo);
public sealed record CreateCostCenterRequest(string Code, string Name, string? Category);
public sealed record LockPeriodRequest(int Year, int Month, bool Lock, string? User);
public sealed record UpdateAccountingSettingsRequest(bool AutoPostOnConfirm);
public sealed record FinanceAccountMappingItemRequest(Guid FinancialAccountId, string LedgerAccountCode);
public sealed record AutoPostInvoiceRequest(Guid InvoiceId, string InvoiceNumber, string CustomerName, DateTime Date, decimal NetAmount, decimal VatAmount, decimal TotalAmount);
public sealed record AutoPostPurchaseRequest(Guid PurchaseId, string InvoiceNumber, string SupplierName, DateTime Date, decimal NetAmount, decimal VatAmount, decimal TotalAmount);
public sealed record AutoPostReceiptRequest(Guid ReceiptId, string ReceiptNumber, string CustomerName, DateTime Date, decimal Amount, string? PaymentMethod);
public sealed record UploadBankStatementRequest(string? BankName, string? AccountNumber, string? Currency, DateTime PeriodStartDate, DateTime PeriodEndDate, decimal InitialBalance, decimal FinalBalance, List<UploadBankStatementLineRequest> Lines);
public sealed record UploadBankStatementLineRequest(DateTime TransactionDate, string Description, string? ReferenceNumber, decimal Debit, decimal Credit, decimal Balance);
public sealed record QuickPostBankFeeRequest(string FeeType);
