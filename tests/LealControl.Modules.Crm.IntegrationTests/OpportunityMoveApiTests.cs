using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class OpportunityMoveApiTests : IClassFixture<CrmWebApplicationFactory>
{
    private readonly CrmWebApplicationFactory _factory;
    public OpportunityMoveApiTests(CrmWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task Move_and_activity_are_saved_together_only_for_valid_transition()
    {
        var client = _factory.CreateAuthenticatedClient();
        var opened = await client.PostAsJsonAsync("/api/v1/crm/opportunities", new
        {
            title = "Oportunidad de prueba de etapas"
        });
        opened.StatusCode.Should().Be(HttpStatusCode.Created);
        var opportunity = await opened.Content.ReadFromJsonAsync<OpportunityResponse>();
        opportunity.Should().NotBeNull();
        var path = $"/api/v1/crm/opportunities/{opportunity!.Id}";

        var rejected = await client.PostAsJsonAsync(path + "/move", new
        {
            stage = "Won", activityDescription = "No debe quedar en historial"
        });
        rejected.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var afterReject = await client.GetFromJsonAsync<ActivityResponse[]>(path + "/timeline");
        afterReject.Should().BeEmpty();

        var lost = await client.PostAsJsonAsync(path + "/move", new
        {
            stage = "Lost", lostReason = "Sin presupuesto aprobado",
            activityDescription = "Pérdida confirmada"
        });
        lost.StatusCode.Should().Be(HttpStatusCode.OK);
        var afterLost = await client.GetFromJsonAsync<ActivityResponse[]>(path + "/timeline");
        afterLost.Should().ContainSingle().Which.Description.Should().Be("Pérdida confirmada");

        var reopened = await client.PostAsJsonAsync(path + "/move", new
        {
            stage = "Qualified", lostReason = "El cliente retoma el proyecto",
            activityDescription = "Reapertura confirmada"
        });
        reopened.StatusCode.Should().Be(HttpStatusCode.OK);
        var afterReopen = await client.GetFromJsonAsync<ActivityResponse[]>(path + "/timeline");
        afterReopen.Should().HaveCount(2);
        afterReopen.Should().ContainSingle(a => a.Description == "Reapertura confirmada");
    }

    private sealed record OpportunityResponse(Guid Id);
    private sealed record ActivityResponse(string Description);
}
