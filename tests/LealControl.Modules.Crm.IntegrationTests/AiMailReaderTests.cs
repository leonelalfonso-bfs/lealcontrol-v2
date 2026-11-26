using System.Net.Http.Json;
using System.Text.Json;
using LealControl.Api.Ai;
using LealControl.Modules.Communications.Infrastructure.Domain;
using LealControl.Modules.Communications.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>
/// Lectura de mails con IA (con un proveedor falso): clasifica cada conversación con mail nuevo, abre la oportunidad de
/// los pedidos comerciales (con el cliente si el CUIT ya existe, si no con un lead), respeta el tope mensual y no
/// vuelve a leer lo ya leído.
/// </summary>
public sealed class AiMailReaderTests : IAsyncLifetime
{
    private readonly CrmWebApplicationFactory _factory = new();
    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    private sealed class FakeAi : IAiClient
    {
        public int Calls;
        public Task<AiCompletion> CompleteJsonAsync(string apiKey, string model, string system, string user,
            IReadOnlyDictionary<string, JsonElement> schema, int maxTokens, CancellationToken ct)
        {
            Calls++;
            Assert.Equal("sk-ant-prueba-1234", apiKey);
            object reading = user.Contains("Oferta imperdible")
                ? new { category = "spam", urgency = 1, summary = "Publicidad.", is_new_business = false, opportunity_title = "", company = "", contact_name = "", cuit = "", phone = "", email = "", location = "", product = "" }
                : user.Contains("Areneras")
                    ? new { category = "pedido_cotizacion", urgency = 2, summary = "Areneras pide cotizar una báscula de 21 m.", is_new_business = true, opportunity_title = "Báscula 21 m", company = "Areneras del Sur SA", contact_name = "Ana", cuit = "20-12345678-6", phone = "", email = "", location = "San Nicolás", product = "Báscula 21 m" }
                    : new { category = "consulta_comercial", urgency = 3, summary = "Quieren saber si calibran balanzas en Rosario.", is_new_business = true, opportunity_title = "Calibración en Rosario", company = "Molino Nuevo", contact_name = "Pedro", cuit = "", phone = "341 555-1234", email = "", location = "Rosario", product = "Calibración" };
            return Task.FromResult(new AiCompletion(JsonSerializer.Serialize(reading), 1500, 200, "end_turn"));
        }
    }

    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, body);
        return JsonDocument.Parse(body).RootElement.Clone();
    }

    private static async Task Ok(HttpResponseMessage response) =>
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());

    [Fact]
    public async Task Reads_new_mails_opens_opportunities_and_respects_the_budget()
    {
        var tenantId = CrmWebApplicationFactory.DemoTenantId;
        var cs = _factory.DatabaseConnectionString;
        var now = _factory.Services.GetRequiredService<TimeProvider>().GetUtcNow().UtcDateTime; // reloj de pruebas
        using (var scope = _factory.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<LealControl.Api.SuperAdmin.ICommunicationsInboxSettings>().SetEnabledAsync(true);
        using var admin = _factory.CreateAuthenticatedClient();
        // La configuración de la IA vive en Comunicaciones: hace falta tener el módulo.
        using var inbox = _factory.CreateClientForUser(Guid.NewGuid(), "it@lealcontrol.com", "Admin", "[\"communications\"]");
        var customer = (await Json(await admin.PostAsJsonAsync("/api/v1/crm/customers", new
        {
            legalName = "Areneras del Sur SA", documentType = "Cuit", documentNumber = "20123456786",
            taxCondition = "ResponsableInscripto", iibbRegime = "Local", isCustomer = true, isSupplier = false
        }))).GetProperty("id").GetGuid();

        // Clave y activación desde la pantalla.
        await Ok(await inbox.PutAsJsonAsync("/api/v1/communications/ai/settings", new
        {
            apiKey = "sk-ant-prueba-1234", monthlyBudgetUsd = 10m, mailReadingEnabled = true, autoOpportunities = true, businessDescription = "Básculas y calibraciones"
        }));
        var settings = await Json(await inbox.GetAsync("/api/v1/communications/ai/settings"));
        Assert.True(settings.GetProperty("hasKey").GetBoolean());
        Assert.Equal("1234", settings.GetProperty("keyHint").GetString());
        Assert.False(settings.TryGetProperty("protectedApiKey", out _));

        Conversation Mail(string from, string subject, string body, DateTime at) =>
            Conversation.Create(tenantId, "email", Guid.NewGuid().ToString("N"), from, from, from, null, body, at, EmailDirection.Incoming);
        var quote = Mail("ana@areneras.com", "Cotización", "Areneras: necesitamos una báscula", now.AddMinutes(-20));
        var question = Mail("pedro@molino.com", "Consulta", "¿Calibran en Rosario?", now.AddMinutes(-15));
        var spam = Mail("promo@ofertas.com", "Oferta", "Oferta imperdible", now.AddMinutes(-10));
        var old = Mail("viejo@cliente.com", "Viejo", "Mail de hace un mes", now.AddDays(-30));
        await using (var comms = new CommunicationsDbContext(new DbContextOptionsBuilder<CommunicationsDbContext>().UseNpgsql(cs).Options))
        {
            await comms.EnsureTablesCreatedAsync();
            comms.Conversations.AddRange(quote, question, spam, old);
            foreach (var c in new[] { quote, question, spam, old })
            {
                var message = EmailMessage.Create(tenantId, Guid.NewGuid(), Guid.NewGuid().ToString("N"), null, c.ThreadKey, EmailDirection.Incoming,
                    "Asunto", c.ParticipantEmail!, "ventas@empresa.com", c.LastMessagePreview ?? "", c.LastMessageAtUtc);
                message.SetConversationId(c.Id);
                comms.EmailMessages.Add(message);
            }
            await comms.SaveChangesAsync();
        }

        var ai = new FakeAi();
        var reader = new AiMailReader(ai, _factory.Services.GetRequiredService<AiKeyProtector>(), NullLogger<AiMailReader>.Instance);
        Assert.Equal(3, await reader.ReadPendingAsync(cs, tenantId, now, default)); // el de hace un mes no
        Assert.Equal(0, await reader.ReadPendingAsync(cs, tenantId, now, default));
        Assert.Equal(3, ai.Calls);

        await using (var comms = new CommunicationsDbContext(new DbContextOptionsBuilder<CommunicationsDbContext>().UseNpgsql(cs).Options))
        {
            var read = await comms.Conversations.AsNoTracking().Where(c => c.TenantId == tenantId).ToDictionaryAsync(c => c.Id);
            Assert.Equal("pedido_cotizacion", read[quote.Id].AiCategory);
            Assert.Equal(customer, read[quote.Id].RelatedCustomerId); // por el CUIT
            Assert.NotNull(read[quote.Id].RelatedOpportunityId);
            Assert.NotNull(read[question.Id].RelatedLeadId); // cliente nuevo: lead
            Assert.NotNull(read[question.Id].RelatedOpportunityId);
            Assert.Equal(3, read[question.Id].AiUrgency);
            Assert.Equal("spam", read[spam.Id].AiCategory);
            Assert.Null(read[spam.Id].RelatedOpportunityId);
            Assert.Null(read[old.Id].AiCategory);
        }

        var opportunities = (await Json(await admin.GetAsync($"/api/v1/crm/customers/{customer}/opportunities"))).EnumerateArray().ToList();
        Assert.Equal("Báscula 21 m", Assert.Single(opportunities).GetProperty("title").GetString());

        var month = await Json(await inbox.GetAsync("/api/v1/communications/ai/settings"));
        Assert.Equal(3, month.GetProperty("monthCalls").GetInt32());
        Assert.Equal(0.0008m, month.GetProperty("monthSpentUsd").GetDecimal()); // 3 × (1500 × 0,10 + 200 × 0,50) / 1M = 0,00075

        // Tope alcanzado: un mail nuevo no se lee.
        await Ok(await inbox.PutAsJsonAsync("/api/v1/communications/ai/settings", new
        {
            apiKey = (string?)null, monthlyBudgetUsd = 0m, mailReadingEnabled = true, autoOpportunities = true, businessDescription = "Básculas"
        }));
        await using (var db = new NpgsqlConnection(cs))
        {
            await db.OpenAsync();
            await using var cmd = new NpgsqlCommand("""UPDATE communications.conversations SET "LastIncomingAtUtc" = @at WHERE "Id" = @id""", db);
            cmd.Parameters.AddWithValue("id", spam.Id);
            cmd.Parameters.AddWithValue("at", now.AddMinutes(5));
            await cmd.ExecuteNonQueryAsync();
        }
        Assert.Equal(0, await reader.ReadPendingAsync(cs, tenantId, now.AddMinutes(10), default));
        Assert.Equal(3, ai.Calls);
        Assert.Contains("tope mensual", (await Json(await inbox.GetAsync("/api/v1/communications/ai/settings"))).GetProperty("lastError").GetString());
    }
}
