using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>
/// Sueldos S2: convenios configurables. UECARA se instala como plantilla de datos; el simulador aplica escala por
/// categoría y zona, antigüedad desde el mes siguiente, adicionales por zona, grupo y marca del empleado, y
/// aportes sindicales según afiliación. Las escalas se pegan o se generan con el aumento del acuerdo.
/// </summary>
public sealed class PayrollAgreementsApiTests : IAsyncLifetime
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

    private static decimal Line(JsonElement sim, string code) =>
        sim.GetProperty("lines").EnumerateArray().Where(l => l.GetProperty("code").GetString() == code).Sum(l => l.GetProperty("amount").GetDecimal());

    [Fact]
    public async Task Uecara_template_simulates_the_agreement_payslip_and_scales_can_be_updated()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var agreement = await Json(await client.PostAsync("/api/v1/hr/payroll/agreements/templates/uecara", null));
        var id = agreement.GetProperty("id").GetGuid();
        Assert.Contains("ya está cargado", await Rejected(await client.PostAsync("/api/v1/hr/payroll/agreements/templates/uecara", null)));

        var detail = await Json(await client.GetAsync($"/api/v1/hr/payroll/agreements/{id}"));
        Assert.Equal(16, detail.GetProperty("categories").GetArrayLength());
        var auxiliar = detail.GetProperty("categories").EnumerateArray().Single(c => c.GetProperty("name").GetString() == "Auxiliar administrativo").GetProperty("id").GetGuid();

        object Simulate(string zone, string month, bool member, params string[] flags) =>
            new { categoryId = auxiliar, zone, month, seniorityFrom = "2021-09-15T00:00:00Z", unionMember = member, flags };

        // Septiembre, zona II, no afiliado, título B: el 5.º año se cumple el 15/09 y se cobra desde octubre.
        var sim = await Json(await client.PostAsJsonAsync($"/api/v1/hr/payroll/agreements/{id}/simulate", Simulate("II", "2026-09", false, "titulo-b")));
        Assert.Equal(1624878m, sim.GetProperty("basic").GetDecimal());
        Assert.Equal(4, sim.GetProperty("seniorityYears").GetInt32());
        Assert.Equal(55376m, Line(sim, "ANTIG"));
        Assert.Equal(64592m, Line(sim, "TITB"));
        Assert.Equal(1744846m, sim.GetProperty("remunerative").GetDecimal());
        Assert.Equal(17448.46m, Line(sim, "SOLID"));
        Assert.Equal(26172.69m, Line(sim, "SOLEX"));
        Assert.Contains(sim.GetProperty("warnings").EnumerateArray(), w => w.GetString()!.Contains("tope del 2 %"));

        // Afiliado: cuota del 2 % y sin solidarios. Zona IV, grupo administrativos: adicional del 80 %.
        var member = await Json(await client.PostAsJsonAsync($"/api/v1/hr/payroll/agreements/{id}/simulate", Simulate("IV", "2026-10", true)));
        Assert.Equal(5, member.GetProperty("seniorityYears").GetInt32());
        Assert.Equal(1299902.40m, Line(member, "ZONA4"));
        Assert.Equal(0m, Line(member, "SOLID"));
        Assert.True(Line(member, "CUOTA") > 0m);
        Assert.Contains(member.GetProperty("warnings").EnumerateArray(), w => w.GetString()!.Contains("09/2026")); // falta la escala de octubre

        // Octubre: +1,8 % sobre septiembre, redondeado a pesos.
        await Json(await client.PostAsJsonAsync($"/api/v1/hr/payroll/agreements/{id}/scales/increase",
            new { month = "2026-10", percent = 1.8m, source = "UECARA acuerdo 22/09/2026", roundToPesos = true }));
        var october = await Json(await client.GetAsync($"/api/v1/hr/payroll/agreements/{id}/scales?month=2026-10"));
        var row = october.EnumerateArray().Single(s => s.GetProperty("categoryId").GetGuid() == auxiliar && s.GetProperty("zone").GetString() == "II");
        Assert.Equal(1654126m, row.GetProperty("basic").GetDecimal());
        Assert.True(row.GetProperty("isCurrentMonth").GetBoolean());

        // Pegado desde planilla: todo o nada.
        var bad = await Rejected(await client.PostAsJsonAsync($"/api/v1/hr/payroll/agreements/{id}/scales/paste",
            new { month = "2026-11", source = "Acuerdo", text = "Auxiliar administrativo\tII\t1.700.000,00\nCategoría inventada\tII\t100" }));
        Assert.Contains("no existe en el convenio", bad);
        await Json(await client.PostAsJsonAsync($"/api/v1/hr/payroll/agreements/{id}/scales/paste",
            new { month = "2026-11", source = "Acuerdo", text = "Auxiliar administrativo\tII\t1.700.000,00\t50000" }));
        var november = await Json(await client.PostAsJsonAsync($"/api/v1/hr/payroll/agreements/{id}/simulate", Simulate("II", "2026-11", true)));
        Assert.Equal(1700000m, november.GetProperty("basic").GetDecimal());
        Assert.Equal(50000m, november.GetProperty("nonRemunerative").GetDecimal());

        // El aporte solidario de los no afiliados no puede pasar del 2 % (Ley 27.802).
        Assert.Contains("tope legal del 2 %", await Rejected(await client.PostAsJsonAsync($"/api/v1/hr/payroll/agreements/{id}/rules", new
        {
            type = "EmployeeDeduction", code = "SOL2", name = "Solidario", basis = "PercentOfGross", value = 2.5m, remunerative = false,
            appliesTo = "NonMembers", seniorityFromNextMonth = false, validFrom = "2026-11"
        })));
    }

    [Fact]
    public async Task Employees_are_assigned_to_agreement_category_and_zone()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var agreement = await Json(await client.PostAsync("/api/v1/hr/payroll/agreements/templates/uecara", null));
        var id = agreement.GetProperty("id").GetGuid();
        var detail = await Json(await client.GetAsync($"/api/v1/hr/payroll/agreements/{id}"));
        var category = detail.GetProperty("categories")[0].GetProperty("id").GetGuid();

        object Employee(string? zone) => new
        {
            fileNumber = "7", firstName = "Luis", lastName = "Díaz", documentNumber = "30111222", cuil = "20301112220", hireDate = "2022-01-10T00:00:00Z",
            agreementId = id, agreementCategoryId = category, agreementZone = zone, agreementFlags = "Titulo-A, fallo-caja"
        };
        Assert.Contains("zona", await Rejected(await client.PostAsJsonAsync("/api/v1/hr/employees", Employee("IX"))));
        var employee = await Json(await client.PostAsJsonAsync("/api/v1/hr/employees", Employee("ii")));
        Assert.Equal("II", employee.GetProperty("agreementZone").GetString());
        Assert.Equal("titulo-a,fallo-caja", employee.GetProperty("agreementFlags").GetString());
        Assert.Equal("Capataz de obra", employee.GetProperty("unionCategory").GetString());
        Assert.Contains("colaboradores", await Rejected(await client.DeleteAsync($"/api/v1/hr/payroll/agreements/{id}")));
    }
}
