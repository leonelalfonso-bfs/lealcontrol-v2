using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace LealControl.Modules.Quality.Tests;

public sealed class IndicatorTrackingTests : IClassFixture<QualityWebApplicationFactory>
{
    private readonly QualityWebApplicationFactory _factory;
    public IndicatorTrackingTests(QualityWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task Summary_uses_displayed_cumulative_even_for_yearly_indicator_with_monthly_values()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var name = "Indicador acumulado " + Guid.NewGuid().ToString("N");
        var created = await client.PostAsJsonAsync("/api/v1/quality/records/mc01-r03", new
        {
            name, targetValue = 100, targetUnit = "%", direction = "HigherIsBetter", frequency = "Yearly"
        });
        created.EnsureSuccessStatusCode();
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        foreach (var (period, value) in new[] { ("2026-01", 30), ("2026-09", 20), ("2026-12", 50) })
        {
            var response = await client.PostAsJsonAsync($"/api/v1/quality/records/mc01-r03/{id}/values", new { period, value });
            response.EnsureSuccessStatusCode();
        }
        var list = await client.GetFromJsonAsync<JsonElement>("/api/v1/quality/records/mc01-r03");
        var row = list.GetProperty("rows").EnumerateArray().Single(r => r.GetProperty("id").GetGuid() == id);
        Assert.Equal(50, row.GetProperty("latestValue").GetDecimal());
        Assert.Equal(100, row.GetProperty("latestCumulativeYtd").GetDecimal());
        Assert.Equal("Met", row.GetProperty("compliance").GetString());
        Assert.Equal(100, row.GetProperty("values").EnumerateArray().First().GetProperty("cumulativeYtd").GetDecimal());

        var nextYear = await client.PostAsJsonAsync($"/api/v1/quality/records/mc01-r03/{id}/values", new { period = "2027-01", value = 10 });
        nextYear.EnsureSuccessStatusCode();
        list = await client.GetFromJsonAsync<JsonElement>("/api/v1/quality/records/mc01-r03");
        row = list.GetProperty("rows").EnumerateArray().Single(r => r.GetProperty("id").GetGuid() == id);
        Assert.Equal(10, row.GetProperty("latestCumulativeYtd").GetDecimal());
        Assert.Equal("Below", row.GetProperty("compliance").GetString());
    }
}
