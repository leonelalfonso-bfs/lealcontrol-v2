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

public sealed class QaPurchase002Scenario : ITestScenario
{
    public string Name => "QA-PURCHASE-002: Compra a Crédito y Pagos Parciales";
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
                initialStock: 50m,
                unitPrice: 15000m,
                costPrice: 10000m,
                vatRate: 21m);

            var cashAccount = await TestDataFactory.CreateCashAccountAsync(context, "Caja QA-PURCHASE-002 Efectivo");

            const decimal purchasedQuantity = 10m;
            const decimal unitCost = 10000m;
            const decimal expectedNet = 100000m;       // 10 x $10.000
            const decimal expectedVat = 21000m;        // 21% de $100.000
            const decimal expectedTotal = 121000m;     // $121.000
            const decimal expectedFinalStock = 60m;    // 50 + 10
            const decimal partialPayment1 = 60500m;    // 50%
            const decimal partialPayment2 = 60500m;    // 50%

            var stockAuditor = new StockAuditor();
            var supplierAuditor = new SupplierAccountAuditor();
            var accountingAuditor = new AccountingAuditor();

            // Saldo inicial proveedor = $0.00
            await supplierAuditor.AuditSupplierBalanceAsync(context, scenario, supplier.Id, expectedBalance: 0m);

            // ====================================================================
            // 2. ACT
            // ====================================================================

            // 2.1 Recepción de mercadería
            var receptionCmd = new CreatePurchaseReceptionCommand(
                PurchaseOrderId: null,
                PurchaseInvoiceId: null,
                SupplierId: supplier.Id,
                SupplierName: supplier.LegalName,
                SupplierRemitoNumber: "0001-00008888",
                ReceptionDate: DateTime.UtcNow,
                WarehouseLocation: "Depósito Central",
                ReceivedBy: "QA Auditor",
                Notes: "Recepción por QA-PURCHASE-002",
                Items: new List<PurchaseReceptionItemWrite>
                {
                    new(product.Id, product.Code, product.Name, purchasedQuantity, "u", null)
                });

            var recRes = await context.HttpClient.PostAsJsonAsync("/api/v1/purchases/receptions", receptionCmd);
            scenario.AddCheck(
                name: "Recepción de mercadería a crédito responde 201 Created",
                module: Module,
                condition: recRes.IsSuccessStatusCode,
                expected: "201 Created",
                actual: $"{(int)recRes.StatusCode} {recRes.StatusCode}");

            var reception = await recRes.Content.ReadFromJsonAsync<PurchaseReceptionDto>();
            if (reception == null)
            {
                scenario.AddCheck("Deserialización de recepción", Module, false, "PurchaseReceptionDto no nulo", "null");
                return scenario;
            }

            // Stock incrementado a 60
            await stockAuditor.AuditProductStockAsync(context, scenario, product.Id, expectedFinalStock);

            // 2.2 Factura de compra a 30 días plazo
            var invoiceCmd = new CreatePurchaseInvoiceCommand(
                InvoiceType: "A",
                PointOfSale: 15,
                InvoiceNumber: 77112,
                PurchaseOrderId: null,
                PurchaseReceptionId: reception.Id,
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
                Cae: "74333444555666",
                CaeDueDate: DateTime.UtcNow.AddDays(10),
                Notes: "Factura compra a crédito QA-PURCHASE-002",
                ArcaVoucherId: null,
                Items: new List<PurchaseInvoiceItemWrite>
                {
                    new(product.Id, product.Code, product.Name, purchasedQuantity, unitCost, 21m)
                });

            var invoiceRes = await context.HttpClient.PostAsJsonAsync("/api/v1/purchases/invoices", invoiceCmd);
            scenario.AddCheck(
                name: "Carga de factura de compra a crédito responde 200/201",
                module: Module,
                condition: invoiceRes.IsSuccessStatusCode,
                expected: "200/201 OK",
                actual: $"{(int)invoiceRes.StatusCode} {invoiceRes.StatusCode}");

            var invoice = await invoiceRes.Content.ReadFromJsonAsync<PurchaseInvoiceDto>();
            if (invoice == null)
            {
                scenario.AddCheck("Deserialización de factura de compra", Module, false, "PurchaseInvoiceDto no nulo", "null");
                return scenario;
            }

            scenario.AddCheck(
                name: "Neto de compra a crédito coincide con $100.000",
                module: Module,
                condition: invoice.Subtotal == expectedNet,
                expected: $"${expectedNet:N2}",
                actual: $"${invoice.Subtotal:N2}");

            scenario.AddCheck(
                name: "IVA de compra a crédito coincide con $21.000",
                module: Module,
                condition: invoice.Iva21 == expectedVat,
                expected: $"${expectedVat:N2}",
                actual: $"${invoice.Iva21:N2}");

            // 2.3 Contabilización automática
            var postPayload = new AutoPostPurchaseRequest(
                PurchaseId: invoice.Id,
                InvoiceNumber: invoice.FormattedNumber,
                SupplierName: invoice.SupplierName,
                Date: invoice.IssueDate,
                NetAmount: invoice.Subtotal,
                VatAmount: invoice.Iva21 + invoice.Iva105 + invoice.Iva27,
                TotalAmount: invoice.Total);

            var postRes = await context.HttpClient.PostAsJsonAsync("/api/v1/accounting/auto-post/purchase", postPayload);
            scenario.AddCheck(
                name: "Contabilización de compra a crédito responde 200/201",
                module: "Accounting",
                condition: postRes.IsSuccessStatusCode,
                expected: "200/201 OK",
                actual: $"{(int)postRes.StatusCode} {postRes.StatusCode}");

            // Auditoría Inmediata: Saldo a pagar al proveedor = $121.000
            await supplierAuditor.AuditSupplierBalanceAsync(context, scenario, supplier.Id, expectedBalance: expectedTotal);

            // 2.4 Pago Parcial 1 (50% = $60.500)
            var pay1Payload = new
            {
                supplierId = supplier.Id,
                supplierName = supplier.LegalName,
                supplierTaxId = supplier.DocumentNumber,
                amount = partialPayment1,
                currency = "ARS",
                paymentDateUtc = DateTime.UtcNow,
                notes = $"Pago parcial 1 compra {invoice.FormattedNumber}",
                lines = new[]
                {
                    new
                    {
                        method = "Cash",
                        amount = partialPayment1,
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
                        amountImputed = partialPayment1
                    }
                }
            };

            var pay1Res = await context.HttpClient.PostAsJsonAsync("/api/v1/finance/payments", pay1Payload);
            scenario.AddCheck(
                name: "Pago parcial 1 responde 200/201",
                module: "Finance",
                condition: pay1Res.IsSuccessStatusCode,
                expected: "200/201 OK",
                actual: $"{(int)pay1Res.StatusCode} {pay1Res.StatusCode}");

            // Auditoría Posterior a Pago 1: Saldo restante = $60.500
            await supplierAuditor.AuditSupplierBalanceAsync(context, scenario, supplier.Id, expectedBalance: expectedTotal - partialPayment1);

            // 2.5 Pago Parcial 2 Cancelatorio (50% final = $60.500)
            var pay2Payload = new
            {
                supplierId = supplier.Id,
                supplierName = supplier.LegalName,
                supplierTaxId = supplier.DocumentNumber,
                amount = partialPayment2,
                currency = "ARS",
                paymentDateUtc = DateTime.UtcNow,
                notes = $"Pago cancelatorio compra {invoice.FormattedNumber}",
                lines = new[]
                {
                    new
                    {
                        method = "Cash",
                        amount = partialPayment2,
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
                        amountImputed = partialPayment2
                    }
                }
            };

            var pay2Res = await context.HttpClient.PostAsJsonAsync("/api/v1/finance/payments", pay2Payload);
            scenario.AddCheck(
                name: "Pago cancelatorio responde 200/201",
                module: "Finance",
                condition: pay2Res.IsSuccessStatusCode,
                expected: "200/201 OK",
                actual: $"{(int)pay2Res.StatusCode} {pay2Res.StatusCode}");

            // ====================================================================
            // 3. ASSERT & AUDITORES FINALES
            // ====================================================================

            // Saldo final en cuenta corriente de proveedor = $0.00
            await supplierAuditor.AuditSupplierBalanceAsync(context, scenario, supplier.Id, expectedBalance: 0m);

            // Asiento contable balanceado
            await accountingAuditor.AuditDocumentJournalEntryAsync(context, scenario, "Purchases", invoice.Id.ToString(), expectedTotal);
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
