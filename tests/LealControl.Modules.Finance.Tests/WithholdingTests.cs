using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using FluentAssertions;
using LealControl.Modules.Finance.Infrastructure;
using Xunit;

namespace LealControl.Modules.Finance.Tests;

/// <summary>Retención de Ganancias RG 830 (nota 69, F2), calculada a mano; régimen 078 con mínimo $ 224.000 y 2 %.</summary>
public sealed class WithholdingTests : IClassFixture<FinanceWebApplicationFactory>
{
    private readonly FinanceWebApplicationFactory _factory;
    public WithholdingTests(FinanceWebApplicationFactory factory) => _factory = factory;

    private static readonly WithholdingRegime Goods = new() { Code = "078", Name = "Bienes", NonTaxableAmount = 224000m, RateRegistered = 2m, RateUnregistered = 10m, MinimumWithholding = 240m };
    private static readonly WithholdingRegime Services = new() { Code = "094", Name = "Servicios", NonTaxableAmount = 67170m, RateRegistered = 2m, RateUnregistered = 28m, MinimumWithholding = 240m };
    private static SupplierWithholdingProfile Profile(string condition, DateTime? excludedUntil = null) => new() { Condition = condition, ExcludedUntil = excludedUntil };
    private static readonly DateTime Day = new(2026, 10, 20, 0, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void Registered_supplier_accumulates_the_month_and_respects_the_minimum()
    {
        WithholdingCalculator.Calculate(Goods, Profile("Inscripto"), Day, 150000m, 0m, 0m).Amount.Should().Be(0m);          // no supera el mínimo
        WithholdingCalculator.Calculate(Goods, Profile("Inscripto"), Day, 200000m, 150000m, 0m).Amount.Should().Be(2520m);  // (350.000 − 224.000) × 2 %
        WithholdingCalculator.Calculate(Goods, Profile("Inscripto"), Day, 10000m, 350000m, 2520m).Amount.Should().Be(0m);   // 2.720 − 2.520 = 200 < 240
        WithholdingCalculator.Calculate(Goods, Profile("Inscripto"), Day, 10000m, 360000m, 2520m).Amount.Should().Be(400m); // 2.920 − 2.520
    }

    [Fact]
    public void Unregistered_monotributo_and_excluded_suppliers()
    {
        WithholdingCalculator.Calculate(Services, Profile("NoInscripto"), Day, 1000m, 0m, 0m).Amount.Should().Be(280m);     // 28 %, sin mínimo no sujeto
        WithholdingCalculator.Calculate(Services, Profile("NoInscripto"), Day, 500m, 0m, 0m).Amount.Should().Be(0m);        // 140 < 240
        WithholdingCalculator.Calculate(Goods, Profile("Monotributo"), Day, 900000m, 0m, 0m).Amount.Should().Be(0m);
        WithholdingCalculator.Calculate(Goods, Profile("Inscripto", Day.AddDays(10)), Day, 900000m, 0m, 0m).Amount.Should().Be(0m);
        WithholdingCalculator.Calculate(Goods, Profile("Inscripto", Day.AddDays(-1)), Day, 900000m, 0m, 0m).Amount.Should().Be(13520m);
    }

    [Fact]
    public async Task Payment_orders_withhold_issue_a_certificate_and_export_to_sicore()
    {
        var client = _factory.CreateAuthenticatedClient(FinanceWebApplicationFactory.DemoTenantId);
        var supplierId = Guid.NewGuid();
        (await client.PutAsJsonAsync("/api/v1/finance/withholdings/settings", new { isAgent = true, agentSince = "2026-10-01" })).IsSuccessStatusCode.Should().BeTrue();
        (await client.PutAsJsonAsync($"/api/v1/finance/withholdings/suppliers/{supplierId}", new { condition = "Inscripto", regimeCode = "078" })).IsSuccessStatusCode.Should().BeTrue();

        object Order(decimal amount, decimal retention) => new
        {
            supplierId, supplierName = "Proveedor Retención", supplierTaxId = "30-71234567-1", paymentDateUtc = "2026-10-20T00:00:00Z", currency = "ARS", amount,
            lines = retention > 0
                ? new object[] { new { method = "Retention", amount = retention, currency = "ARS", retentionType = "GAN" }, new { method = "Cash", amount = amount - retention, currency = "ARS" } }
                : new object[] { new { method = "Cash", amount, currency = "ARS" } }
        };

        // 150.000: no supera el mínimo; queda acumulado.
        (await client.PostAsJsonAsync("/api/v1/finance/payments", Order(150000m, 0m))).StatusCode.Should().Be(HttpStatusCode.Created);
        var preview = await (await client.PostAsJsonAsync("/api/v1/finance/withholdings/preview", new { supplierId, date = "2026-10-20T00:00:00Z", amount = 200000m })).Content.ReadFromJsonAsync<JsonElement>();
        preview.GetProperty("amount").GetDecimal().Should().Be(2520m);
        // Sin el renglón de retención no se guarda.
        var missing = await client.PostAsJsonAsync("/api/v1/finance/payments", Order(200000m, 0m));
        missing.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await missing.Content.ReadAsStringAsync()).Should().Contain("2.520,00");
        (await client.PostAsJsonAsync("/api/v1/finance/payments", Order(200000m, 2520m))).StatusCode.Should().Be(HttpStatusCode.Created);

        var list = (await client.GetFromJsonAsync<JsonElement>("/api/v1/finance/withholdings?from=2026-10-01&to=2026-10-31")).EnumerateArray()
            .Where(w => w.GetProperty("supplierId").GetGuid() == supplierId).ToList();
        list.Should().HaveCount(2);
        var withheld = list.Single(w => w.GetProperty("amount").GetDecimal() > 0);
        withheld.GetProperty("certificateNumber").GetString().Should().StartWith("RG-");
        withheld.GetProperty("priorBase").GetDecimal().Should().Be(150000m);

        var file = Encoding.Latin1.GetString(await (await client.GetAsync("/api/v1/finance/withholdings/sicore?from=2026-10-01&to=2026-10-31")).Content.ReadAsByteArrayAsync());
        var line = file.Split("\r\n", StringSplitOptions.RemoveEmptyEntries).Single(l => l.Contains("30712345671"));
        line.Length.Should().Be(144);
        line[..2].Should().Be("06");
        line.Substring(2, 10).Should().Be("20/10/2026");
        line.Substring(44, 3).Should().Be("217");
        line.Substring(47, 3).Should().Be("078");
        line.Substring(50, 1).Should().Be("1");
        line.Substring(51, 14).Should().Be("     350000,00");
        line.Substring(75, 2).Should().Be("01");
        line.Substring(78, 14).Should().Be("       2520,00");
        line.Substring(108, 2).Should().Be("80");
        line.Substring(110, 11).Should().Be("30712345671");
    }
}
