using System;
using System.Diagnostics;
using System.Linq;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.Tasks;
using LealControl.Modules.Accounting.Infrastructure;
using LealControl.Modules.Finance.Infrastructure;
using LealControl.QA.Auditors;
using LealControl.QA.Factories;
using LealControl.QA.Infrastructure;
using LealControl.QA.Models;
using Microsoft.EntityFrameworkCore;

namespace LealControl.QA.Scenarios.Finance;

public sealed class QaFinance001Scenario : ITestScenario
{
    public string Name => "QA-FINANCE-001: Extracto → Recibo → Ledger";
    public string Module => "Finance";

    public async Task<QaScenarioResult> ExecuteAsync(QaTestContext context)
    {
        var sw = Stopwatch.StartNew();
        var scenario = new QaScenarioResult { ScenarioName = Name, Module = Module };

        try
        {
            await TestDataFactory.InitializeAccountingAsync(context);
            var accountingDb = context.GetService<AccountingDbContext>();
            await accountingDb.SeedDefaultJournalTemplatesAsync(context.TenantId);

            var customer = await TestDataFactory.CreateCustomerAsync(context);
            var bank = await TestDataFactory.CreateBankAccountAsync(context, "Banco Extracto QA");

            await context.HttpClient.PutAsJsonAsync("/api/v1/accounting/finance-account-mappings", new[]
            {
                new { financialAccountId = bank.Id, ledgerAccountCode = "1.1.01.002" }
            });

            const decimal amount = 15000m;
            var csv = $"""
                Fecha;Descripción;Débitos;Créditos;Saldo;Número de comprobante
                {DateTime.UtcNow:dd/MM/yyyy};TRANSF RECIBIDA QA;;{amount.ToString("0.00", System.Globalization.CultureInfo.GetCultureInfo("es-AR"))};{amount.ToString("0.00", System.Globalization.CultureInfo.GetCultureInfo("es-AR"))};QA-TRX-001
                """;

            var importRes = await context.HttpClient.PostAsJsonAsync("/api/v1/finance/imports/bank/confirm", new
            {
                accountId = bank.Id,
                csvContent = csv,
                fileName = "qa-finance-001.csv"
            });
            scenario.AddCheck(
                "Importación de extracto bancario",
                Module,
                importRes.IsSuccessStatusCode,
                "2xx",
                $"{(int)importRes.StatusCode}",
                "El CSV debe importarse sin error.");

            var financeDb = context.GetService<FinanceDbContext>();
            await financeDb.EnsureFinanceTablesAsync();
            await FinanceConcepts.EnsureBaseConceptsAsync(financeDb, context.TenantId.Value, default);

            var concept = await financeDb.FinancialConcepts.AsNoTracking()
                .SingleAsync(c => c.TenantId == context.TenantId.Value && c.Code == "COBRO_CLIENTE");

            var movement = await financeDb.Movements
                .Where(m => m.TenantId == context.TenantId.Value && m.AccountId == bank.Id)
                .OrderByDescending(m => m.CreatedAtUtc)
                .FirstAsync();

            movement.ConceptId = concept.Id;
            movement.ClassificationStatus = FinancialClassificationStatus.Confirmed;
            movement.ClassifiedAtUtc = DateTime.UtcNow;
            await financeDb.SaveChangesAsync();

            scenario.AddCheck(
                "Movimiento importado confirmado como cobro de cliente",
                Module,
                movement.Amount == amount && movement.Kind == FinancialMovementKind.Credit,
                $"Crédito ${amount:N2}",
                $"{movement.Kind} ${movement.Amount:N2}");

            var receiptPayload = new
            {
                accountId = bank.Id,
                customerId = customer.Id,
                amount,
                currency = "ARS",
                receiptDateUtc = DateTime.UtcNow,
                description = "Cobro desde extracto QA-FINANCE-001",
                lines = new[]
                {
                    new
                    {
                        method = "BankTransfer",
                        amount,
                        currency = "ARS",
                        accountId = bank.Id,
                        movementId = movement.Id,
                        chequeId = (Guid?)null,
                        conceptId = concept.Id,
                        retentionType = (string?)null,
                        retentionCertificate = (string?)null,
                        notes = (string?)null
                    }
                }
            };

            var receiptRes = await context.HttpClient.PostAsJsonAsync("/api/v1/finance/collections", receiptPayload);
            scenario.AddCheck(
                "Recibo vinculado al movimiento del extracto",
                Module,
                receiptRes.IsSuccessStatusCode,
                "2xx",
                $"{(int)receiptRes.StatusCode}");

            if (!receiptRes.IsSuccessStatusCode)
            {
                scenario.AddCheck("Detalle error recibo", Module, false, "OK", await receiptRes.Content.ReadAsStringAsync());
                return scenario;
            }

            using var receiptDoc = JsonDocument.Parse(await receiptRes.Content.ReadAsStringAsync());
            var receiptId = receiptDoc.RootElement.TryGetProperty("id", out var idProp)
                ? idProp.GetGuid()
                : await financeDb.CollectionReceipts
                    .Where(r => r.TenantId == context.TenantId.Value)
                    .OrderByDescending(r => r.CreatedAtUtc)
                    .Select(r => r.Id)
                    .FirstAsync();

            var batchRes = await context.HttpClient.PostAsJsonAsync("/api/v1/accounting/batch-post/execute", new
            {
                periodStart = DateTime.UtcNow.Date.AddDays(-1),
                periodEnd = DateTime.UtcNow.Date.AddDays(1),
                modules = new[] { "Finance" },
                branchId = (string?)null,
                currency = (string?)null,
                executedBy = "qa@lealcontrol.com"
            });
            scenario.AddCheck(
                "Batch-post de documentos Finance",
                "Accounting",
                batchRes.IsSuccessStatusCode,
                "2xx",
                $"{(int)batchRes.StatusCode}");

            var accountingAuditor = new AccountingAuditor();
            await accountingAuditor.AuditDocumentJournalEntryAsync(
                context, scenario, "Finance", receiptId.ToString(), amount);

            var entry = await accountingDb.JournalEntries.AsNoTracking()
                .Include(j => j.Lines)
                .FirstOrDefaultAsync(j =>
                    j.TenantId == context.TenantId
                    && j.SourceModule == "Finance"
                    && j.SourceDocumentId == receiptId.ToString());

            if (entry is not null)
            {
                var hasBank = entry.Lines.Any(l => l.AccountCode == "1.1.01.002" && l.Debit == amount);
                var hasAr = entry.Lines.Any(l => l.AccountCode == "1.1.02.001" && l.Credit == amount);
                scenario.AddCheck(
                    "Asiento imputa banco y deudores (partida doble)",
                    "Accounting",
                    hasBank && hasAr,
                    "Débito banco + crédito deudores",
                    $"Banco={hasBank}, Deudores={hasAr}");
            }

            var reconciled = await financeDb.Movements.AsNoTracking().SingleAsync(m => m.Id == movement.Id);
            scenario.AddCheck(
                "Movimiento del extracto queda conciliado con el recibo",
                Module,
                reconciled.ReconciliationStatus == FinancialReconciliationStatus.Reconciled
                    && reconciled.LinkedEntityId == receiptId,
                "Reconciled + LinkedEntity",
                $"{reconciled.ReconciliationStatus} / {reconciled.LinkedEntityId}");
        }
        catch (Exception ex)
        {
            scenario.AddCheck("Ejecución sin excepciones", Module, false, "OK", ex.GetType().Name, ex.ToString());
        }
        finally
        {
            sw.Stop();
            scenario.Duration = sw.Elapsed;
        }

        return scenario;
    }
}
