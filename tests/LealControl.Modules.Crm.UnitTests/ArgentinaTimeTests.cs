using LealControl.BuildingBlocks.Time;
using Xunit;

namespace LealControl.Modules.Crm.UnitTests;

/// <summary>El día de negocio es el de Argentina (UTC-3): a las 22 h todavía es hoy, aunque en UTC ya sea mañana.</summary>
public sealed class ArgentinaTimeTests
{
    [Theory]
    [InlineData("2026-10-14T01:00:00Z", "2026-10-13")] // 22:00 en Argentina
    [InlineData("2026-10-14T02:59:59Z", "2026-10-13")] // 23:59:59
    [InlineData("2026-10-14T03:00:00Z", "2026-10-14")] // medianoche
    [InlineData("2026-10-14T15:00:00Z", "2026-10-14")]
    public void Today_is_the_civil_day_in_Argentina(string utc, string expected)
    {
        var now = DateTimeOffset.Parse(utc, System.Globalization.CultureInfo.InvariantCulture);
        Assert.Equal(DateOnly.Parse(expected), ArgentinaTime.Today(now));
        var asUtc = ArgentinaTime.TodayAsUtcDate(now);
        Assert.Equal(DateTimeKind.Utc, asUtc.Kind);
        Assert.Equal(DateOnly.Parse(expected), DateOnly.FromDateTime(asUtc));
    }
}
