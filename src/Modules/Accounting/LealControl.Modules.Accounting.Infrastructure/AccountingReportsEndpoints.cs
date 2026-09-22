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

internal static class AccountingReportsEndpoints
{
    public static RouteGroupBuilder MapAccountingReportsEndpoints(this RouteGroupBuilder group)
    {
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
            var docType = FiscalDocumentTypeResolver.Resolve(req.InvoiceType, req.InvoiceNumber);
            var amounts = AutoPostViaGateway.InvoiceAmounts(req.NetAmount, req.VatAmount, req.TotalAmount);
            var tags = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                ["PaymentMethod"] = "Account"
            };
            if (!string.IsNullOrWhiteSpace(req.InvoiceType))
                tags["InvoiceType"] = req.InvoiceType!;
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
            var docType = FiscalDocumentTypeResolver.Resolve(req.InvoiceType, req.InvoiceNumber);
            var amounts = AutoPostViaGateway.InvoiceAmounts(req.NetAmount, req.VatAmount, req.TotalAmount);
            var tags = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            if (!string.IsNullOrWhiteSpace(req.InvoiceType))
                tags["InvoiceType"] = req.InvoiceType!;
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

        return group;
    }
}
