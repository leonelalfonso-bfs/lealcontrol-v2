using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LealControl.Modules.Quality.Infrastructure;
using Xunit;

namespace LealControl.Modules.Quality.Tests;

public sealed class SupplierEvaluationCriteriaTests : IClassFixture<QualityWebApplicationFactory>
{
    private readonly QualityWebApplicationFactory _factory;
    public SupplierEvaluationCriteriaTests(QualityWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task Requires_all_six_scores_and_calculates_total_on_server()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var supplierId = Guid.NewGuid();
        var criteria = QualitySupplierCriteria.Required.Select((entry, index) =>
            new QualitySupplierCriterion(entry.Code, entry.Label, Math.Min(5, index + 1),
                index == 0 ? "Cumple especificaciones" : "")).ToList();
        var url = "/api/v1/quality/records/pg05/r01";
        var incomplete = await client.PostAsJsonAsync(url, new
        {
            supplierId, supplierName = "Proveedor de prueba", criteria = criteria[..5]
        });
        Assert.Equal(HttpStatusCode.BadRequest, incomplete.StatusCode);

        var invalid = criteria.Select(c => c with { Score = c.Code == "quality" ? 6 : c.Score }).ToList();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(url, new
        {
            supplierId, supplierName = "Proveedor de prueba", criteria = invalid
        })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(url, new
        {
            supplierId, supplierName = "Proveedor de prueba", criteria, score = 99
        })).StatusCode);

        var created = await client.PostAsJsonAsync(url, new
        {
            supplierId, supplierName = "Proveedor de prueba", serviceScope = "Insumos", criteria
        });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var record = await created.Content.ReadFromJsonAsync<JsonElement>();
        var id = record.GetProperty("id").GetGuid();
        Assert.Equal(20m, record.GetProperty("score").GetDecimal());
        Assert.Equal(6, record.GetProperty("criteria").GetArrayLength());
        Assert.Equal("Cumple especificaciones", record.GetProperty("criteria")[0].GetProperty("observation").GetString());

        var fetched = await client.GetFromJsonAsync<JsonElement>($"{url}/{id}");
        Assert.Equal(20m, fetched.GetProperty("score").GetDecimal());
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"{url}/{id}", new { score = 30 })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"{url}/{id}", new { criteria = criteria[..5] })).StatusCode);

        criteria[0] = criteria[0] with { Score = 5 };
        var updated = await client.PutAsJsonAsync($"{url}/{id}", new { criteria, status = "Approved" });
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        record = await updated.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(24m, record.GetProperty("score").GetDecimal());
        Assert.Equal("Approved", record.GetProperty("status").GetString());
    }
}
