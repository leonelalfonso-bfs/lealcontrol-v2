using System.Globalization;

namespace LealControl.Modules.Sales.Infrastructure.Fiscal;

/// <summary>
/// Fecha a consultar en FEParamGetCotizacion: la de emisión si es anterior a hoy (Argentina);
/// para hoy o fechas futuras ARCA usa la cotización vigente, que se pide sin fecha.
/// </summary>
public static class FiscalExchangeRateDate
{
    public static string? For(string issueDate, DateTimeOffset nowUtc)
    {
        var today = nowUtc.ToOffset(TimeSpan.FromHours(-3)).ToString("yyyyMMdd", CultureInfo.InvariantCulture);
        return string.CompareOrdinal(issueDate, today) < 0 ? issueDate : null;
    }
}
