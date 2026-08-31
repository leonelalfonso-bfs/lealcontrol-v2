using System;
using System.Linq;
using System.Threading.Tasks;
using LealControl.Modules.Sales.Infrastructure.Persistence;
using LealControl.QA.Infrastructure;
using LealControl.QA.Models;
using Microsoft.EntityFrameworkCore;

namespace LealControl.QA.Auditors;

public sealed class TaxAuditor : IQaAuditor
{
    public string Name => "Tax Auditor";
    public string Module => "Taxes";

    public async Task AuditInvoiceTaxesAsync(QaTestContext context, QaScenarioResult scenario, Guid invoiceId)
    {
        var salesDb = context.GetService<SalesDbContext>();
        var tenantId = context.TenantId;

        var invoice = await salesDb.Invoices
            .Include(i => i.Items)
            .FirstOrDefaultAsync(i => i.TenantId == tenantId && i.Id == invoiceId);

        scenario.AddCheck(
            name: "Comprobante existe para auditoría fiscal",
            module: Module,
            condition: invoice != null,
            expected: "Factura encontrada",
            actual: invoice != null ? invoice.FormattedNumber : "No encontrada",
            entity: "Invoice",
            entityId: invoiceId.ToString());

        if (invoice == null) return;

        // 1. Check Subtotal
        var calculatedSubtotal = invoice.Items.Sum(i => i.NetSubtotal);
        scenario.AddCheck(
            name: "Subtotal neto coincide con sumatoria de renglones",
            module: Module,
            condition: Math.Abs(invoice.Subtotal - calculatedSubtotal) < 0.01m,
            expected: $"${calculatedSubtotal:N2}",
            actual: $"${invoice.Subtotal:N2}",
            entity: "Invoice",
            entityId: invoiceId.ToString());

        // 2. Check VAT breakdown
        var calculatedVat = invoice.Items.Sum(i => i.VatAmount);
        var totalHeaderVat = invoice.Iva21 + invoice.Iva105 + invoice.Iva27;
        scenario.AddCheck(
            name: "IVA total en cabecera coincide con sumatoria de ítems",
            module: Module,
            condition: Math.Abs(totalHeaderVat - calculatedVat) < 0.01m,
            expected: $"${calculatedVat:N2}",
            actual: $"${totalHeaderVat:N2}",
            entity: "Invoice",
            entityId: invoiceId.ToString());

        // 3. Check Total: Subtotal + VAT + Perceptions
        var expectedTotal = invoice.Subtotal + totalHeaderVat + invoice.IibbPerception;
        scenario.AddCheck(
            name: "Total final coincide estrictamente con Neto + IVA + Percepciones",
            module: Module,
            condition: Math.Abs(invoice.Total - expectedTotal) < 0.01m,
            expected: $"${expectedTotal:N2}",
            actual: $"${invoice.Total:N2}",
            entity: "Invoice",
            entityId: invoiceId.ToString());
    }
}
