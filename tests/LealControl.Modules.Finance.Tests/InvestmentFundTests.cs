using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using FluentAssertions;
using LealControl.Modules.Finance.Infrastructure;
using Xunit;

namespace LealControl.Modules.Finance.Tests;

/// <summary>Fondos comunes de inversión (nota 69, F5) con un listado inventado en el formato de FIMA de Galicia.</summary>
public sealed class InvestmentFundTests : IClassFixture<FinanceWebApplicationFactory>
{
    private readonly FinanceWebApplicationFactory _factory;
    public InvestmentFundTests(FinanceWebApplicationFactory factory) => _factory = factory;

    private static byte[] Sample() => File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "TestData", "fima-ejemplo.xlsx"));

    [Fact]
    public void Galicia_fund_list_is_parsed()
    {
        var rows = InvestmentFunds.ParseGalicia(Sample())!;
        rows.Should().HaveCount(3);
        var sub = rows.Single(r => r.ExternalId == "900000003");
        (sub.FundName, sub.Currency, sub.Kind, sub.Amount, sub.Units, sub.UnitValue, sub.Status).Should().Be(("Fima Premium - Clase A", "ARS", "Subscription", 1000000m, 10000m, 100m, "Settled"));
        sub.SettlementDate.Should().Be(new DateTime(2026, 10, 21, 0, 0, 0, DateTimeKind.Utc));
        var usd = rows.Single(r => r.ExternalId == "900000001");
        (usd.Currency, usd.Kind, usd.Amount, usd.UnitValue, usd.Status).Should().Be(("USD", "Redemption", 5000m, (decimal?)null, "Pending"));
    }

    [Fact]
    public async Task Import_values_the_holding_and_checks_the_bank()
    {
        var tenantId = FinanceWebApplicationFactory.DemoTenantId; // base propia de esta clase de pruebas
        var client = _factory.CreateAuthenticatedClient(tenantId);
        var accountId = Guid.NewGuid();
        await _factory.WithDbAsync(async db =>
        {
            db.Accounts.Add(new FinancialAccount { Id = accountId, TenantId = tenantId, Name = "Galicia CC", Currency = "ARS", Type = FinancialAccountType.Bank, IsActive = true, CreatedAtUtc = DateTime.UtcNow });
            await db.SaveChangesAsync();
        });
        var body = new { fileBase64 = Convert.ToBase64String(Sample()), fileName = "movimientos.xlsx" };
        var response = await client.PostAsJsonAsync("/api/v1/finance/funds/import", body);
        response.IsSuccessStatusCode.Should().BeTrue(await response.Content.ReadAsStringAsync());
        var first = await response.Content.ReadFromJsonAsync<JsonElement>();
        first.GetProperty("created").GetInt32().Should().Be(3);
        (await (await client.PostAsJsonAsync("/api/v1/finance/funds/import", body)).Content.ReadFromJsonAsync<JsonElement>()).GetProperty("unchanged").GetInt32().Should().Be(3);

        // Solo el rescate figura en el extracto; la suscripción del 21 todavía no.
        var csv = "\"Fecha\";\"Descripción\";\"Origen\";\"Débitos\";\"Créditos\";\"Grupo de Conceptos\";\"Concepto\";\"Número de Terminal\";\"Observaciones Cliente\";\"Número de Comprobante\";\"Leyendas Adicionales1\";\"Leyendas Adicionales2\";\"Leyendas Adicionales3\";\"Leyendas Adicionales4\";\"Tipo de Movimiento\";\"Saldo\"\n"
            + "\"20/10/2026\";\"Rescate Fima\";\"\";\"0\";\"495000,00\";\"\";\"\";\"\";\"\";\"1\";\"FIMA PREMIUM CLASE A\";\"Nro Operacion: 900000002\";\"\";\"\";\"Imputado\";\"495000,00\";\n";
        (await client.PostAsJsonAsync("/api/v1/finance/imports/bank/confirm", new { accountId, fileBase64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(csv)), fileName = "Extracto_CC.csv" }))
            .IsSuccessStatusCode.Should().BeTrue();

        var funds = (await client.GetFromJsonAsync<JsonElement>("/api/v1/finance/funds")).EnumerateArray().ToList();
        funds.Should().HaveCount(2);
        var fima = funds.Single(f => f.GetProperty("currency").GetString() == "ARS");
        (await client.PutAsJsonAsync($"/api/v1/finance/funds/{fima.GetProperty("id").GetGuid()}", new
        {
            accountId, openingUnits = 20000m, openingDate = "2026-10-19T00:00:00Z", openingCost = 1900000m, lastUnitValue = 100m, lastUnitValueDate = "2026-10-21T00:00:00Z"
        })).IsSuccessStatusCode.Should().BeTrue();

        fima = (await client.GetFromJsonAsync<JsonElement>("/api/v1/finance/funds")).EnumerateArray().Single(f => f.GetProperty("currency").GetString() == "ARS");
        fima.GetProperty("units").GetDecimal().Should().Be(25000m);            // 20.000 + 10.000 − 5.000
        fima.GetProperty("valuation").GetDecimal().Should().Be(2500000m);      // × $ 100
        fima.GetProperty("contributed").GetDecimal().Should().Be(2405000m);    // 1.900.000 + 1.000.000 − 495.000
        fima.GetProperty("result").GetDecimal().Should().Be(95000m);
        var ops = fima.GetProperty("operations").EnumerateArray().ToDictionary(o => o.GetProperty("externalId").GetString()!, o => o.GetProperty("inBank"));
        ops["900000002"].GetBoolean().Should().BeTrue();
        ops["900000003"].GetBoolean().Should().BeFalse();
    }
}
