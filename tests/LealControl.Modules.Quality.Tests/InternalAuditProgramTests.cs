using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Xunit;

namespace LealControl.Modules.Quality.Tests;

public sealed class InternalAuditProgramTests : IClassFixture<QualityWebApplicationFactory>
{
    private readonly QualityWebApplicationFactory _factory;
    public InternalAuditProgramTests(QualityWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task Backups_are_available_only_after_audit_is_done()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var create = await client.PostAsJsonAsync("/api/v1/quality/records/pg04", new
        {
            programYear = 2026,
            plannedDate = new DateTime(2026, 10, 1, 12, 0, 0, DateTimeKind.Utc),
            scope = "Laboratorio",
            criteria = "Procedimiento PG04 y requisitos contractuales",
            auditor = "Auditor de prueba"
        });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var audit = await create.Content.ReadFromJsonAsync<JsonElement>();
        var id = audit.GetProperty("id").GetGuid();
        Assert.Equal("Planned", audit.GetProperty("status").GetString());
        Assert.Equal("Procedimiento PG04 y requisitos contractuales", audit.GetProperty("criteria").GetString());

        using var form = new MultipartFormDataContent();
        form.Add(new ByteArrayContent(Encoding.UTF8.GetBytes("plan de prueba")), "file", "plan.txt");
        form.Add(new StringContent("Source"), "role");
        var upload = await client.PostAsync("/api/v1/quality/files", form);
        Assert.Equal(HttpStatusCode.OK, upload.StatusCode);
        var fileId = (await upload.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        var attachEarly = await client.PutAsJsonAsync($"/api/v1/quality/records/pg04/{id}", new { planFileId = fileId });
        Assert.Equal(HttpStatusCode.BadRequest, attachEarly.StatusCode);
        var doneWithoutDate = await client.PutAsJsonAsync($"/api/v1/quality/records/pg04/{id}", new { status = "Done" });
        Assert.Equal(HttpStatusCode.BadRequest, doneWithoutDate.StatusCode);

        var future = await client.PutAsJsonAsync($"/api/v1/quality/records/pg04/{id}", new
        {
            status = "Done", executedDate = DateTime.UtcNow.AddDays(2)
        });
        Assert.Equal(HttpStatusCode.BadRequest, future.StatusCode);

        var done = await client.PutAsJsonAsync($"/api/v1/quality/records/pg04/{id}", new
        {
            status = "Done", executedDate = DateTime.UtcNow
        });
        Assert.Equal(HttpStatusCode.OK, done.StatusCode);
        Assert.Equal("Done", (await done.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("status").GetString());

        async Task<Guid> UploadBackup(string name)
        {
            using var backup = new MultipartFormDataContent();
            backup.Add(new ByteArrayContent(Encoding.UTF8.GetBytes(name)), "file", name);
            backup.Add(new StringContent("Source"), "role");
            var response = await client.PostAsync("/api/v1/quality/files", backup);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        }
        var reportId = await UploadBackup("informe.docx");
        var checklistId = await UploadBackup("lista.xlsx");
        var attach = await client.PutAsJsonAsync($"/api/v1/quality/records/pg04/{id}", new
        {
            planFileId = fileId, reportFileId = reportId, checklistFileId = checklistId
        });
        Assert.Equal(HttpStatusCode.OK, attach.StatusCode);
        audit = await attach.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(fileId, audit.GetProperty("planFileId").GetGuid());
        Assert.Equal(reportId, audit.GetProperty("reportFileId").GetGuid());
        Assert.Equal(checklistId, audit.GetProperty("checklistFileId").GetGuid());
        Assert.Equal("plan de prueba", await client.GetStringAsync($"/api/v1/quality/files/{fileId}"));
        var list = await client.GetFromJsonAsync<JsonElement>("/api/v1/quality/records/pg04");
        Assert.Contains(list.GetProperty("rows").EnumerateArray(), row =>
            row.GetProperty("id").GetGuid() == id && row.GetProperty("status").GetString() == "Done");

        var reopen = await client.PutAsJsonAsync($"/api/v1/quality/records/pg04/{id}", new { status = "Planned" });
        Assert.Equal(HttpStatusCode.BadRequest, reopen.StatusCode);
    }
}
