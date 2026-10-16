using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>
/// Sueldos S4, calculado a mano: aguinaldo (mejor remuneración del semestre, días trabajados, su tope y el 50 % de la
/// detracción) y vacaciones (días por antigüedad, tramos de 7 días, pago adelantado a sueldo / 25 con el promedio de
/// variables y descuento de los días en cada mes).
/// </summary>
public sealed class PayrollSacVacationApiTests : IAsyncLifetime
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

    private static readonly object Deposit = new { lastDepositPeriod = "05/2026", lastDepositDate = "2026-06-09", lastDepositBank = "Banco Nación" };

    private static async Task<JsonElement> OnlyPayslip(HttpClient client, Guid runId)
    {
        var detail = await Json(await client.GetAsync($"/api/v1/hr/payroll/runs/{runId}"));
        var pid = detail.GetProperty("payslips").EnumerateArray().Single().GetProperty("id").GetGuid();
        return (await Json(await client.GetAsync($"/api/v1/hr/payroll/runs/{runId}/payslips/{pid}"))).GetProperty("payslip");
    }

    private static async Task<Guid> CreateRun(HttpClient client, int year, int month, string kind = "Monthly") =>
        (await Json(await client.PostAsJsonAsync("/api/v1/hr/payroll/runs", new { year, month, paymentDate = $"{year}-{month:D2}-28", kind }))).GetProperty("id").GetGuid();

    private static async Task Calculate(HttpClient client, Guid rid) =>
        Assert.Empty((await Json(await client.PostAsync($"/api/v1/hr/payroll/runs/{rid}/calculate", null))).GetProperty("errors").EnumerateArray());

    private async Task<HttpClient> Setup()
    {
        var client = _factory.CreateAuthenticatedClient();
        await Json(await client.PutAsJsonAsync("/api/v1/hr/payroll/settings", new
        {
            isMiPyme = true, isCommerceOrServices = true, artVariablePercent = 2.5m, artFixedAmount = 600m, lifeInsurancePremium = 350m
        }));
        return client;
    }

    [Fact]
    public async Task The_first_semester_sac_takes_the_best_salary_and_the_days_worked()
    {
        using var client = await Setup();
        var juan = await Json(await client.PostAsJsonAsync("/api/v1/hr/employees", new
        {
            fileNumber = "2", firstName = "Juan", lastName = "Gómez", documentNumber = "30111223", cuil = "20301112220", hireDate = "2026-03-16T00:00:00Z",
            baseSalary = 1000000m, jobTitle = "Encargado"
        }));
        var jid = juan.GetProperty("id").GetGuid();

        Assert.Contains("junio", await Rejected(await client.PostAsJsonAsync("/api/v1/hr/payroll/runs", new { year = 2026, month = 5, paymentDate = "2026-05-28", kind = "Sac" })));
        var june = await CreateRun(client, 2026, 6);
        await Json(await client.PostAsJsonAsync($"/api/v1/hr/payroll/runs/{june}/novelties", new { employeeId = jid, kind = "OtherRemunerative", quantity = 0m, amount = 200000m, description = "Premio" }));
        await Calculate(client, june);

        var sac = await CreateRun(client, 2026, 6, "Sac");
        Assert.Equal(2, (await Json(await client.GetAsync($"/api/v1/hr/payroll/runs/{sac}"))).GetProperty("run").GetProperty("number").GetInt32());
        Assert.Contains("Cerrá primero", await Rejected(await client.PostAsync($"/api/v1/hr/payroll/runs/{sac}/calculate", null)));
        Assert.Contains("aguinaldo", await Rejected(await client.PostAsJsonAsync($"/api/v1/hr/payroll/runs/{sac}/novelties", new { employeeId = jid, kind = "Overtime50", quantity = 2m, amount = 0m })));
        Assert.Contains("aguinaldo", await Rejected(await client.PostAsJsonAsync($"/api/v1/hr/payroll/runs/{june}/novelties", new { employeeId = jid, kind = "SacPriorBest", quantity = 0m, amount = 1m })));
        await Json(await client.PostAsJsonAsync($"/api/v1/hr/payroll/runs/{june}/close", Deposit));

        // Marzo a mayo no se liquidaron en el sistema: avisa, y con la mejor remuneración de afuera ya no.
        var first = await Json(await client.PostAsync($"/api/v1/hr/payroll/runs/{sac}/calculate", null));
        Assert.Contains(first.GetProperty("warnings").EnumerateArray(), w => w.GetString()!.Contains("03/2026, 04/2026, 05/2026"));
        await Json(await client.PostAsJsonAsync($"/api/v1/hr/payroll/runs/{sac}/novelties", new { employeeId = jid, kind = "SacPriorBest", quantity = 0m, amount = 1100000m }));
        await Calculate(client, sac);

        // Mejor: junio 1.200.000. Días: 16 de marzo + 30 + 30 + 30 = 106. SAC = 600.000 × 106 / 180.
        var p = await OnlyPayslip(client, sac);
        Assert.Equal(106m, p.GetProperty("daysWorked").GetDecimal());
        Assert.Equal(353333.33m, Line(p, "SAC"));
        Assert.Equal(38866.67m, Line(p, "JUBIL"));
        Assert.Equal(10600m, Line(p, "LEY19032"));
        Assert.Equal(10600m, Line(p, "OBRASOC"));
        Assert.Equal(293266.66m, p.GetProperty("net").GetDecimal());
        Assert.Equal(63228.81m, Line(p, "CONTSS"));     // 18 % de (353.333,33 − 7.003,68 / 2 × 106 / 180)
        Assert.Equal(21200m, Line(p, "CONTOS"));
        Assert.Equal(8833.33m, Line(p, "ART"));         // solo la alícuota
        Assert.Equal(0m, Line(p, "SCVO"));

        // Con el aguinaldo cerrado, la mensual de junio no se reabre.
        await Json(await client.PostAsJsonAsync($"/api/v1/hr/payroll/runs/{sac}/close", Deposit));
        Assert.Contains("reabrí primero el aguinaldo", await Rejected(await client.PostAsync($"/api/v1/hr/payroll/runs/{june}/reopen", null)));
    }

    [Fact]
    public async Task Vacations_are_paid_in_advance_with_the_variable_average_and_discounted_by_month()
    {
        using var client = await Setup();
        var marta = await Json(await client.PostAsJsonAsync("/api/v1/hr/employees", new
        {
            fileNumber = "3", firstName = "Marta", lastName = "Ruiz", documentNumber = "30111222", cuil = "27301112225", hireDate = "2019-02-01T00:00:00Z",
            baseSalary = 1000000m, jobTitle = "Administrativa"
        }));
        var mid = marta.GetProperty("id").GetGuid();
        await Json(await client.PostAsJsonAsync("/api/v1/hr/employees", new
        {
            fileNumber = "4", firstName = "Luis", lastName = "Sosa", documentNumber = "30111223", cuil = "20301112220", hireDate = "2026-10-01T00:00:00Z",
            baseSalary = 900000m, jobTitle = "Cadete"
        }));

        // Septiembre: 10 horas al 50 % (1.000.000 / 200 × 1,5 × 10 = 75.000), cerrada.
        var september = await CreateRun(client, 2026, 9);
        await Json(await client.PostAsJsonAsync($"/api/v1/hr/payroll/runs/{september}/novelties", new { employeeId = mid, kind = "Overtime50", quantity = 10m, amount = 0m }));
        await Calculate(client, september);
        await Json(await client.PostAsJsonAsync($"/api/v1/hr/payroll/runs/{september}/close", Deposit));

        object Leave(string start, int days) => new { employeeId = mid, year = 2026, startDate = start, days };
        Assert.Contains("cerrada", await Rejected(await client.PostAsJsonAsync("/api/v1/hr/vacations", Leave("2026-09-28", 7))));
        var ok = await Json(await client.PostAsJsonAsync("/api/v1/hr/vacations", Leave("2026-10-20", 14)));
        Assert.Empty(ok.GetProperty("warnings").EnumerateArray());
        Assert.Contains("al menos 7", await Rejected(await client.PostAsJsonAsync("/api/v1/hr/vacations", Leave("2026-12-01", 5))));
        Assert.Contains("Le quedan 7", await Rejected(await client.PostAsJsonAsync("/api/v1/hr/vacations", Leave("2026-12-01", 8))));
        Assert.Contains("Se superpone", await Rejected(await client.PostAsJsonAsync("/api/v1/hr/vacations", Leave("2026-10-28", 7))));

        var list = (await Json(await client.GetAsync("/api/v1/hr/vacations?year=2026"))).EnumerateArray().ToList();
        var m = list.Single(x => x.GetProperty("employeeId").GetGuid() == mid);
        Assert.Equal(21, m.GetProperty("entitled").GetInt32());   // más de 5 y hasta 10 años al 31/12
        Assert.Equal(7, m.GetProperty("remaining").GetInt32());
        // Luis ingresó el 1/10: 66 de 261 días hábiles, un día cada 20 trabajados.
        Assert.Equal(3, list.Single(x => x.GetProperty("employeeId").GetGuid() != mid).GetProperty("entitled").GetInt32());

        // Octubre: paga los 14 días a (1.000.000 + 75.000) / 25 y descuenta los 12 días de octubre a 1.000.000 / 30.
        var october = await CreateRun(client, 2026, 10);
        await Calculate(client, october);
        var detail = await Json(await client.GetAsync($"/api/v1/hr/payroll/runs/{october}"));
        var pid = detail.GetProperty("payslips").EnumerateArray().Single(x => x.GetProperty("employeeId").GetGuid() == mid).GetProperty("id").GetGuid();
        var oct = (await Json(await client.GetAsync($"/api/v1/hr/payroll/runs/{october}/payslips/{pid}"))).GetProperty("payslip");
        Assert.Equal(602000m, Line(oct, "VACAC"));
        Assert.Equal(-400000m, Line(oct, "DESCVAC"));
        Assert.Equal(1202000m, oct.GetProperty("remunerative").GetDecimal());

        await Json(await client.PostAsJsonAsync($"/api/v1/hr/payroll/runs/{october}/close", Deposit));

        // Noviembre: solo descuenta los 2 días de vacaciones que caen en el mes.
        var november = await CreateRun(client, 2026, 11);
        await Calculate(client, november);
        var nd = await Json(await client.GetAsync($"/api/v1/hr/payroll/runs/{november}"));
        var npid = nd.GetProperty("payslips").EnumerateArray().Single(x => x.GetProperty("employeeId").GetGuid() == mid).GetProperty("id").GetGuid();
        var nov = (await Json(await client.GetAsync($"/api/v1/hr/payroll/runs/{november}/payslips/{npid}"))).GetProperty("payslip");
        Assert.Equal(0m, Line(nov, "VACAC"));
        Assert.Equal(-66666.67m, Line(nov, "DESCVAC"));
    }
}
