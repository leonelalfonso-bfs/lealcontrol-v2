using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>
/// Sueldos S3: liquidación mensual completa, calculada a mano. UECARA (convenio, antigüedad, título, asistencia,
/// horas extra, aportes con tope, solidarios) y fuera de convenio (ingreso a mitad de mes, inasistencia, adelanto);
/// contribuciones con detracción, obra social, ART y seguro de vida; cierre con art. 140; asiento contable; reapertura.
/// </summary>
public sealed class PayrollRunApiTests : IAsyncLifetime
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

    private static decimal Side(JsonElement entry, string code, string side) =>
        entry.GetProperty("lines").EnumerateArray().Where(l => l.GetProperty("accountCode").GetString() == code).Sum(l => l.GetProperty(side).GetDecimal());

    [Fact]
    public async Task A_month_is_calculated_closed_posted_to_accounting_and_reopened()
    {
        using var client = _factory.CreateAuthenticatedClient();
        await Json(await client.PutAsJsonAsync("/api/v1/hr/payroll/settings", new
        {
            isMiPyme = true, isCommerceOrServices = true, artVariablePercent = 2.5m, artFixedAmount = 600m, lifeInsurancePremium = 350m
        }));
        var agreement = await Json(await client.PostAsync("/api/v1/hr/payroll/agreements/templates/uecara", null));
        var aid = agreement.GetProperty("id").GetGuid();
        await Json(await client.PostAsJsonAsync($"/api/v1/hr/payroll/agreements/{aid}/scales/increase",
            new { month = "2026-10", percent = 1.8m, source = "UECARA acuerdo 22/09/2026", roundToPesos = true }));
        var detail = await Json(await client.GetAsync($"/api/v1/hr/payroll/agreements/{aid}"));
        var auxiliar = detail.GetProperty("categories").EnumerateArray().Single(c => c.GetProperty("name").GetString() == "Auxiliar administrativo").GetProperty("id").GetGuid();

        var ana = await Json(await client.PostAsJsonAsync("/api/v1/hr/employees", new
        {
            fileNumber = "1", firstName = "Ana", lastName = "Pérez", documentNumber = "30111222", cuil = "27301112225", hireDate = "2021-09-15T00:00:00Z",
            agreementId = aid, agreementCategoryId = auxiliar, agreementZone = "II", agreementFlags = "titulo-b"
        }));
        var juan = await Json(await client.PostAsJsonAsync("/api/v1/hr/employees", new
        {
            fileNumber = "2", firstName = "Juan", lastName = "Gómez", documentNumber = "30111223", cuil = "20301112220", hireDate = "2026-10-16T00:00:00Z",
            baseSalary = 1000000m, jobTitle = "Encargado"
        }));

        var run = await Json(await client.PostAsJsonAsync("/api/v1/hr/payroll/runs", new { year = 2026, month = 10, paymentDate = "2026-11-04" }));
        var rid = run.GetProperty("id").GetGuid();
        Assert.Contains("Ya existe", await Rejected(await client.PostAsJsonAsync("/api/v1/hr/payroll/runs", new { year = 2026, month = 10, paymentDate = "2026-11-04" })));
        async Task Novelty(JsonElement e, string kind, decimal quantity = 0m, decimal amount = 0m) =>
            await Json(await client.PostAsJsonAsync($"/api/v1/hr/payroll/runs/{rid}/novelties", new { employeeId = e.GetProperty("id").GetGuid(), kind, quantity, amount }));
        await Novelty(ana, "Overtime50", quantity: 4m);
        await Novelty(juan, "Absence", quantity: 1m);
        await Novelty(juan, "Advance", amount: 50000m);

        var calc = await Json(await client.PostAsync($"/api/v1/hr/payroll/runs/{rid}/calculate", null));
        Assert.Equal(2, calc.GetProperty("calculated").GetInt32());
        Assert.Empty(calc.GetProperty("errors").EnumerateArray());

        var summary = await Json(await client.GetAsync($"/api/v1/hr/payroll/runs/{rid}"));
        Guid Slip(string name) => summary.GetProperty("payslips").EnumerateArray().Single(p => p.GetProperty("employeeName").GetString()!.StartsWith(name)).GetProperty("id").GetGuid();
        async Task<JsonElement> Payslip(string name) => (await Json(await client.GetAsync($"/api/v1/hr/payroll/runs/{rid}/payslips/{Slip(name)}"))).GetProperty("payslip");

        // UECARA: básico 1.654.126 (sept. + 1,8 %), antigüedad 5 × 13.844, título B, asistencia 10 %, 4 h al 50 %.
        var a = await Payslip("Pérez");
        Assert.Equal(1654126m, Line(a, "BASICO"));
        Assert.Equal(69220m, Line(a, "ANTIG"));
        Assert.Equal(64592m, Line(a, "TITB"));
        Assert.Equal(165412.60m, Line(a, "ASIST"));
        Assert.Equal(58600.52m, Line(a, "HE50"));                  // 1.953.350,60 / 200 × 1,5 × 4
        Assert.Equal(2011951.12m, a.GetProperty("remunerative").GetDecimal());
        Assert.Equal(221314.62m, Line(a, "JUBIL"));
        Assert.Equal(60358.53m, Line(a, "LEY19032"));
        Assert.Equal(60358.53m, Line(a, "OBRASOC"));
        Assert.Equal(20119.51m, Line(a, "SOLID"));
        Assert.Equal(30179.27m, Line(a, "SOLEX"));
        Assert.Equal(1619620.66m, a.GetProperty("net").GetDecimal());
        Assert.Equal(360890.54m, Line(a, "CONTSS"));               // 18 % de (2.011.951,12 − 7.003,68)
        Assert.Equal(0m, Line(a, "FAL"));                          // el FAL rige desde noviembre
        Assert.Equal(120717.07m, Line(a, "CONTOS"));
        Assert.Equal(50898.78m, Line(a, "ART"));                   // 2,5 % + 600
        Assert.Equal(350m, Line(a, "SCVO"));

        // Fuera de convenio: ingresó el 16/10 (16 días), 1 inasistencia (1.000.000 / 30), adelanto.
        var j = await Payslip("Gómez");
        Assert.Equal(16m, j.GetProperty("daysWorked").GetDecimal());
        Assert.Equal(533333.33m, Line(j, "BASICO"));
        Assert.Equal(-33333.33m, Line(j, "INASIST"));
        Assert.Equal(500000m, j.GetProperty("remunerative").GetDecimal());
        Assert.Equal(55000m, Line(j, "JUBIL"));
        Assert.Equal(50000m, Line(j, "ADELANTO"));
        Assert.Equal(365000m, j.GetProperty("net").GetDecimal());
        Assert.Equal(89327.65m, Line(j, "CONTSS"));                 // 18 % de (500.000 − 7.003,68 × 16/30)
        Assert.Equal(12820m, Line(j, "ART"));                      // 2,5 % + 600 × 16/30

        // Cierre: pide el último depósito de aportes (art. 140); después no se tocan novedades.
        Assert.Contains("art. 140", await Rejected(await client.PostAsJsonAsync($"/api/v1/hr/payroll/runs/{rid}/close", new { })));
        await Json(await client.PostAsJsonAsync($"/api/v1/hr/payroll/runs/{rid}/close",
            new { lastDepositPeriod = "09/2026", lastDepositDate = "2026-10-09", lastDepositBank = "Banco Nación" }));
        Assert.Contains("cerrada", await Rejected(await client.PostAsJsonAsync($"/api/v1/hr/payroll/runs/{rid}/novelties",
            new { employeeId = juan.GetProperty("id").GetGuid(), kind = "Advance", quantity = 0m, amount = 1m })));
        var closed = await Json(await client.GetAsync($"/api/v1/hr/payroll/runs/{rid}/payslips/{Slip("Pérez")}"));
        Assert.True(closed.GetProperty("intact").GetBoolean());
        Assert.Equal(64, closed.GetProperty("payslip").GetProperty("contentHash").GetString()!.Length);

        // Contabilizar octubre: asiento de sueldos que cuadra.
        await Json(await client.PostAsJsonAsync("/api/v1/accounting/batch-post/execute",
            new { periodStart = "2026-10-01", periodEnd = "2026-10-31", modules = new[] { "Payroll" } }));
        var entries = (await Json(await client.GetAsync("/api/v1/accounting/journal-entries"))).EnumerateArray().ToList();
        var entry = entries.Single(e => e.GetProperty("sourceDocumentId").GetString() == rid.ToString());
        Assert.Equal(entry.GetProperty("totalDebit").GetDecimal(), entry.GetProperty("totalCredit").GetDecimal());
        Assert.Equal(2511951.12m, Side(entry, "5.2.01", "debit"));
        Assert.Equal(1984620.66m, Side(entry, "2.1.02.004", "credit"));
        Assert.Equal(50000m, Side(entry, "1.1.02.003", "credit"));
        Assert.Equal(50298.78m, Side(entry, "2.1.02.007", "credit"));

        // Reabrir: vuelve a borrador y el asiento se contra-asienta.
        await Json(await client.PostAsync($"/api/v1/hr/payroll/runs/{rid}/reopen", null));
        var after = (await Json(await client.GetAsync("/api/v1/accounting/journal-entries"))).EnumerateArray();
        Assert.Contains(after, e => e.GetProperty("entryType").GetString() == "Reversal" && e.GetProperty("sourceDocumentId").GetString() == entry.GetProperty("id").GetString());
        var reopened = await Json(await client.GetAsync($"/api/v1/hr/payroll/runs/{rid}"));
        Assert.Equal("Draft", reopened.GetProperty("run").GetProperty("status").GetString());
    }

    [Fact]
    public async Task A_run_with_an_employee_in_error_cannot_be_closed()
    {
        using var client = _factory.CreateAuthenticatedClient();
        await Json(await client.PostAsJsonAsync("/api/v1/hr/employees", new
        {
            fileNumber = "1", firstName = "Ana", lastName = "Pérez", documentNumber = "30111222", cuil = "27301112225", hireDate = "2021-09-15T00:00:00Z",
            baseSalary = 900000m
        }));
        await Json(await client.PostAsJsonAsync("/api/v1/hr/employees", new
        {
            fileNumber = "2", firstName = "Juan", lastName = "Gómez", documentNumber = "30111223", cuil = "20301112220", hireDate = "2021-09-15T00:00:00Z"
        }));
        var rid = (await Json(await client.PostAsJsonAsync("/api/v1/hr/payroll/runs", new { year = 2026, month = 10, paymentDate = "2026-11-04" }))).GetProperty("id").GetGuid();

        var calc = await Json(await client.PostAsync($"/api/v1/hr/payroll/runs/{rid}/calculate", null));
        Assert.Equal(1, calc.GetProperty("calculated").GetInt32());
        Assert.Contains("sin sueldo", calc.GetProperty("errors").EnumerateArray().Single().GetString());
        Assert.Contains("sin errores", await Rejected(await client.PostAsJsonAsync($"/api/v1/hr/payroll/runs/{rid}/close",
            new { lastDepositPeriod = "09/2026", lastDepositDate = "2026-10-09", lastDepositBank = "Banco Nación" })));
    }
}
