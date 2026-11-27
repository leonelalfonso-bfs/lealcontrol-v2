using System.Net.Http.Json;
using System.Text.Json;
using LealControl.Api.Ai;
using LealControl.Modules.Communications.Infrastructure.Domain;
using LealControl.Modules.Communications.Infrastructure.Persistence;
using LealControl.Modules.Sales.Domain.Quotes;
using LealControl.Modules.Sales.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>
/// Etapa 4: revisión determinística del circuito comercial (costo $0), borrador de respuesta con IA usando ese contexto
/// (nunca se envía solo) y generación a demanda del informe del Supervisor comercial.
/// </summary>
public sealed class CommercialAssistantTests : IAsyncLifetime
{
    private readonly CrmWebApplicationFactory _factory = new();
    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    private sealed class FakeDraftAi : IAiClient
    {
        public string? LastUserPrompt;
        public Task<AiCompletion> CompleteJsonAsync(string apiKey, string model, string system, string user,
            IReadOnlyDictionary<string, JsonElement> schema, int maxTokens, CancellationToken ct, bool deeper = false, bool webSearch = false)
        {
            LastUserPrompt = user;
            return Task.FromResult(new AiCompletion(
                """{"body":"Hola Ana, te escribo en seguimiento del presupuesto P-00042 (Rev. 2) que te enviamos. Quedamos a disposición."}""",
                900, 120, "end_turn"));
        }
    }

    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, body);
        return JsonDocument.Parse(body).RootElement.Clone();
    }

    [Fact]
    public async Task Commercial_check_reports_quotes_revisions_and_missing_items_and_ai_draft_uses_real_circuit()
    {
        var tenantId = CrmWebApplicationFactory.DemoTenantId;
        var cs = _factory.DatabaseConnectionString;
        var now = _factory.Services.GetRequiredService<TimeProvider>().GetUtcNow().UtcDateTime;
        using (var scope = _factory.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<LealControl.Api.SuperAdmin.ICommunicationsInboxSettings>().SetEnabledAsync(true);
        using var admin = _factory.CreateAuthenticatedClient();
        using var inbox = _factory.CreateClientForUser(Guid.NewGuid(), "comercial@lealcontrol.com", "Admin", "[\"communications\"]");

        // Cliente + oportunidad + presupuesto enviado (Rev. 2) hace 7 días
        var customerId = (await Json(await admin.PostAsJsonAsync("/api/v1/crm/customers", new
        {
            legalName = "Frigorifico del Litoral SA",
            documentType = "Cuit",
            documentNumber = "30709876542",
            taxCondition = "ResponsableInscripto",
            iibbRegime = "Local",
            isCustomer = true,
            isSupplier = false
        }))).GetProperty("id").GetGuid();

        var oppId = (await Json(await admin.PostAsJsonAsync("/api/v1/crm/opportunities", new
        {
            title = "Báscula 21m Frigorifico",
            customerId
        }))).GetProperty("id").GetGuid();

        await using (var sales = new SalesDbContext(new DbContextOptionsBuilder<SalesDbContext>().UseNpgsql(cs).Options))
        {
            await sales.EnsureTablesCreatedAsync();
            var quote = Quote.Draft(new LealControl.BuildingBlocks.Tenancy.TenantId(tenantId), "P-00042", customerId, oppId,
                "ARS", null, "Leonel", 15, now.AddDays(-10)).Value;
            quote.AddLine("Báscula 21m", 1, 35_000_000m, now.AddDays(-10));
            quote.NextRevision(now.AddDays(-8));
            quote.MarkSent(now.AddDays(-7));
            sales.Quotes.Add(quote);
            await sales.SaveChangesAsync();
        }

        // Conversación vinculada al cliente y oportunidad
        var conv = Conversation.Create(tenantId, "email", Guid.NewGuid().ToString("N"),
            "ana@frigorifico.com.ar", "Ana", "ana@frigorifico.com.ar", null, "¿Tienen novedades de la cotización?", now.AddMinutes(-10), EmailDirection.Incoming);
        conv.LinkCustomer(customerId);
        conv.LinkOpportunity(oppId);
        await using (var comms = new CommunicationsDbContext(new DbContextOptionsBuilder<CommunicationsDbContext>().UseNpgsql(cs).Options))
        {
            await comms.EnsureTablesCreatedAsync();
            comms.Conversations.Add(conv);
            var msg = EmailMessage.Create(tenantId, Guid.NewGuid(), Guid.NewGuid().ToString("N"), null, conv.ThreadKey, EmailDirection.Incoming,
                "Consulta báscula", "ana@frigorifico.com.ar", "ventas@empresa.com", "¿Tienen novedades de la cotización?", now.AddMinutes(-10));
            msg.SetConversationId(conv.Id);
            comms.EmailMessages.Add(msg);
            await comms.SaveChangesAsync();
        }

        // 1. Revisión del circuito comercial (sin IA, costo $0)
        var check = await Json(await inbox.GetAsync($"/api/v1/communications/conversations/{conv.Id}/commercial-check"));
        Assert.Equal("Frigorifico del Litoral SA", check.GetProperty("customer").GetProperty("name").GetString());
        Assert.Equal("Por cotizar", check.GetProperty("opportunity").GetProperty("stageLabel").GetString());
        var quoteDto = Assert.Single(check.GetProperty("quotes").EnumerateArray());
        Assert.Equal("P-00042", quoteDto.GetProperty("number").GetString());
        Assert.Equal(2, quoteDto.GetProperty("revision").GetInt32());
        Assert.Equal("Enviado", quoteDto.GetProperty("statusLabel").GetString());
        Assert.True(quoteDto.GetProperty("daysSinceSent").GetInt32() >= 6);

        var codes = check.GetProperty("missingItems").EnumerateArray().Select(x => x.GetProperty("code").GetString()).ToHashSet();
        Assert.Contains("quote.followup", codes);
        Assert.Contains("contact.missing", codes);
        Assert.Contains("opportunity.no-next-action", codes);

        // 2. Borrador con IA (usando doble falso) recibe el contexto real del presupuesto P-00042 Rev. 2
        var putRes = await inbox.PutAsJsonAsync("/api/v1/communications/ai/settings", new
        {
            apiKey = "sk-ant-prueba-draft", monthlyBudgetUsd = 10m, mailReadingEnabled = true,
            autoOpportunities = true, supervisorEnabled = true, businessDescription = "Básculas"
        });
        Assert.True(putRes.IsSuccessStatusCode);

        var fakeAi = new FakeDraftAi();
        var drafter = new AiReplyDrafter(fakeAi, _factory.Services.GetRequiredService<AiKeyProtector>(), NullLogger<AiReplyDrafter>.Instance);
        var draft = await drafter.DraftAsync(cs, tenantId, conv.Id, seesAmounts: true, now, default);
        Assert.True(draft.Ok);
        Assert.Contains("P-00042", draft.Body);
        Assert.NotNull(fakeAi.LastUserPrompt);
        Assert.Contains("P-00042 (Rev. 2)", fakeAi.LastUserPrompt);
        Assert.Contains("Enviado", fakeAi.LastUserPrompt);
    }
}
