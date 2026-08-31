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

public sealed class QaSale001Scenario : ITestScenario
{
    public string Name => "QA-SALE-001: Venta Contado Completa";
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
            var product = await TestDataFactory.CreateProductAsync(
                context,
                initialStock: 100m,
                unitPrice: 10000m,
                costPrice: 6000m,
                vatRate: 21m);

            var cashAccount = await TestDataFactory.CreateCashAccountAsync(context);

            const decimal soldQuantity = 10m;
            const decimal expectedNet = 100000m;      // 10 x $10.000
            const decimal expectedVat = 21000m;       // 21% de $100.000
            const decimal expectedTotal = 121000m;    // $100.000 + $21.000
            const decimal expectedFinalStock = 90m;   // 100 - 10

            // ====================================================================
            // 2. ACT
            // ====================================================================

            // 2.1 Emitir Factura de Venta Directa (Venta de Mostrador)
            var invoiceCmd = new CreateInvoiceCommand(
                InvoiceType: "A",
                PointOfSale: 1,
                OrderId: null,
                RemitoId: null,
                CustomerId: customer.Id,
                CustomerName: customer.LegalName,
                CustomerDocument: customer.DocumentNumber,
                CustomerTaxCondition: "ResponsableInscripto",
                CustomerAddress: "Calle Falsa 123",
                DueDate: DateTime.UtcNow.AddDays(30),
                Currency: "ARS",
                ExchangeRate: 1m,
                Notes: "Venta contado generada por QA-SALE-001",
                Items: new List<InvoiceItemWriteDto>
                {
                    new(product.Id, product.Code, product.Name, soldQuantity, product.UnitPrice, product.VatRate)
                });

            var invoiceRes = await context.HttpClient.PostAsJsonAsync("/api/v1/sales/invoices", invoiceCmd);
            scenario.AddCheck(
                name: "Emisión de comprobante de venta vía API REST responde 201 Created",
                module: Module,
                condition: invoiceRes.IsSuccessStatusCode,
                expected: "201 Created",
                actual: $"{(int)invoiceRes.StatusCode} {invoiceRes.StatusCode}",
                message: "La factura de venta debe crearse satisfactoriamente.");

            var invoice = await invoiceRes.Content.ReadFromJsonAsync<InvoiceDto>();
            if (invoice == null)
            {
                scenario.AddCheck("Deserialización de comprobante de venta", Module, false, "InvoiceDto no nulo", "null");
                return scenario;
            }

            // 2.2 Registrar Recibo de Cobranza Contado Inmediato
            var receiptPayload = new
            {
                accountId = cashAccount.Id,
                customerId = customer.Id,
                invoiceId = invoice.Id,
                amount = expectedTotal,
                currency = "ARS",
                receiptDateUtc = DateTime.UtcNow,
                description = $"Cobro contado factura {invoice.FormattedNumber}",
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
                name: "Registro de recibo de cobro contado vía API REST responde 200 OK",
                module: "Finance",
                condition: receiptRes.IsSuccessStatusCode,
                expected: "200 OK",
                actual: $"{(int)receiptRes.StatusCode} {receiptRes.StatusCode}",
                message: "El cobro de la venta contado debe registrarse en tesorería.");

            // 2.3 Contabilizar Asiento Automático de la Factura
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
                name: "Contabilización automática de factura responde 200 OK",
                module: "Accounting",
                condition: postRes.IsSuccessStatusCode,
                expected: "200 OK",
                actual: $"{(int)postRes.StatusCode} {postRes.StatusCode}",
                message: "El motor contable debe asentar la venta en el libro diario.");

            // ====================================================================
            // 3. ASSERT & AUDITORES INDEPENDIENTES
            // ====================================================================

            // 3.1 Auditoría de Impuestos y Facturación
            var taxAuditor = new TaxAuditor();
            await taxAuditor.AuditInvoiceTaxesAsync(context, scenario, invoice.Id);

            scenario.AddCheck(
                name: "Importe neto de factura coincide con cálculo esperado",
                module: Module,
                condition: invoice.Subtotal == expectedNet,
                expected: $"${expectedNet:N2}",
                actual: $"${invoice.Subtotal:N2}",
                entity: "Invoice",
                entityId: invoice.Id.ToString());

            scenario.AddCheck(
                name: "IVA 21% de factura coincide con cálculo esperado",
                module: Module,
                condition: invoice.Iva21 == expectedVat,
                expected: $"${expectedVat:N2}",
                actual: $"${invoice.Iva21:N2}",
                entity: "Invoice",
                entityId: invoice.Id.ToString());

            scenario.AddCheck(
                name: "Importe total de factura coincide con cálculo esperado",
                module: Module,
                condition: invoice.Total == expectedTotal,
                expected: $"${expectedTotal:N2}",
                actual: $"${invoice.Total:N2}",
                entity: "Invoice",
                entityId: invoice.Id.ToString());

            // 3.2 Auditoría de Stock y Kardex
            var stockAuditor = new StockAuditor();
            await stockAuditor.AuditProductStockAsync(context, scenario, product.Id, expectedFinalStock);

            // 3.3 Auditoría de Cuenta Corriente (Saldo Cliente == 0 en venta contado)
            var custAuditor = new CustomerAccountAuditor();
            await custAuditor.AuditCustomerBalanceAsync(context, scenario, customer.Id, expectedBalance: 0m);

            // 3.4 Auditoría de Tesorería (Movimiento de caja)
            var financeDb = context.GetService<FinanceDbContext>();
            var cashMovement = await financeDb.Movements.AsNoTracking().FirstOrDefaultAsync(m => m.TenantId == context.TenantId.Value && m.AccountId == cashAccount.Id);

            scenario.AddCheck(
                name: "Movimiento de tesorería registrado en Caja Efectivo",
                module: "Finance",
                condition: cashMovement != null && cashMovement.Amount == expectedTotal && cashMovement.Kind == FinancialMovementKind.Credit,
                expected: $"Crédito por ${expectedTotal:N2}",
                actual: cashMovement != null ? $"{cashMovement.Kind} por ${cashMovement.Amount:N2}" : "Sin movimiento registrado",
                entity: "FinancialMovement",
                entityId: cashAccount.Id.ToString());

            // 3.5 Auditoría de Contabilidad (Asiento balanceado)
            var accountingAuditor = new AccountingAuditor();
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


