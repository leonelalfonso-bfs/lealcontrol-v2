using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using LealControl.Modules.Crm.Infrastructure.Http;
using System.Text.Json;
using Xunit;

namespace LealControl.Modules.Quality.Tests;

public sealed class QualityPg14WorkflowTests : IClassFixture<QualityWebApplicationFactory>
{
    private readonly QualityWebApplicationFactory _factory;
    public QualityPg14WorkflowTests(QualityWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task Abba_check_is_calculated_and_appears_in_the_six_month_schedule()
    {
        using var client = _factory.CreateClient();
        var tenant = QualityWebApplicationFactory.DemoTenantId;
        var token = SimpleJwt.CreateToken(Guid.NewGuid(), "quality@example.com", "Quality", "Admin", tenant,
            "Empresa Test", """["quality","metrology"]""");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        client.DefaultRequestHeaders.Add("X-Tenant-Id", tenant.ToString());

        async Task<Guid> AddWeight(string code, int mass)
        {
            var result = await client.PostAsJsonAsync("/api/v1/metrology/weights", new { code, nominalValue = mass, unit = "kg" });
            Assert.Equal(HttpStatusCode.Created, result.StatusCode);
            var json = await result.Content.ReadFromJsonAsync<JsonElement>();
            return json.GetProperty("id").GetGuid();
        }
        var target = await AddWeight("PG14-TARGET", 1000);
        var master = await AddWeight("PG14-MASTER", 1000);
        var checkUrl = "/api/v1/quality/records/pg14/r05";
        var invalid = await client.PostAsJsonAsync(checkUrl, new
        {
            targetWeightId = target, masterWeightId = target, comparatorResolution = 0.001m,
            readingA1 = 0m, readingB1 = 0.002m, readingB2 = 0.004m, readingA2 = 0m
        });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);

        var created = await client.PostAsJsonAsync(checkUrl, new
        {
            targetWeightId = target, masterWeightId = master, comparatorResolution = 0.001m,
            readingA1 = 0m, readingB1 = 0.002m, readingB2 = 0.004m, readingA2 = 0m,
            result = "Pass", responsible = "Técnico"
        });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var row = await created.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(0.003m, row.GetProperty("meanDifference").GetDecimal());
        var id = row.GetProperty("id").GetGuid();
        var completed = await client.PutAsJsonAsync($"{checkUrl}/{id}", new { status = "Completed" });
        Assert.Equal(HttpStatusCode.OK, completed.StatusCode);
        var list = await client.GetFromJsonAsync<JsonElement>(checkUrl);
        var schedule = list.GetProperty("schedule").EnumerateArray().First(r => r.GetProperty("weightId").GetGuid() == target);
        Assert.NotEqual(JsonValueKind.Null, schedule.GetProperty("nextDate").ValueKind);
        Assert.True(schedule.GetProperty("isReferenceMass").GetBoolean());
        var logs = await client.GetFromJsonAsync<JsonElement>($"/api/v1/quality/records/pg14/r01?assetSource=StandardWeight&assetId={target}");
        Assert.Contains(logs.GetProperty("rows").EnumerateArray(), log =>
            log.GetProperty("kind").GetString() == "V" && log.GetProperty("assetId").GetGuid() == target);
    }

    [Fact]
    public async Task Maintenance_months_keep_their_year_and_a_done_month_creates_one_log()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var equipment = await client.PostAsJsonAsync("/api/v1/quality/records/pg14/equipment", new
        {
            kind = "Other", description = "Comparador de prueba"
        });
        Assert.Equal(HttpStatusCode.Created, equipment.StatusCode);
        var eq = await equipment.Content.ReadFromJsonAsync<JsonElement>();
        var eqId = eq.GetProperty("id").GetGuid();
        Assert.Matches("^EQ-\\d{4}$", eq.GetProperty("code").GetString());
        var url = "/api/v1/quality/records/pg14/r06";
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(url, new { equipmentId = eqId, activity = "Limpieza", frequency = "Quarterly" })).StatusCode);

        // Trimestral desde noviembre de 2027: noviembre en 2027 y febrero, mayo, agosto y noviembre en 2028 (antes corría todo a un solo año).
        var created = await client.PostAsJsonAsync(url, new { equipmentId = eqId, activity = "Limpieza", frequency = "Quarterly", firstDate = "2027-11-01" });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        string MonthsOf(JsonElement list) => list.GetProperty("rows").EnumerateArray().Single(r => r.GetProperty("id").GetGuid() == id).GetProperty("months").GetString()!;
        Assert.Equal("----------P-", MonthsOf(await client.GetFromJsonAsync<JsonElement>($"{url}?year=2027")));
        Assert.Equal("-P--P--P--P-", MonthsOf(await client.GetFromJsonAsync<JsonElement>($"{url}?year=2028")));
        var plan = await client.GetFromJsonAsync<JsonElement>($"{url}/{id}");
        Assert.Equal("2027-11-30", plan.GetProperty("nextDue").GetString()![..10]);

        // Realizado en febrero de 2028: R en ese año, hoja de vida con un mantenimiento preventivo.
        var done = await client.PutAsJsonAsync($"{url}/{id}", new { year = 2028, month = 2, monthValue = "R" });
        Assert.Equal(HttpStatusCode.OK, done.StatusCode);
        Assert.Equal("-R--P--P--P-", (await done.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("months").GetString());
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"{url}/{id}", new { year = 2028, month = 3, monthValue = "D" })).StatusCode);
        var logs = await client.GetFromJsonAsync<JsonElement>($"/api/v1/quality/records/pg14/r01?assetSource=QualityEquipment&assetId={eqId}");
        Assert.Single(logs.GetProperty("rows").EnumerateArray(), log => log.GetProperty("kind").GetString() == "MP");
    }

    [Theory]
    [InlineData("StandardWeight")]
    [InlineData("Instrument")]
    public async Task Maintenance_of_metrology_asset_appears_in_its_lifecycle(string source)
    {
        using var client = _factory.CreateClient();
        var tenant = QualityWebApplicationFactory.DemoTenantId;
        var token = SimpleJwt.CreateToken(Guid.NewGuid(), "quality@example.com", "Quality", "Admin", tenant,
            "Empresa Test", """["quality","metrology"]""");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        client.DefaultRequestHeaders.Add("X-Tenant-Id", tenant.ToString());
        var code = $"MP-{Guid.NewGuid():N}"[..30];
        var assetResponse = source == "StandardWeight"
            ? await client.PostAsJsonAsync("/api/v1/metrology/weights", new { code, nominalValue = 1000, unit = "kg" })
            : await client.PostAsJsonAsync("/api/v1/metrology/instruments", new { code, kind = "Thermometer", description = "Termómetro de prueba" });
        Assert.Equal(HttpStatusCode.Created, assetResponse.StatusCode);
        var asset = await assetResponse.Content.ReadFromJsonAsync<JsonElement>();
        var assetId = asset.GetProperty("id").GetGuid();
        var url = "/api/v1/quality/records/pg14/r06";
        var created = await client.PostAsJsonAsync(url, new { assetSource = source, equipmentId = assetId,
            activity = "Control preventivo", frequency = "Annual", firstDate = "2026-01-01" });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var plan = await created.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(source, plan.GetProperty("assetSource").GetString());
        // Número interno de PG14 y la identificación del equipo, los dos a la vista.
        Assert.Matches($"^EQ-\\d{{4}} \\({code}\\)$", plan.GetProperty("equipmentCode").GetString());
        var id = plan.GetProperty("id").GetGuid();
        var done = await client.PutAsJsonAsync($"{url}/{id}", new { year = 2026, month = 1, monthValue = "R" });
        Assert.Equal(HttpStatusCode.OK, done.StatusCode);
        var logs = await client.GetFromJsonAsync<JsonElement>($"/api/v1/quality/records/pg14/r01?assetSource={source}&assetId={assetId}");
        Assert.Single(logs.GetProperty("rows").EnumerateArray(), log =>
            log.GetProperty("kind").GetString() == "MP" && log.GetProperty("assetSource").GetString() == source);
    }


    [Fact]
    public async Task Certificates_list_their_equipment_with_internal_number_and_identification()
    {
        using var client = _factory.CreateClient();
        var tenant = QualityWebApplicationFactory.DemoTenantId;
        var token = SimpleJwt.CreateToken(Guid.NewGuid(), "quality@example.com", "Quality", "Admin", tenant,
            "Empresa Test", """["quality","metrology"]""");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        client.DefaultRequestHeaders.Add("X-Tenant-Id", tenant.ToString());
        var cert = $"CERT-{Guid.NewGuid():N}"[..20];
        var code = $"W-{Guid.NewGuid():N}"[..12];
        var weight = await client.PostAsJsonAsync("/api/v1/metrology/weights", new
        {
            code, serialNumber = "S-123", nominalValue = 20, unit = "kg", certificateNumber = cert, traceabilityLab = "Laboratorio Ejemplo",
            calibrationDate = "2026-01-10T00:00:00Z", expirationDate = "2028-01-10T00:00:00Z"
        });
        Assert.Equal(HttpStatusCode.Created, weight.StatusCode);
        var weightId = (await weight.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        var list = await client.GetFromJsonAsync<JsonElement>("/api/v1/quality/records/pg17/certificates");
        Assert.Contains(list.GetProperty("missing").EnumerateArray(), m => m.GetProperty("number").GetString() == cert);

        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/v1/quality/records/pg17/certificates",
            new { number = cert, calibrationDate = "2026-01-10", expirationDate = "2025-01-10" })).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/api/v1/quality/records/pg17/certificates",
            new { number = cert, laboratory = "Laboratorio Ejemplo", calibrationDate = "2026-01-10", expirationDate = "2028-01-10" })).StatusCode);

        var detail = await client.GetFromJsonAsync<JsonElement>($"/api/v1/quality/records/pg17/certificates/by-number/{cert}");
        Assert.Equal("Vigente", detail.GetProperty("status").GetString());
        var asset = Assert.Single(detail.GetProperty("assets").EnumerateArray());
        Assert.Equal(weightId, asset.GetProperty("id").GetGuid());
        Assert.Matches("^EQ-\\d{4}$", asset.GetProperty("internalCode").GetString());
        Assert.Equal(code, asset.GetProperty("code").GetString());
        Assert.Equal(HttpStatusCode.BadRequest, (await client.DeleteAsync($"/api/v1/quality/records/pg17/certificates/{detail.GetProperty("id").GetGuid()}")).StatusCode);

        // El número interno no se repite entre equipos.
        var other = await client.PostAsJsonAsync("/api/v1/metrology/instruments", new { code = $"T-{Guid.NewGuid():N}"[..12], kind = "Thermometer", description = "Termómetro" });
        var otherId = (await other.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"/api/v1/metrology/instruments/{otherId}",
            new { code = "x", internalCode = asset.GetProperty("internalCode").GetString() })).StatusCode);
    }
}
