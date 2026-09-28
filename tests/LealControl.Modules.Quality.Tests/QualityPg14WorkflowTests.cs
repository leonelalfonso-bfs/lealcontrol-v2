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
    public async Task Annual_maintenance_months_cycle_and_completed_month_creates_one_log()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var equipment = await client.PostAsJsonAsync("/api/v1/quality/records/pg14/equipment", new
        {
            kind = "Other", description = "Comparador de prueba"
        });
        Assert.Equal(HttpStatusCode.Created, equipment.StatusCode);
        var eq = await equipment.Content.ReadFromJsonAsync<JsonElement>();
        var eqId = eq.GetProperty("id").GetGuid();
        var url = "/api/v1/quality/records/pg14/r06";
        var year = DateTime.UtcNow.Year - 1;
        var invalid = await client.PostAsJsonAsync(url, new { equipmentId = eqId, activity = "Limpieza", programYear = year, months = "PPP" });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        var created = await client.PostAsJsonAsync(url, new { equipmentId = eqId, activity = "Limpieza", programYear = year, months = "P-----------" });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var plan = await created.Content.ReadFromJsonAsync<JsonElement>();
        var id = plan.GetProperty("id").GetGuid();
        Assert.Equal("P-----------", plan.GetProperty("months").GetString());
        Assert.True(plan.GetProperty("isOverdue").GetBoolean());
        var done = await client.PutAsJsonAsync($"{url}/{id}", new { month = 1, monthValue = "D" });
        Assert.Equal(HttpStatusCode.OK, done.StatusCode);
        plan = await done.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("D-----------", plan.GetProperty("months").GetString());
        Assert.False(plan.GetProperty("isOverdue").GetBoolean());
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
            activity = "Control preventivo", months = "P-----------" });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var plan = await created.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(source, plan.GetProperty("assetSource").GetString());
        Assert.Equal(code, plan.GetProperty("equipmentCode").GetString());
        var id = plan.GetProperty("id").GetGuid();
        var done = await client.PutAsJsonAsync($"{url}/{id}", new { month = 1, monthValue = "D" });
        Assert.Equal(HttpStatusCode.OK, done.StatusCode);
        var logs = await client.GetFromJsonAsync<JsonElement>($"/api/v1/quality/records/pg14/r01?assetSource={source}&assetId={assetId}");
        Assert.Single(logs.GetProperty("rows").EnumerateArray(), log =>
            log.GetProperty("kind").GetString() == "MP" && log.GetProperty("assetSource").GetString() == source);
    }

}
