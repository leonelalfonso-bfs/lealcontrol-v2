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

public sealed class QaPurchase001Scenario : ITestScenario
{
    public string Name => "QA-PURCHASE-001: Compra Contado con Recepción y Factura";
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
                initialStock: 10m,
                unitPrice: 8000m,
                costPrice: 5000m,
                vatRate: 21m);

            var cashAccount = await TestDataFactory.CreateCashAccountAsync(context);

            const decimal purchasedQuantity = 20m;
            const decimal unitCost = 5000m;
            const decimal expectedNet = 100000m;       // 20 x $5.000
            const decimal expectedVat = 21000m;        // 21% de $100.000
            const decimal expectedTotal = 121000m;     // $121.000
            const decimal expectedFinalStock = 30m;    // 10 + 20

            var stockAuditor = new StockAuditor();
            var supplierAuditor = new SupplierAccountAuditor();
            var accountingAuditor = new AccountingAuditor();

            // ====================================================================
            // 2. ACT
            // ====================================================================

            // 2.1 Registrar Recepción Física de Mercadería (Remito de Proveedor)
            var receptionCmd = new CreatePurchaseReceptionCommand(
                PurchaseOrderId: null,
                PurchaseInvoiceId: null,
                SupplierId: supplier.Id,
                SupplierName: supplier.LegalName,
                SupplierRemitoNumber: "0001-00004567",
                ReceptionDate: DateTime.UtcNow,
                WarehouseLocation: "Depósito Central",
                ReceivedBy: "QA Recepcionista",
                Notes: "Recepción generada por QA-PURCHASE-001",
                Items: new List<PurchaseReceptionItemWrite>
                {
                    new(product.Id, product.Code, product.Name, purchasedQuantity, "u", null)
                });

            var recRes = await context.HttpClient.PostAsJsonAsync("/api/v1/purchases/receptions", receptionCmd);
            scenario.AddCheck(
                name: "Recepción de mercadería responde 201 Created",
                module: Module,
                condition: recRes.IsSuccessStatusCode,
                expected: "201 Created",
                actual: $"{(int)recRes.StatusCode} {recRes.StatusCode}");

            var reception = await recRes.Content.ReadFromJsonAsync<PurchaseReceptionDto>();
            if (reception == null)
            {
                scenario.AddCheck("Deserialización de recepción de mercadería", Module, false, "PurchaseReceptionDto no nulo", "null");
                return scenario;
            }

            // Auditoría Inmediata: El stock físico debe haber aumentado a 30
            await stockAuditor.AuditProductStockAsync(context, scenario, product.Id, expectedFinalStock);

            // 2.2 Registrar Factura de Proveedor vinculada a la recepción
            var invoiceCmd = new CreatePurchaseInvoiceCommand(
                InvoiceType: "A",
                PointOfSale: 12,
                InvoiceNumber: 99881,
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
                Cae: "74123456789012",
                CaeDueDate: DateTime.UtcNow.AddDays(10),
                Notes: "Factura de compra QA-PURCHASE-001",
                ArcaVoucherId: null,
                Items: new List<PurchaseInvoiceItemWrite>
                {
                    new(product.Id, product.Code, product.Name, purchasedQuantity, unitCost, 21m)
                });

            var invoiceRes = await context.HttpClient.PostAsJsonAsync("/api/v1/purchases/invoices", invoiceCmd);
            scenario.AddCheck(
                name: "Carga de factura de compra responde 200/201",
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
                name: "Neto de factura de compra coincide con $100.000",
                module: Module,
                condition: invoice.Subtotal == expectedNet,
                expected: $"${expectedNet:N2}",
                actual: $"${invoice.Subtotal:N2}");

            scenario.AddCheck(
                name: "IVA de factura de compra coincide con $21.000",
                module: Module,
                condition: invoice.Iva21 == expectedVat,
                expected: $"${expectedVat:N2}",
                actual: $"${invoice.Iva21:N2}");

            scenario.AddCheck(
                name: "Total de factura de compra coincide con $121.000",
                module: Module,
                condition: invoice.Total == expectedTotal,
                expected: $"${expectedTotal:N2}",
                actual: $"${invoice.Total:N2}");

            // 2.3 Contabilizar Asiento Automático de Compra
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
                name: "Contabilización automática de compra responde 200/201",
                module: "Accounting",
                condition: postRes.IsSuccessStatusCode,
                expected: "200/201 OK",
                actual: $"{(int)postRes.StatusCode} {postRes.StatusCode}");

            // Auditoría Inmediata: Saldo con el proveedor debe ser exactamente $121.000 pendiente de pago
            await supplierAuditor.AuditSupplierBalanceAsync(context, scenario, supplier.Id, expectedBalance: expectedTotal);

            // 2.4 Pago Contado Inmediato mediante Orden de Pago
            var paymentPayload = new
            {
                supplierId = supplier.Id,
                supplierName = supplier.LegalName,
                supplierTaxId = supplier.DocumentNumber,
                amount = expectedTotal,
                currency = "ARS",
                paymentDateUtc = DateTime.UtcNow,
                notes = $"Pago contado factura compra {invoice.FormattedNumber}",
                lines = new[]
                {
                    new
                    {
                        method = "Cash",
                        amount = expectedTotal,
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
                        amountImputed = invoice.Total
                    }
                }
            };

            var payRes = await context.HttpClient.PostAsJsonAsync("/api/v1/finance/payments", paymentPayload);
            scenario.AddCheck(
                name: "Emisión de orden de pago responde 200/201",
                module: "Finance",
                condition: payRes.IsSuccessStatusCode,
                expected: "200/201 OK",
                actual: $"{(int)payRes.StatusCode} {payRes.StatusCode}");

            // ====================================================================
            // 3. ASSERT & AUDITORES FINALES
            // ====================================================================

            // 3.1 Saldo final en cuenta corriente de proveedor debe ser $0.00
            await supplierAuditor.AuditSupplierBalanceAsync(context, scenario, supplier.Id, expectedBalance: 0m);

            // 3.2 Asiento contable de compra balanceado
            await accountingAuditor.AuditDocumentJournalEntryAsync(context, scenario, "Purchases", invoice.Id.ToString(), expectedTotal);

            // 3.3 Movimiento de egreso en caja
            var financeDb = context.GetService<FinanceDbContext>();
            var cashDebit = await financeDb.Movements.AsNoTracking()
                .FirstOrDefaultAsync(m => m.TenantId == context.TenantId.Value && m.AccountId == cashAccount.Id && m.Kind == FinancialMovementKind.Debit);

            scenario.AddCheck(
                name: "Egreso de tesorería registrado en Caja Efectivo por $121.000",
                module: "Finance",
                condition: cashDebit != null && cashDebit.Amount == expectedTotal,
                expected: $"Débito/Egreso por ${expectedTotal:N2}",
                actual: cashDebit != null ? $"{cashDebit.Kind} por ${cashDebit.Amount:N2}" : "Sin movimiento registrado");
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
