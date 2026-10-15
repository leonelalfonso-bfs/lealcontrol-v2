using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>
/// Contabilidad C0: asientos manuales validados contra el plan de cuentas, numeración única aun
/// con asientos simultáneos, candado de período y sin el Libro IVA Digital falso. (El cierre de
/// ejercicio se prueba en AccountingFiscalYearApiTests.)
/// </summary>
public sealed class AccountingSafetyApiTests : IAsyncLifetime
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

    private static async Task<string> RejectedAsync(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.BadRequest, body);
        return body;
    }

    private static object Line(JsonElement account, decimal debit, decimal credit) => new
    {
        accountId = account.GetProperty("id").GetGuid(),
        accountCode = account.GetProperty("code").GetString(),
        accountName = "Lo que diga la pantalla",
        debit, credit, currency = "ARS", exchangeRate = 1m
    };

    private static object Entry(string date, params object[] lines) =>
        new { date, concept = "Asiento de prueba", entryType = "Standard", sourceModule = "Sales", createdBy = "otro@ejemplo.com", lines };

    [Fact]
    public async Task Manual_entries_are_validated_against_the_chart_and_numbered_once()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var accounts = (await Json(await client.GetAsync("/api/v1/accounting/accounts"))).EnumerateArray().ToList();
        var cash = accounts.Single(a => a.GetProperty("code").GetString() == "1.1.01.001");
        var bank = accounts.Single(a => a.GetProperty("code").GetString() == "1.1.01.002");
        var group = accounts.Single(a => a.GetProperty("code").GetString() == "1.1.01"); // de agrupación

        Assert.Contains("no imputable", await RejectedAsync(await client.PostAsJsonAsync("/api/v1/accounting/journal-entries",
            Entry("2026-10-02", Line(group, 100, 0), Line(cash, 0, 100)))));
        Assert.Contains("uno solo", await RejectedAsync(await client.PostAsJsonAsync("/api/v1/accounting/journal-entries",
            Entry("2026-10-02", Line(bank, 100, 100), Line(cash, 0, 100)))));
        Assert.Contains("desbalanceado", await RejectedAsync(await client.PostAsJsonAsync("/api/v1/accounting/journal-entries",
            Entry("2026-10-02", Line(bank, 100.01m, 0), Line(cash, 0, 100)))));
        await RejectedAsync(await client.PostAsJsonAsync("/api/v1/accounting/journal-entries",
            new { date = "2026-10-02", concept = "Cierre a mano", entryType = "Closing", lines = new[] { Line(bank, 1, 0), Line(cash, 0, 1) } }));

        var created = await Json(await client.PostAsJsonAsync("/api/v1/accounting/journal-entries",
            Entry("2026-10-02", Line(bank, 100, 0), Line(cash, 0, 100))));
        Assert.Equal("Manual", created.GetProperty("sourceModule").GetString()); // no se puede hacer pasar por Ventas
        Assert.Equal("IT Admin", created.GetProperty("createdBy").GetString()); // el usuario conectado
        Assert.Contains(created.GetProperty("lines").EnumerateArray(), l => l.GetProperty("accountName").GetString() == "Banco Galicia C/C");

        // Diez asientos a la vez: todos se graban, con números distintos y seguidos.
        var responses = await Task.WhenAll(Enumerable.Range(0, 10).Select(_ =>
            client.PostAsJsonAsync("/api/v1/accounting/journal-entries", Entry("2026-10-02", Line(bank, 10, 0), Line(cash, 0, 10)))));
        var numbers = new List<int> { created.GetProperty("entryNumber").GetInt32() };
        foreach (var r in responses) numbers.Add((await Json(r)).GetProperty("entryNumber").GetInt32());
        Assert.Equal(numbers.Count, numbers.Distinct().Count());
        Assert.Equal(Enumerable.Range(numbers.Min(), numbers.Count), numbers.Order());
    }

    [Fact]
    public async Task Locked_periods_and_unbalanced_payroll_are_refused_and_the_fake_vat_book_is_gone()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var accounts = (await Json(await client.GetAsync("/api/v1/accounting/accounts"))).EnumerateArray().ToList();
        var cash = accounts.Single(a => a.GetProperty("code").GetString() == "1.1.01.001");
        var bank = accounts.Single(a => a.GetProperty("code").GetString() == "1.1.01.002");

        await Json(await client.PostAsJsonAsync("/api/v1/accounting/periods/lock", new { year = 2026, month = 9, @lock = true }));
        Assert.Contains("cerrado", await RejectedAsync(await client.PostAsJsonAsync("/api/v1/accounting/journal-entries",
            Entry("2026-09-15", Line(bank, 50, 0), Line(cash, 0, 50)))));

        Assert.Contains("no cuadra", await RejectedAsync(await client.PostAsJsonAsync("/api/v1/accounting/auto-post/payroll", new
        {
            date = "2026-10-02", periodDescription = "09/2026", totalGrossSalaries = 1000m, totalEmployerContributions = 200m,
            totalNetSalaries = 800m, totalSocialSecurityToPay = 300m
        })));

        using (var sales = await client.GetAsync("/api/v1/accounting/reports/iva-digital-sales?year=2026&month=9"))
            Assert.Equal(HttpStatusCode.NotFound, sales.StatusCode);
        using (var purchases = await client.GetAsync("/api/v1/accounting/reports/iva-digital-purchases?year=2026&month=9"))
            Assert.Equal(HttpStatusCode.NotFound, purchases.StatusCode);
    }
}
