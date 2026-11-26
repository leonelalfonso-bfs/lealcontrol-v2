using System.Net.Http.Json;
using System.Text.Json;
using LealControl.Api.Automation;
using LealControl.Modules.Communications.Infrastructure.Domain;
using LealControl.Modules.Communications.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>
/// Seguimiento de presupuestos: a los 5 días hábiles sin respuesta se crea una actividad para hoy en el CRM (una sola
/// vez) y aparece en "Mis avisos"; si el cliente escribió un mail después del envío, no. Reloj de pruebas: 2/10/2026.
/// </summary>
public sealed class QuoteFollowUpApiTests : IAsyncLifetime
{
    private readonly CrmWebApplicationFactory _factory = new();
    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    private static readonly DateTime Now = new(2026, 10, 2, 15, 0, 0, DateTimeKind.Utc);

    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, body);
        return JsonDocument.Parse(body).RootElement.Clone();
    }

    private async Task<(Guid Customer, Guid Quote, string Number)> SentQuoteAsync(HttpClient client, string name, string cuit, DateTime sentAtUtc)
    {
        var customer = (await Json(await client.PostAsJsonAsync("/api/v1/crm/customers", new
        {
            legalName = name, documentType = "Cuit", documentNumber = cuit,
            taxCondition = "ResponsableInscripto", iibbRegime = "Local", isCustomer = true, isSupplier = false
        }))).GetProperty("id").GetGuid();
        var quote = await Json(await client.PostAsJsonAsync("/api/v1/sales/quotes", new
        {
            customerId = customer, locationId = (Guid?)null, contactId = (Guid?)null, opportunityId = (Guid?)null, currency = "ARS",
            exchangeRateUsdBillete = 1500m, exchangeRateUsdDivisa = 1480m, discountPercent = 0m, validDays = 30, paymentTerms = "Contado",
            paymentMethod = (string?)null, deliveryTimeDays = (int?)null, transportation = (string?)null, warranty = (string?)null, notes = (string?)null,
            ownerName = "Vendedor", lines = new[] { new { description = "Calibración", quantity = 1m, unitPrice = 100000m, discountPercent = 0m, taxRate = 21m, isOptional = false, currencyCode = "ARS" } }
        }));
        var id = quote.GetProperty("id").GetGuid();
        await Json(await client.PostAsync($"/api/v1/sales/quotes/{id}/send", null));
        await using var db = new NpgsqlConnection(_factory.DatabaseConnectionString);
        await db.OpenAsync();
        await using var cmd = new NpgsqlCommand("""UPDATE sales.quotes SET "SentAtUtc" = @at WHERE "Id" = @id""", db);
        cmd.Parameters.AddWithValue("at", sentAtUtc);
        cmd.Parameters.AddWithValue("id", id);
        await cmd.ExecuteNonQueryAsync();
        return (customer, id, quote.GetProperty("quoteNumber").GetString()!);
    }

    private async Task<long> FollowUpActivitiesAsync(Guid customer)
    {
        await using var db = new NpgsqlConnection(_factory.DatabaseConnectionString);
        await db.OpenAsync();
        await using var cmd = new NpgsqlCommand("""SELECT count(*) FROM crm.activities WHERE "CustomerId" = @c AND "Description" LIKE 'Seguimiento del presupuesto%'""", db);
        cmd.Parameters.AddWithValue("c", customer);
        return (long)(await cmd.ExecuteScalarAsync())!;
    }

    [Fact]
    public async Task Unanswered_quote_gets_one_follow_up_and_a_notice_unless_the_customer_wrote()
    {
        using var admin = _factory.CreateAuthenticatedClient();
        var cs = _factory.DatabaseConnectionString;
        var silent = await SentQuoteAsync(admin, "Cliente Callado SA", "20123456786", new DateTime(2026, 9, 21, 15, 0, 0, DateTimeKind.Utc));
        var answered = await SentQuoteAsync(admin, "Cliente Responde SA", "30712345671", new DateTime(2026, 9, 21, 15, 0, 0, DateTimeKind.Utc));
        // Enviado el martes 29/9: todavía no pasaron 5 días hábiles.
        var recent = await SentQuoteAsync(admin, "Cliente Reciente SA", "20304050609", new DateTime(2026, 9, 29, 15, 0, 0, DateTimeKind.Utc));

        // El segundo cliente escribió después del envío, en una conversación vinculada a él.
        await using (var comms = new CommunicationsDbContext(new DbContextOptionsBuilder<CommunicationsDbContext>().UseNpgsql(cs).Options))
        {
            await comms.EnsureTablesCreatedAsync();
            var conversation = Conversation.Create(CrmWebApplicationFactory.DemoTenantId, "email", Guid.NewGuid().ToString("N"), "compras@responde.com",
                "Compras", "compras@responde.com", null, "Consulta por el presupuesto", new DateTime(2026, 9, 24, 13, 0, 0, DateTimeKind.Utc), EmailDirection.Incoming);
            conversation.LinkCustomer(answered.Customer);
            comms.Conversations.Add(conversation);
            await comms.SaveChangesAsync();
        }

        Assert.Equal(1, await QuoteFollowUp.CreateActivitiesAsync(cs, CrmWebApplicationFactory.DemoTenantId, Now, default));
        Assert.Equal(0, await QuoteFollowUp.CreateActivitiesAsync(cs, CrmWebApplicationFactory.DemoTenantId, Now, default));
        Assert.Equal(1, await FollowUpActivitiesAsync(silent.Customer));
        Assert.Equal(0, await FollowUpActivitiesAsync(answered.Customer));
        Assert.Equal(0, await FollowUpActivitiesAsync(recent.Customer));

        var groups = (await Json(await admin.GetAsync("/api/v1/notices/mine"))).GetProperty("groups").EnumerateArray().ToList();
        var quotes = groups.Single(g => g.GetProperty("code").GetString() == "sales.quotes-unanswered").GetProperty("items").EnumerateArray().ToList();
        var item = Assert.Single(quotes);
        Assert.Equal($"{silent.Number} · Cliente Callado SA", item.GetProperty("title").GetString());
        Assert.Equal("Enviado hace 11 días · $ 121.000,00", item.GetProperty("detail").GetString());

        var activities = groups.Single(g => g.GetProperty("code").GetString() == "crm.activities-due").GetProperty("items").EnumerateArray().ToList();
        var activity = Assert.Single(activities);
        Assert.StartsWith($"Cliente Callado SA · Seguimiento del presupuesto {silent.Number}", activity.GetProperty("title").GetString());
        Assert.Equal("Para hoy", activity.GetProperty("detail").GetString());
    }
}
