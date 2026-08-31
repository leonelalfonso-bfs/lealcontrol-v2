using System;
using System.Linq;
using System.Threading.Tasks;
using LealControl.Modules.Finance.Infrastructure;
using LealControl.Modules.Sales.Infrastructure.Persistence;
using LealControl.QA.Infrastructure;
using LealControl.QA.Models;
using Microsoft.EntityFrameworkCore;

namespace LealControl.QA.Auditors;

public sealed class CustomerAccountAuditor : IQaAuditor
{
    public string Name => "Customer Account Auditor";
    public string Module => "CustomerAccounts";

    public async Task AuditCustomerBalanceAsync(QaTestContext context, QaScenarioResult scenario, Guid customerId, decimal expectedBalance)
    {
        var salesDb = context.GetService<SalesDbContext>();
        var financeDb = context.GetService<FinanceDbContext>();
        var tenantId = context.TenantId;

        // 1. Sum debits (Invoices not cancelled)
        var invoices = await salesDb.Invoices.AsNoTracking().Where(i => i.TenantId == tenantId && i.CustomerId == customerId && i.Status != "Cancelled")
            .ToListAsync();

        var totalDebits = invoices.Sum(i => i.Total);

        // 2. Sum credits (Collection Receipts)
        var receipts = await financeDb.CollectionReceipts.AsNoTracking().Where(r => r.TenantId == tenantId.Value && r.CustomerId == customerId && r.Status != "Cancelled")
            .ToListAsync();

        var totalCredits = receipts.Sum(r => r.Amount);

        // 3. Calculated balance
        var calculatedBalance = totalDebits - totalCredits;

        scenario.AddCheck(
            name: "Saldo de cuenta corriente reconstruido coincide con valor esperado",
            module: Module,
            condition: calculatedBalance == expectedBalance,
            expected: $"${expectedBalance:N2}",
            actual: $"${calculatedBalance:N2}",
            message: $"Débitos facturados: ${totalDebits:N2} | Créditos cobrados: ${totalCredits:N2} | Saldo: ${calculatedBalance:N2}",
            entity: "CustomerAccount",
            entityId: customerId.ToString());
    }
}

