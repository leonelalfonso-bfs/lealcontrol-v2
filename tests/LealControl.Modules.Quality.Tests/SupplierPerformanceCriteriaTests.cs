using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LealControl.Modules.Quality.Infrastructure;
using Xunit;

namespace LealControl.Modules.Quality.Tests;

public sealed class SupplierPerformanceCriteriaTests : IClassFixture<QualityWebApplicationFactory>
{
    private readonly QualityWebApplicationFactory _factory;
    public SupplierPerformanceCriteriaTests(QualityWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task Requires_each_score_and_persists_observations_and_total()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var url = "/api/v1/quality/records/pg05/r03";
        var supplierId = Guid.NewGuid();
        var criteria = QualitySupplierCriteria.Required.Select((item, index) =>
            new QualitySupplierCriterion(item.Code, item.Label, index % 5 + 1,
                index == 0 ? "Resultado conforme" : "")).ToList();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(url, new
        {
            supplierId, supplierName = "Proveedor de prueba", criteria = criteria[..5]
        })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(url, new
        {
            supplierId, supplierName = "Proveedor de prueba", criteria, score = 90
        })).StatusCode);
        var invalid = criteria.Select(item => item with { Score = item.Code == "price" ? 0 : item.Score }).ToList();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(url, new
        {
            supplierId, supplierName = "Proveedor de prueba", criteria = invalid
        })).StatusCode);

        var created = await client.PostAsJsonAsync(url, new
        {
            supplierId, supplierName = "Proveedor de prueba", period = "2026-Q3", criteria
        });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var record = await created.Content.ReadFromJsonAsync<JsonElement>();
        var id = record.GetProperty("id").GetGuid();
        Assert.Equal(16m, record.GetProperty("score").GetDecimal());
        Assert.Equal(6, record.GetProperty("criteria").GetArrayLength());
        Assert.Equal("Resultado conforme", record.GetProperty("criteria")[0].GetProperty("observation").GetString());

        var fetched = await client.GetFromJsonAsync<JsonElement>($"{url}/{id}");
        Assert.Equal(16m, fetched.GetProperty("score").GetDecimal());
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"{url}/{id}", new { score = 100 })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"{url}/{id}", new { criteria = criteria[..5] })).StatusCode);

        criteria[0] = criteria[0] with { Score = 5 };
        var completed = await client.PutAsJsonAsync($"{url}/{id}", new { status = "Completed", criteria });
        Assert.Equal(HttpStatusCode.OK, completed.StatusCode);
        record = await completed.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(20m, record.GetProperty("score").GetDecimal());
        Assert.Equal("Completed", record.GetProperty("status").GetString());
    }
}
