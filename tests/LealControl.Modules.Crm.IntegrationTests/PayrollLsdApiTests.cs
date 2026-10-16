using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Npgsql;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>
/// Sueldos S5: archivo del Libro de Sueldos Digital verificado posición por posición contra el diseño de ARCA
/// ("Interfaz Usuario / Liquidación de SyJ - DJ F931"), controles previos, conceptos ARCA y su archivo.
/// </summary>
public sealed class PayrollLsdApiTests : IAsyncLifetime
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

    private async Task Sql(string sql)
    {
        await using var db = new NpgsqlConnection(_factory.DatabaseConnectionString);
        await db.OpenAsync();
        await using var cmd = new NpgsqlCommand(sql, db);
        await cmd.ExecuteNonQueryAsync();
    }

    /// <summary>Campo de un registro, con las posiciones "desde" y "hasta" del diseño (base 1).</summary>
    private static string F(string record, int from, int to) => record.Substring(from - 1, to - from + 1);

    [Fact]
    public async Task The_lsd_file_follows_the_arca_design()
    {
        using var client = _factory.CreateAuthenticatedClient();
        await Json(await client.PutAsJsonAsync("/api/v1/hr/payroll/settings", new
        {
            isMiPyme = true, isCommerceOrServices = true, activityCode = 49, artVariablePercent = 2.5m, artFixedAmount = 600m, lifeInsurancePremium = 350m
        }));
        var ana = await Json(await client.PostAsJsonAsync("/api/v1/hr/employees", new
        {
            fileNumber = "1", firstName = "Ana", lastName = "Pérez", documentNumber = "30111222", cuil = "27-30111222-5", hireDate = "2021-01-01T00:00:00Z",
            baseSalary = 1000000m, jobTitle = "Administrativa", localityCode = "01", healthInsuranceCode = "126205", cbu = "0110599520000001234567", hasSpouse = true, childrenCount = 2
        }));
        await Json(await client.PostAsJsonAsync("/api/v1/hr/employees", new
        {
            fileNumber = "2", firstName = "Luis", lastName = "Sosa", documentNumber = "30111223", cuil = "20301112220", hireDate = "2026-10-16T00:00:00Z",
            baseSalary = 900000m, jobTitle = "Cadete", localityCode = "01"
        }));

        var rid = (await Json(await client.PostAsJsonAsync("/api/v1/hr/payroll/runs", new { year = 2026, month = 10, paymentDate = "2026-11-04" }))).GetProperty("id").GetGuid();
        await Json(await client.PostAsJsonAsync($"/api/v1/hr/payroll/runs/{rid}/novelties", new { employeeId = ana.GetProperty("id").GetGuid(), kind = "Overtime50", quantity = 4m, amount = 0m }));
        await Json(await client.PostAsync($"/api/v1/hr/payroll/runs/{rid}/calculate", null));

        // Controles previos: abierta, sin CUIT de la empresa y un legajo sin obra social.
        var check = await Json(await client.GetAsync($"/api/v1/hr/payroll/runs/{rid}/lsd/check"));
        var errors = check.GetProperty("errors").EnumerateArray().Select(e => e.GetString()!).ToList();
        Assert.Contains(errors, e => e.Contains("Cerrá la liquidación"));
        Assert.Contains(errors, e => e.Contains("CUIT de la empresa"));
        Assert.Contains(errors, e => e.StartsWith("Sosa, Luis") && e.Contains("obra social"));
        Assert.Contains("Cerrá", await Rejected(await client.GetAsync($"/api/v1/hr/payroll/runs/{rid}/lsd/file")));

        await Json(await client.PostAsJsonAsync($"/api/v1/hr/payroll/runs/{rid}/close", new { lastDepositPeriod = "09/2026", lastDepositDate = "2026-10-09", lastDepositBank = "Banco Nación" }));
        var company = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>((await Json(await client.GetAsync("/api/v1/company/settings"))).GetRawText())!;
        company["documentNumber"] = JsonDocument.Parse("\"30-71234567-1\"").RootElement;
        await Json(await client.PutAsJsonAsync("/api/v1/company/settings", company));
        await Sql("""UPDATE hr."Employees" SET "HealthInsuranceCode" = '126205' WHERE "FileNumber" = '2'""");
        check = await Json(await client.GetAsync($"/api/v1/hr/payroll/runs/{rid}/lsd/check"));
        Assert.True(check.GetProperty("errors").GetArrayLength() == 0, check.GetProperty("errors").ToString());
        Assert.Contains(check.GetProperty("warnings").EnumerateArray(), w => w.GetString()!.StartsWith("Sosa, Luis") && w.GetString()!.Contains("efectivo"));
        Assert.Equal(113300m + 52800m, check.GetProperty("summary").GetProperty("pensionContributions").GetDecimal());

        var response = await client.GetAsync($"/api/v1/hr/payroll/runs/{rid}/lsd/file");
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        var text = Encoding.Latin1.GetString(await response.Content.ReadAsByteArrayAsync());
        Assert.EndsWith("\r\n", text);
        var records = text.Split("\r\n", StringSplitOptions.RemoveEmptyEntries);
        foreach (var r in records)
            Assert.Equal(r[..2] switch { "01" => 35, "02" => 115, "03" => 51, "04" => 370, _ => -1 }, r.Length);

        // 01: CUIT, envío SJ, período, mensual, liquidación 1, base 30, 2 trabajadores.
        Assert.Equal("01" + "30712345671" + "SJ" + "202610" + "M" + "00001" + "30" + "000002", records[0]);

        var anaRecords = records.Where(r => F(r, 3, 13) == "27301112225").ToList();
        var r02 = anaRecords.Single(r => r.StartsWith("02"));
        Assert.Equal("1         ", F(r02, 14, 23));
        Assert.Equal("0110599520000001234567", F(r02, 74, 95));
        Assert.Equal("000", F(r02, 96, 98));                      // mes completo: no proporciona el tope
        Assert.Equal("20261104", F(r02, 99, 106));
        Assert.Equal("        ", F(r02, 107, 114));
        Assert.Equal("3", F(r02, 115, 115));
        var luis02 = records.Single(r => r.StartsWith("02") && F(r, 3, 13) == "20301112220");
        Assert.Equal("016", F(luis02, 96, 98));                   // ingresó el 16: tope por 16 días
        Assert.Equal("1", F(luis02, 115, 115));

        var he = anaRecords.Single(r => r.StartsWith("03") && F(r, 14, 23) == "HE50      ");
        Assert.Equal("00400", F(he, 24, 28));                      // 4 horas
        Assert.Equal("H", F(he, 29, 29));
        Assert.Equal("000000003000000", F(he, 30, 44));            // 1.000.000 / 200 × 1,5 × 4
        Assert.Equal("C", F(he, 45, 45));
        var jubil = anaRecords.Single(r => r.StartsWith("03") && F(r, 14, 23) == "JUBIL     ");
        Assert.Equal("000000011330000", F(jubil, 30, 44));
        Assert.Equal("D", F(jubil, 45, 45));

        var r04 = anaRecords.Single(r => r.StartsWith("04"));
        Assert.Equal("1", F(r04, 14, 14));                         // cónyuge
        Assert.Equal("02", F(r04, 15, 16));                        // hijos
        Assert.Equal("0", F(r04, 17, 17));                         // fuera de convenio
        Assert.Equal("1", F(r04, 18, 18));                         // SCVO
        Assert.Equal("1", F(r04, 20, 20));                         // empleador del 18 %
        Assert.Equal("01", F(r04, 22, 23));
        Assert.Equal("049", F(r04, 26, 28));
        Assert.Equal("008", F(r04, 29, 31));
        Assert.Equal("01", F(r04, 34, 35));
        Assert.Equal("0101", F(r04, 36, 39));                      // situación 01 desde el día 1
        Assert.Equal("30", F(r04, 48, 49));
        Assert.Equal("126205", F(r04, 63, 68));
        Assert.Equal("000000103000000", F(r04, 161, 175));         // remuneración bruta
        Assert.Equal("000000103000000", F(r04, 176, 190));         // base 1: aportes SIPA
        Assert.Equal("000000103000000", F(r04, 191, 205));         // base 2: contribuciones SIPA
        Assert.Equal("000000000000000", F(r04, 251, 265));         // base 6
        Assert.Equal("000000103000000", F(r04, 296, 310));         // base 9: LRT
        Assert.Equal("000000102299632", F(r04, 341, 355));         // base 10: base 2 − detracción
        Assert.Equal("000000000700368", F(r04, 356, 370));         // detracción 7.003,68
    }

    [Fact]
    public async Task Concepts_are_mapped_to_arca_codes_and_exported()
    {
        using var client = _factory.CreateAuthenticatedClient();
        await Json(await client.PostAsync("/api/v1/hr/payroll/agreements/templates/uecara", null));
        var concepts = (await Json(await client.GetAsync("/api/v1/hr/payroll/lsd/concepts"))).EnumerateArray().ToList();
        string Arca(string code) => concepts.Single(c => c.GetProperty("code").GetString() == code).GetProperty("arcaCode").GetString()!;
        Assert.Equal("110000", Arca("BASICO"));
        Assert.Equal("150000", Arca("VACAC"));
        Assert.Equal("160001", Arca("ANTIG"));
        Assert.Equal("170001", Arca("ASIST"));
        Assert.Equal("810004", Arca("CUOTA"));

        Assert.Contains("100000 al 499999", await Rejected(await client.PutAsJsonAsync("/api/v1/hr/payroll/lsd/concepts/OTROREM", new { arcaCode = "550000" })));
        var changed = await Json(await client.PutAsJsonAsync("/api/v1/hr/payroll/lsd/concepts/HE50", new { arcaCode = "130000" }));
        Assert.Equal("130000", changed.GetProperty("arcaCode").GetString());
        Assert.Equal("130001", changed.GetProperty("defaultArcaCode").GetString());

        var file = Encoding.Latin1.GetString(await (await client.GetAsync("/api/v1/hr/payroll/lsd/concepts/file")).Content.ReadAsByteArrayAsync());
        var lines = file.Split("\r\n", StringSplitOptions.RemoveEmptyEntries);
        Assert.All(lines, l => Assert.Equal(195, l.Length));
        var he = lines.Single(l => F(l, 7, 16) == "HE50      ");
        Assert.Equal("130000", F(he, 1, 6));
        Assert.Equal("Horas extra al 50 %", F(he, 17, 166).TrimEnd());
        Assert.Equal("0", F(he, 167, 167));
        Assert.Equal("1111111100 1 1 10 0", F(he, 168, 186));
        var jubil = lines.Single(l => F(l, 7, 16) == "JUBIL     ");
        Assert.Equal("0000000000 0 0 00 0", F(jubil, 168, 186));
        Assert.Contains(lines, l => F(l, 7, 16) == "ANTIG     " && F(l, 17, 166).StartsWith("Antigüedad"));

        // Vacío vuelve a la propuesta del sistema.
        var back = await Json(await client.PutAsJsonAsync("/api/v1/hr/payroll/lsd/concepts/HE50", new { arcaCode = "" }));
        Assert.Equal("130001", back.GetProperty("arcaCode").GetString());
    }
}
