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

public sealed class QaSale003Scenario : ITestScenario
{
    public string Name => "QA-SALE-003: Nota de Crédito por Devolución de Mercadería";
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
            const decimal invoiceNet = 100000m;        // 10 x $10.000
            const decimal invoiceVat = 21000m;         // 21% de $100.000
            const decimal invoiceTotal = 121000m;      // $121.000
            const decimal stockAfterSale = 90m;        // 100 - 10

            const decimal returnedQuantity = 4m;
            const decimal ncNet = 40000m;              // 4 x $10.000
            const decimal ncVat = 8400m;               // 21% de $40.000
            const decimal ncTotal = 48400m;            // $48.400
            const decimal stockAfterReturn = 94m;      // 90 + 4 devueltas

            const decimal expectedNetBalance = 72600m; // $121.000 - $48.400

            var custAuditor = new CustomerAccountAuditor();
            var stockAuditor = new StockAuditor();
            var taxAuditor = new TaxAuditor();
            var accountingAuditor = new AccountingAuditor();

            // ====================================================================
            // 2. ACT
            // ====================================================================

            // 2.1 Emitir Factura A original
            var invoiceCmd = new CreateInvoiceCommand(
                InvoiceType: "A",
                PointOfSale: 1,
                OrderId: null,
                RemitoId: null,
                CustomerId: customer.Id,
                CustomerName: customer.LegalName,
                CustomerDocument: customer.DocumentNumber,
                CustomerTaxCondition: "ResponsableInscripto",
                CustomerAddress: "Av. Corrientes 1234",
                DueDate: DateTime.UtcNow.AddDays(30),
                Currency: "ARS",
                ExchangeRate: 1m,
                Notes: "Factura original QA-SALE-003",
                Items: new List<InvoiceItemWriteDto>
                {
                    new(product.Id, product.Code, product.Name, soldQuantity, product.UnitPrice, product.VatRate)
                });

            var invoiceRes = await context.HttpClient.PostAsJsonAsync("/api/v1/sales/invoices", invoiceCmd);
            scenario.AddCheck(
                name: "Emisión de factura de venta original responde 201",
                module: Module,
                condition: invoiceRes.IsSuccessStatusCode,
                expected: "201 Created",
                actual: $"{(int)invoiceRes.StatusCode} {invoiceRes.StatusCode}");

            var invoice = await invoiceRes.Content.ReadFromJsonAsync<InvoiceDto>();
            if (invoice == null)
            {
                scenario.AddCheck("Deserialización de factura original", Module, false, "InvoiceDto no nulo", "null");
                return scenario;
            }

            scenario.AddCheck(
                name: "Neto factura original coincide con $100.000",
                module: Module,
                condition: invoice.Subtotal == invoiceNet,
                expected: $"${invoiceNet:N2}",
                actual: $"${invoice.Subtotal:N2}");

            scenario.AddCheck(
                name: "IVA 21% factura original coincide con $21.000",
                module: Module,
                condition: invoice.Iva21 == invoiceVat,
                expected: $"${invoiceVat:N2}",
                actual: $"${invoice.Iva21:N2}");

            // Contabilizar Factura
            await context.HttpClient.PostAsJsonAsync("/api/v1/accounting/auto-post/invoice", new AutoPostInvoiceRequest(
                InvoiceId: invoice.Id,
                InvoiceNumber: invoice.FormattedNumber,
                CustomerName: invoice.CustomerName,
                Date: invoice.IssueDate,
                NetAmount: invoice.Subtotal,
                VatAmount: invoice.Iva21 + invoice.Iva105 + invoice.Iva27,
                TotalAmount: invoice.Total));

            // Validar stock tras factura (90 unidades)
            await stockAuditor.AuditProductStockAsync(context, scenario, product.Id, stockAfterSale);

            // Validar saldo deudor inicial ($121.000)
            await custAuditor.AuditCustomerBalanceAsync(context, scenario, customer.Id, expectedBalance: invoiceTotal);

            // 2.2 Emitir Nota de Crédito por Devolución de 4 unidades
            var ncCmd = new CreateInvoiceCommand(
                InvoiceType: "NC_A",
                PointOfSale: 1,
                OrderId: null,
                RemitoId: null,
                CustomerId: customer.Id,
                CustomerName: customer.LegalName,
                CustomerDocument: customer.DocumentNumber,
                CustomerTaxCondition: "ResponsableInscripto",
                CustomerAddress: "Av. Corrientes 1234",
                DueDate: DateTime.UtcNow,
                Currency: "ARS",
                ExchangeRate: 1m,
                Notes: $"Devolución parcial de mercadería s/factura {invoice.FormattedNumber}",
                Items: new List<InvoiceItemWriteDto>
                {
                    new(product.Id, product.Code, product.Name, returnedQuantity, product.UnitPrice, product.VatRate)
                });

            var ncRes = await context.HttpClient.PostAsJsonAsync("/api/v1/sales/invoices", ncCmd);
            scenario.AddCheck(
                name: "Emisión de Nota de Crédito por devolución responde 201",
                module: Module,
                condition: ncRes.IsSuccessStatusCode,
                expected: "201 Created",
                actual: $"{(int)ncRes.StatusCode} {ncRes.StatusCode}");

            var nc = await ncRes.Content.ReadFromJsonAsync<InvoiceDto>();
            if (nc == null)
            {
                scenario.AddCheck("Deserialización de Nota de Crédito", Module, false, "InvoiceDto no nulo", "null");
                return scenario;
            }

            scenario.AddCheck(
                name: "Neto Nota de Crédito coincide con $40.000",
                module: Module,
                condition: nc.Subtotal == ncNet,
                expected: $"${ncNet:N2}",
                actual: $"${nc.Subtotal:N2}");

            scenario.AddCheck(
                name: "IVA Nota de Crédito coincide con $8.400",
                module: Module,
                condition: nc.Iva21 == ncVat,
                expected: $"${ncVat:N2}",
                actual: $"${nc.Iva21:N2}");

            // Contabilizar Nota de Crédito
            var postNcRes = await context.HttpClient.PostAsJsonAsync("/api/v1/accounting/auto-post/invoice", new AutoPostInvoiceRequest(
                InvoiceId: nc.Id,
                InvoiceNumber: nc.FormattedNumber,
                CustomerName: nc.CustomerName,
                Date: nc.IssueDate,
                NetAmount: nc.Subtotal,
                VatAmount: nc.Iva21 + nc.Iva105 + nc.Iva27,
                TotalAmount: nc.Total));

            scenario.AddCheck(
                name: "Contabilización de Nota de Crédito responde 200/201",
                module: "Accounting",
                condition: postNcRes.IsSuccessStatusCode,
                expected: "200/201 OK",
                actual: $"{(int)postNcRes.StatusCode} {postNcRes.StatusCode}");

            // 2.3 Auditoría de Reintegro de Stock (+4 unidades devueltas = 94 unidades en depósito)
            await stockAuditor.AuditProductStockAsync(context, scenario, product.Id, stockAfterReturn);

            // 2.4 Auditoría de Cuenta Corriente (Saldo disminuido en $48.400 = $72.600 pendiente)
            await custAuditor.AuditCustomerBalanceAsync(context, scenario, customer.Id, expectedBalance: expectedNetBalance);

            // 2.5 Cobro del saldo neto final restante ($72.600)
            var finalReceiptPayload = new
            {
                accountId = cashAccount.Id,
                customerId = customer.Id,
                invoiceId = invoice.Id,
                amount = expectedNetBalance,
                currency = "ARS",
                receiptDateUtc = DateTime.UtcNow,
                description = $"Cobro saldo cancelatorio neto s/factura {invoice.FormattedNumber} deducida NC {nc.FormattedNumber}",
                lines = new[]
                {
                    new
                    {
                        method = "Cash",
                        amount = expectedNetBalance,
                        currency = "ARS",
                        accountId = cashAccount.Id
                    }
                }
            };

            var finalReceiptRes = await context.HttpClient.PostAsJsonAsync("/api/v1/finance/collections", finalReceiptPayload);
            scenario.AddCheck(
                name: "Cobranza de saldo neto resultante responde 200/201",
                module: "Finance",
                condition: finalReceiptRes.IsSuccessStatusCode,
                expected: "200/201 OK",
                actual: $"{(int)finalReceiptRes.StatusCode} {finalReceiptRes.StatusCode}");

            // 2.6 Saldo final de cliente = $0.00
            await custAuditor.AuditCustomerBalanceAsync(context, scenario, customer.Id, expectedBalance: 0m);

            // ====================================================================
            // 3. ASSERT & AUDITORES
            // ====================================================================
            await taxAuditor.AuditInvoiceTaxesAsync(context, scenario, nc.Id);
            await accountingAuditor.AuditDocumentJournalEntryAsync(context, scenario, "Sales", nc.Id.ToString(), ncTotal);
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
