using System;
using System.Collections.Generic;

namespace LealControl.Modules.Metrology.Infrastructure;

/// <summary>
/// Catálogo operativo de perfiles reglamentarios. No sustituye la revisión
/// técnica ni la habilitación requerida para ejecutar una operación legal.
/// </summary>
public sealed record MetrologyRegulatoryProfile(
    string Code,
    string DisplayName,
    string RegulatoryStatus,
    string Notice,
    string StandardReference,
    int? DefaultValidityMonths,
    IReadOnlyDictionary<string, string> Operations);

public sealed record MetrologyTestPlanItem(string Code, string Title, string Purpose, bool Required);

public static class MetrologyRegulatoryProfiles
{
    public const string Transitional2307 = "REGIMEN_TRANSITORIO_R2307_80";
    public const string Ipna25 = "IPNA_R25_2025";

    private static readonly IReadOnlyDictionary<string, string> CommonOperations =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["Calibration"] = "Calibración / determinación de errores",
            ["PostRepair"] = "Ensayo posterior a reparación",
            ["PeriodicVerification"] = "Verificación periódica",
            ["InitialVerification"] = "Verificación primitiva"
        };

    public static readonly MetrologyRegulatoryProfile Legacy2307 = new(
        Transitional2307,
        "Régimen transitorio — Res. SCyNEI Nº 2307/1980",
        "Derogada — aplicación transitoria",
        "La Res. 2307/80 fue derogada por la Res. 25/2025. Este expediente debe utilizarse únicamente cuando el instrumento y la operación estén comprendidos en el régimen transitorio aplicable.",
        "Resolución SCyNEI Nº 2307/1980 (régimen transitorio)",
        null,
        CommonOperations);

    public static readonly MetrologyRegulatoryProfile Current25 = new(
        Ipna25,
        "Instrumentos no automáticos — Res. SIyC Nº 25/2025",
        "Vigente",
        "La verificación periódica prevista para este perfil se programa a VEINTICUATRO (24) meses. La emisión del documento no reemplaza la habilitación que exija la autoridad competente.",
        "Resolución SIyC Nº 25/2025 — Instrumentos de pesar de funcionamiento no automático",
        24,
        CommonOperations);

    public static MetrologyRegulatoryProfile Resolve(string? profileCode, string? legacyStandard = null)
    {
        if (string.Equals(profileCode, Transitional2307, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(profileCode, "Res2307_80", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(legacyStandard, "Res2307_80", StringComparison.OrdinalIgnoreCase))
        {
            return Legacy2307;
        }

        return Current25;
    }

    public static string ResolveOperationLabel(MetrologyRegulatoryProfile profile, string? operationType)
    {
        var key = string.IsNullOrWhiteSpace(operationType) ? "Calibration" : operationType.Trim();
        return profile.Operations.TryGetValue(key, out var label) ? label : profile.Operations["Calibration"];
    }

    public static IReadOnlyList<MetrologyTestPlanItem> GetTestPlan(MetrologyRegulatoryProfile profile, string? operationType)
    {
        var plan = new List<MetrologyTestPlanItem>
        {
            new("IDENTIFICATION", "Identificación e inscripciones", "Contrastar identificación, características metrológicas y datos del instrumento con el expediente disponible.", true),
            new("VISUAL", "Inspección general", "Registrar estado mecánico, instalación, dispositivo indicador y condiciones que puedan afectar el ensayo.", true),
            new("ZERO_TARE", "Puesta a cero y tara", "Verificar el funcionamiento de los dispositivos disponibles en el instrumento.", true),
            new("REPEATABILITY", profile.Code == Transitional2307 ? "Ensayo de fidelidad" : "Ensayo de repetibilidad", "Registrar series de indicaciones bajo cargas definidas por el procedimiento aplicable.", true),
            new("ECCENTRICITY", "Ensayo de excentricidad", "Registrar indicaciones en las posiciones de carga que correspondan a la configuración del receptor.", true),
            new("ERRORS", "Errores de indicación", "Registrar cargas crecientes y decrecientes y evaluar con el criterio técnico aplicable.", true),
            new("SEALS", "Precintos y cierre", "Documentar estado, intervención o colocación de precintos cuando corresponda.", true)
        };
        if (string.Equals(operationType, "PostRepair", StringComparison.OrdinalIgnoreCase))
            plan.Insert(2, new("REPAIR", "Intervención posterior a reparación", "Describir la reparación efectuada y los elementos intervenidos antes del ensayo.", true));
        if (string.Equals(operationType, "PeriodicVerification", StringComparison.OrdinalIgnoreCase) || string.Equals(operationType, "InitialVerification", StringComparison.OrdinalIgnoreCase))
            plan.Add(new("AUTHORIZATION", "Control de habilitación", "Confirmar que la operación y el documento se emiten dentro del alcance habilitado por la autoridad competente.", true));
        return plan;
    }
}
