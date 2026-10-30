using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>Áreas configurables de RRHH (organigrama y manuales) y archivo del manual de procedimientos.</summary>
public sealed class HrAreasManualsApiTests : IAsyncLifetime
{
    private readonly CrmWebApplicationFactory _factory = new();
    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, body);
        return body.Length == 0 ? default : JsonDocument.Parse(body).RootElement.Clone();
    }

    [Fact]
    public async Task Areas_start_from_what_is_used_rename_in_cascade_and_manuals_take_a_file()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var manual = (await Json(await client.PostAsJsonAsync("/api/v1/hr/manuals", new
        {
            code = "PE-02", title = "Calibración de básculas", area = "Servicio técnico", version = "rev03", effectiveDate = "2026-10-01T00:00:00Z", status = "Vigente", description = "",
            fileStorageKey = "otra-empresa/archivo"
        }))).GetProperty("id").GetGuid();

        // Las áreas arrancan de las que ya se usan.
        var areas = (await Json(await client.GetAsync("/api/v1/hr/areas"))).EnumerateArray().ToList();
        var service = Assert.Single(areas);
        Assert.Equal("Servicio técnico", service.GetProperty("name").GetString());
        Assert.Equal(1, service.GetProperty("manuals").GetInt32());

        await Json(await client.PostAsJsonAsync("/api/v1/hr/areas", new { name = "Administración", sortOrder = 1 }));
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/v1/hr/areas", new { name = "administración", sortOrder = 2 })).StatusCode);
        await Json(await client.PutAsJsonAsync($"/api/v1/hr/areas/{service.GetProperty("id").GetGuid()}", new { name = "Taller y servicio técnico", sortOrder = 0 }));
        var manuals = await Json(await client.GetAsync("/api/v1/hr/manuals"));
        Assert.Equal("Taller y servicio técnico", manuals.EnumerateArray().Single().GetProperty("area").GetString());
        Assert.Equal(HttpStatusCode.Conflict, (await client.DeleteAsync($"/api/v1/hr/areas/{service.GetProperty("id").GetGuid()}")).StatusCode);

        // El archivo solo entra por su endpoint (el alta no acepta una clave de almacenamiento).
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/v1/hr/manuals/{manual}/file")).StatusCode);
        var content = new ByteArrayContent(Encoding.ASCII.GetBytes("%PDF-1.4 PE-02"));
        content.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");
        await Json(await client.PostAsync($"/api/v1/hr/manuals/{manual}/file", new MultipartFormDataContent { { content, "file", "PE-02 rev03.pdf" } }));
        Assert.Equal("%PDF-1.4 PE-02", await (await client.GetAsync($"/api/v1/hr/manuals/{manual}/file")).Content.ReadAsStringAsync());
        Assert.Equal("PE-02 rev03.pdf", (await Json(await client.GetAsync("/api/v1/hr/manuals"))).EnumerateArray().Single().GetProperty("fileName").GetString());
    }
}
