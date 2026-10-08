using System.Net;
using System.Text;
using FluentAssertions;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class DocumentTemplatesApiTests : IAsyncLifetime
{
    private readonly CrmWebApplicationFactory _factory = new();

    public Task InitializeAsync() => _factory.InitializeAsync();

    public Task DisposeAsync() => _factory.DisposeAsync();

    [Fact]
    public async Task Admin_saves_templates_and_any_user_reads_them()
    {
        var admin = _factory.CreateAuthenticatedClient(role: "Admin");
        var before = await admin.GetAsync("/api/v1/company/document-templates");
        before.StatusCode.Should().BeOneOf(HttpStatusCode.NoContent, HttpStatusCode.OK);

        using var body = new StringContent(
            """{"global":{"primaryColor":"#123456"},"quote":{"paymentTerms":"Contado"}}""",
            Encoding.UTF8, "application/json");
        var saved = await admin.PutAsync("/api/v1/company/document-templates", body);
        saved.StatusCode.Should().Be(HttpStatusCode.OK);

        var reader = _factory.CreateAuthenticatedClient(role: "Comercial");
        var read = await reader.GetAsync("/api/v1/company/document-templates");
        read.StatusCode.Should().Be(HttpStatusCode.OK);
        var json = await read.Content.ReadAsStringAsync();
        json.Should().Contain("#123456").And.Contain("Contado");
    }

    [Fact]
    public async Task Comercial_user_cannot_save_templates()
    {
        var client = _factory.CreateAuthenticatedClient(role: "Comercial");
        using var body = new StringContent("""{"global":{}}""", Encoding.UTF8, "application/json");
        var response = await client.PutAsync("/api/v1/company/document-templates", body);
        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Templates_must_be_an_object()
    {
        var client = _factory.CreateAuthenticatedClient(role: "Admin");
        using var body = new StringContent("[1,2]", Encoding.UTF8, "application/json");
        var response = await client.PutAsync("/api/v1/company/document-templates", body);
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }
}
