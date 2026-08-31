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

public sealed class QaSale002Scenario : ITestScenario
{
    public string Name => "QA-SALE-002: Venta Cuenta Corriente y Cobranzas Parciales";
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
                initialStock: 50m,
                unitPrice: 20000m,
                costPrice: 12000m,
                vatRate: 21m);

            var cashAccount = await TestDataFactory.CreateCashAccountAsync(context);

            const decimal soldQuantity = 5m;
            const decimal expectedNet = 100000m;       // 5 x $20.000
            const decimal expectedVat = 21000m;        // 21% de $100.000
            const decimal expectedTotal = 121000m;     // $100.000 + $21.000
            const decimal expectedFinalStock = 45m;    // 50 - 5
            const decimal partialPayment1 = 60500m;    // 50% de $121.000
            const decimal partialPayment2 = 60500m;    // 50% restante

            var custAuditor = new CustomerAccountAuditor();
            var stockAuditor = new StockAuditor();
            var taxAuditor = new TaxAuditor();
            var accountingAuditor = new AccountingAuditor();

            // Saldo inicial debe ser estrictamente 0
            await custAuditor.AuditCustomerBalanceAsync(context, scenario, customer.Id, expectedBalance: 0m);

            // ====================================================================
            // 2. ACT
            // ====================================================================

            // 2.1 Emitir Factura de Venta a Plazo (Crédito 30 días)
            var invoiceCmd = new CreateInvoiceCommand(
                InvoiceType: "A",
                PointOfSale: 1,
                OrderId: null,
                RemitoId: null,
                CustomerId: customer.Id,
                CustomerName: customer.LegalName,
                CustomerDocument: customer.DocumentNumber,
                CustomerTaxCondition: "ResponsableInscripto",
                CustomerAddress: "Ruta 8 Km 50",
                DueDate: DateTime.UtcNow.AddDays(30),
                Currency: "ARS",
                ExchangeRate: 1m,
                Notes: "Venta a crédito generada por QA-SALE-002",
                Items: new List<InvoiceItemWriteDto>
                {
                    new(product.Id, product.Code, product.Name, soldQuantity, product.UnitPrice, product.VatRate)
                });

            var invoiceRes = await context.HttpClient.PostAsJsonAsync("/api/v1/sales/invoices", invoiceCmd);
            scenario.AddCheck(
                name: "Emisión de factura a crédito vía API responde 201 Created",
                module: Module,
                condition: invoiceRes.IsSuccessStatusCode,
                expected: "201 Created",
                actual: $"{(int)invoiceRes.StatusCode} {invoiceRes.StatusCode}");

            var invoice = await invoiceRes.Content.ReadFromJsonAsync<InvoiceDto>();
            if (invoice == null)
            {
                scenario.AddCheck("Deserialización de factura a crédito", Module, false, "InvoiceDto no nulo", "null");
                return scenario;
            }

            scenario.AddCheck(
                name: "Importe neto coincide con $100.000",
                module: Module,
                condition: invoice.Subtotal == expectedNet,
                expected: $"${expectedNet:N2}",
                actual: $"${invoice.Subtotal:N2}");

            scenario.AddCheck(
                name: "IVA 21% coincide con $21.000",
                module: Module,
                condition: invoice.Iva21 == expectedVat,
                expected: $"${expectedVat:N2}",
                actual: $"${invoice.Iva21:N2}");

            // 2.2 Contabilizar Factura
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
                actual: $"{(int)postRes.StatusCode} {postRes.StatusCode}");

            // Auditoría Inmediata: Saldo Deudor en Cuenta Corriente debe ser igual al Total Facturado
            await custAuditor.AuditCustomerBalanceAsync(context, scenario, customer.Id, expectedBalance: expectedTotal);

            // Auditoría Inmediata: Stock físico debe haber descontado las 5 unidades
            await stockAuditor.AuditProductStockAsync(context, scenario, product.Id, expectedFinalStock);

            // 2.3 Cobranza Parcial 1 (50% = $60.500)
            var receipt1Payload = new
            {
                accountId = cashAccount.Id,
                customerId = customer.Id,
                invoiceId = invoice.Id,
                amount = partialPayment1,
                currency = "ARS",
                receiptDateUtc = DateTime.UtcNow,
                description = $"Cobro parcial 1 s/factura {invoice.FormattedNumber}",
                lines = new[]
                {
                    new
                    {
                        method = "Cash",
                        amount = partialPayment1,
                        currency = "ARS",
                        accountId = cashAccount.Id
                    }
                }
            };

            var receipt1Res = await context.HttpClient.PostAsJsonAsync("/api/v1/finance/collections", receipt1Payload);
            scenario.AddCheck(
                name: "Registro de cobranza parcial 1 responde 200/201",
                module: "Finance",
                condition: receipt1Res.IsSuccessStatusCode,
                expected: "200/201 OK",
                actual: $"{(int)receipt1Res.StatusCode} {receipt1Res.StatusCode}");

            // Auditoría Posterior a Pago 1: Saldo debe ser exactamente el 50% restante ($60.500)
            await custAuditor.AuditCustomerBalanceAsync(context, scenario, customer.Id, expectedBalance: expectedTotal - partialPayment1);

            // 2.4 Cobranza Parcial 2 (50% final = $60.500 para cancelar saldo)
            var receipt2Payload = new
            {
                accountId = cashAccount.Id,
                customerId = customer.Id,
                invoiceId = invoice.Id,
                amount = partialPayment2,
                currency = "ARS",
                receiptDateUtc = DateTime.UtcNow,
                description = $"Cobro parcial 2 cancelatorio s/factura {invoice.FormattedNumber}",
                lines = new[]
                {
                    new
                    {
                        method = "Cash",
                        amount = partialPayment2,
                        currency = "ARS",
                        accountId = cashAccount.Id
                    }
                }
            };

            var receipt2Res = await context.HttpClient.PostAsJsonAsync("/api/v1/finance/collections", receipt2Payload);
            scenario.AddCheck(
                name: "Registro de cobranza parcial 2 responde 200/201",
                module: "Finance",
                condition: receipt2Res.IsSuccessStatusCode,
                expected: "200/201 OK",
                actual: $"{(int)receipt2Res.StatusCode} {receipt2Res.StatusCode}");

            // Auditoría Final: Saldo en Cuenta Corriente debe quedar en $0.00
            await custAuditor.AuditCustomerBalanceAsync(context, scenario, customer.Id, expectedBalance: 0m);

            // ====================================================================
            // 3. ASSERT & AUDITORES FINALES
            // ====================================================================
            await taxAuditor.AuditInvoiceTaxesAsync(context, scenario, invoice.Id);
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
