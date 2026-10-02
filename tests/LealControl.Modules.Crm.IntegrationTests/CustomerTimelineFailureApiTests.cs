using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class CustomerTimelineFailureApiTests : IAsyncLifetime
{
    private readonly CrmWebApplicationFactory _factory =
        CrmWebApplicationFactory.ForEnvironment("Production");

    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    [Fact]
    public async Task Persistent_activity_query_failure_is_not_an_empty_timeline()
    {
        using var client = _factory.CreateAuthenticatedClient();
        using var created = await client.PostAsJsonAsync("/api/v1/crm/customers", new
        {
            legalName = "Cliente historial de prueba",
            documentType = "Cuit",
            documentNumber = "20123456786",
            taxCondition = "ResponsableInscripto",
            iibbRegime = "Local",
            isCustomer = true,
            isSupplier = false
        });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        using var customer = JsonDocument.Parse(await created.Content.ReadAsStringAsync());
        var url = $"/api/v1/crm/customers/{customer.RootElement.GetProperty("id").GetGuid()}/timeline";

        using var empty = await client.GetAsync(url);
        Assert.Equal(HttpStatusCode.OK, empty.StatusCode);
        using var emptyBody = JsonDocument.Parse(await empty.Content.ReadAsStringAsync());
        Assert.Equal(0, emptyBody.RootElement.GetArrayLength());

        var connectionString = _factory.Services.GetRequiredService<IConfiguration>()
            .GetConnectionString("Database");
        Assert.False(string.IsNullOrWhiteSpace(connectionString));
        await using var db = new NpgsqlConnection(connectionString);
        await db.OpenAsync();
        await using (var breakSchema = new NpgsqlCommand(
            "ALTER TABLE crm.activities RENAME COLUMN \"OccurredAtUtc\" TO \"BrokenOccurredAtUtc\"", db))
        {
            await breakSchema.ExecuteNonQueryAsync();
        }

        using var failed = await client.GetAsync(url);
        Assert.Equal(HttpStatusCode.InternalServerError, failed.StatusCode);
        var errorBody = await failed.Content.ReadAsStringAsync();
        Assert.Contains("No se pudo completar la operación por un error de base de datos.", errorBody);
        Assert.DoesNotContain("OccurredAtUtc", errorBody);
    }
}
