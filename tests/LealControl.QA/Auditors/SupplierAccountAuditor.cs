using System;
using System.Linq;
using System.Threading.Tasks;
using LealControl.Modules.Finance.Infrastructure;
using LealControl.Modules.Sales.Domain.Purchases;
using LealControl.Modules.Sales.Infrastructure.Persistence;
using LealControl.QA.Infrastructure;
using LealControl.QA.Models;
using Microsoft.EntityFrameworkCore;

namespace LealControl.QA.Auditors;

public sealed class SupplierAccountAuditor : IQaAuditor
{
    public string Name => "Supplier Account Auditor";
    public string Module => "SupplierAccounts";

    public async Task AuditSupplierBalanceAsync(QaTestContext context, QaScenarioResult scenario, Guid supplierId, decimal expectedBalance)
    {
        var salesDb = context.GetService<SalesDbContext>();
        var financeDb = context.GetService<FinanceDbContext>();
        var tenantId = context.TenantId;

        // 1. Sum debits/invoices from supplier (PurchaseInvoices not cancelled, subtract NC)
        var invoices = await salesDb.Set<PurchaseInvoice>().AsNoTracking()
            .Where(i => i.TenantId == tenantId && i.SupplierId == supplierId && i.Status != "Cancelled")
            .ToListAsync();

        var totalBilled = invoices.Sum(i => i.InvoiceType.StartsWith("NC", StringComparison.OrdinalIgnoreCase) ? -i.Total : i.Total);

        // 2. Sum payments (PaymentOrders not cancelled)
        var payments = await financeDb.PaymentOrders.AsNoTracking()
            .Where(p => p.TenantId == tenantId.Value && p.SupplierId == supplierId && p.Status != "Voided")
            .ToListAsync();

        var totalPaid = payments.Sum(p => p.Amount);

        // 3. Calculated payable balance (Saldo Acreedor / Pendiente de Pago)
        var calculatedBalance = totalBilled - totalPaid;

        scenario.AddCheck(
            name: "Saldo de cuenta corriente de proveedor coincide con valor esperado",
            module: Module,
            condition: calculatedBalance == expectedBalance,
            expected: $"${expectedBalance:N2}",
            actual: $"${calculatedBalance:N2}",
            message: $"Facturado proveedor: ${totalBilled:N2} | Pagado: ${totalPaid:N2} | Saldo a pagar: ${calculatedBalance:N2}",
            entity: "SupplierAccount",
            entityId: supplierId.ToString());
    }
}
