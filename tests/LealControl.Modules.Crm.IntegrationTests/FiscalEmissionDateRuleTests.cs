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
        Assert.Equal(expected, FiscalEmissionDateRule.IsAllowed(date, now));
    }
    [Fact]
    public void Civil_date_changes_at_argentine_midnight_instead_of_utc_midnight()
    {
        Assert.True(FiscalEmissionDateRule.IsAllowed("20260922",
            new DateTimeOffset(2026, 10, 3, 2, 59, 0, TimeSpan.Zero)));
        Assert.False(FiscalEmissionDateRule.IsAllowed("20260922",
            new DateTimeOffset(2026, 10, 3, 3, 0, 0, TimeSpan.Zero)));
    }
}
