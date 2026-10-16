using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Npgsql;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>
/// Sueldos S6, calculado a mano: liquidación final por despido sin causa con la LCT reformada por la Ley 27.802
/// (art. 245 con tope del convenio, preaviso, integración, SAC proporcional, vacaciones no gozadas) y despido en el
/// período de prueba (sin indemnización ni preaviso).
/// </summary>
public sealed class PayrollFinalSettlementApiTests : IAsyncLifetime
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

    private static decimal Line(JsonElement payslip, string code) =>
        payslip.GetProperty("lines").EnumerateArray().Where(l => l.GetProperty("code").GetString() == code).Sum(l => l.GetProperty("amount").GetDecimal());

    private static readonly object Deposit = new { lastDepositPeriod = "09/2026", lastDepositDate = "2026-10-09", lastDepositBank = "Banco Nación" };

    private async Task Sql(string sql)
    {
        await using var db = new NpgsqlConnection(_factory.DatabaseConnectionString);
        await db.OpenAsync();
        await using var cmd = new NpgsqlCommand(sql, db);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task<JsonElement> OnlyPayslip(HttpClient client, Guid runId)
    {
        var detail = await Json(await client.GetAsync($"/api/v1/hr/payroll/runs/{runId}"));
        var pid = detail.GetProperty("payslips").EnumerateArray().Single().GetProperty("id").GetGuid();
        return (await Json(await client.GetAsync($"/api/v1/hr/payroll/runs/{runId}/payslips/{pid}"))).GetProperty("payslip");
    }

    [Fact]
    public async Task A_dismissal_without_cause_pays_severance_notice_integration_sac_and_vacations()
    {
        using var client = _factory.CreateAuthenticatedClient();
        await Json(await client.PutAsJsonAsync("/api/v1/hr/payroll/settings", new
        {
            isMiPyme = true, isCommerceOrServices = true, artVariablePercent = 2.5m, artFixedAmount = 600m, lifeInsurancePremium = 350m
        }));
        // Tope del art. 245 del convenio de la empresa: rige para los de fuera de convenio (el más favorable del establecimiento).
        var agreement = await Json(await client.PostAsync("/api/v1/hr/payroll/agreements/templates/uecara", null));
        var aid = agreement.GetProperty("id").GetGuid();
        var a = (await Json(await client.GetAsync($"/api/v1/hr/payroll/agreements/{aid}"))).GetProperty("agreement");
        await Json(await client.PutAsJsonAsync($"/api/v1/hr/payroll/agreements/{aid}", new
        {
            code = a.GetProperty("code").GetString(), name = a.GetProperty("name").GetString(), union = a.GetProperty("union").GetString(),
            hourDivisor = a.GetProperty("hourDivisor").GetDecimal(), zones = a.GetProperty("zones").GetString(), notes = (string?)null,
            severanceCap = 900000m, severanceCapSource = "Tope publicado (prueba)"
        }));

        async Task<Guid> Employee(string file, string first, string last, string cuil, string hire, decimal salary) =>
            (await Json(await client.PostAsJsonAsync("/api/v1/hr/employees", new
            {
                fileNumber = file, firstName = first, lastName = last, documentNumber = cuil.Substring(2, 8), cuil, hireDate = hire, baseSalary = salary, jobTitle = "Administrativo"
            }))).GetProperty("id").GetGuid();
        var pedro = await Employee("1", "Pedro", "Díaz", "20301112220", "2020-03-01T00:00:00Z", 1000000m);
        var luis = await Employee("2", "Luis", "Sosa", "27301112225", "2026-07-01T00:00:00Z", 900000m);
        var ana = await Employee("3", "Ana", "Paz", "20111111112", "2025-01-01T00:00:00Z", 800000m);

        // Julio a septiembre cerrados; en julio Pedro hizo 10 horas al 50 % (75.000).
        foreach (var month in new[] { 7, 8, 9 })
        {
            var rid = (await Json(await client.PostAsJsonAsync("/api/v1/hr/payroll/runs", new { year = 2026, month, paymentDate = $"2026-{month:D2}-28" }))).GetProperty("id").GetGuid();
            if (month == 7)
                await Json(await client.PostAsJsonAsync($"/api/v1/hr/payroll/runs/{rid}/novelties", new { employeeId = pedro, kind = "Overtime50", quantity = 10m, amount = 0m }));
            Assert.Empty((await Json(await client.PostAsync($"/api/v1/hr/payroll/runs/{rid}/calculate", null))).GetProperty("errors").EnumerateArray());
            await Json(await client.PostAsJsonAsync($"/api/v1/hr/payroll/runs/{rid}/close", Deposit));
        }

        object Final(Guid employeeId) => new { year = 2026, month = 10, paymentDate = "2026-10-14", kind = "Final", employeeId, terminationCause = "DismissalWithoutCause" };
        Assert.Contains("fecha de egreso", await Rejected(await client.PostAsJsonAsync("/api/v1/hr/payroll/runs", Final(pedro))));
        await Sql("""UPDATE hr."Employees" SET "TerminationDate" = '2026-10-10', "Status" = 2 WHERE "FileNumber" IN ('1', '2')""");
        var final = (await Json(await client.PostAsJsonAsync("/api/v1/hr/payroll/runs", Final(pedro)))).GetProperty("id").GetGuid();
        Assert.Contains("ya tiene liquidación final", await Rejected(await client.PostAsJsonAsync("/api/v1/hr/payroll/runs", Final(pedro))));
        Assert.Empty((await Json(await client.PostAsync($"/api/v1/hr/payroll/runs/{final}/calculate", null))).GetProperty("errors").EnumerateArray());

        var p = await OnlyPayslip(client, final);
        // Días de octubre: 1.000.000 × 10 / 30.
        Assert.Equal(333333.33m, Line(p, "BASICO"));
        // SAC proporcional: mejor del semestre julio (1.075.000) / 2 × (30 + 30 + 30 + 10) / 180.
        Assert.Equal(298611.11m, Line(p, "SACPROP"));
        // Art. 245: 6 años y 7 meses = 7 períodos; mejor remuneración 1.000.000 (las horas extra de un mes no son habituales),
        // tope del convenio 900.000 (más que el piso del 67 %: 670.000).
        Assert.Equal(6300000m, Line(p, "INDANT"));
        // Preaviso: más de 5 años, 2 meses; integración: 21 días de 31; cada uno con su SAC.
        Assert.Equal(2000000m, Line(p, "PREAV"));
        Assert.Equal(166666.67m, Line(p, "SACPREAV"));
        Assert.Equal(677419.35m, Line(p, "INTEG"));
        Assert.Equal(56451.61m, Line(p, "SACINTEG"));
        // Vacaciones no gozadas: 21 días × 283 / 365 = 16,28 días × (1.000.000 + 25.000 de promedio de variables) / 25.
        Assert.Equal(667480m, Line(p, "VACNG"));
        Assert.Equal(55623.33m, Line(p, "SACVACNG"));
        // Aportes sobre los días y el SAC; las indemnizaciones no llevan.
        Assert.Equal(69513.89m, Line(p, "JUBIL"));
        Assert.Equal(631944.44m, p.GetProperty("remunerative").GetDecimal());
        Assert.Equal(9923640.96m, p.GetProperty("nonRemunerative").GetDecimal());
        Assert.Equal(10448154.85m, p.GetProperty("net").GetDecimal());

        // En el período de prueba (6 meses): sin indemnización ni preaviso, con aviso.
        var trial = (await Json(await client.PostAsJsonAsync("/api/v1/hr/payroll/runs", Final(luis)))).GetProperty("id").GetGuid();
        var calc = await Json(await client.PostAsync($"/api/v1/hr/payroll/runs/{trial}/calculate", null));
        Assert.Contains(calc.GetProperty("warnings").EnumerateArray(), w => w.GetString()!.Contains("período de prueba"));
        var t = await OnlyPayslip(client, trial);
        Assert.Equal(0m, Line(t, "INDANT") + Line(t, "PREAV") + Line(t, "INTEG"));
        Assert.True(Line(t, "VACNG") > 0m);

        // La mensual de octubre ya no los incluye: cobran sus días en la final.
        var october = (await Json(await client.PostAsJsonAsync("/api/v1/hr/payroll/runs", new { year = 2026, month = 10, paymentDate = "2026-11-04" }))).GetProperty("id").GetGuid();
        await Json(await client.PostAsync($"/api/v1/hr/payroll/runs/{october}/calculate", null));
        var slips = (await Json(await client.GetAsync($"/api/v1/hr/payroll/runs/{october}"))).GetProperty("payslips").EnumerateArray().ToList();
        Assert.Equal(ana, slips.Single().GetProperty("employeeId").GetGuid());

        // Certificado de trabajo: los meses liquidados en el sistema.
        await Json(await client.PostAsJsonAsync($"/api/v1/hr/payroll/runs/{final}/close", Deposit));
        var certificate = await Json(await client.GetAsync($"/api/v1/hr/payroll/runs/{final}/certificate"));
        Assert.Equal(4, certificate.GetProperty("periods").GetArrayLength());
        Assert.Equal("2026-10-10", certificate.GetProperty("employee").GetProperty("terminationDate").GetString()![..10]);
    }
}
