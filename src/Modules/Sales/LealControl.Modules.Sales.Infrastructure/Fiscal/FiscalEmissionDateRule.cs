using System.Globalization;
namespace LealControl.Modules.Sales.Infrastructure.Fiscal;
public static class FiscalEmissionDateRule
{
    public static bool IsAllowed(string issueDate, DateTimeOffset nowUtc)
    {
        if (!DateTime.TryParseExact(issueDate, "yyyyMMdd", CultureInfo.InvariantCulture,
            DateTimeStyles.None, out var issued)) return false;
        var today = nowUtc.ToOffset(TimeSpan.FromHours(-3)).Date;
        return issued.Date >= today.AddDays(-10) && issued.Date <= today.AddDays(10);
    }
}
