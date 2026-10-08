using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>
/// Flota, entrega 1a: unidades con validación, lecturas que no bajan y vencimientos con
/// renovación y faltantes. El reloj de pruebas está fijo en el 2/10/2026.
/// </summary>
public sealed class FleetApiTests : IAsyncLifetime
{
    private readonly CrmWebApplicationFactory _factory = new();
    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    // La API acepta y devuelve las enumeraciones como texto.
    private const string Pickup = "Pickup", Forklift = "Forklift", SemiTrailer = "SemiTrailer";
    private const string Km = "Kilometers", Hours = "Hours", NoMeter = "None";
    private const string Vtv = "VtvRto", Insurance = "InsurancePolicy", ForkliftCert = "ForkliftCertification";
    private const string Active = "Active", Sold = "Sold";

    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.RootElement.Clone();
    }

    private static async Task<string> Detail(HttpResponseMessage response) =>
        (await Json(response)).GetProperty("detail").GetString() ?? "";

    private static object Unit(string type, string? plate, string? code, string meter, int? km = null, decimal? hours = null, string status = Active) => new
    {
        type, plate, internalCode = code, brand = "Toyota", model = "Hilux", year = 2022, meterType = meter,
        vinChassis = "", engineNumber = "", fuelType = "Diesel", status, initialKilometers = km, initialHours = hours
    };

    [Fact]
    public async Task Units_are_validated_and_identified_by_plate_or_internal_code()
    {
        using var client = _factory.CreateAuthenticatedClient();

        using var noId = await client.PostAsJsonAsync("/api/v1/fleet/vehicles", Unit(Pickup, "", "", Km));
        Assert.Equal(HttpStatusCode.BadRequest, noId.StatusCode);
        Assert.Contains("patente", await Detail(noId));

        using var created = await client.PostAsJsonAsync("/api/v1/fleet/vehicles", Unit(Pickup, "ab 123 cd", null, Km, km: 15000));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var pickup = await Json(created);
        Assert.Equal("AB123CD", pickup.GetProperty("plate").GetString());
        Assert.Equal(15000, pickup.GetProperty("currentKilometers").GetInt32());

        using var duplicate = await client.PostAsJsonAsync("/api/v1/fleet/vehicles", Unit(Pickup, "AB-123-CD", null, Km));
        Assert.Equal(HttpStatusCode.BadRequest, duplicate.StatusCode);
        Assert.Contains("AB123CD", await Detail(duplicate));

        using var forklift = await client.PostAsJsonAsync("/api/v1/fleet/vehicles", Unit(Forklift, null, "ae-01", Hours, hours: 1200m));
        Assert.Equal(HttpStatusCode.Created, forklift.StatusCode);
        var forkliftJson = await Json(forklift);
        Assert.Equal("AE-01", forkliftJson.GetProperty("label").GetString());

        // Un autoelevador medido por horas no acepta kilómetros.
        var forkliftId = forkliftJson.GetProperty("id").GetGuid();
        using var kmOnForklift = await client.PostAsJsonAsync($"/api/v1/fleet/vehicles/{forkliftId}/readings", new { kilometers = 10 });
        Assert.Equal(HttpStatusCode.BadRequest, kmOnForklift.StatusCode);
    }

    [Fact]
    public async Task Readings_cannot_go_down_unless_it_is_a_justified_correction()
    {
        using var client = _factory.CreateAuthenticatedClient();
        using var created = await client.PostAsJsonAsync("/api/v1/fleet/vehicles", Unit(Pickup, "AA111AA", null, Km, km: 50000));
        var id = (await Json(created)).GetProperty("id").GetGuid();
        var readings = $"/api/v1/fleet/vehicles/{id}/readings";

        using (var lower = await client.PostAsJsonAsync(readings, new { kilometers = 49000 }))
        {
            Assert.Equal(HttpStatusCode.BadRequest, lower.StatusCode);
            Assert.Contains("no pueden bajar", await Detail(lower));
        }
        using (var noReason = await client.PostAsJsonAsync(readings, new { kilometers = 49000, correction = true }))
            Assert.Equal(HttpStatusCode.BadRequest, noReason.StatusCode);
        using (var future = await client.PostAsJsonAsync(readings, new { kilometers = 51000, date = "2026-10-03" }))
            Assert.Equal(HttpStatusCode.BadRequest, future.StatusCode);

        using (var ok = await client.PostAsJsonAsync(readings, new { kilometers = 51200, date = "2026-10-01" }))
            Assert.Equal(51200, (await Json(ok)).GetProperty("currentKilometers").GetInt32());
        using (var fix = await client.PostAsJsonAsync(readings, new { kilometers = 51020, correction = true, note = "Se cargó 51200 por error" }))
            Assert.Equal(51020, (await Json(fix)).GetProperty("currentKilometers").GetInt32());

        var history = await Json(await client.GetAsync(readings));
        Assert.Equal(3, history.GetArrayLength()); // inicial + lectura + corrección
    }

    [Fact]
    public async Task Expirations_show_expired_due_soon_and_missing_and_renewal_replaces_the_previous()
    {
        using var client = _factory.CreateAuthenticatedClient();
        using var created = await client.PostAsJsonAsync("/api/v1/fleet/vehicles", Unit(Pickup, "AC222CC", null, Km));
        var id = (await Json(created)).GetProperty("id").GetGuid();
        using var forkliftResponse = await client.PostAsJsonAsync("/api/v1/fleet/vehicles", Unit(Forklift, null, "AE-02", Hours));
        using var soldResponse = await client.PostAsJsonAsync("/api/v1/fleet/vehicles", Unit(SemiTrailer, "AD333DD", null, NoMeter, status: Sold));
        Assert.Equal(HttpStatusCode.Created, soldResponse.StatusCode);

        // Sin cargar nada: faltan VTV y seguro de la camioneta y la habilitación del autoelevador.
        // La unidad dada de baja no cuenta.
        var empty = await Json(await client.GetAsync("/api/v1/fleet/expirations"));
        Assert.Equal(3, empty.GetProperty("missing").GetInt32());

        var docs = $"/api/v1/fleet/vehicles/{id}/documents";
        using (var vtv = await client.PostAsJsonAsync(docs, new { documentType = Vtv, expirationDate = "2026-10-10", alertDaysBefore = 30 }))
        {
            Assert.Equal(HttpStatusCode.Created, vtv.StatusCode);
            var view = await Json(vtv);
            Assert.Equal(8, view.GetProperty("daysRemaining").GetInt32());
            Assert.Equal("DueSoon", view.GetProperty("state").GetString());
        }
        using (var insurance = await client.PostAsJsonAsync(docs, new { documentType = Insurance, expirationDate = "2026-09-30", issueDate = "2025-09-30" }))
            Assert.Equal("Expired", (await Json(insurance)).GetProperty("state").GetString());
        using (var bad = await client.PostAsJsonAsync(docs, new { documentType = Vtv, expirationDate = "2026-01-01", issueDate = "2026-02-01" }))
            Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);

        var panel = await Json(await client.GetAsync("/api/v1/fleet/expirations"));
        Assert.Equal(1, panel.GetProperty("expired").GetInt32());
        Assert.Equal(1, panel.GetProperty("dueSoon").GetInt32());
        Assert.Equal(1, panel.GetProperty("missing").GetInt32()); // la habilitación del autoelevador
        Assert.Equal("Expired", panel.GetProperty("items")[0].GetProperty("state").GetString()); // primero los vencidos

        // Renovar la VTV: la anterior pasa al historial y la nueva está al día.
        Guid renewedId;
        using (var renewed = await client.PostAsJsonAsync(docs, new { documentType = Vtv, expirationDate = "2027-10-10" }))
            renewedId = (await Json(renewed)).GetProperty("id").GetGuid();
        var active = await Json(await client.GetAsync(docs));
        Assert.Equal(2, active.GetArrayLength());
        var all = await Json(await client.GetAsync(docs + "?history=true"));
        Assert.Equal(3, all.GetArrayLength());
        Assert.Equal(1, (await Json(await client.GetAsync("/api/v1/fleet/expirations"))).GetProperty("expired").GetInt32());
        Assert.Equal(0, (await Json(await client.GetAsync("/api/v1/fleet/expirations"))).GetProperty("dueSoon").GetInt32());

        // Borrar la renovación cargada por error: vuelve a regir la anterior.
        using (var deleted = await client.DeleteAsync($"/api/v1/fleet/documents/{renewedId}"))
            Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
        Assert.Equal(1, (await Json(await client.GetAsync("/api/v1/fleet/expirations"))).GetProperty("dueSoon").GetInt32());

        // El listado de unidades trae el resumen por unidad.
        var units = await Json(await client.GetAsync("/api/v1/fleet/vehicles"));
        var pickup = units.EnumerateArray().Single(u => u.GetProperty("id").GetGuid() == id);
        Assert.Equal(1, pickup.GetProperty("expiredCount").GetInt32());
        Assert.Equal(1, pickup.GetProperty("dueSoonCount").GetInt32());
        Assert.Equal("2026-10-10", pickup.GetProperty("nextExpirationDate").GetString());
        Assert.DoesNotContain(units.EnumerateArray(), u => u.GetProperty("label").GetString() == "AD333DD");

        // El autoelevador con su habilitación vigente deja de figurar como faltante.
        var forkliftId = (await Json(forkliftResponse)).GetProperty("id").GetGuid();
        using (var cert = await client.PostAsJsonAsync($"/api/v1/fleet/vehicles/{forkliftId}/documents", new { documentType = ForkliftCert, expirationDate = "2027-06-30" }))
            Assert.Equal(HttpStatusCode.Created, cert.StatusCode);
        Assert.Equal(0, (await Json(await client.GetAsync("/api/v1/fleet/expirations"))).GetProperty("missing").GetInt32());
    }
}
