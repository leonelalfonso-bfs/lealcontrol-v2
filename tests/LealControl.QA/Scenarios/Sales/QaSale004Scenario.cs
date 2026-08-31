using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Net.Http.Json;
using System.Threading.Tasks;
using LealControl.Modules.Accounting.Infrastructure;
using LealControl.Modules.Finance.Infrastructure;
using LealControl.Modules.Sales.Application.Invoices;
using LealControl.QA.Auditors;
using LealControl.QA.Factories;
using LealControl.QA.Infrastructure;
using LealControl.QA.Models;
using Microsoft.EntityFrameworkCore;

namespace LealControl.QA.Scenarios.Sales;

public sealed class QaSale004Scenario : ITestScenario
{
    public string Name => "QA-SALE-004: Venta Multi-Alícuota (21%, 10.5% y Exento)";
    public string Module => "Sales";

    public async Task<QaScenarioResult> ExecuteAsync(QaTestContext context)
    {
        var sw = Stopwatch.StartNew();
        var scenario = new QaScenarioResult
        {
            ScenarioName = Name,
            Module = Module
        };

        try
        {
            // ====================================================================
            // 1. ARRANGE
            // ====================================================================
            await TestDataFactory.InitializeAccountingAsync(context);

            var customer = await TestDataFactory.CreateCustomerAsync(context);

            // Producto 1: IVA 21%
            var product21 = await TestDataFactory.CreateProductAsync(
                context,
                initialStock: 50m,
                unitPrice: 10000m,
                costPrice: 6000m,
                vatRate: 21m);

            // Producto 2: IVA 10.5%
            var product105 = await TestDataFactory.CreateProductAsync(
                context,
                initialStock: 50m,
                unitPrice: 20000m,
                costPrice: 12000m,
                vatRate: 10.5m);

            // Producto 3: Exento (0%)
            var productExempt = await TestDataFactory.CreateProductAsync(
                context,
                initialStock: 50m,
                unitPrice: 25000m,
                costPrice: 15000m,
                vatRate: 0m);

            var cashAccount = await TestDataFactory.CreateCashAccountAsync(context);

            const decimal qty1 = 10m;  // 10 x $10.000 = $100.000 neto + $21.000 IVA 21%
            const decimal qty2 = 5m;   // 5 x $20.000 = $100.000 neto + $10.500 IVA 10.5%
            const decimal qty3 = 4m;   // 4 x $25.000 = $100.000 neto + $0 IVA 0%

            const decimal expectedNet = 300000m;
            const decimal expectedIva21 = 21000m;
            const decimal expectedIva105 = 10500m;
            const decimal expectedTotal = 331500m;

            var taxAuditor = new TaxAuditor();
            var stockAuditor = new StockAuditor();
            var custAuditor = new CustomerAccountAuditor();
            var accountingAuditor = new AccountingAuditor();

            // ====================================================================
            // 2. ACT
            // ====================================================================

            // 2.1 Emitir Factura A con múltiples tasas de IVA
            var invoiceCmd = new CreateInvoiceCommand(
                InvoiceType: "A",
                PointOfSale: 1,
                OrderId: null,
                RemitoId: null,
                CustomerId: customer.Id,
                CustomerName: customer.LegalName,
                CustomerDocument: customer.DocumentNumber,
                CustomerTaxCondition: "ResponsableInscripto",
                CustomerAddress: "Parque Industrial Pilar Lote 14",
                DueDate: DateTime.UtcNow.AddDays(15),
                Currency: "ARS",
                ExchangeRate: 1m,
                Notes: "Factura multi-alícuota QA-SALE-004",
                Items: new List<InvoiceItemWriteDto>
                {
                    new(product21.Id, product21.Code, product21.Name, qty1, product21.UnitPrice, product21.VatRate),
                    new(product105.Id, product105.Code, product105.Name, qty2, product105.UnitPrice, product105.VatRate),
                    new(productExempt.Id, productExempt.Code, productExempt.Name, qty3, productExempt.UnitPrice, productExempt.VatRate)
                });

            var invoiceRes = await context.HttpClient.PostAsJsonAsync("/api/v1/sales/invoices", invoiceCmd);
            scenario.AddCheck(
                name: "Emisión de factura multi-alícuota responde 201 Created",
                module: Module,
                condition: invoiceRes.IsSuccessStatusCode,
                expected: "201 Created",
                actual: $"{(int)invoiceRes.StatusCode} {invoiceRes.StatusCode}");

            var invoice = await invoiceRes.Content.ReadFromJsonAsync<InvoiceDto>();
            if (invoice == null)
            {
                scenario.AddCheck("Deserialización de factura multi-alícuota", Module, false, "InvoiceDto no nulo", "null");
                return scenario;
            }

            // 2.2 Asiento Contable Automático
            var postPayload = new AutoPostInvoiceRequest(
                InvoiceId: invoice.Id,
                InvoiceNumber: invoice.FormattedNumber,
                CustomerName: invoice.CustomerName,
                Date: invoice.IssueDate,
                NetAmount: invoice.Subtotal,
                VatAmount: invoice.Iva21 + invoice.Iva105 + invoice.Iva27,
                TotalAmount: invoice.Total);

            var postRes = await context.HttpClient.PostAsJsonAsync("/api/v1/accounting/auto-post/invoice", postPayload);
            scenario.AddCheck(
                name: "Contabilización automática de factura multi-alícuota responde 200 OK",
                module: "Accounting",
                condition: postRes.IsSuccessStatusCode,
                expected: "200 OK",
                actual: $"{(int)postRes.StatusCode} {postRes.StatusCode}");

            // 2.3 Cobro Total en Efectivo
            var receiptPayload = new
            {
                accountId = cashAccount.Id,
                customerId = customer.Id,
                invoiceId = invoice.Id,
                amount = expectedTotal,
                currency = "ARS",
                receiptDateUtc = DateTime.UtcNow,
                description = $"Cobro total factura multi-alícuota {invoice.FormattedNumber}",
                lines = new[]
                {
                    new
                    {
                        method = "Cash",
                        amount = expectedTotal,
                        currency = "ARS",
                        accountId = cashAccount.Id
                    }
                }
            };

            var receiptRes = await context.HttpClient.PostAsJsonAsync("/api/v1/finance/collections", receiptPayload);
            scenario.AddCheck(
                name: "Registro de cobro factura multi-alícuota responde 200/201",
                module: "Finance",
                condition: receiptRes.IsSuccessStatusCode,
                expected: "200/201 OK",
                actual: $"{(int)receiptRes.StatusCode} {receiptRes.StatusCode}");

            // ====================================================================
            // 3. ASSERT & AUDITORES INDEPENDIENTES
            // ====================================================================

            // 3.1 Auditoría Impositiva (TaxAuditor)
            await taxAuditor.AuditInvoiceTaxesAsync(context, scenario, invoice.Id);

            scenario.AddCheck(
                name: "Base neta acumulada coincide con $300.000,00",
                module: Module,
                condition: invoice.Subtotal == expectedNet,
                expected: $"${expectedNet:N2}",
                actual: $"${invoice.Subtotal:N2}");

            scenario.AddCheck(
                name: "Discriminación IVA 21% coincide con $21.000,00",
                module: Module,
                condition: invoice.Iva21 == expectedIva21,
                expected: $"${expectedIva21:N2}",
                actual: $"${invoice.Iva21:N2}");

            scenario.AddCheck(
                name: "Discriminación IVA 10.5% coincide con $10.500,00",
                module: Module,
                condition: invoice.Iva105 == expectedIva105,
                expected: $"${expectedIva105:N2}",
                actual: $"${invoice.Iva105:N2}");

            scenario.AddCheck(
                name: "Total general coincide con $331.500,00",
                module: Module,
                condition: invoice.Total == expectedTotal,
                expected: $"${expectedTotal:N2}",
                actual: $"${invoice.Total:N2}");

            // 3.2 Auditoría de Stock en los 3 productos
            await stockAuditor.AuditProductStockAsync(context, scenario, product21.Id, expectedFinalStock: 50m - qty1);
            await stockAuditor.AuditProductStockAsync(context, scenario, product105.Id, expectedFinalStock: 50m - qty2);
            await stockAuditor.AuditProductStockAsync(context, scenario, productExempt.Id, expectedFinalStock: 50m - qty3);

            // 3.3 Auditoría de Saldo en Cuenta Corriente (Saldo final en cero)
            await custAuditor.AuditCustomerBalanceAsync(context, scenario, customer.Id, expectedBalance: 0m);

            // 3.4 Auditoría de Asiento Contable
            await accountingAuditor.AuditDocumentJournalEntryAsync(context, scenario, "Sales", invoice.Id.ToString(), expectedTotal);
        }
        catch (Exception ex)
        {
            scenario.AddCheck(
                name: "Ejecución de escenario sin excepciones no controladas",
                module: Module,
                condition: false,
                expected: "Sin excepción",
                actual: ex.GetType().Name,
                message: ex.ToString());
        }
        finally
        {
            sw.Stop();
            scenario.Duration = sw.Elapsed;
        }

        return scenario;
    }
}
