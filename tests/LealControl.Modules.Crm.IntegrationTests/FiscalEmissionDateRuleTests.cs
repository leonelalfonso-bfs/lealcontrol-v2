using LealControl.Modules.Sales.Infrastructure.Fiscal;
using Xunit;
namespace LealControl.Modules.Crm.IntegrationTests;
public sealed class FiscalEmissionDateRuleTests
{
    [Theory]
    [InlineData("20260922", true)]
    [InlineData("20261012", true)]
    [InlineData("20260921", false)]
    [InlineData("20261013", false)]
    [InlineData("20261002", true)]
    [InlineData("20260230", false)]
    [InlineData("", false)]
    public void Service_emission_window_includes_exact_ten_day_boundaries(string date, bool expected)
    {
        var now = new DateTimeOffset(2026, 10, 2, 15, 0, 0, TimeSpan.Zero);
        Assert.Equal(expected, FiscalEmissionDateRule.IsAllowed(date, 2, now));
    }
    [Fact]
    public void Civil_date_changes_at_argentine_midnight_instead_of_utc_midnight()
    {
        Assert.True(FiscalEmissionDateRule.IsAllowed("20260922", 2,
            new DateTimeOffset(2026, 10, 3, 2, 59, 0, TimeSpan.Zero)));
        Assert.False(FiscalEmissionDateRule.IsAllowed("20260922", 2,
            new DateTimeOffset(2026, 10, 3, 3, 0, 0, TimeSpan.Zero)));
    }
    [Theory]
    [InlineData("20260927", true)]
    [InlineData("20261007", true)]
    [InlineData("20260926", false)]
    [InlineData("20261008", false)]
    public void Product_emission_window_is_five_days(string date, bool expected)
    {
        var now = new DateTimeOffset(2026, 10, 2, 15, 0, 0, TimeSpan.Zero);
        Assert.Equal(expected, FiscalEmissionDateRule.IsAllowed(date, 1, now));
    }

    [Theory]
    [InlineData(201, "20261003", true)]
    [InlineData(201, "20261002", false)]
    [InlineData(201, "20261009", true)]
    [InlineData(201, "20261010", false)]
    [InlineData(203, "20261008", true)]
    [InlineData(203, "20261009", false)]
    [InlineData(202, "20261003", true)]
    public void Fce_window_is_five_days_back_and_no_future_for_notes(int type, string date, bool expected)
    {
        // 8/10 a las 20 h de Argentina (23 h UTC).
        var now = new DateTimeOffset(2026, 10, 8, 23, 0, 0, TimeSpan.Zero);
        Assert.Equal(expected, FiscalEmissionDateRule.IsAllowed(date, 1, now, type));
    }
}
