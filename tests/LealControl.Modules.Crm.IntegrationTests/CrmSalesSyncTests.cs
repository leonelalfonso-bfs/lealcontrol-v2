using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LealControl.Modules.Sales.Domain.Orders;
using LealControl.Modules.Sales.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>
/// Sincronización bidireccional CRM ↔ Ventas:
/// - Enviar presupuesto avanza la oportunidad a Propuesta y actualiza el monto.
/// - Aceptar presupuesto avanza a Negociación.
/// - Confirmar pedido (incluso creado directo) gana la oportunidad; bloquear Perdida mientras haya pedido activo.
/// - Anular el único pedido reabre la oportunidad a Negociación.
/// - sales-chain devuelve presupuestos y pedidos; sync-with-sales corrige oportunidades desfasadas.
/// </summary>
public sealed class CrmSalesSyncTests : IAsyncLifetime
{
    private readonly CrmWebApplicationFactory _factory = new();
    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, $"{(int)response.StatusCode}: {body}");
        return JsonDocument.Parse(body).RootElement.Clone();
    }

    private async Task<JsonElement> GetOpportunityAsync(HttpClient client, Guid oppId)
    {
        var list = await Json(await client.GetAsync("/api/v1/crm/opportunities"));
        return list.EnumerateArray().First(o => o.GetProperty("id").GetGuid() == oppId);
    }

    [Fact]
    public async Task Syncs_quote_and_order_lifecycle_bidirectionally_and_repairs_desynced_opportunities()
    {
        using var client = _factory.CreateAuthenticatedClient();

        // 1) Cliente + Oportunidad abierta en Lead (Por cotizar).
        var customer = await Json(await client.PostAsJsonAsync("/api/v1/crm/customers", new
        {
            legalName = "Industrias Bidireccionales SA",
            documentType = "Cuit",
            documentNumber = "30712345671",
            taxCondition = "ResponsableInscripto",
            isCustomer = true
        }));
        var customerId = customer.GetProperty("id").GetGuid();

        var opp = await Json(await client.PostAsJsonAsync("/api/v1/crm/opportunities", new
        {
            title = "Balanza tolva 30t",
            customerId,
            currency = "ARS"
        }));
        var oppId = opp.GetProperty("id").GetGuid();
        Assert.Equal("Lead", opp.GetProperty("stage").GetString());

        // 2) Crear presupuesto desde la oportunidad, cargar ítem y enviarlo → avanza a Proposal y actualiza monto.
        var quote = await Json(await client.PostAsJsonAsync($"/api/v1/sales/quotes/from-opportunity/{oppId}", new { }));
        var quoteId = quote.GetProperty("id").GetGuid();

        var updatedQuote = await Json(await client.PutAsJsonAsync($"/api/v1/sales/quotes/{quoteId}", new
        {
            customerId,
            currency = "ARS",
            validDays = 15,
            lines = new[]
            {
                new { description = "Balanza tolva 30t", quantity = 1m, unitPrice = 500000m, discountPercent = 0m, taxRate = 21m, isOptional = false }
            }
        }));
        var expectedTotal = updatedQuote.GetProperty("total").GetDecimal();
        Assert.True(expectedTotal > 0m);

        await Json(await client.PostAsync($"/api/v1/sales/quotes/{quoteId}/send", null));
        var oppAfterSend = await GetOpportunityAsync(client, oppId);
        Assert.Equal("Proposal", oppAfterSend.GetProperty("stage").GetString());
        Assert.Equal(expectedTotal, oppAfterSend.GetProperty("amount").GetDecimal());

        // 3) Aceptar presupuesto → avanza a Negotiation.
        await Json(await client.PostAsync($"/api/v1/sales/quotes/{quoteId}/accept", null));
        var oppAfterAccept = await GetOpportunityAsync(client, oppId);
        Assert.Equal("Negotiation", oppAfterAccept.GetProperty("stage").GetString());

        // 4) Crear pedido directo en borrador vinculado a la oportunidad y confirmarlo → oportunidad pasa a Won.
        var order = await Json(await client.PostAsJsonAsync("/api/v1/sales/orders", new
        {
            customerId,
            opportunityId = oppId,
            currency = "ARS",
            exchangeRateUsdBillete = 1500m,
            exchangeRateUsdDivisa = 1480m,
            discountPercent = 0m,
            lines = new[]
            {
                new { description = "Balanza tolva 30t", quantity = 1m, unitPrice = 480000m, currencyCode = "ARS", discountPercent = 0m, taxRate = 21m, isOptional = false }
            }
        }));
        var orderId = order.GetProperty("id").GetGuid();
        var orderTotal = order.GetProperty("total").GetDecimal();

        await Json(await client.PutAsJsonAsync($"/api/v1/sales/orders/{orderId}/status", new { status = "Confirmed" }));
        var oppAfterConfirm = await GetOpportunityAsync(client, oppId);
        Assert.Equal("Won", oppAfterConfirm.GetProperty("stage").GetString());
        Assert.Equal(orderTotal, oppAfterConfirm.GetProperty("amount").GetDecimal());

        // 5) Mientras el pedido esté activo, NO se puede marcar manualmente la oportunidad como Perdida.
        var lostAttempt = await client.PostAsJsonAsync($"/api/v1/crm/opportunities/{oppId}/move", new
        {
            stage = "Lost",
            lostReason = "Intento indebido"
        });
        Assert.Equal(HttpStatusCode.BadRequest, lostAttempt.StatusCode);

        // 6) sales-chain expone tanto el presupuesto como el pedido.
        var chain = await Json(await client.GetAsync($"/api/v1/crm/opportunities/{oppId}/sales-chain"));
        Assert.Single(chain.GetProperty("quotes").EnumerateArray());
        Assert.Single(chain.GetProperty("orders").EnumerateArray());

        // 7) Anular el único pedido → reabre la oportunidad a Negotiation.
        await Json(await client.PutAsJsonAsync($"/api/v1/sales/orders/{orderId}/status", new { status = "Cancelled" }));
        var oppAfterCancel = await GetOpportunityAsync(client, oppId);
        Assert.Equal("Negotiation", oppAfterCancel.GetProperty("stage").GetString());

        // 8) Reparador idempotente sync-with-sales: si existe una oportunidad abierta con pedido confirmado en DB, la pasa a Won.
        var desyncedOpp = await Json(await client.PostAsJsonAsync("/api/v1/crm/opportunities", new
        {
            title = "Oportunidad histórica desfasada",
            customerId,
            currency = "ARS"
        }));
        var desyncedOppId = desyncedOpp.GetProperty("id").GetGuid();

        await using (var sales = new SalesDbContext(new DbContextOptionsBuilder<SalesDbContext>().UseNpgsql(_factory.DatabaseConnectionString).Options))
        {
            var legacyOrder = Order.Create(
                new LealControl.BuildingBlocks.Tenancy.TenantId(CrmWebApplicationFactory.DemoTenantId),
                "PED-9991", customerId, DateTime.UtcNow,
                opportunityId: desyncedOppId, currency: "ARS", initialStatus: OrderStatus.Confirmed);
            legacyOrder.AddLine(null, "Servicio histórico", 1m, 100000m, "ARS", 0m, 21m);
            sales.Orders.Add(legacyOrder);
            await sales.SaveChangesAsync();
        }

        var syncRes = await Json(await client.PostAsync("/api/v1/crm/opportunities/sync-with-sales", null));
        Assert.Equal(1, syncRes.GetProperty("ordersSynced").GetInt32());

        var repairedOpp = await GetOpportunityAsync(client, desyncedOppId);
        Assert.Equal("Won", repairedOpp.GetProperty("stage").GetString());
    }
}
