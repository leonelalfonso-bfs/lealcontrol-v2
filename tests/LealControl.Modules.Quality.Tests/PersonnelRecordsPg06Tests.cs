using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace LealControl.Modules.Quality.Tests;

public sealed class PersonnelRecordsPg06Tests : IClassFixture<QualityWebApplicationFactory>
{
    private readonly QualityWebApplicationFactory _factory;
    public PersonnelRecordsPg06Tests(QualityWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task Training_and_authorization_keep_the_new_fields_and_role_end_date_is_validated()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var trainingUrl = "/api/v1/quality/records/pg06/r01";
        var training = await client.PostAsJsonAsync(trainingUrl, new
        {
            programYear = 2026, topic = "Seguridad", interveningPersonnel = "Ana y Luis",
            trainingType = "External"
        });
        Assert.Equal(HttpStatusCode.Created, training.StatusCode);
        var item = await training.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("External", item.GetProperty("trainingType").GetString());
        Assert.Equal("Ana y Luis", item.GetProperty("interveningPersonnel").GetString());
        Assert.False(item.TryGetProperty("effectivenessCheck", out _));
        var trainingId = item.GetProperty("id").GetGuid();
        var done = await client.PutAsJsonAsync($"{trainingUrl}/{trainingId}", new { status = "Done", interveningPersonnel = "Ana, Luis y Eva" });
        Assert.Equal(HttpStatusCode.OK, done.StatusCode);
        item = await done.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Ana, Luis y Eva", item.GetProperty("interveningPersonnel").GetString());

        var authUrl = "/api/v1/quality/records/pg06/r02";
        var personId = Guid.NewGuid();
        var start = new DateTime(2026, 8, 1, 0, 0, 0, DateTimeKind.Utc);
        var from = new DateTime(2026, 9, 1, 0, 0, 0, DateTimeKind.Utc);
        var auth = await client.PostAsJsonAsync(authUrl, new
        {
            userId = personId, personName = "Ana", method = "IT-01 Muestreo",
            trainingStartDate = start, validFrom = from,
            trainingActions = "Práctica supervisada"
        });
        Assert.Equal(HttpStatusCode.Created, auth.StatusCode);
        var authorization = await auth.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("IT-01 Muestreo", authorization.GetProperty("method").GetString());
        Assert.Equal("Práctica supervisada", authorization.GetProperty("trainingActions").GetString());
        Assert.Equal(from, authorization.GetProperty("validFrom").GetDateTime());
        Assert.Equal(start, authorization.GetProperty("trainingStartDate").GetDateTime());
        var authorizationId = authorization.GetProperty("id").GetGuid();
        authorization = await client.GetFromJsonAsync<JsonElement>($"{authUrl}/{authorizationId}");
        Assert.Equal("IT-01 Muestreo", authorization.GetProperty("method").GetString());
        var updatedAuth = await client.PutAsJsonAsync($"{authUrl}/{authorizationId}", new { trainingActions = "Práctica y examen" });
        Assert.Equal(HttpStatusCode.OK, updatedAuth.StatusCode);
        authorization = await updatedAuth.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Práctica y examen", authorization.GetProperty("trainingActions").GetString());

        var roleUrl = "/api/v1/quality/records/pg06/r04";
        var since = new DateTime(2026, 9, 1, 0, 0, 0, DateTimeKind.Utc);
        var until = since.AddMonths(3);
        var invalid = await client.PostAsJsonAsync(roleUrl, new
        {
            role = "Analista", userId = personId, personName = "Ana", since, until = since.AddDays(-1)
        });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        var role = await client.PostAsJsonAsync(roleUrl, new
        {
            role = "Analista", userId = personId, personName = "Ana", since, until
        });
        Assert.Equal(HttpStatusCode.Created, role.StatusCode);
        var assignment = await role.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(until, assignment.GetProperty("until").GetDateTime());
        var assignmentId = assignment.GetProperty("id").GetGuid();
        var badUpdate = await client.PutAsJsonAsync($"{roleUrl}/{assignmentId}", new { until = since.AddDays(-1) });
        Assert.Equal(HttpStatusCode.BadRequest, badUpdate.StatusCode);
    }
}
