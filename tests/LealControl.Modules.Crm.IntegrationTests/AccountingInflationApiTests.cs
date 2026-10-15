using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>
/// Contabilidad C6: ajuste por inflación. Las cuentas no monetarias se reexpresan con el índice de cierre /
/// índice de su mes; la diferencia va contra RECPAM; cada mes registra solo lo que falta.
/// </summary>
public sealed class AccountingInflationApiTests : IAsyncLifetime
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

    private static object Line(JsonElement account, decimal debit, decimal credit) => new
    {
        accountId = account.GetProperty("id").GetGuid(), accountCode = account.GetProperty("code").GetString(), accountName = "x",
        debit, credit, currency = "ARS", exchangeRate = 1m
    };

    private static decimal Side(JsonElement entry, string accountCode, string side) =>
        entry.GetProperty("lines").EnumerateArray().Where(l => l.GetProperty("accountCode").GetString() == accountCode)
            .Sum(l => l.GetProperty(side).GetDecimal());

    private static async Task<JsonElement> EntryAsync(HttpClient client, JsonElement created)
    {
        var id = created.GetProperty("id").GetString();
        return (await Json(await client.GetAsync("/api/v1/accounting/journal-entries"))).EnumerateArray()
            .Single(e => e.GetProperty("id").GetString() == id);
    }

    [Fact]
    public async Task Non_monetary_accounts_are_restated_against_recpam_month_by_month()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var all = (await Json(await client.GetAsync("/api/v1/accounting/accounts"))).EnumerateArray().ToList();
        JsonElement A(string code) => all.Single(a => a.GetProperty("code").GetString() == code);
        var (cash, capital, goods, sales) = (A("1.1.01.001"), A("3.1.01"), A("1.1.04.001"), A("4.1.01"));

        async Task Entry(string date, params object[] lines) =>
            await Json(await client.PostAsJsonAsync("/api/v1/accounting/journal-entries", new { date, concept = "Mov", entryType = "Standard", lines }));
        await Entry("2026-01-10", Line(cash, 1000m, 0m), Line(capital, 0m, 1000m));   // aporte
        await Entry("2026-02-15", Line(goods, 500m, 0m), Line(cash, 0m, 500m));       // compra de mercadería
        await Entry("2026-03-05", Line(cash, 300m, 0m), Line(sales, 0m, 300m));       // venta

        var suggested = await Json(await client.PostAsync("/api/v1/accounting/inflation-adjustment/suggest-accounts", null));
        Assert.True(suggested.GetProperty("total").GetInt32() > 0);

        var request = new { date = "2026-03-31" };
        var missing = await Json(await client.PostAsJsonAsync("/api/v1/accounting/inflation-adjustment/preview", request));
        Assert.Equal(["01/2026", "02/2026", "03/2026"], missing.GetProperty("missingIndices").EnumerateArray().Select(m => m.GetString()));
        Assert.Contains("Faltan los índices", await Rejected(await client.PostAsJsonAsync("/api/v1/accounting/inflation-adjustment", request)));

        Assert.Contains("repetido", await Rejected(await client.PutAsJsonAsync("/api/v1/accounting/inflation-indices",
            new[] { new { year = 2026, month = 1, value = 100m }, new { year = 2026, month = 1, value = 101m } })));
        await Json(await client.PutAsJsonAsync("/api/v1/accounting/inflation-indices", new[]
        {
            new { year = 2026, month = 1, value = 100m }, new { year = 2026, month = 2, value = 110m },
            new { year = 2026, month = 3, value = 121m }, new { year = 2026, month = 4, value = 133.1m }
        }));

        // Marzo (121): capital ×1,21 → −210; mercadería de febrero ×1,1 → +50; venta de marzo ×1 → 0.
        // RECPAM: 160 de pérdida (la caja perdió poder de compra).
        var preview = await Json(await client.PostAsJsonAsync("/api/v1/accounting/inflation-adjustment/preview", request));
        Assert.Equal(160m, preview.GetProperty("recpam").GetDecimal());
        var march = await EntryAsync(client, await Json(await client.PostAsJsonAsync("/api/v1/accounting/inflation-adjustment", request)));
        Assert.Equal(210m, Side(march, "3.1.01", "credit"));
        Assert.Equal(50m, Side(march, "1.1.04.001", "debit"));
        Assert.Equal(160m, Side(march, "4.2.04", "debit"));
        Assert.Equal(0m, Side(march, "1.1.01.001", "debit") + Side(march, "1.1.01.001", "credit")); // la caja no se ajusta
        Assert.Contains("ya tiene ajuste", await Rejected(await client.PostAsJsonAsync("/api/v1/accounting/inflation-adjustment", request)));

        // Abril (133,1): solo lo que falta. Capital: −1000 × 0,331 = −331, ya ajustado −210 → −121.
        var april = await EntryAsync(client, await Json(await client.PostAsJsonAsync("/api/v1/accounting/inflation-adjustment", new { date = "2026-04-30" })));
        Assert.Equal(121m, Side(april, "3.1.01", "credit"));
        Assert.Equal(55m, Side(april, "1.1.04.001", "debit"));   // 500 × 133,1/110 = 605 → +105, ya +50
        Assert.Equal(30m, Side(april, "4.1.01", "credit"));      // 300 × 1,1 = 330 → −30
    }

    [Fact]
    public async Task After_closing_the_year_the_opening_balances_are_restated_from_the_closing_month()
    {
        using var client = _factory.CreateAuthenticatedClient();
        // Ejercicio que cierra en marzo, para poder cerrarlo con el reloj de pruebas (octubre de 2026).
        await Json(await client.PutAsJsonAsync("/api/v1/accounting/settings", new { fiscalYearEndMonth = 3 }));
        var all = (await Json(await client.GetAsync("/api/v1/accounting/accounts"))).EnumerateArray().ToList();
        JsonElement A(string code) => all.Single(a => a.GetProperty("code").GetString() == code);
        var (cash, capital, goods, sales) = (A("1.1.01.001"), A("3.1.01"), A("1.1.04.001"), A("4.1.01"));
        async Task Entry(string date, params object[] lines) =>
            await Json(await client.PostAsJsonAsync("/api/v1/accounting/journal-entries", new { date, concept = "Mov", entryType = "Standard", lines }));
        await Entry("2026-01-10", Line(cash, 1000m, 0m), Line(capital, 0m, 1000m));
        await Entry("2026-02-15", Line(goods, 500m, 0m), Line(cash, 0m, 500m));
        await Entry("2026-03-05", Line(cash, 300m, 0m), Line(sales, 0m, 300m));
        await Json(await client.PostAsync("/api/v1/accounting/inflation-adjustment/suggest-accounts", null));
        await Json(await client.PutAsJsonAsync("/api/v1/accounting/inflation-indices", new[]
        {
            new { year = 2026, month = 1, value = 100m }, new { year = 2026, month = 2, value = 110m },
            new { year = 2026, month = 3, value = 121m }, new { year = 2026, month = 4, value = 133.1m }
        }));
        await Json(await client.PostAsJsonAsync("/api/v1/accounting/inflation-adjustment", new { date = "2026-03-31" }));
        await Json(await client.PostAsJsonAsync("/api/v1/accounting/fiscal-years/close", new { end = "2026-03-31" }));

        // Apertura en moneda de marzo: capital 1210, resultados no asignados 140 (venta 300 − RECPAM 160), mercadería 550.
        // Abril (×1,1): capital −121, resultados no asignados −14, mercadería +55; RECPAM 80 = caja 800 × 10 %.
        var april = await Json(await client.PostAsJsonAsync("/api/v1/accounting/inflation-adjustment/preview", new { date = "2026-04-30" }));
        Assert.Empty(april.GetProperty("missingIndices").EnumerateArray());
        var rows = april.GetProperty("rows").EnumerateArray().ToDictionary(r => r.GetProperty("accountCode").GetString()!, r => r.GetProperty("adjustment").GetDecimal());
        Assert.Equal(-121m, rows["3.1.01"]);
        Assert.Equal(-14m, rows["3.2.01"]);
        Assert.Equal(55m, rows["1.1.04.001"]);
        Assert.Equal(80m, april.GetProperty("recpam").GetDecimal());
    }
}
