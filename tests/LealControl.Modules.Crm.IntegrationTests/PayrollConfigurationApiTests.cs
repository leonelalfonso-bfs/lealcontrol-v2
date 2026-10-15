using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>
/// Sueldos S1: datos del empleador, parámetros legales con vigencia (los del sistema y los que carga la
/// empresa) y legajo con los datos de la seguridad social. Reloj de pruebas: 2/10/2026.
/// </summary>
public sealed class PayrollConfigurationApiTests : IAsyncLifetime
{
    private readonly CrmWebApplicationFactory _factory = new();
    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, body);
        using var doc = JsonDocument.Parse(body);
        return doc.RootElement.Clone();
    }

    private static async Task<string> Rejected(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.BadRequest, body);
        return body;
    }

    private static JsonElement Param(JsonElement resolved, string key) =>
        resolved.GetProperty("resolved").EnumerateArray().Single(p => p.GetProperty("key").GetString() == key);

    [Fact]
    public async Task Legal_parameters_resolve_by_month_and_the_company_can_add_a_missing_one()
    {
        using var client = _factory.CreateAuthenticatedClient();

        var october = await Json(await client.GetAsync("/api/v1/hr/payroll/parameters"));   // por defecto, el mes en curso
        Assert.StartsWith("2026-10", october.GetProperty("month").GetString());
        var max = Param(october, "base.maxima");
        Assert.Equal(4769631.49m, max.GetProperty("value").GetDecimal());
        Assert.Equal("Res. ANSES 284/2026", max.GetProperty("norm").GetString());
        Assert.Equal(18m, Param(october, "contribucion.general").GetProperty("value").GetDecimal());
        // El FAL rige desde noviembre de 2026.
        Assert.Equal(JsonValueKind.Null, Param(october, "fal.mipyme").GetProperty("value").ValueKind);
        var november = await Json(await client.GetAsync("/api/v1/hr/payroll/parameters?month=2026-11"));
        Assert.Equal(2.5m, Param(november, "fal.mipyme").GetProperty("value").GetDecimal());

        // Noviembre todavía no tiene tope de ANSES: se usa el de octubre y se avisa.
        Assert.Contains("Falta el valor de 11/2026", Param(november, "base.maxima").GetProperty("warning").GetString());
        Assert.Contains("norma", await Rejected(await client.PostAsJsonAsync("/api/v1/hr/payroll/settings/parameters",
            new { key = "base.maxima", validFrom = "2026-11", value = 4850000m, norm = "" })));
        var added = await Json(await client.PostAsJsonAsync("/api/v1/hr/payroll/settings/parameters",
            new { key = "base.maxima", validFrom = "2026-11", value = 4850000m, norm = "Res. ANSES 300/2026" }));
        var updated = Param(await Json(await client.GetAsync("/api/v1/hr/payroll/parameters?month=2026-11")), "base.maxima");
        Assert.Equal(4850000m, updated.GetProperty("value").GetDecimal());
        Assert.True(updated.GetProperty("fromCompany").GetBoolean());
        Assert.Equal(JsonValueKind.Null, updated.GetProperty("warning").ValueKind);

        // Lo de la empresa se puede borrar; lo del sistema, no.
        using (var deleted = await client.DeleteAsync($"/api/v1/hr/payroll/settings/parameters/{added.GetProperty("id").GetGuid()}"))
            Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
        var systemRow = october.GetProperty("history").EnumerateArray().First(h => !h.GetProperty("fromCompany").GetBoolean());
        using (var refused = await client.DeleteAsync($"/api/v1/hr/payroll/settings/parameters/{systemRow.GetProperty("id").GetGuid()}"))
            Assert.Equal(HttpStatusCode.NotFound, refused.StatusCode);
    }

    [Fact]
    public async Task Employer_settings_and_employee_social_security_data_are_validated()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var settings = await Json(await client.GetAsync("/api/v1/hr/payroll/settings"));
        Assert.True(settings.GetProperty("isMiPyme").GetBoolean());
        Assert.Contains("ART", await Rejected(await client.PutAsJsonAsync("/api/v1/hr/payroll/settings", new
        {
            isMiPyme = true, isCommerceOrServices = true, artVariablePercent = 45m, artFixedAmount = 0m, lifeInsurancePremium = 0m
        })));
        var saved = await Json(await client.PutAsJsonAsync("/api/v1/hr/payroll/settings", new
        {
            isMiPyme = true, isCommerceOrServices = false, activityCode = 49, artInsurer = "Prevención ART", artContractNumber = "123",
            artVariablePercent = 2.5m, artFixedAmount = 600m, lifeInsurancePremium = 350m, falId = "FAL-1"
        }));
        Assert.Equal(2.5m, saved.GetProperty("artVariablePercent").GetDecimal());

        object Employee(string cuil, bool partTime = false, decimal? hours = null) => new
        {
            fileNumber = "1", firstName = "Ana", lastName = "Pérez", documentNumber = "30111222", cuil, hireDate = "2024-03-01T00:00:00Z",
            isUnionMember = true, socialSecuritySituation = 1, socialSecurityCondition = 1, contractModalityCode = 8, casualtyCode = 0,
            healthInsuranceCode = "126205", hasSpouse = true, childrenCount = 2, partTime, weeklyHours = hours
        };
        Assert.Contains("CUIL no es válido", await Rejected(await client.PostAsJsonAsync("/api/v1/hr/employees", Employee("27301112223"))));
        Assert.Contains("horas semanales", await Rejected(await client.PostAsJsonAsync("/api/v1/hr/employees", Employee("27301112225", partTime: true))));
        var employee = await Json(await client.PostAsJsonAsync("/api/v1/hr/employees", Employee("27301112225", partTime: true, hours: 24m)));
        Assert.True(employee.GetProperty("isUnionMember").GetBoolean());
        Assert.Equal(8, employee.GetProperty("contractModalityCode").GetInt32());
        Assert.Equal(24m, employee.GetProperty("weeklyHours").GetDecimal());
    }
}
