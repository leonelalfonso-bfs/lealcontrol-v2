using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Net.Http.Json;
using System.Threading.Tasks;
using LealControl.Modules.Accounting.Infrastructure;
using LealControl.Modules.Finance.Infrastructure;
using LealControl.Modules.Sales.Application.Purchases;
using LealControl.QA.Auditors;
using LealControl.QA.Factories;
using LealControl.QA.Infrastructure;
using LealControl.QA.Models;
using Microsoft.EntityFrameworkCore;

namespace LealControl.QA.Scenarios.Purchases;

public sealed class QaPurchase003Scenario : ITestScenario
{
    public string Name => "QA-PURCHASE-003: Nota de Crédito de Proveedor";
    public string Module => "Purchases";

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

            var supplier = await TestDataFactory.CreateSupplierAsync(context);
            var product = await TestDataFactory.CreateProductAsync(
                context,
                initialStock: 20m,
                unitPrice: 15000m,
                costPrice: 10000m,
                vatRate: 21m);

            var cashAccount = await TestDataFactory.CreateCashAccountAsync(context, "Caja QA-PURCHASE-003 Efectivo");

            const decimal purchasedQuantity = 10m;
            const decimal returnedQuantity = 3m;
            const decimal unitCost = 10000m;

            const decimal invoiceNet = 100000m;        // 10 x $10.000
            const decimal invoiceVat = 21000m;         // 21% de $100.000
            const decimal invoiceTotal = 121000m;      // $121.000

            const decimal ncNet = 30000m;              // 3 x $10.000
            const decimal ncVat = 6300m;               // 21% de $30.000
            const decimal ncTotal = 36300m;            // $36.300

            const decimal expectedRemainingPayable = 84700m; // $121.000 - $36.300

            var supplierAuditor = new SupplierAccountAuditor();
            var accountingAuditor = new AccountingAuditor();

            // Saldo inicial proveedor = $0.00
            await supplierAuditor.AuditSupplierBalanceAsync(context, scenario, supplier.Id, expectedBalance: 0m);

            // ====================================================================
            // 2. ACT
            // ====================================================================

            // 2.1 Factura de Compra original
            var invoiceCmd = new CreatePurchaseInvoiceCommand(
                InvoiceType: "A",
                PointOfSale: 10,
                InvoiceNumber: 55441,
                PurchaseOrderId: null,
                PurchaseReceptionId: null,
                SupplierId: supplier.Id,
                SupplierName: supplier.LegalName,
                SupplierDocument: supplier.DocumentNumber,
                SupplierTaxCondition: "ResponsableInscripto",
                IssueDate: DateTime.UtcNow,
                DueDate: DateTime.UtcNow.AddDays(30),
                Currency: "ARS",
                ExchangeRate: 1m,
                IibbPerception: 0m,
                IvaPerception: 0m,
                OtherTaxes: 0m,
                Cae: "74888999000111",
                CaeDueDate: DateTime.UtcNow.AddDays(10),
                Notes: "Factura original QA-PURCHASE-003",
                ArcaVoucherId: null,
                Items: new List<PurchaseInvoiceItemWrite>
                {
                    new(product.Id, product.Code, product.Name, purchasedQuantity, unitCost, 21m)
                });

            var invoiceRes = await context.HttpClient.PostAsJsonAsync("/api/v1/purchases/invoices", invoiceCmd);
            scenario.AddCheck(
                name: "Carga de factura original de compra responde 200/201",
                module: Module,
                condition: invoiceRes.IsSuccessStatusCode,
                expected: "200/201 OK",
                actual: $"{(int)invoiceRes.StatusCode} {invoiceRes.StatusCode}");

            var invoice = await invoiceRes.Content.ReadFromJsonAsync<PurchaseInvoiceDto>();
            if (invoice == null)
            {
                scenario.AddCheck("Deserialización de factura original", Module, false, "PurchaseInvoiceDto no nulo", "null");
                return scenario;
            }

            scenario.AddCheck(
                name: "Neto factura original coincide con $100.000",
                module: Module,
                condition: invoice.Subtotal == invoiceNet,
                expected: $"${invoiceNet:N2}",
                actual: $"${invoice.Subtotal:N2}");

            scenario.AddCheck(
                name: "IVA factura original coincide con $21.000",
                module: Module,
                condition: invoice.Iva21 == invoiceVat,
                expected: $"${invoiceVat:N2}",
                actual: $"${invoice.Iva21:N2}");

            // Contabilizar factura original
            await context.HttpClient.PostAsJsonAsync("/api/v1/accounting/auto-post/purchase", new AutoPostPurchaseRequest(
                PurchaseId: invoice.Id,
                InvoiceNumber: invoice.FormattedNumber,
                SupplierName: invoice.SupplierName,
                Date: invoice.IssueDate,
                NetAmount: invoice.Subtotal,
                VatAmount: invoice.Iva21 + invoice.Iva105 + invoice.Iva27,
                TotalAmount: invoice.Total,
                InvoiceType: invoice.InvoiceType));

            // Saldo adeudado inicial = $121.000
            await supplierAuditor.AuditSupplierBalanceAsync(context, scenario, supplier.Id, expectedBalance: invoiceTotal);

            // 2.2 Nota de Crédito de Proveedor por devolución de 3 unidades
            var ncCmd = new CreatePurchaseInvoiceCommand(
                InvoiceType: "NC_A",
                PointOfSale: 10,
                InvoiceNumber: 2211,
                PurchaseOrderId: null,
                PurchaseReceptionId: null,
                SupplierId: supplier.Id,
                SupplierName: supplier.LegalName,
                SupplierDocument: supplier.DocumentNumber,
                SupplierTaxCondition: "ResponsableInscripto",
                IssueDate: DateTime.UtcNow,
                DueDate: DateTime.UtcNow,
                Currency: "ARS",
                ExchangeRate: 1m,
                IibbPerception: 0m,
                IvaPerception: 0m,
                OtherTaxes: 0m,
                Cae: "74999000111222",
                CaeDueDate: DateTime.UtcNow.AddDays(10),
                Notes: $"Nota de crédito recibida por devolución s/factura {invoice.FormattedNumber}",
                ArcaVoucherId: null,
                Items: new List<PurchaseInvoiceItemWrite>
                {
                    new(product.Id, product.Code, product.Name, returnedQuantity, unitCost, 21m)
                });

            var ncRes = await context.HttpClient.PostAsJsonAsync("/api/v1/purchases/invoices", ncCmd);
            scenario.AddCheck(
                name: "Carga de Nota de Crédito de proveedor responde 200/201",
                module: Module,
                condition: ncRes.IsSuccessStatusCode,
                expected: "200/201 OK",
                actual: $"{(int)ncRes.StatusCode} {ncRes.StatusCode}");

            var nc = await ncRes.Content.ReadFromJsonAsync<PurchaseInvoiceDto>();
            if (nc == null)
            {
                scenario.AddCheck("Deserialización de Nota de Crédito de proveedor", Module, false, "PurchaseInvoiceDto no nulo", "null");
                return scenario;
            }

            scenario.AddCheck(
                name: "Neto Nota de Crédito coincide con $30.000",
                module: Module,
                condition: nc.Subtotal == ncNet,
                expected: $"${ncNet:N2}",
                actual: $"${nc.Subtotal:N2}");

            scenario.AddCheck(
                name: "IVA Nota de Crédito coincide con $6.300",
                module: Module,
                condition: nc.Iva21 == ncVat,
                expected: $"${ncVat:N2}",
                actual: $"${nc.Iva21:N2}");

            // Contabilizar Nota de Crédito
            var postNcRes = await context.HttpClient.PostAsJsonAsync("/api/v1/accounting/auto-post/purchase", new AutoPostPurchaseRequest(
                PurchaseId: nc.Id,
                InvoiceNumber: nc.FormattedNumber,
                SupplierName: nc.SupplierName,
                Date: nc.IssueDate,
                NetAmount: nc.Subtotal,
                VatAmount: nc.Iva21 + nc.Iva105 + nc.Iva27,
                TotalAmount: nc.Total,
                InvoiceType: nc.InvoiceType));

            scenario.AddCheck(
                name: "Contabilización de Nota de Crédito de proveedor responde 200/201",
                module: "Accounting",
                condition: postNcRes.IsSuccessStatusCode,
                expected: "200/201 OK",
                actual: $"{(int)postNcRes.StatusCode} {postNcRes.StatusCode}");

            // 2.3 Auditoría de Cuenta Corriente: Saldo disminuido automáticamente en $36.300 ($84.700 pendiente)
            await supplierAuditor.AuditSupplierBalanceAsync(context, scenario, supplier.Id, expectedBalance: expectedRemainingPayable);

            // 2.4 Pago cancelatorio del saldo neto resultante ($84.700)
            var finalPayPayload = new
            {
                supplierId = supplier.Id,
                supplierName = supplier.LegalName,
                supplierTaxId = supplier.DocumentNumber,
                amount = expectedRemainingPayable,
                currency = "ARS",
                paymentDateUtc = DateTime.UtcNow,
                notes = $"Pago saldo neto compra {invoice.FormattedNumber} deducida NC {nc.FormattedNumber}",
                lines = new[]
                {
                    new
                    {
                        method = "Cash",
                        amount = expectedRemainingPayable,
                        currency = "ARS",
                        accountId = cashAccount.Id
                    }
                },
                imputations = new[]
                {
                    new
                    {
                        purchaseInvoiceId = invoice.Id,
                        invoiceNumber = invoice.FormattedNumber,
                        invoiceTotal = invoice.Total,
                        amountImputed = expectedRemainingPayable
                    }
                }
            };

            var finalPayRes = await context.HttpClient.PostAsJsonAsync("/api/v1/finance/payments", finalPayPayload);
            scenario.AddCheck(
                name: "Pago cancelatorio neto responde 200/201",
                module: "Finance",
                condition: finalPayRes.IsSuccessStatusCode,
                expected: "200/201 OK",
                actual: $"{(int)finalPayRes.StatusCode} {finalPayRes.StatusCode}");

            // 2.5 Saldo final en cuenta corriente de proveedor debe ser $0.00
            await supplierAuditor.AuditSupplierBalanceAsync(context, scenario, supplier.Id, expectedBalance: 0m);

            // ====================================================================
            // 3. ASSERT & AUDITORES
            // ====================================================================
            await accountingAuditor.AuditDocumentJournalEntryAsync(context, scenario, "Purchases", nc.Id.ToString(), ncTotal);
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
