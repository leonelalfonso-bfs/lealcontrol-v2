using System.Net.Http.Json;
using System.Text.Json;
using LealControl.Api.Ai;
using LealControl.BuildingBlocks.Notices;
using LealControl.Modules.Communications.Infrastructure.Domain;
using LealControl.Modules.Communications.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>
/// Supervisor comercial (con un proveedor falso): lee los avisos de ventas, arma las prioridades una sola vez por día y
/// las muestra primero en "Mis avisos"; quien no ve importes recibe la versión sin montos.
/// </summary>
public sealed class AiSupervisorTests : IAsyncLifetime
{
    private readonly CrmWebApplicationFactory _factory = new();
    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    private sealed class FakeAi : IAiClient
    {
        public int Calls;
        public string? LastUser;
        public string Link = "";
        public Task<AiCompletion> CompleteJsonAsync(string apiKey, string model, string system, string user,
            IReadOnlyDictionary<string, JsonElement> schema, int maxTokens, CancellationToken ct, bool deeper = false)
        {
            Calls++;
            LastUser = user;
            Assert.Equal(AiModels.Supervisor, model);
            var json = JsonSerializer.Serialize(new
            {
                priorities = new object[]
                {
                    new { title = "Responder a compras@cantera.com", why_with_amounts = "Pide una báscula de $ 45.000.000 y lleva 5 días sin respuesta.",
                        why_without_amounts = "Pide una báscula de $ 45.000.000 y lleva 5 días sin respuesta.", link = Link, urgency = 3 },
                    new { title = "Revisar el embudo", why_with_amounts = "Hay oportunidades frías.", why_without_amounts = "Hay oportunidades frías.",
                        link = "https://sitio-externo.com", urgency = 1 },
                }
            });
            return Task.FromResult(new AiCompletion(json, 3000, 800, "end_turn"));
        }
    }

    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, body);
        return JsonDocument.Parse(body).RootElement.Clone();
    }

    [Fact]
    public async Task Builds_the_daily_priorities_once_and_hides_amounts_from_who_cannot_see_them()
    {
        var tenantId = CrmWebApplicationFactory.DemoTenantId;
        var cs = _factory.DatabaseConnectionString;
        var clock = _factory.Services.GetRequiredService<TimeProvider>().GetUtcNow().UtcDateTime; // viernes 2/10/2026
        var morning = new DateTime(clock.Year, clock.Month, clock.Day, 12, 0, 0, DateTimeKind.Utc); // 9 h de Argentina
        var protector = _factory.Services.GetRequiredService<AiKeyProtector>();

        // Un mail sin responder hace una semana: el aviso que el supervisor tiene que priorizar.
        var unanswered = Conversation.Create(tenantId, "email", Guid.NewGuid().ToString("N"), "compras@cantera.com", "Cantera",
            "compras@cantera.com", null, "Necesitamos una báscula", DateTime.UtcNow.AddDays(-7), EmailDirection.Incoming);
        await using (var comms = new CommunicationsDbContext(new DbContextOptionsBuilder<CommunicationsDbContext>().UseNpgsql(cs).Options))
        {
            await comms.EnsureTablesCreatedAsync();
            comms.Conversations.Add(unanswered);
            await comms.SaveChangesAsync();
        }
        await using (var db = await AiEndpoints.OpenAsync(cs, default))
        {
            var settings = AiSettings.For(tenantId);
            settings.SetApiKey(protector.Protect("sk-ant-prueba"), "ueba", morning);
            settings.Update(10m, mailReading: false, autoOpportunities: true, supervisor: true, "Básculas", morning);
            db.Settings.Add(settings);
            await db.SaveChangesAsync();
        }

        var ai = new FakeAi { Link = $"/comunicaciones?conversation={unanswered.Id}" };
        var supervisor = new AiSupervisor(ai, protector, _factory.Services.GetServices<INoticeProvider>(), NullLogger<AiSupervisor>.Instance);
        Assert.False(await supervisor.GenerateAsync(cs, tenantId, morning.AddHours(-8), default)); // 1 h de Argentina: todavía no
        Assert.True(await supervisor.GenerateAsync(cs, tenantId, morning, default));
        Assert.False(await supervisor.GenerateAsync(cs, tenantId, morning.AddHours(2), default)); // una vez por día
        Assert.Equal(1, ai.Calls);
        Assert.Contains("Sin responder: Cantera", ai.LastUser);
        Assert.StartsWith("Hoy es viernes 02/10/2026", ai.LastUser);
        Assert.Contains($"[/comunicaciones?conversation={unanswered.Id}]", ai.LastUser);

        // Con importes: primero, con el monto; el enlace inventado se descarta.
        using var admin = _factory.CreateAuthenticatedClient();
        var groups = (await Json(await admin.GetAsync("/api/v1/notices/mine"))).GetProperty("groups").EnumerateArray().ToList();
        var briefing = groups[0];
        Assert.Equal("sales.ai-briefing", briefing.GetProperty("code").GetString());
        var items = briefing.GetProperty("items").EnumerateArray().ToList();
        Assert.Equal(2, items.Count);
        Assert.Contains("$ 45.000.000", items[0].GetProperty("detail").GetString());
        Assert.Equal($"/comunicaciones?conversation={unanswered.Id}", items[0].GetProperty("link").GetString());
        Assert.Equal("Critical", items[0].GetProperty("severity").GetString());
        Assert.Equal(JsonValueKind.Null, items[1].GetProperty("link").ValueKind);

        // Sin importes: la versión sin montos, aunque la IA haya escrito uno.
        var profile = await Json(await admin.PostAsJsonAsync("/api/v1/company/permission-profiles", new
        {
            name = "Ventas sin importes", matrix = new Dictionary<string, string> { ["sales"] = "View" }, seeAmounts = false, seeCosts = false, seeSalaries = false
        }));
        var user = await Json(await admin.PostAsJsonAsync("/api/v1/company/users", new
        {
            fullName = "Recepcion", email = "recepcion@example.com", role = "Comercial", password = "Clave-1234", profileId = profile.GetProperty("id").GetGuid()
        }));
        using var clerk = _factory.CreateClientForUser(user.GetProperty("id").GetGuid(), "recepcion@example.com");
        var clerkBriefing = (await Json(await clerk.GetAsync("/api/v1/notices/mine"))).GetProperty("groups").EnumerateArray().First();
        Assert.Equal("sales.ai-briefing", clerkBriefing.GetProperty("code").GetString());
        var detail = clerkBriefing.GetProperty("items")[0].GetProperty("detail").GetString();
        Assert.DoesNotContain("45.000.000", detail);
        Assert.Contains("(importe)", detail);

        Assert.Equal("Responder a compras@cantera.com", AiSupervisor.WithoutMoney("Responder a compras@cantera.com"));
        Assert.Equal("Presupuesto de (importe) sin respuesta", AiSupervisor.WithoutMoney("Presupuesto de USD 12.500,50 sin respuesta"));
    }
}
