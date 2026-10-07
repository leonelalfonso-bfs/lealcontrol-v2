using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using LealControl.Modules.Finance.Infrastructure;
using Xunit;

namespace LealControl.Modules.Finance.Tests;

public sealed class CreateFinanceDocumentsHandlerTests : IClassFixture<FinanceWebApplicationFactory>
{
    private readonly FinanceWebApplicationFactory _factory;

    public CreateFinanceDocumentsHandlerTests(FinanceWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task Create_receipt_persists_confirmed_document()
    {
        var tenantId = FinanceWebApplicationFactory.DemoTenantId;
        var client = _factory.CreateAuthenticatedClient(tenantId);
        var accountId = Guid.NewGuid();

        await _factory.WithDbAsync(async db =>
        {
            db.Accounts.Add(new FinancialAccount
            {
                Id = accountId,
                TenantId = tenantId,
                Name = "Caja Application",
                Currency = "ARS",
                Type = FinancialAccountType.Cash,
                IsActive = true,
                CreatedAtUtc = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
        });

        var response = await client.PostAsJsonAsync("/api/v1/finance/collections", new
        {
            accountId,
            amount = 1500m,
            currency = "ARS",
            receiptDateUtc = DateTime.UtcNow,
            description = "Cobro capa aplicación"
        });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        doc.RootElement.GetProperty("status").GetString().Should().Be("Confirmed");
        doc.RootElement.GetProperty("receiptNumber").GetString().Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public async Task Receipt_computes_exchange_difference_per_dollar_invoice()
    {
        var tenantId = FinanceWebApplicationFactory.DemoTenantId;
        var client = _factory.CreateAuthenticatedClient(tenantId);
        var accountId = Guid.NewGuid();
        var invoiceId = Guid.NewGuid();
        await _factory.WithDbAsync(async db =>
        {
            db.Accounts.Add(new FinancialAccount
            {
                Id = accountId, TenantId = tenantId, Name = "Caja USD dif", Currency = "ARS",
                Type = FinancialAccountType.Cash, IsActive = true, CreatedAtUtc = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
        });

        // USD 90,91 cobrados a TC 1.100 sobre una factura a TC 1.000: diferencia 9.091.
        var response = await client.PostAsJsonAsync("/api/v1/finance/collections", new
        {
            accountId,
            amount = 100000m,
            currency = "ARS",
            receiptDateUtc = DateTime.UtcNow,
            description = "Cobro factura en dólares",
            imputations = new[]
            {
                new
                {
                    invoiceId, invoiceNumber = "0001-00000009", invoiceTotal = 121m, amountImputed = 100000m,
                    amountUsd = 90.91m, invoiceExchangeRate = 1000m, paymentExchangeRate = 1100m
                }
            }
        });
        response.StatusCode.Should().Be(HttpStatusCode.Created);

        await _factory.WithDbAsync(async db =>
        {
            var imputation = db.CollectionReceiptImputations.Single(x => x.InvoiceId == invoiceId);
            imputation.AmountUsd.Should().Be(90.91m);
            imputation.ExchangeDifferenceArs.Should().Be(9091m);
            await Task.CompletedTask;
        });
    }

    [Fact]
    public async Task Create_payment_order_persists_confirmed_document()
    {
        var tenantId = FinanceWebApplicationFactory.DemoTenantId;
        var client = _factory.CreateAuthenticatedClient(tenantId);

        var response = await client.PostAsJsonAsync("/api/v1/finance/payments", new
        {
            supplierName = "Proveedor Application",
            paymentDateUtc = DateTime.UtcNow,
            currency = "ARS",
            amount = 800m,
            notes = "Pago capa aplicación"
        });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        doc.RootElement.GetProperty("status").GetString().Should().Be("Confirmed");
        doc.RootElement.GetProperty("orderNumber").GetString().Should().NotBeNullOrWhiteSpace();
    }
}
