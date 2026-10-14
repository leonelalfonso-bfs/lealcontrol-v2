namespace LealControl.BuildingBlocks.Time;

/// <summary>
/// La hora y el día civil de Argentina (UTC-3 todo el año, sin horario de verano). El día UTC
/// no sirve para fechas de negocio: desde las 21 h de Argentina ya es el día siguiente.
/// </summary>
public static class ArgentinaTime
{
    public static readonly TimeSpan Offset = TimeSpan.FromHours(-3);

    /// <summary>La hora de Argentina para un instante.</summary>
    public static DateTimeOffset Now(DateTimeOffset utcNow) => utcNow.ToOffset(Offset);

    /// <summary>El día civil de Argentina.</summary>
    public static DateOnly Today(DateTimeOffset utcNow) => DateOnly.FromDateTime(Now(utcNow).DateTime);

    /// <summary>
    /// El día civil de Argentina como fecha a las 00:00 UTC, para comparar con fechas guardadas
    /// ("no puede ser futura", "está vencida", "desde hoy").
    /// </summary>
    public static DateTime TodayAsUtcDate(DateTimeOffset utcNow)
    {
        var today = Today(utcNow);
        return new DateTime(today.Year, today.Month, today.Day, 0, 0, 0, DateTimeKind.Utc);
    }
}
