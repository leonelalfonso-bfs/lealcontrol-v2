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
