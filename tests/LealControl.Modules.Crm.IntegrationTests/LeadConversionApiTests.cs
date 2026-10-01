using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class LeadConversionApiTests : IClassFixture<CrmWebApplicationFactory>
{
    private readonly CrmWebApplicationFactory _factory;

    public LeadConversionApiTests(CrmWebApplicationFactory factory) => _factory = factory;

    [Theory]
    [InlineData(true, "20123456786", 1)]
    [InlineData(false, "27123456780", 0)]
    public async Task Conversion_creates_only_the_requested_opportunity(
        bool createOpportunity, string cuit, int expectedCount)
    {
        using var client = _factory.CreateAuthenticatedClient();
        using var captured = await client.PostAsJsonAsync("/api/v1/crm/leads", new
        {
            name = "Prospecto " + cuit,
            contactName = "Contacto",
            email = (string?)null,
            phone = (string?)null,
            description = "Consulta de calibración",
            source = "Manual",
            assignedTo = (Guid?)null
        });
        captured.EnsureSuccessStatusCode();
        using var lead = await captured.Content.ReadFromJsonAsync<JsonDocument>();
        var leadId = lead!.RootElement.GetProperty("id").GetGuid();

        using var converted = await client.PostAsJsonAsync(
            $"/api/v1/crm/leads/{leadId}/convert?createOpportunity={createOpportunity.ToString().ToLowerInvariant()}",
            new
            {
                legalName = "Cliente " + cuit,
                documentType = "Cuit",
                documentNumber = cuit,
                taxCondition = "ResponsableInscripto",
                iibbRegime = "Local",
                isCustomer = true,
                isSupplier = false
            });
        converted.EnsureSuccessStatusCode();
        using var customer = await converted.Content.ReadFromJsonAsync<JsonDocument>();
        var customerId = customer!.RootElement.GetProperty("id").GetGuid();

        using var opportunities = await client.GetFromJsonAsync<JsonDocument>(
            $"/api/v1/crm/customers/{customerId}/opportunities");
        var linked = opportunities!.RootElement.EnumerateArray()
            .Where(item => item.TryGetProperty("leadId", out var sourceLead) &&
                sourceLead.ValueKind == JsonValueKind.String &&
                sourceLead.GetGuid() == leadId)
            .ToList();
        linked.Should().HaveCount(expectedCount);
    }
}
