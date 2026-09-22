using System;
using System.Diagnostics;
using System.Linq;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.Tasks;
using LealControl.Modules.Finance.Infrastructure;
using LealControl.QA.Factories;
using LealControl.QA.Infrastructure;
using LealControl.QA.Models;
using Microsoft.EntityFrameworkCore;

namespace LealControl.QA.Scenarios.Finance;

public sealed class QaFinance002Scenario : ITestScenario
{
    public string Name => "QA-FINANCE-002: Cheque recibido → depositado → rechazado";
    public string Module => "Finance";

    public async Task<QaScenarioResult> ExecuteAsync(QaTestContext context)
    {
        var sw = Stopwatch.StartNew();
        var scenario = new QaScenarioResult { ScenarioName = Name, Module = Module };

        try
        {
            var bank = await TestDataFactory.CreateBankAccountAsync(context, "Banco Cheques QA");
            const decimal amount = 42000m;
            const decimal fees = 200m;

            var createRes = await context.HttpClient.PostAsJsonAsync("/api/v1/finance/echeqs", new
            {
                checkNumber = "QA-CH-002",
                amount,
                currency = "ARS",
                issuerName = "Cliente Cheque QA",
                issueDateUtc = DateTime.UtcNow.Date,
                dueDateUtc = DateTime.UtcNow.Date.AddDays(30),
                direction = "Received"
            });
            if (!createRes.IsSuccessStatusCode)
            {
                var error = await createRes.Content.ReadAsStringAsync();
                scenario.AddCheck(
                    "Alta de cheque recibido",
                    Module,
                    false,
                    "2xx",
                    $"{(int)createRes.StatusCode}: {error}");
                return scenario;
            }

            scenario.AddCheck(
                "Alta de cheque recibido",
                Module,
                true,
                "2xx",
                $"{(int)createRes.StatusCode}");

            using var createDoc = JsonDocument.Parse(await createRes.Content.ReadAsStringAsync());
            var chequeId = createDoc.RootElement.GetProperty("id").GetGuid();

            var depositRes = await context.HttpClient.PostAsJsonAsync($"/api/v1/finance/echeqs/{chequeId}/deposit", new
            {
                bankAccountId = bank.Id,
                depositDateUtc = DateTime.UtcNow
            });
            scenario.AddCheck(
                "Depósito del cheque en banco",
                Module,
                depositRes.IsSuccessStatusCode,
                "2xx",
                $"{(int)depositRes.StatusCode}");

            var financeDb = context.GetService<FinanceDbContext>();
            var deposited = await financeDb.ReceivedCheques.AsNoTracking().SingleAsync(c => c.Id == chequeId);
            scenario.AddCheck(
                "Estado Deposited tras depósito",
                Module,
                deposited.Status == ReceivedChequeStatus.Deposited,
                "Deposited",
                deposited.Status.ToString());

            var credit = await financeDb.Movements.AsNoTracking()
                .SingleOrDefaultAsync(m => m.Id == deposited.BankMovementId);
            scenario.AddCheck(
                "Crédito bancario por depósito del cheque",
                Module,
                credit is not null && credit.Kind == FinancialMovementKind.Credit && credit.Amount == amount,
                $"Credit ${amount:N2}",
                credit is null ? "sin movimiento" : $"{credit.Kind} ${credit.Amount:N2}");

            var rejectRes = await context.HttpClient.PostAsJsonAsync($"/api/v1/finance/echeqs/{chequeId}/reject", new
            {
                rejectDateUtc = DateTime.UtcNow,
                note = "Rechazado QA sin fondos",
                fees
            });
            scenario.AddCheck(
                "Rechazo del cheque depositado",
                Module,
                rejectRes.IsSuccessStatusCode,
                "2xx",
                $"{(int)rejectRes.StatusCode}");

            var rejected = await financeDb.ReceivedCheques.AsNoTracking().SingleAsync(c => c.Id == chequeId);
            scenario.AddCheck(
                "Estado Rejected tras rechazo",
                Module,
                rejected.Status == ReceivedChequeStatus.Rejected,
                "Rejected",
                rejected.Status.ToString());

            var debit = await financeDb.Movements.AsNoTracking()
                .Where(m => m.TenantId == context.TenantId.Value
                            && m.LinkedEntityId == chequeId
                            && m.Kind == FinancialMovementKind.Debit)
                .OrderByDescending(m => m.CreatedAtUtc)
                .FirstOrDefaultAsync();

            scenario.AddCheck(
                "Débito bancario por rechazo incluye gastos",
                Module,
                debit is not null && debit.Amount == amount + fees,
                $"Debit ${amount + fees:N2}",
                debit is null ? "sin débito" : $"{debit.Kind} ${debit.Amount:N2}");
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
