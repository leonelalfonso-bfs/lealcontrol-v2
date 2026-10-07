using System.Globalization;
namespace LealControl.Modules.Sales.Infrastructure.Fiscal;
public static class FiscalEmissionDateRule
{
    // ARCA admite hasta 5 días antes o después para productos y 10 para servicios o mixtos.
    public static bool IsAllowed(string issueDate, int concept, DateTimeOffset nowUtc)
    {
        if (!DateTime.TryParseExact(issueDate, "yyyyMMdd", CultureInfo.InvariantCulture,
            DateTimeStyles.None, out var issued)) return false;
        var today = nowUtc.ToOffset(TimeSpan.FromHours(-3)).Date;
        var window = concept == 1 ? 5 : 10;
        return issued.Date >= today.AddDays(-window) && issued.Date <= today.AddDays(window);
    }
}
