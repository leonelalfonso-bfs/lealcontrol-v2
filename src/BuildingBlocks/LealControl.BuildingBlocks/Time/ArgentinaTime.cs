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

    /// <summary>
    /// El instante tal que lo ocurrido antes lleva al menos <paramref name="businessHours"/> horas hábiles: las de
    /// lunes a viernes, día completo, en hora argentina. 24 horas hábiles = un día hábil.
    /// </summary>
    public static DateTime BusinessCutoff(DateTime nowUtc, int businessHours)
    {
        var cursor = DateTime.SpecifyKind(nowUtc, DateTimeKind.Utc) + Offset;
        var remaining = TimeSpan.FromHours(businessHours);
        while (true)
        {
            // El día al que pertenece el cursor: una medianoche es el final del día anterior.
            var day = (cursor.TimeOfDay == TimeSpan.Zero ? cursor.AddDays(-1) : cursor).Date;
            if (day.DayOfWeek is not (DayOfWeek.Saturday or DayOfWeek.Sunday))
            {
                var available = cursor - day;
                if (remaining <= available)
                    return DateTime.SpecifyKind(cursor - remaining - Offset, DateTimeKind.Utc);
                remaining -= available;
            }
            cursor = day;
        }
    }
}
