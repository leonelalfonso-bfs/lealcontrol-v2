using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using LealControl.Modules.Quality.Infrastructure;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Api.SuperAdmin;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace LealControl.Modules.Quality.Tests;

public sealed class ExternalDocumentTests : IClassFixture<QualityWebApplicationFactory>
{
    private readonly QualityWebApplicationFactory _factory;
    public ExternalDocumentTests(QualityWebApplicationFactory factory) => _factory = factory;

    private static readonly byte[] Pdf = Encoding.ASCII.GetBytes("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF");
    private static MultipartFormDataContent Upload(byte[] bytes, string name = "original.pdf")
    {
        var form = new MultipartFormDataContent();
        form.Add(new ByteArrayContent(bytes), "file", name);
        return form;
    }

    private async Task<string> Create(HttpClient client, string type = "External", bool current = false)
    {
        var code = "EXT-" + Guid.NewGuid().ToString("N")[..12];
        var response = await client.PostAsJsonAsync("/api/v1/quality/documents", new
        {
            code, title = "Norma de ensayo", type, externalSource = "Organismo de prueba", markCurrent = current
        });
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString()!;
    }

    [Fact]
    public async Task Create_upload_list_download_replace_and_tenant_isolation()
    {
        using var client = _factory.CreateAuthenticatedClient();
        // Includes seeded/current documents: attaching their external source must not require re-approval.
        var code = await Create(client, current: true);
        using var body = Upload(Pdf);
        var upload = await client.PostAsync($"/api/v1/quality/documents/{code}/external-original", body);
        Assert.True(upload.IsSuccessStatusCode, await upload.Content.ReadAsStringAsync());
        var file = await upload.Content.ReadFromJsonAsync<JsonElement>();
        var fileId = file.GetProperty("id").GetGuid();
        var list = await client.GetFromJsonAsync<JsonElement>("/api/v1/quality/records/pg01-r02");
        var row = list.GetProperty("rows").EnumerateArray().Single(r => r.GetProperty("code").GetString() == code);
        Assert.Equal(fileId, row.GetProperty("originalFileId").GetGuid());
        Assert.Equal("Current", row.GetProperty("estado").GetString());
        var download = await client.GetAsync($"/api/v1/quality/files/{fileId}");
        Assert.Equal(Pdf, await download.Content.ReadAsByteArrayAsync());
        Assert.Equal("application/pdf", download.Content.Headers.ContentType?.MediaType);
        Assert.Contains("original.pdf", download.Content.Headers.ContentDisposition?.ToString());

        var otherTenantId = Guid.NewGuid();
        using (var setup = _factory.Services.CreateScope())
        {
            var master = setup.ServiceProvider.GetRequiredService<MasterDbContext>();
            // Route both test companies to the same temporary DB to exercise row-level isolation.
            master.Tenants.Add(new MasterTenant
            {
                Id = otherTenantId, Name = "Other company", Slug = otherTenantId.ToString("N"),
                DbName = new Npgsql.NpgsqlConnectionStringBuilder(_factory.ConnectionString).Database!,
                EnabledModulesJson = "[\"quality\"]"
            });
            await master.SaveChangesAsync();
        }
        using var other = _factory.CreateAuthenticatedClient(otherTenantId);
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync($"/api/v1/quality/files/{fileId}")).StatusCode);
        using var otherBody = Upload(Pdf);
        Assert.Equal(HttpStatusCode.NotFound, (await other.PostAsync($"/api/v1/quality/documents/{code}/external-original", otherBody)).StatusCode);
        var otherList = await other.GetFromJsonAsync<JsonElement>("/api/v1/quality/records/pg01-r02");
        Assert.DoesNotContain(otherList.GetProperty("rows").EnumerateArray(), r => r.GetProperty("code").GetString() == code);

        using var replacement = Upload(Pdf, "reemplazo.pdf");
        var replace = await client.PostAsync($"/api/v1/quality/documents/{code}/external-original", replacement);
        replace.EnsureSuccessStatusCode();
        var replacementId = (await replace.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        Assert.NotEqual(fileId, replacementId);
        list = await client.GetFromJsonAsync<JsonElement>("/api/v1/quality/records/pg01-r02");
        row = list.GetProperty("rows").EnumerateArray().Single(r => r.GetProperty("code").GetString() == code);
        Assert.Equal(replacementId, row.GetProperty("originalFileId").GetGuid());
        Assert.Equal(Pdf, await client.GetByteArrayAsync($"/api/v1/quality/files/{fileId}"));
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<QualityDbContext>();
        Assert.Equal(2, await db.AuditEvents.CountAsync(a => a.EventType == "ExternalOriginalAttached" && a.Summary.Contains(code)));
    }

    [Theory]
    [InlineData("fake.pdf", "not a PDF")]
    [InlineData("document.txt", "%PDF-1.4")]
    [InlineData("empty.pdf", "")]
    public async Task Reject_invalid_originals(string name, string content)
    {
        using var client = _factory.CreateAuthenticatedClient();
        var code = await Create(client);
        using var body = Upload(Encoding.ASCII.GetBytes(content), name);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync($"/api/v1/quality/documents/{code}/external-original", body)).StatusCode);
    }

    [Fact]
    public async Task Reject_oversize_and_non_external_and_unauthorized_uploads()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var code = await Create(client);
        using var huge = Upload(new byte[20 * 1024 * 1024 + 1]);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync($"/api/v1/quality/documents/{code}/external-original", huge)).StatusCode);
        var internalCode = await Create(client, "Procedure");
        using var body = Upload(Pdf);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsync($"/api/v1/quality/documents/{internalCode}/external-original", body)).StatusCode);
        using var reader = _factory.CreateAuthenticatedClient(role: "Comercial");
        using var denied = Upload(Pdf);
        Assert.Equal(HttpStatusCode.Forbidden, (await reader.PostAsync($"/api/v1/quality/documents/{code}/external-original", denied)).StatusCode);
    }
}
