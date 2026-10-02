using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class OpportunityQueryFailureApiTests : IAsyncLifetime
{
    private readonly CrmWebApplicationFactory _factory =
        CrmWebApplicationFactory.ForEnvironment("Production");

    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    [Fact]
    public async Task Persistent_query_failure_is_visible_in_lists_and_kanban()
    {
        using var client = _factory.CreateAuthenticatedClient();
        using var created = await client.PostAsJsonAsync("/api/v1/crm/customers", new
        {
            legalName = "Cliente oportunidades de prueba",
            documentType = "Cuit", documentNumber = "20123456786",
            taxCondition = "ResponsableInscripto", iibbRegime = "Local",
            isCustomer = true, isSupplier = false
        });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        using var customer = JsonDocument.Parse(await created.Content.ReadAsStringAsync());
        var id = customer.RootElement.GetProperty("id").GetGuid();
        string[] urls =
        [
            "/api/v1/crm/opportunities",
            $"/api/v1/crm/customers/{id}/opportunities",
            "/api/v1/crm/opportunities/kanban"
        ];
        foreach (var url in urls)
        {
            using var empty = await client.GetAsync(url);
            Assert.Equal(HttpStatusCode.OK, empty.StatusCode);
            if (url != "/api/v1/crm/opportunities/kanban")
            {
                using var body = JsonDocument.Parse(await empty.Content.ReadAsStringAsync());
                Assert.Equal(0, body.RootElement.GetArrayLength());
            }
        }

        var connectionString = _factory.Services.GetRequiredService<IConfiguration>()
            .GetConnectionString("Database");
        Assert.False(string.IsNullOrWhiteSpace(connectionString));
        await using var db = new NpgsqlConnection(connectionString);
        await db.OpenAsync();
        await using (var breakSchema = new NpgsqlCommand(
            "ALTER TABLE crm.opportunities RENAME COLUMN \"Id\" TO \"BrokenOpportunityId\"", db))
        {
            await breakSchema.ExecuteNonQueryAsync();
        }

        foreach (var url in urls)
        {
            using var failed = await client.GetAsync(url);
            Assert.Equal(HttpStatusCode.InternalServerError, failed.StatusCode);
            var error = await failed.Content.ReadAsStringAsync();
            Assert.Contains("No se pudo completar la operación por un error de base de datos.", error);
            Assert.DoesNotContain("BrokenOpportunityId", error);
            Assert.DoesNotContain("42703", error);
        }
    }
}
