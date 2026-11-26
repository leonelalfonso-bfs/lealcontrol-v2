using System.Net.Http.Json;
using System.Text.Json;
using LealControl.Modules.Communications.Infrastructure.Domain;
using LealControl.Modules.Communications.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>
/// Etapa 2 CRM: al convertir un prospecto se guarda su contacto, se re-vinculan sus oportunidades abiertas
/// (sin duplicar) y sus conversaciones de la bandeja; además se puede vincular un cliente o editar una oportunidad.
/// </summary>
public sealed class LeadConversionAndOpportunityTests : IAsyncLifetime
{
    private readonly CrmWebApplicationFactory _factory = new();
    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, body);
        return JsonDocument.Parse(body).RootElement.Clone();
    }

    [Fact]
    public async Task Converting_lead_creates_contact_relinks_existing_opportunity_and_conversations()
    {
        var tenantId = CrmWebApplicationFactory.DemoTenantId;
        var cs = _factory.DatabaseConnectionString;
        var now = _factory.Services.GetRequiredService<TimeProvider>().GetUtcNow().UtcDateTime;
        using var admin = _factory.CreateAuthenticatedClient();

        // 1. Capturar prospecto con contacto, mail y teléfono
        var lead = await Json(await admin.PostAsJsonAsync("/api/v1/crm/leads", new
        {
            name = "Molinos del Oeste SRL",
            contactName = "Martín Ferreyra",
            email = "mferreyra@molinosoeste.com.ar",
            phone = "3415551122",
            description = "Báscula 18m · CUIT 30709876542",
            source = "Email"
        }));
        var leadId = lead.GetProperty("id").GetGuid();

        // 2. Abrir oportunidad vinculada al prospecto (como hace la IA)
        var opp = await Json(await admin.PostAsJsonAsync("/api/v1/crm/opportunities", new
        {
            title = "Báscula 18m Molinos del Oeste",
            leadId
        }));
        var oppId = opp.GetProperty("id").GetGuid();
        Assert.Equal(JsonValueKind.Null, opp.GetProperty("customerId").ValueKind);

        // 3. Conversación en la bandeja vinculada a ese prospecto
        var conv = Conversation.Create(tenantId, "email", Guid.NewGuid().ToString("N"),
            "mferreyra@molinosoeste.com.ar", "Martín Ferreyra", "mferreyra@molinosoeste.com.ar",
            null, "Hola, pido presupuesto", now, EmailDirection.Incoming);
        conv.LinkLead(leadId);
        conv.LinkOpportunity(oppId);
        await using (var comms = new CommunicationsDbContext(new DbContextOptionsBuilder<CommunicationsDbContext>().UseNpgsql(cs).Options))
        {
            await comms.EnsureTablesCreatedAsync();
            comms.Conversations.Add(conv);
            await comms.SaveChangesAsync();
        }

        // 4. Convertir prospecto en cliente (incluso con createOpportunity=true no debe duplicar la existente)
        var customer = await Json(await admin.PostAsJsonAsync($"/api/v1/crm/leads/{leadId}/convert?createOpportunity=true", new
        {
            legalName = "MOLINOS DEL OESTE S.R.L.",
            documentType = "Cuit",
            documentNumber = "30709876542",
            taxCondition = "ResponsableInscripto",
            iibbRegime = "Local",
            isCustomer = true,
            isSupplier = false,
            email = "mferreyra@molinosoeste.com.ar",
            phone = "3415551122"
        }));
        var customerId = customer.GetProperty("id").GetGuid();

        // Contacto del prospecto guardado en el cliente
        var contact = Assert.Single(customer.GetProperty("contacts").EnumerateArray());
        Assert.Equal("Martín Ferreyra", contact.GetProperty("name").GetString());
        Assert.Equal("mferreyra@molinosoeste.com.ar", contact.GetProperty("email").GetString());

        // La oportunidad existente quedó vinculada al cliente sin crear una duplicada
        var customerOpps = (await Json(await admin.GetAsync($"/api/v1/crm/customers/{customerId}/opportunities"))).EnumerateArray().ToList();
        var singleOpp = Assert.Single(customerOpps);
        Assert.Equal(oppId, singleOpp.GetProperty("id").GetGuid());

        // La conversación de la bandeja quedó re-vinculada al nuevo cliente
        await using (var comms = new CommunicationsDbContext(new DbContextOptionsBuilder<CommunicationsDbContext>().UseNpgsql(cs).Options))
        {
            var reloaded = await comms.Conversations.AsNoTracking().SingleAsync(c => c.Id == conv.Id);
            Assert.Equal(customerId, reloaded.RelatedCustomerId);
        }
    }

    [Fact]
    public async Task Opportunity_can_attach_existing_customer_and_update_commercial_details()
    {
        using var admin = _factory.CreateAuthenticatedClient();

        var customerId = (await Json(await admin.PostAsJsonAsync("/api/v1/crm/customers", new
        {
            legalName = "Acopio Norte SA",
            documentType = "Cuit",
            documentNumber = "20123456786",
            taxCondition = "ResponsableInscripto",
            iibbRegime = "Local",
            isCustomer = true,
            isSupplier = false
        }))).GetProperty("id").GetGuid();

        var oppId = (await Json(await admin.PostAsJsonAsync("/api/v1/crm/opportunities", new
        {
            title = "Consulta inicial"
        }))).GetProperty("id").GetGuid();

        // Vincular cliente existente desde la oportunidad
        var attached = await Json(await admin.PostAsJsonAsync($"/api/v1/crm/opportunities/{oppId}/attach-customer", new { customerId }));
        Assert.Equal(customerId, attached.GetProperty("customerId").GetGuid());

        // Editar datos comerciales de la oportunidad
        var updated = await Json(await admin.PutAsJsonAsync($"/api/v1/crm/opportunities/{oppId}", new
        {
            title = "Báscula 21m Acopio Norte",
            amount = 42500000m,
            currency = "ARS",
            ownerName = "Leonel",
            priority = "High",
            expectedCloseDate = "2026-11-15T12:00:00Z"
        }));
        Assert.Equal("Báscula 21m Acopio Norte", updated.GetProperty("title").GetString());
        Assert.Equal(42500000m, updated.GetProperty("amount").GetDecimal());
        Assert.Equal("Leonel", updated.GetProperty("ownerName").GetString());
        Assert.Equal("High", updated.GetProperty("priority").GetString());
    }
}
