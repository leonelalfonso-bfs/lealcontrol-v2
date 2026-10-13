using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>
/// Flota 3: órdenes de servicio y agenda. No se asigna a nadie ni nada vencido (o que venza antes
/// del fin), en taller u ocupado en ese horario. Reloj: 2/10/2026.
/// </summary>
public sealed class FleetServiceOrdersApiTests : IAsyncLifetime
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

    private static async Task<string> RejectedAsync(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.RootElement.GetProperty("detail").GetString()!;
    }

    [Fact]
    public async Task Assignments_are_blocked_when_something_is_expired_busy_or_in_the_shop()
    {
        using var client = _factory.CreateAuthenticatedClient();

        var customer = (await Json(await client.PostAsJsonAsync("/api/v1/crm/customers", new
        {
            legalName = "Molinos del Sur SA", documentType = "Cuit", documentNumber = "20123456786",
            taxCondition = "ResponsableInscripto", iibbRegime = "Local", isCustomer = true, isSupplier = false
        }))).GetProperty("id").GetGuid();
        var found = await Json(await client.GetAsync("/api/v1/fleet/service-orders/customers?search=molinos"));
        Assert.Equal("Molinos del Sur SA", found[0].GetProperty("name").GetString());
        Assert.Equal(0, (await Json(await client.GetAsync("/api/v1/fleet/service-orders/sales-orders"))).GetArrayLength());

        // Camioneta con la documentación al día y un chofer con la licencia por vencer el 10/10.
        var pickup = (await Json(await client.PostAsJsonAsync("/api/v1/fleet/vehicles", new
        {
            type = "Pickup", plate = "AB123CD", brand = "Toyota", model = "Hilux", year = 2022, meterType = "Kilometers", initialKilometers = 50000
        }))).GetProperty("id").GetGuid();
        foreach (var doc in new[] { "VtvRto", "InsurancePolicy" })
            await Json(await client.PostAsJsonAsync($"/api/v1/fleet/vehicles/{pickup}/documents", new { documentType = doc, expirationDate = "2027-06-30" }));
        var employee = (await Json(await client.PostAsJsonAsync("/api/v1/hr/employees", new
        {
            firstName = "Juan", lastName = "Gómez", documentNumber = "30111222", cuil = "20301112223", hireDate = "2020-01-01T00:00:00Z"
        }))).GetProperty("id").GetGuid();
        var member = await Json(await client.PostAsJsonAsync("/api/v1/fleet/people", new { employeeId = employee, isDriver = true, isTechnician = true }));
        await Json(await client.PostAsJsonAsync($"/api/v1/fleet/people/{member.GetProperty("id").GetGuid()}/credentials",
            new { type = "DrivingLicense", category = "B1", expirationDate = "2026-10-10" }));

        var availability = await Json(await client.GetAsync(
            "/api/v1/fleet/service-orders/availability?start=2026-10-05T08:00:00-03:00&end=2026-10-05T18:00:00-03:00"));
        Assert.Empty(availability.GetProperty("people")[0].GetProperty("blockers").EnumerateArray());
        Assert.Empty(availability.GetProperty("vehicles")[0].GetProperty("blockers").EnumerateArray());

        var first = await Json(await client.PostAsJsonAsync("/api/v1/fleet/service-orders", new
        {
            customerId = customer, description = "Calibración de balanza de camiones", location = "Planta Bahía Blanca",
            start = "2026-10-05T08:00:00-03:00", end = "2026-10-05T18:00:00-03:00", employeeIds = new[] { employee }, vehicleIds = new[] { pickup }
        }));
        Assert.Equal("OS-00001", first.GetProperty("code").GetString());
        Assert.Equal("Scheduled", first.GetProperty("status").GetString());
        Assert.Equal("Molinos del Sur SA", first.GetProperty("customerName").GetString());
        Assert.Equal("AB123CD", first.GetProperty("vehicles")[0].GetProperty("label").GetString());
        var firstId = first.GetProperty("id").GetGuid();

        // La misma camioneta en un horario que se superpone: ocupada.
        var busy = await RejectedAsync(await client.PostAsJsonAsync("/api/v1/fleet/service-orders", new
        {
            customerName = "Otro cliente", description = "Visita", start = "2026-10-05T12:00:00-03:00", end = "2026-10-05T14:00:00-03:00", vehicleIds = new[] { pickup }
        }));
        Assert.Contains("AB123CD: ocupada en OS-00001", busy);

        // Un trabajo que termina después de que vence la licencia.
        var expiring = await RejectedAsync(await client.PostAsJsonAsync("/api/v1/fleet/service-orders", new
        {
            customerName = "Otro cliente", description = "Visita", start = "2026-10-12T08:00:00-03:00", end = "2026-10-12T12:00:00-03:00", employeeIds = new[] { employee }
        }));
        Assert.Contains("Licencia de conducir vence el 10/10", expiring);

        // Sin fecha: queda para coordinar, sin controles de horario.
        var pending = await Json(await client.PostAsJsonAsync("/api/v1/fleet/service-orders", new { customerName = "Otro cliente", description = "Visita", employeeIds = new[] { employee } }));
        Assert.Equal("Pending", pending.GetProperty("status").GetString());
        Assert.Equal("OS-00002", pending.GetProperty("code").GetString());

        var agenda = await Json(await client.GetAsync("/api/v1/fleet/agenda?from=2026-10-05"));
        Assert.Equal("2026-10-11", agenda.GetProperty("to").GetString());
        Assert.Equal(1, agenda.GetProperty("orders").GetArrayLength());
        Assert.Equal(1, agenda.GetProperty("unscheduled").GetArrayLength());
        Assert.Contains(agenda.GetProperty("events").EnumerateArray(), e => e.GetProperty("title").GetString() == "Gómez, Juan — vence Licencia de conducir");

        // Después de programar, la camioneta entra al taller: la orden lo muestra y llega el aviso.
        await Json(await client.PostAsJsonAsync($"/api/v1/fleet/vehicles/{pickup}/maintenances", new { type = "Corrective", status = "InProgress", title = "Embrague", date = "2026-10-02" }));
        var withProblem = await Json(await client.GetAsync($"/api/v1/fleet/service-orders/{firstId}"));
        Assert.Contains("AB123CD: en taller", withProblem.GetProperty("problems")[0].GetString());
        var notices = (await Json(await client.GetAsync("/api/v1/notices/mine"))).GetProperty("groups").EnumerateArray()
            .Single(g => g.GetProperty("code").GetString() == "fleet.service-orders");
        Assert.Equal("OS-00001 — Molinos del Sur SA", notices.GetProperty("items")[0].GetProperty("title").GetString());
        // Mientras siga en taller, no se puede reprogramar con esa unidad.
        Assert.Contains("en taller", await RejectedAsync(await client.PutAsJsonAsync($"/api/v1/fleet/service-orders/{firstId}", new
        {
            customerId = customer, description = "Calibración", start = "2026-10-05T08:00:00-03:00", end = "2026-10-05T18:00:00-03:00", vehicleIds = new[] { pickup }
        })));

        // Iniciar y terminar.
        Assert.Equal("InProgress", (await Json(await client.PostAsync($"/api/v1/fleet/service-orders/{firstId}/start", null))).GetProperty("status").GetString());
        await RejectedAsync(await client.PostAsJsonAsync($"/api/v1/fleet/service-orders/{firstId}/complete", new { workPerformed = "" }));
        var done = await Json(await client.PostAsJsonAsync($"/api/v1/fleet/service-orders/{firstId}/complete", new { workPerformed = "Calibrada con pesas patrón clase M1." }));
        Assert.Equal("Completed", done.GetProperty("status").GetString());
        await RejectedAsync(await client.PutAsJsonAsync($"/api/v1/fleet/service-orders/{firstId}", new { customerName = "X", description = "Y" }));
        Assert.Equal(1, (await Json(await client.GetAsync("/api/v1/fleet/service-orders?status=open"))).GetArrayLength());
    }
}
