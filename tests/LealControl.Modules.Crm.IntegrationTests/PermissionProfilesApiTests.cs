using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Domain.Settings;
using LealControl.Modules.Crm.Infrastructure.Persistence;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>Permisos P1: perfiles de fábrica, usuario = perfil + excepciones, y protecciones.</summary>
public sealed class PermissionProfilesApiTests : IAsyncLifetime
{
    private readonly CrmWebApplicationFactory _factory = new();
    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, body);
        using var doc = JsonDocument.Parse(body);
        return doc.RootElement.Clone();
    }

    private static async Task<string> Error(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        return await response.Content.ReadAsStringAsync();
    }

    private static Guid ProfileId(JsonElement profiles, string systemKey) =>
        profiles.EnumerateArray().Single(p => p.TryGetProperty("systemKey", out var k) && k.GetString() == systemKey).GetProperty("id").GetGuid();

    private static string[] Modules(JsonElement user) =>
        JsonSerializer.Deserialize<string[]>(user.GetProperty("allowedModulesJson").GetString()!)!;

    [Fact]
    public async Task Factory_profiles_users_with_overrides_and_custom_profiles()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var profiles = await Json(await client.GetAsync("/api/v1/company/permission-profiles"));
        Assert.Equal(["Dueño", "Administración", "Ventas", "Compras", "RRHH", "Técnico", "Solo lectura"],
            profiles.EnumerateArray().Select(p => p.GetProperty("name").GetString()));
        var owner = ProfileId(profiles, "owner");
        var hr = ProfileId(profiles, "hr");

        // El Dueño no se toca y los de fábrica no se borran.
        using (var lockedEdit = await client.PutAsJsonAsync($"/api/v1/company/permission-profiles/{owner}",
                   new { name = "Dueño", matrix = new Dictionary<string, string>(), seeAmounts = false, seeCosts = false, seeSalaries = false }))
            Assert.Contains("Dueño", await Error(lockedEdit));
        using (var deleteSystem = await client.DeleteAsync($"/api/v1/company/permission-profiles/{hr}"))
            Assert.Contains("fábrica", await Error(deleteSystem));

        // Dueño: administra todo (incluido usuarios), con datos sensibles.
        var boss = await Json(await client.PostAsJsonAsync("/api/v1/company/users", new
        {
            fullName = "Dueña", email = "duena@example.com", role = "Comercial", password = "Clave-1234", profileId = owner
        }));
        Assert.Equal("Admin", boss.GetProperty("role").GetString());

        // RRHH: ve RRHH y flota, no finanzas; con una excepción: sin flota y con importes.
        var person = await Json(await client.PostAsJsonAsync("/api/v1/company/users", new
        {
            fullName = "Recursos Humanos", email = "rrhh@example.com", role = "Comercial", password = "Clave-1234", profileId = hr
        }));
        Assert.Equal("RRHH", person.GetProperty("role").GetString());
        Assert.Contains("hr", Modules(person));
        Assert.Contains("fleet", Modules(person));
        Assert.DoesNotContain("finance", Modules(person));
        Assert.Equal("None", person.GetProperty("effectiveModules").GetProperty("finance").GetString());
        Assert.True(person.GetProperty("effectiveSensitive").GetProperty("salaries").GetBoolean());
        Assert.False(person.GetProperty("effectiveSensitive").GetProperty("amounts").GetBoolean());

        var personId = person.GetProperty("id").GetGuid();
        var updated = await Json(await client.PutAsJsonAsync($"/api/v1/company/users/{personId}", new
        {
            id = personId, fullName = "Recursos Humanos", role = "Comercial", isActive = true, profileId = hr,
            overrides = new { modules = new Dictionary<string, string> { ["fleet"] = "None" }, amounts = true }
        }));
        Assert.DoesNotContain("fleet", Modules(updated));
        Assert.True(updated.GetProperty("effectiveSensitive").GetProperty("amounts").GetBoolean());
        Assert.Equal("RRHH", updated.GetProperty("profileName").GetString());

        // Perfil propio: al editarlo, sus usuarios toman el cambio.
        var custom = await Json(await client.PostAsJsonAsync("/api/v1/company/permission-profiles", new
        {
            name = "Encargado de flota", description = "Flota completa",
            matrix = new Dictionary<string, string> { ["fleet"] = "Admin" }, seeAmounts = false, seeCosts = true, seeSalaries = false,
            copyFromId = hr
        }));
        var customId = custom.GetProperty("id").GetGuid();
        using (var duplicate = await client.PostAsJsonAsync("/api/v1/company/permission-profiles", new
               { name = "encargado de flota", matrix = new Dictionary<string, string>(), seeAmounts = false, seeCosts = false, seeSalaries = false }))
            Assert.Contains("Ya hay un perfil", await Error(duplicate));

        var fleetUser = await Json(await client.PostAsJsonAsync("/api/v1/company/users", new
        {
            fullName = "Flota", email = "flota@example.com", role = "Comercial", password = "Clave-1234", profileId = customId
        }));
        Assert.Equal(["fleet"], Modules(fleetUser));

        await Json(await client.PutAsJsonAsync($"/api/v1/company/permission-profiles/{customId}", new
        {
            name = "Encargado de flota", matrix = new Dictionary<string, string> { ["fleet"] = "Admin", ["inventory"] = "View" },
            seeAmounts = false, seeCosts = true, seeSalaries = false
        }));
        var users = await Json(await client.GetAsync("/api/v1/company/users"));
        var refreshed = users.EnumerateArray().Single(u => u.GetProperty("email").GetString() == "flota@example.com");
        Assert.Equal(["fleet", "inventory"], Modules(refreshed));

        // No se borra un perfil en uso.
        using (var inUse = await client.DeleteAsync($"/api/v1/company/permission-profiles/{customId}"))
            Assert.Contains("usan", await Error(inUse));
    }

    [Fact]
    public async Task There_is_always_someone_who_administers_the_company()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var profiles = await Json(await client.GetAsync("/api/v1/company/permission-profiles"));
        var users = await Json(await client.GetAsync("/api/v1/company/users"));
        foreach (var u in users.EnumerateArray())
            await client.DeleteAsync($"/api/v1/company/users/{u.GetProperty("id").GetGuid()}");

        var only = await Json(await client.PostAsJsonAsync("/api/v1/company/users", new
        {
            fullName = "Único", email = "unico@example.com", role = "Comercial", password = "Clave-1234", profileId = ProfileId(profiles, "owner")
        }));
        var id = only.GetProperty("id").GetGuid();
        using (var demote = await client.PutAsJsonAsync($"/api/v1/company/users/{id}", new
               { id, fullName = "Único", role = "Comercial", isActive = true, profileId = ProfileId(profiles, "sales") }))
            Assert.Contains("administre", await Error(demote));
        using (var remove = await client.DeleteAsync($"/api/v1/company/users/{id}"))
            Assert.Equal(HttpStatusCode.BadRequest, remove.StatusCode);
    }

    [Fact]
    public async Task A_user_without_modules_no_longer_sees_everything()
    {
        // Token de un usuario no administrador sin lista de módulos: antes pasaba a todo.
        using var client = _factory.CreateAuthenticatedClient(role: "Comercial");
        using var fleet = await client.GetAsync("/api/v1/fleet/vehicles");
        Assert.Equal(HttpStatusCode.Forbidden, fleet.StatusCode);
    }

    [Fact]
    public void Migration_keeps_the_modules_each_user_had()
    {
        var tenant = new TenantId(Guid.NewGuid());
        var sales = SystemProfiles.All.Single(d => d.Key == "sales");
        var profile = PermissionProfile.Create(tenant, sales.Name, null, sales.Matrix, sales.Sensitive, sales.LegacyRole, DateTime.UtcNow, sales.Key);

        // Tenía ventas y flota: el perfil Ventas no trae flota ni comunicaciones con esa lista.
        var overrides = PermissionProfilesBootstrap.OverridesPreservingModules(profile, """["sales","crm","fleet"]""");
        var effective = PermissionCatalog.Resolve(profile, overrides);
        Assert.Equal(["crm", "fleet", "sales"], PermissionCatalog.AllowedModuleKeys(effective));

        // Sin lista (antes veía todo): ahora ve lo de su perfil.
        Assert.Null(PermissionProfilesBootstrap.OverridesPreservingModules(profile, "[]"));
        Assert.Equal("owner", SystemProfiles.ForLegacyRole("Administrador"));
        Assert.Equal("administration", SystemProfiles.ForLegacyRole("Tesorero"));
    }
}
