using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using LealControl.Modules.Crm.Infrastructure.Http;
using Xunit;

namespace LealControl.Modules.Quality.Tests;

/// <summary>Informe de báscula camionera de punta a punta: alta en borrador, carga, cálculo, número servicio-instrumento y emisión.</summary>
public sealed class TruckScaleReportApiTests : IClassFixture<QualityWebApplicationFactory>
{
    private readonly QualityWebApplicationFactory _factory;
    public TruckScaleReportApiTests(QualityWebApplicationFactory factory) => _factory = factory;

    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, body);
        return JsonDocument.Parse(body).RootElement.Clone();
    }

    [Fact]
    public async Task Truck_scale_report_is_loaded_calculated_and_issued_only_with_valid_standards()
    {
        using var client = _factory.CreateClient();
        var token = SimpleJwt.CreateToken(Guid.NewGuid(), "tecnico@example.com", "Técnico", "Admin", QualityWebApplicationFactory.DemoTenantId, "Empresa Test", """["quality","metrology"]""");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        client.DefaultRequestHeaders.Add("X-Tenant-Id", QualityWebApplicationFactory.DemoTenantId.ToString());

        var equipment = (await Json(await client.PostAsJsonAsync("/api/v1/metrology/equipment", new
        {
            code = $"CAM-{Guid.NewGuid():N}"[..12], description = "Báscula camionera 80 t", customerName = "Cliente de prueba", location = "Salida de silos",
            applicableStandard = "Res2307_80", platformType = "TruckScale", indicator1Brand = "GaMa", indicator1Model = "A12", maxCapacity = 80000m,
            minCapacity = 1000m, divisionD = 20m, verificationIntervalE = 20m, unit = "kg", accuracyClass = "III", indicationType = "Digital", loadCellsCount = 8
        }))).GetProperty("id").GetGuid();
        async Task<Guid> Weight(string code, decimal mass, string expiration) =>
            (await Json(await client.PostAsJsonAsync("/api/v1/metrology/weights", new { code, nominalValue = mass, unit = "kg", certificateNumber = "CERT-1", expirationDate = expiration }))).GetProperty("id").GetGuid();
        var weights = new List<Guid>();
        for (var i = 1; i <= 10; i++) weights.Add(await Weight($"TS-{Guid.NewGuid():N}"[..10], 1000m, "2027-09-02T00:00:00Z"));
        var expired = await Weight($"TS-OLD-{Guid.NewGuid():N}"[..12], 1000m, "2026-07-01T00:00:00Z");

        object Input(List<Guid> ids, string service = "2601") => new
        {
            equipmentId = equipment, standard = "2307", serviceNumber = service, remitoNumber = "0003-00002601", orderReference = "Presupuesto 3630", procedureCode = "PE-02 rev03",
            calibrationDate = "2026-07-21T00:00:00Z", nextCalibrationDate = (string?)null, performedBy = "Técnico de prueba", modules = 4, weightIds = ids,
            substitution = (object?)null, inspection = new[] { new { point = "Celdas de carga y soportes", status = "OK", observation = (string?)null } },
            weighing = new[] { new { load = 1000m, weights = 1000m, substitution = 0m, ascending = 1000m, descending = (decimal?)1000m }, new { load = 10000m, weights = 10000m, substitution = 0m, ascending = 10000m, descending = (decimal?)null } },
            repeatability = new { load = 10000m, readings = new[] { 10000m, 10000m, 10000m } },
            eccentricity = new { method = "apoyos", load = 10000m, positions = Enumerable.Range(1, 8).Select(i => new { position = $"Apoyo {i}", reading = 10000m }), rows = (string[]?)null },
            zero = new { at4Percent = true, at4PercentPlusE = false, zeroErrorE = (decimal?)null }, mobility = Array.Empty<object>(), observations = Array.Empty<string>(),
            temperatureCelsius = (decimal?)22m, thermometerInstrumentId = (Guid?)null
        };

        var created = await Json(await client.PostAsJsonAsync("/api/v1/metrology/reports/truck-scale", Input([.. weights, expired])));
        var id = created.GetProperty("id").GetGuid();
        Assert.Equal("2601-1", created.GetProperty("number").GetString());
        Assert.Equal("Draft", created.GetProperty("reportStatus").GetString());
        var evaluation = created.GetProperty("evaluation");
        Assert.True(evaluation.GetProperty("conforming").GetBoolean());
        Assert.Equal("NoEnsayado", evaluation.GetProperty("requirements")[3].GetProperty("verdict").GetString());
        // Patrones agrupados por masa y certificado desde el maestro de pesas.
        Assert.Equal(2, created.GetProperty("data").GetProperty("weights").GetArrayLength());
        Assert.Contains(evaluation.GetProperty("warnings").EnumerateArray(), w => w.GetString()!.Contains("venció el 01/07/2026"));

        // Con un patrón vencido no se emite; sin él, sí.
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync($"/api/v1/metrology/reports/{id}/approve", null)).StatusCode);
        await Json(await client.PutAsJsonAsync($"/api/v1/metrology/reports/{id}/truck-scale", Input(weights)));
        // Sin firma cargada no se emite; con la firma, sale con el nombre de quien emite.
        var noSignature = await client.PostAsync($"/api/v1/metrology/reports/{id}/approve", null);
        Assert.Equal(HttpStatusCode.BadRequest, noSignature.StatusCode);
        Assert.Contains("firma", await noSignature.Content.ReadAsStringAsync());
        await Json(await client.PutAsJsonAsync("/api/v1/metrology/signatories/me", new { fullName = "Ing. Responsable", title = "Responsable técnico", license = (string?)null,
            signatureBase64 = "data:image/png;base64," + Convert.ToBase64String(new byte[] { 0x89, 0x50, 0x4E, 0x47, 1, 2, 3 }) }));
        await Json(await client.PostAsync($"/api/v1/metrology/reports/{id}/approve", null));
        var issued = await Json(await client.GetAsync($"/api/v1/metrology/reports/{id}/truck-scale"));
        Assert.Equal("Issued", issued.GetProperty("reportStatus").GetString());
        Assert.Equal("Ing. Responsable", issued.GetProperty("approvedBy").GetString());
        var signature = await client.GetAsync($"/api/v1/metrology/signatories/{issued.GetProperty("approvedByUserId").GetGuid()}/signature");
        Assert.Equal("image/png", signature.Content.Headers.ContentType?.MediaType);
        Assert.StartsWith("2027-07-21", issued.GetProperty("nextCalibrationDate").GetString());
        Assert.Equal(HttpStatusCode.Conflict, (await client.PutAsJsonAsync($"/api/v1/metrology/reports/{id}/truck-scale", Input(weights))).StatusCode);

        // Segundo instrumento del mismo servicio.
        Assert.Equal("2601-2", (await Json(await client.PostAsJsonAsync("/api/v1/metrology/reports/truck-scale", Input(weights)))).GetProperty("number").GetString());
    }
}
