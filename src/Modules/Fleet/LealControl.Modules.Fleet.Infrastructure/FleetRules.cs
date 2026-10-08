using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;

namespace LealControl.Modules.Fleet.Infrastructure;

public enum ExpirationState { Ok, DueSoon, Expired, Missing }

/// <summary>Reglas de Flota sin base de datos: validaciones, vencimientos y documentación obligatoria.</summary>
public static partial class FleetRules
{
    private static readonly TimeSpan ArgentinaOffset = TimeSpan.FromHours(-3);

    /// <summary>Día civil de Argentina (UTC-3, sin horario de verano).</summary>
    public static DateOnly TodayInArgentina(DateTimeOffset utcNow) => DateOnly.FromDateTime(utcNow.ToOffset(ArgentinaOffset).DateTime);

    /// <summary>Las fechas civiles se guardan a las 12:00 UTC: en cualquier huso siguen siendo el mismo día.</summary>
    public static DateTime ToStoredDate(DateOnly date) => new(date.Year, date.Month, date.Day, 12, 0, 0, DateTimeKind.Utc);

    /// <summary>Lee la fecha civil guardada (12:00 UTC; los datos viejos pueden estar a las 00:00 o 03:00 UTC).</summary>
    public static DateOnly FromStoredDate(DateTime stored) =>
        DateOnly.FromDateTime(stored.Kind == DateTimeKind.Local ? stored.ToUniversalTime() : stored);

    public static bool TryParseDate(string? value, out DateOnly date) =>
        DateOnly.TryParseExact(value?.Trim(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out date);

    public static string NormalizePlate(string? plate) => NonAlphanumeric().Replace((plate ?? "").ToUpperInvariant(), "");

    public static string? NormalizeCode(string? code)
    {
        var value = (code ?? "").Trim().ToUpperInvariant();
        return value.Length == 0 ? null : value;
    }

    /// <summary>Documentación que una unidad de ese tipo tiene que tener vigente.</summary>
    public static IReadOnlyList<FleetDocType> RequiredDocuments(VehicleType type) => type switch
    {
        VehicleType.Truck or VehicleType.TractorUnit => [FleetDocType.VtvRto, FleetDocType.InsurancePolicy, FleetDocType.Ruta],
        VehicleType.Pickup or VehicleType.Van or VehicleType.Car or VehicleType.SemiTrailer or VehicleType.Trailer =>
            [FleetDocType.VtvRto, FleetDocType.InsurancePolicy],
        VehicleType.Forklift => [FleetDocType.ForkliftCertification],
        _ => []
    };

    public static (ExpirationState State, int DaysRemaining) Evaluate(DateOnly expiration, int alertDaysBefore, DateOnly today)
    {
        var days = expiration.DayNumber - today.DayNumber;
        var state = days < 0 ? ExpirationState.Expired
            : days <= Math.Max(0, alertDaysBefore) ? ExpirationState.DueSoon
            : ExpirationState.Ok;
        return (state, days);
    }

    public static string? ValidateVehicle(VehicleType type, string plate, string? internalCode, string brand, string model, int? year, MeterType meter, int nowYear)
    {
        if (!Enum.IsDefined(type)) return "Tipo de unidad inválido.";
        if (!Enum.IsDefined(meter)) return "Forma de medición inválida.";
        if (plate.Length == 0 && internalCode is null)
            return "Cargá la patente o, si la unidad no tiene (por ejemplo un autoelevador), un código interno.";
        if (plate.Length is > 0 and (< 5 or > 10)) return "La patente tiene que tener entre 5 y 10 letras y números.";
        if (internalCode is { Length: > 30 }) return "El código interno admite hasta 30 caracteres.";
        if (string.IsNullOrWhiteSpace(brand)) return "La marca es obligatoria.";
        if (brand.Trim().Length > 80 || (model ?? "").Trim().Length > 80) return "Marca y modelo admiten hasta 80 caracteres.";
        if (year is { } y && (y < 1950 || y > nowYear + 1)) return $"El año tiene que estar entre 1950 y {nowYear + 1}.";
        return null;
    }

    /// <summary>
    /// Valida una lectura: tiene que corresponder a cómo se mide la unidad y no puede bajar,
    /// salvo una corrección explícita con motivo.
    /// </summary>
    public static string? ValidateReading(MeterType meter, int? km, decimal? hours, int currentKm, decimal currentHours, bool correction, string? note)
    {
        if (km is null && hours is null) return "Cargá los kilómetros o las horas.";
        if (km is not null && meter is MeterType.Hours or MeterType.None) return "Esta unidad no se mide por kilómetros.";
        if (hours is not null && meter is MeterType.Kilometers or MeterType.None) return "Esta unidad no se mide por horas.";
        if (km is < 0 or > 5_000_000) return "Kilómetros fuera de rango.";
        if (hours is < 0 or > 500_000) return "Horas fuera de rango.";
        if (correction)
            return string.IsNullOrWhiteSpace(note) ? "Una corrección necesita el motivo." : null;
        if (km is { } k && k < currentKm) return $"Los kilómetros no pueden bajar (la unidad tiene {currentKm:N0}). Si es un error de carga, marcá \"corrección\" y explicá el motivo.";
        if (hours is { } h && h < currentHours) return $"Las horas no pueden bajar (la unidad tiene {currentHours:N1}). Si es un error de carga, marcá \"corrección\" y explicá el motivo.";
        return null;
    }

    [GeneratedRegex("[^A-Z0-9]")]
    private static partial Regex NonAlphanumeric();
}
