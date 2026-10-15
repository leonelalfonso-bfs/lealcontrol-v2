using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>Flota 2b: plan de mantenimiento, trabajos de taller, combustible y costos. Reloj: 2/10/2026.</summary>
public sealed class FleetMaintenanceApiTests : IAsyncLifetime
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

    private static async Task<Guid> VehicleAsync(HttpClient client, string type, string plate, int km) =>
        (await Json(await client.PostAsJsonAsync("/api/v1/fleet/vehicles", new
        {
            type, plate, brand = "Toyota", model = "Hilux", year = 2022, meterType = "Kilometers", initialKilometers = km
        }))).GetProperty("id").GetGuid();

    private static Task<HttpResponseMessage> ReadingAsync(HttpClient client, Guid vehicle, int km) =>
        client.PostAsJsonAsync($"/api/v1/fleet/vehicles/{vehicle}/readings", new { kilometers = km });

    private static async Task<JsonElement> PlanAsync(HttpClient client, Guid vehicle) =>
        (await Json(await client.GetAsync($"/api/v1/fleet/vehicles/{vehicle}/plans")))[0];

    [Fact]
    public async Task Service_plan_warns_by_km_and_a_completed_job_restarts_the_count()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var pickup = await VehicleAsync(client, "Pickup", "AB123CD", 10000);
        var plans = $"/api/v1/fleet/vehicles/{pickup}/plans";

        using (var noInterval = await client.PostAsJsonAsync(plans, new { title = "Aceite" }))
            Assert.Equal(HttpStatusCode.BadRequest, noInterval.StatusCode);
        using (var hours = await client.PostAsJsonAsync(plans, new { title = "Aceite", intervalHours = 250 }))
            Assert.Equal(HttpStatusCode.BadRequest, hours.StatusCode); // la camioneta no mide horas

        var plan = await Json(await client.PostAsJsonAsync(plans, new { title = "Aceite y filtros", intervalKm = 10000, intervalDays = 365, lastDoneDate = "2026-01-01" }));
        var planId = plan.GetProperty("id").GetGuid();
        Assert.Equal(20000, plan.GetProperty("nextKm").GetInt32()); // desde la lectura actual
        Assert.Equal("2027-01-01", plan.GetProperty("nextDate").GetString());
        Assert.Equal("Ok", plan.GetProperty("state").GetString());

        await Json(await ReadingAsync(client, pickup, 19500));
        Assert.Equal("DueSoon", (await PlanAsync(client, pickup)).GetProperty("state").GetString());
        var notices = (await Json(await client.GetAsync("/api/v1/notices/mine"))).GetProperty("groups").EnumerateArray()
            .Single(g => g.GetProperty("code").GetString() == "fleet.services");
        Assert.Contains("faltan 500 km", notices.GetProperty("items")[0].GetProperty("detail").GetString());

        await Json(await ReadingAsync(client, pickup, 20100));
        var overdue = await PlanAsync(client, pickup);
        Assert.Equal("Expired", overdue.GetProperty("state").GetString());
        Assert.Contains("pasado por 100 km", overdue.GetProperty("dueText").GetString());

        // Entra al taller: la unidad deja de estar disponible.
        var maintenances = $"/api/v1/fleet/vehicles/{pickup}/maintenances";
        var job = await Json(await client.PostAsJsonAsync(maintenances, new
        {
            type = "Preventive", status = "InProgress", title = "", date = "2026-10-02", planIds = new[] { planId }
        }));
        Assert.Equal("Aceite y filtros", job.GetProperty("title").GetString());
        Assert.Equal("InMaintenance", (await Json(await client.GetAsync($"/api/v1/fleet/vehicles/{pickup}"))).GetProperty("status").GetString());
        var panel = await Json(await client.GetAsync("/api/v1/fleet/maintenance"));
        Assert.Equal(1, panel.GetProperty("inShop").GetArrayLength());
        Assert.Equal(1, panel.GetProperty("expired").GetInt32());

        // Terminado: necesita los km del momento; la cuenta vuelve a empezar y la unidad queda disponible.
        var jobUrl = $"/api/v1/fleet/maintenances/{job.GetProperty("id").GetGuid()}";
        using (var noKm = await client.PutAsJsonAsync(jobUrl, new { type = "Preventive", status = "Completed", title = "Aceite y filtros", date = "2026-10-02", planIds = new[] { planId } }))
            Assert.Equal(HttpStatusCode.BadRequest, noKm.StatusCode);
        await Json(await client.PutAsJsonAsync(jobUrl, new
        {
            type = "Preventive", status = "Completed", title = "Aceite y filtros", date = "2026-10-02", km = 20200, totalCost = 150000m, planIds = new[] { planId }
        }));
        var vehicle = await Json(await client.GetAsync($"/api/v1/fleet/vehicles/{pickup}"));
        Assert.Equal("Active", vehicle.GetProperty("status").GetString());
        Assert.Equal(20200, vehicle.GetProperty("currentKilometers").GetInt32());
        var renewed = await PlanAsync(client, pickup);
        Assert.Equal("Ok", renewed.GetProperty("state").GetString());
        Assert.False(renewed.GetProperty("lastDoneFromBaseline").GetBoolean());
        Assert.Equal(30200, renewed.GetProperty("nextKm").GetInt32());
        Assert.Equal("2027-10-02", renewed.GetProperty("nextDate").GetString());

        // Borrar el trabajo (carga equivocada): el plan vuelve a contar desde el punto de partida.
        using (var deleted = await client.DeleteAsync(jobUrl)) Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
        Assert.Equal("Expired", (await PlanAsync(client, pickup)).GetProperty("state").GetString());

        // Un trabajo hecho no puede tener fecha futura; uno programado sí.
        using (var future = await client.PostAsJsonAsync(maintenances, new { type = "Corrective", status = "Completed", title = "Frenos", date = "2026-10-20" }))
            Assert.Equal(HttpStatusCode.BadRequest, future.StatusCode);
        await Json(await client.PostAsJsonAsync(maintenances, new { type = "Inspection", status = "Scheduled", title = "Revisión", date = "2026-10-20" }));
        Assert.Equal(1, (await Json(await client.GetAsync("/api/v1/fleet/maintenance"))).GetProperty("scheduled").GetArrayLength());
    }

    [Fact]
    public async Task Fuel_logs_compute_consumption_and_costs_are_hidden_without_permission()
    {
        using var admin = _factory.CreateAuthenticatedClient();
        var truck = await VehicleAsync(admin, "Truck", "AF456GH", 100000);
        var employee = (await Json(await admin.PostAsJsonAsync("/api/v1/hr/employees", new
        {
            firstName = "Juan", lastName = "Gómez", documentNumber = "30111222", cuil = "20301112220", hireDate = "2020-01-01T00:00:00Z"
        }))).GetProperty("id").GetGuid();

        using (var notMember = await admin.PostAsJsonAsync("/api/v1/fleet/fuel-logs", new { vehicleId = truck, liters = 100m, km = 100500, employeeId = employee }))
            Assert.Equal(HttpStatusCode.BadRequest, notMember.StatusCode);
        await Json(await admin.PostAsJsonAsync("/api/v1/fleet/people", new { employeeId = employee, isDriver = true }));
        using (var noKm = await admin.PostAsJsonAsync("/api/v1/fleet/fuel-logs", new { vehicleId = truck, liters = 100m }))
            Assert.Equal(HttpStatusCode.BadRequest, noKm.StatusCode);

        var first = await Json(await admin.PostAsJsonAsync("/api/v1/fleet/fuel-logs", new
        {
            vehicleId = truck, date = "2026-10-01", km = 100500, liters = 100m, pricePerLiter = 1500m, employeeId = employee
        }));
        Assert.Equal(JsonValueKind.Null, first.GetProperty("kmPerLiter").ValueKind); // no hay carga anterior
        var second = await Json(await admin.PostAsJsonAsync("/api/v1/fleet/fuel-logs", new
        {
            vehicleId = truck, date = "2026-10-02", km = 100900, liters = 50m, totalCost = 80000m, employeeId = employee
        }));
        Assert.Equal(8m, second.GetProperty("kmPerLiter").GetDecimal()); // 400 km / 50 l
        using (var lower = await admin.PostAsJsonAsync("/api/v1/fleet/fuel-logs", new { vehicleId = truck, date = "2026-10-02", km = 100800, liters = 10m }))
            Assert.Equal(HttpStatusCode.BadRequest, lower.StatusCode);

        var logs = await Json(await admin.GetAsync($"/api/v1/fleet/fuel-logs?vehicleId={truck}"));
        Assert.Equal(2, logs.GetArrayLength());
        Assert.Equal("Gómez, Juan", logs[0].GetProperty("personName").GetString());
        Assert.Equal(1600m, logs[0].GetProperty("pricePerLiter").GetDecimal());
        Assert.Equal(100900, (await Json(await admin.GetAsync($"/api/v1/fleet/vehicles/{truck}"))).GetProperty("currentKilometers").GetInt32());

        await Json(await admin.PostAsJsonAsync($"/api/v1/fleet/vehicles/{truck}/maintenances", new
        {
            type = "Corrective", status = "Completed", title = "Cubierta", date = "2026-10-02", km = 100900, totalCost = 50000m
        }));
        var costs = await Json(await admin.GetAsync("/api/v1/fleet/costs?from=2026-10-01&to=2026-10-02"));
        var row = costs.GetProperty("rows").EnumerateArray().Single(r => r.GetProperty("vehicleId").GetGuid() == truck);
        Assert.Equal(900, row.GetProperty("km").GetInt32());
        Assert.Equal(230000m, row.GetProperty("fuelCost").GetDecimal());
        Assert.Equal(280000m, row.GetProperty("totalCost").GetDecimal());
        Assert.Equal(311.11m, row.GetProperty("costPerKm").GetDecimal());
        Assert.Equal(6m, row.GetProperty("kmPerLiter").GetDecimal());

        // Sin el permiso de costos: carga combustible, pero no ve importes ni el informe de costos.
        var profile = await Json(await admin.PostAsJsonAsync("/api/v1/company/permission-profiles", new
        {
            name = "Chofer", matrix = new Dictionary<string, string> { ["fleet"] = "Edit" }, seeAmounts = false, seeCosts = false, seeSalaries = false
        }));
        var user = await Json(await admin.PostAsJsonAsync("/api/v1/company/users", new
        {
            fullName = "Chofer", email = "chofer@example.com", role = "Comercial", password = "Clave-1234", profileId = profile.GetProperty("id").GetGuid()
        }));
        using var driver = _factory.CreateClientForUser(user.GetProperty("id").GetGuid(), "chofer@example.com");
        await Json(await driver.PostAsJsonAsync("/api/v1/fleet/fuel-logs", new { vehicleId = truck, km = 101000, liters = 20m, totalCost = 30000m }));
        var seen = await driver.GetStringAsync($"/api/v1/fleet/fuel-logs?vehicleId={truck}");
        Assert.DoesNotContain("totalCost", seen);
        Assert.Contains("kmPerLiter", seen);
        var jobs = await driver.GetStringAsync($"/api/v1/fleet/vehicles/{truck}/maintenances");
        Assert.DoesNotContain("totalCost", jobs);
        // Edita el trabajo (el costo le llega vacío): el costo guardado no se pierde.
        var jobId = JsonDocument.Parse(jobs).RootElement[0].GetProperty("id").GetGuid();
        await Json(await driver.PutAsJsonAsync($"/api/v1/fleet/maintenances/{jobId}", new
        {
            type = "Corrective", status = "Completed", title = "Cubierta delantera", date = "2026-10-02", km = 100900, totalCost = 0m
        }));
        Assert.Equal(50000m, (await Json(await admin.GetAsync($"/api/v1/fleet/vehicles/{truck}/maintenances")))[0].GetProperty("totalCost").GetDecimal());
        using (var report = await driver.GetAsync("/api/v1/fleet/costs"))
            Assert.Equal(HttpStatusCode.Forbidden, report.StatusCode);
    }
}
