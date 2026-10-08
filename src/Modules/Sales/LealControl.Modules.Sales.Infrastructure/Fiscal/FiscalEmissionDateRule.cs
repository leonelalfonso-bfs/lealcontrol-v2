using System.Globalization;
namespace LealControl.Modules.Sales.Infrastructure.Fiscal;
public static class FiscalEmissionDateRule
{
    // ARCA admite hasta 5 días antes o después para productos y 10 para servicios o mixtos.
    public static bool IsAllowed(string issueDate, int concept, DateTimeOffset nowUtc, int voucherType = 0)
    {
        // FCE: la factura entre N-5 y N+1; sus notas entre N-5 y N (validación 10016).
        if (voucherType is 201 or 206 or 202 or 203 or 207 or 208)
        {
            if (!DateTime.TryParseExact(issueDate, "yyyyMMdd", CultureInfo.InvariantCulture,
                DateTimeStyles.None, out var fceIssued)) return false;
            var fceToday = nowUtc.ToOffset(TimeSpan.FromHours(-3)).Date;
            var ahead = voucherType is 201 or 206 ? 1 : 0;
            return fceIssued.Date >= fceToday.AddDays(-5) && fceIssued.Date <= fceToday.AddDays(ahead);
        }
        if (!DateTime.TryParseExact(issueDate, "yyyyMMdd", CultureInfo.InvariantCulture,
            DateTimeStyles.None, out var issued)) return false;
        var today = nowUtc.ToOffset(TimeSpan.FromHours(-3)).Date;
        var window = concept == 1 ? 5 : 10;
        return issued.Date >= today.AddDays(-window) && issued.Date <= today.AddDays(window);
    }
}
