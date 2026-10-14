using LealControl.BuildingBlocks.Time;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;

namespace LealControl.Modules.Fleet.Infrastructure;

public enum ExpirationState { Ok, DueSoon, Expired, Missing }

/// <summary>Próximo service de un ítem del plan (lo que no aplica queda en null).</summary>
public sealed record PlanDue(int? NextKm, int? KmLeft, decimal? NextHours, decimal? HoursLeft, DateOnly? NextDate, int? DaysLeft, ExpirationState State);

/// <summary>Reglas de Flota sin base de datos: validaciones, vencimientos y documentación obligatoria.</summary>
public static partial class FleetRules
{
    public static readonly CultureInfo Ar = CultureInfo.GetCultureInfo("es-AR");

    /// <summary>Día civil de Argentina (UTC-3, sin horario de verano).</summary>
    public static DateOnly TodayInArgentina(DateTimeOffset utcNow) => ArgentinaTime.Today(utcNow);

    /// <summary>Las fechas civiles se guardan a las 12:00 UTC: en cualquier huso siguen siendo el mismo día.</summary>
    public static DateTime ToStoredDate(DateOnly date) => new(date.Year, date.Month, date.Day, 12, 0, 0, DateTimeKind.Utc);

    /// <summary>Lee la fecha civil guardada (12:00 UTC; los datos viejos pueden estar a las 00:00 o 03:00 UTC).</summary>
    public static DateOnly FromStoredDate(DateTime stored) =>
        DateOnly.FromDateTime(stored.Kind == DateTimeKind.Local ? stored.ToUniversalTime() : stored);

    public static bool TryParseDate(string? value, out DateOnly date) =>
        DateOnly.TryParseExact(value?.Trim(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out date);

    /// <summary>Credenciales que una persona tiene que tener vigentes según sus roles.</summary>
    public static IReadOnlyList<CredentialType> RequiredCredentials(FleetMember member)
    {
        var list = new List<CredentialType>();
        if (member.IsDriver || member.IsCargoDriver) list.Add(CredentialType.DrivingLicense);
        if (member.IsCargoDriver) list.Add(CredentialType.Linti);
        if (member.IsForkliftOperator) list.Add(CredentialType.ForkliftOperator);
        return list;
    }

    public static string CredentialLabel(CredentialType type) => type switch
    {
        CredentialType.DrivingLicense => "Licencia de conducir",
        CredentialType.Linti => "LINTI",
        CredentialType.ForkliftOperator => "Carnet de autoelevadorista",
        CredentialType.MedicalFitness => "Apto médico",
        _ => "Otra"
    };

    public static string DocumentLabel(FleetDocType type) => type switch
    {
        FleetDocType.VtvRto => "VTV / RTO",
        FleetDocType.InsurancePolicy => "Seguro",
        FleetDocType.Ruta => "RUTA",
        FleetDocType.FireExtinguisher => "Matafuego",
        FleetDocType.ForkliftCertification => "Habilitación autoelevador",
        FleetDocType.GreenCard => "Cédula",
        FleetDocType.GncCard => "Oblea GNC",
        FleetDocType.Senasa => "SENASA",
        _ => "Otro"
    };

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

    public static bool UsesKm(MeterType meter) => meter is MeterType.Kilometers or MeterType.Both;
    public static bool UsesHours(MeterType meter) => meter is MeterType.Hours or MeterType.Both;

    public static string? ValidatePlan(MeterType meter, string? title, int? intervalKm, decimal? intervalHours, int? intervalDays,
        int alertKm, decimal alertHours, int alertDays)
    {
        if (string.IsNullOrWhiteSpace(title)) return "Poné qué se hace (por ejemplo \"Cambio de aceite y filtros\").";
        if (title.Trim().Length > 160) return "La descripción admite hasta 160 caracteres.";
        if (intervalKm is null && intervalHours is null && intervalDays is null) return "Indicá cada cuántos km, horas o días se hace.";
        if (intervalKm is not null && !UsesKm(meter)) return "Esta unidad no se mide por kilómetros.";
        if (intervalHours is not null && !UsesHours(meter)) return "Esta unidad no se mide por horas.";
        if (intervalKm is <= 0 or > 1_000_000) return "El intervalo en km tiene que ser mayor a cero.";
        if (intervalHours is <= 0 or > 100_000) return "El intervalo en horas tiene que ser mayor a cero.";
        if (intervalDays is <= 0 or > 3650) return "El intervalo en días va de 1 a 3650.";
        if (alertKm < 0 || alertHours < 0 || alertDays < 0) return "Los márgenes de aviso no pueden ser negativos.";
        return null;
    }

    /// <summary>
    /// Próximo service de un ítem del plan, desde el último hecho. Vence por lo que llegue primero
    /// (km, horas o fecha); "por vencer" cuando falta menos que el margen de aviso.
    /// </summary>
    public static PlanDue EvaluatePlan(MaintenancePlan plan, Vehicle vehicle, DateOnly lastDate, int? lastKm, decimal? lastHours, DateOnly today)
    {
        int? nextKm = null, kmLeft = null, daysLeft = null;
        decimal? nextHours = null, hoursLeft = null;
        DateOnly? nextDate = null;
        if (plan.IntervalKm is { } ik && UsesKm(vehicle.MeterType))
        {
            nextKm = (lastKm ?? 0) + ik;
            kmLeft = nextKm - vehicle.CurrentKilometers;
        }
        if (plan.IntervalHours is { } ih && UsesHours(vehicle.MeterType))
        {
            nextHours = (lastHours ?? 0) + ih;
            hoursLeft = nextHours - vehicle.CurrentEngineHours;
        }
        if (plan.IntervalDays is { } id)
        {
            nextDate = lastDate.AddDays(id);
            daysLeft = nextDate.Value.DayNumber - today.DayNumber;
        }
        var state = kmLeft < 0 || hoursLeft < 0 || daysLeft < 0 ? ExpirationState.Expired
            : kmLeft <= plan.AlertKm || hoursLeft <= plan.AlertHours || daysLeft <= plan.AlertDays ? ExpirationState.DueSoon
            : ExpirationState.Ok;
        return new PlanDue(nextKm, kmLeft, nextHours, hoursLeft, nextDate, daysLeft, state);
    }

    /// <summary>Texto corto de lo que falta: "faltan 800 km", "pasado por 120 km · vencido hace 3 días".</summary>
    public static string DueText(PlanDue due)
    {
        var parts = new List<string>();
        if (due.KmLeft is { } k) parts.Add(k < 0 ? $"pasado por {(-k).ToString("N0", Ar)} km" : $"faltan {k.ToString("N0", Ar)} km");
        if (due.HoursLeft is { } h) parts.Add(h < 0 ? $"pasado por {(-h).ToString("N0", Ar)} h" : $"faltan {h.ToString("N0", Ar)} h");
        if (due.DaysLeft is { } d) parts.Add(d < 0 ? $"vencido hace {-d} días" : d == 0 ? "vence hoy" : $"faltan {d} días");
        return string.Join(" · ", parts);
    }

    [GeneratedRegex("[^A-Z0-9]")]
    private static partial Regex NonAlphanumeric();
}
