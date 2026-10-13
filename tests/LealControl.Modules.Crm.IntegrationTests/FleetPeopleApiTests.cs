using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>Flota 2a: personas de RRHH en la flota, con credenciales obligatorias según su rol. Reloj: 2/10/2026.</summary>
public sealed class FleetPeopleApiTests : IAsyncLifetime
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

    private static async Task<Guid> EmployeeAsync(HttpClient client, string first, string last) =>
        (await Json(await client.PostAsJsonAsync("/api/v1/hr/employees", new
        {
            firstName = first, lastName = last, documentNumber = "30111222", cuil = "20301112223", hireDate = "2020-01-01T00:00:00Z"
        }))).GetProperty("id").GetGuid();

    [Fact]
    public async Task Cargo_driver_needs_license_and_linti_and_renewals_work_like_vehicle_documents()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var juan = await EmployeeAsync(client, "Juan", "Gómez");
        var ana = await EmployeeAsync(client, "Ana", "Ruiz");

        var available = await Json(await client.GetAsync("/api/v1/fleet/people/available"));
        Assert.Equal(2, available.GetArrayLength());

        using (var noRole = await client.PostAsJsonAsync("/api/v1/fleet/people", new { employeeId = juan }))
            Assert.Equal(HttpStatusCode.BadRequest, noRole.StatusCode);
        var member = await Json(await client.PostAsJsonAsync("/api/v1/fleet/people", new { employeeId = juan, isCargoDriver = true }));
        Assert.True(member.GetProperty("isDriver").GetBoolean()); // chofer de cargas también es chofer
        Assert.Equal(2, member.GetProperty("missingCount").GetInt32()); // licencia y LINTI
        using (var duplicate = await client.PostAsJsonAsync("/api/v1/fleet/people", new { employeeId = juan, isDriver = true }))
            Assert.Equal(HttpStatusCode.BadRequest, duplicate.StatusCode);
        Assert.Equal(1, (await Json(await client.GetAsync("/api/v1/fleet/people/available"))).GetArrayLength());

        var id = member.GetProperty("id").GetGuid();
        var credentials = $"/api/v1/fleet/people/{id}/credentials";
        var license = await Json(await client.PostAsJsonAsync(credentials, new { type = "DrivingLicense", category = "e1", expirationDate = "2026-10-10" }));
        Assert.Equal("E1", license.GetProperty("category").GetString());
        Assert.Equal("DueSoon", license.GetProperty("state").GetString());
        await Json(await client.PostAsJsonAsync(credentials, new { type = "Linti", expirationDate = "2026-09-30" }));

        var panel = await Json(await client.GetAsync("/api/v1/fleet/people/expirations"));
        Assert.Equal(1, panel.GetProperty("expired").GetInt32());
        Assert.Equal(1, panel.GetProperty("dueSoon").GetInt32());
        Assert.Equal(0, panel.GetProperty("missing").GetInt32());

        // Renovar la licencia y borrar la renovación cargada por error.
        var renewed = await Json(await client.PostAsJsonAsync(credentials, new { type = "DrivingLicense", category = "E1", expirationDate = "2031-10-10" }));
        Assert.Equal(0, (await Json(await client.GetAsync("/api/v1/fleet/people/expirations"))).GetProperty("dueSoon").GetInt32());
        Assert.Equal(3, (await Json(await client.GetAsync(credentials + "?history=true"))).GetArrayLength());
        using (var deleted = await client.DeleteAsync($"/api/v1/fleet/credentials/{renewed.GetProperty("id").GetGuid()}"))
            Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
        Assert.Equal(1, (await Json(await client.GetAsync("/api/v1/fleet/people/expirations"))).GetProperty("dueSoon").GetInt32());

        // Autoelevadorista: le falta el carnet. Y el aviso personal lo muestra.
        await Json(await client.PostAsJsonAsync("/api/v1/fleet/people", new { employeeId = ana, isForkliftOperator = true }));
        var groups = (await Json(await client.GetAsync("/api/v1/notices/mine"))).GetProperty("groups").EnumerateArray().ToList();
        var people = groups.Single(g => g.GetProperty("code").GetString() == "fleet.people-credentials");
        Assert.Contains(people.GetProperty("items").EnumerateArray(), i => i.GetProperty("title").GetString() == "Ruiz, Ana — Carnet de autoelevadorista");
    }
}
