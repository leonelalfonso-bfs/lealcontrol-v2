using System.IO.Compression;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>Archivos de los vencimientos de Flota y legajo para ingreso a planta (personas y unidades en un ZIP).</summary>
public sealed class FleetPacketApiTests : IAsyncLifetime
{
    private readonly CrmWebApplicationFactory _factory = new();
    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, body);
        return JsonDocument.Parse(body).RootElement.Clone();
    }

    private static MultipartFormDataContent Pdf(string name, string text)
    {
        var content = new ByteArrayContent(Encoding.ASCII.GetBytes("%PDF-1.4 " + text));
        content.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");
        return new MultipartFormDataContent { { content, "file", name } };
    }

    [Fact]
    public async Task Documents_take_their_scans_and_the_packet_zips_people_and_vehicles()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var vehicle = (await Json(await client.PostAsJsonAsync("/api/v1/fleet/vehicles", new
        {
            type = "Pickup", plate = "AE123BC", brand = "Toyota", model = "Hilux", year = 2022, meterType = "Kilometers", initialKilometers = 1000
        }))).GetProperty("id").GetGuid();
        var vtv = (await Json(await client.PostAsJsonAsync($"/api/v1/fleet/vehicles/{vehicle}/documents", new { documentType = "VtvRto", expirationDate = "2028-08-22" }))).GetProperty("id").GetGuid();
        await client.PostAsJsonAsync($"/api/v1/fleet/vehicles/{vehicle}/documents", new { documentType = "InsurancePolicy", expirationDate = "2027-06-30" });

        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync($"/api/v1/fleet/documents/{vtv}/file", new MultipartFormDataContent())).StatusCode);
        await Json(await client.PostAsync($"/api/v1/fleet/documents/{vtv}/file", Pdf("vtv.pdf", "VTV")));
        var docs = await Json(await client.GetAsync($"/api/v1/fleet/vehicles/{vehicle}/documents"));
        Assert.Equal("vtv.pdf", docs.EnumerateArray().Single(d => d.GetProperty("id").GetGuid() == vtv).GetProperty("fileName").GetString());
        Assert.Equal("%PDF-1.4 VTV", await (await client.GetAsync($"/api/v1/fleet/documents/{vtv}/file")).Content.ReadAsStringAsync());

        var employee = (await Json(await client.PostAsJsonAsync("/api/v1/hr/employees", new
        {
            firstName = "Juan", lastName = "Gómez", documentNumber = "30111222", cuil = "20301112220", hireDate = "2020-01-01T00:00:00Z"
        }))).GetProperty("id").GetGuid();
        var member = (await Json(await client.PostAsJsonAsync("/api/v1/fleet/people", new { employeeId = employee, isDriver = true }))).GetProperty("id").GetGuid();
        var license = (await Json(await client.PostAsJsonAsync($"/api/v1/fleet/people/{member}/credentials", new { type = "DrivingLicense", category = "B1", expirationDate = "2029-01-10" }))).GetProperty("id").GetGuid();
        await Json(await client.PostAsync($"/api/v1/fleet/credentials/{license}/file", Pdf("licencia.pdf", "LIC")));
        // Documento del legajo de RRHH (se guarda como data URL): va al legajo sin cargarlo dos veces.
        await Json(await client.PostAsJsonAsync($"/api/v1/hr/employees/{employee}/documents", new
        {
            documentType = "AltaTemprana", category = "Ingreso", fileName = "alta.pdf", fileUrl = "data:application/pdf;base64," + Convert.ToBase64String(Encoding.ASCII.GetBytes("%PDF-1.4 ALTA"))
        }));

        var preview = (await Json(await client.GetAsync($"/api/v1/fleet/packet/preview?employeeIds={employee}&vehicleIds={vehicle}"))).EnumerateArray().ToList();
        Assert.Equal(4, preview.Count);
        Assert.False(preview.Single(p => p.GetProperty("label").GetString() == "Seguro").GetProperty("hasFile").GetBoolean());

        var zip = await client.PostAsJsonAsync("/api/v1/fleet/packet", new { items = preview.Select(p => new { source = p.GetProperty("source").GetString(), id = p.GetProperty("id").GetGuid() }) });
        Assert.True(zip.IsSuccessStatusCode, await zip.Content.ReadAsStringAsync());
        Assert.Equal("application/zip", zip.Content.Headers.ContentType?.MediaType);
        using var archive = new ZipArchive(await zip.Content.ReadAsStreamAsync());
        var names = archive.Entries.Select(e => e.FullName).ToList();
        Assert.Contains("Gómez, Juan - DNI 30111222/Licencia de conducir B1 - vence 10-01-2029.pdf", names);
        Assert.Contains("Gómez, Juan - DNI 30111222/Alta temprana.pdf", names);
        Assert.Contains("AE123BC Toyota Hilux/VTV - RTO - vence 22-08-2028.pdf", names);
        using var index = new StreamReader(archive.GetEntry("Indice.txt")!.Open());
        Assert.Contains("Seguro - vence 30/06/2027 - Vigente - SIN ARCHIVO", await index.ReadToEndAsync());
    }
}
