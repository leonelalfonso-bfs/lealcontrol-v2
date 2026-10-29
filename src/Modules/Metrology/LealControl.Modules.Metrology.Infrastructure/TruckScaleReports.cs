namespace LealControl.Modules.Metrology.Infrastructure;

/// <summary>Datos de campo de un informe de calibración de báscula camionera (modelo del paquete "Informes BFS").</summary>
public sealed record TruckScaleData
{
    /// <summary>"2307" (Res. 2307/80) o "25/2025" (Res. SIC 25/2025).</summary>
    public string Standard { get; init; } = "2307";
    public TruckScaleInstrument Instrument { get; init; } = new();
    public List<TruckScaleWeightSet> Weights { get; init; } = [];
    public TruckScaleSubstitution? Substitution { get; init; }
    public List<TruckScaleInspectionItem> Inspection { get; init; } = [];
    public List<TruckScaleLoadStep> Weighing { get; init; } = [];
    public TruckScaleRepeatability? Repeatability { get; init; }
    public TruckScaleEccentricity? Eccentricity { get; init; }
    public TruckScaleZero? Zero { get; init; }
    public List<TruckScaleMobility> Mobility { get; init; } = [];
    public List<string> Observations { get; init; } = [];
}

public sealed record TruckScaleInstrument
{
    public decimal Max { get; init; }
    /// <summary>División de verificación.</summary>
    public decimal E { get; init; }
    /// <summary>División real; con Res. 2307/80 define la capacidad mínima.</summary>
    public decimal? D { get; init; }
    public string AccuracyClass { get; init; } = "III";
    public string Unit { get; init; } = "kg";
    /// <summary>"digital" o "analogica": con Res. 25/2025 la movilidad no aplica a la indicación digital (8.3.3).</summary>
    public string Indication { get; init; } = "digital";
    public int Supports { get; init; }
    public int Modules { get; init; }
}

/// <summary>Juego de pesas patrón: masa nominal × cantidad, con su certificado y vencimiento.</summary>
public sealed record TruckScaleWeightSet(decimal Mass, int Quantity, string Identification, string Certificate, DateTime? Expiration, Guid? StandardWeightId = null);
public sealed record TruckScaleSubstitution(string Description, decimal Value);
/// <summary>Estado: OK, No OK o N/A.</summary>
public sealed record TruckScaleInspectionItem(string Point, string Status, string? Observation);
/// <summary>Escalón del ensayo de pesaje: carga = pesas + sustitución; lectura descendente opcional.</summary>
public sealed record TruckScaleLoadStep(decimal Load, decimal Weights, decimal Substitution, decimal Ascending, decimal? Descending);
public sealed record TruckScaleRepeatability(decimal Load, List<decimal> Readings);
/// <summary>Método "apoyos" (pesas sobre cada apoyo) o "rodante" (vehículo por tercios, ida y vuelta).</summary>
public sealed record TruckScaleEccentricity(string Method, decimal Load, List<TruckScalePosition> Positions, List<string>? Rows);
public sealed record TruckScalePosition(string Position, decimal Reading);
/// <summary>Puesta a cero con 4 % de Máx. (debe) y con 4 % + 1 e (no debe); error E0 en divisiones e (Res. 25/2025).</summary>
public sealed record TruckScaleZero(bool? At4Percent, bool? At4PercentPlusE, decimal? ZeroErrorE);
/// <summary>Lectura con la carga y tras agregar 1,4 e.</summary>
public sealed record TruckScaleMobility(decimal Load, decimal Reading, decimal ReadingAfter);

/// <summary>Resultado de un requisito: Satisface, NoSatisface, NoEnsayado o NoAplica.</summary>
public enum TruckScaleVerdict { Satisface, NoSatisface, NoEnsayado, NoAplica }

public sealed record TruckScaleRequirement(string Paragraph, string Name, string Key, TruckScaleVerdict Verdict);
public sealed record TruckScalePositionResult(string Position, decimal Reading, decimal Error, bool Pass);
public sealed record TruckScaleStepResult(decimal Load, decimal Weights, decimal Substitution, decimal Ascending, decimal AscendingError, decimal? Descending, decimal? DescendingError, decimal Mpe, bool Pass);

public sealed record TruckScaleEvaluation(
    string Standard, string StandardShort, string StandardName,
    decimal MinCapacity, string MinCapacityRule, decimal[] MpeBands,
    List<TruckScaleRequirement> Requirements, List<TruckScaleStepResult> Weighing,
    decimal? RepeatabilitySpread, decimal? RepeatabilityMpe,
    decimal? EccentricityMpe, List<TruckScalePositionResult> Eccentricity,
    bool UsesSubstitution, decimal MaxWeightsApplied, decimal WeightsFraction, decimal RequiredWeightsFraction, decimal MaxLoad, decimal RangeFraction,
    decimal TotalStandardsMass, bool Conforming, List<string> NotTested, List<string> Observations, List<string> Warnings);

/// <summary>
/// Cálculo del informe de báscula camionera, portado de camionera.js (paquete "Informes BFS", 29/10/2026): E.M.T. en servicio,
/// capacidad mínima, requisitos por norma, sustitución (Res. 25/2025 3.7.3), excentricidad por apoyos o por tercios y conclusión.
/// Los resultados se calculan siempre: el informe no puede contradecir sus datos.
/// </summary>
public static class TruckScaleEvaluator
{
    private const decimal Tolerance = 0.000000001m;

    private static readonly Dictionary<string, (string Short, string Name, (string Paragraph, string Name, string Key)[] Requirements)> Standards = new()
    {
        ["2307"] = ("Res. 2307/80",
            "Res. ex S.E.C. y N.E.I. N° 2307/80 – Reglamentación Metrológica y Técnica para instrumentos de pesar de funcionamiento no automático",
            [("9", "Desvío de resultados (ensayo de pesaje)", "pesaje"), ("13.4.2.1", "Excentricidad", "exc"), ("14.1.2", "Fidelidad", "rep"),
             ("14.2.2.1.2", "Movilidad", "mov"), ("A.3.2.2", "Efecto máximo de puesta a cero", "cero")]),
        ["25/2025"] = ("Res. 25/2025",
            "Res. SIC N° 25/2025 – Reglamento Técnico y Metrológico de instrumentos de pesar de funcionamiento no automático (base OIML R76)",
            [("3.5.1 / 3.5.2", "Errores de indicación (EMT en servicio)", "pesaje"), ("3.6.1", "Repetibilidad / fidelidad", "rep"),
             ("3.6.2", "Excentricidad de carga", "exc"), ("4.5.1", "Rango de puesta a cero (≤ 4 % de Máx.)", "cero"),
             ("4.5.2", "Exactitud de puesta a cero (≤ 0,25 e)", "ceroExact"), ("3.8", "Movilidad", "mov"),
             ("3.7.3", "Proporción de pesas patrón en la sustitución", "sust")])
    };

    /// <summary>Tramos en divisiones e hasta los que el E.M.T. en servicio es 1 e y 2 e (más allá, 3 e).</summary>
    public static decimal[] Bands(string accuracyClass) => accuracyClass == "IIII" ? [50m, 200m] : [500m, 2000m];

    /// <summary>E.M.T. en servicio: el doble del de verificación primitiva (igual en ambas normas).</summary>
    public static decimal Mpe(decimal load, decimal e, string accuracyClass)
    {
        var bands = Bands(accuracyClass);
        var n = load / e;
        return n <= bands[0] ? e : n <= bands[1] ? 2 * e : 3 * e;
    }

    /// <summary>Capacidad mínima: Res. 25/2025 Tabla 3 (III: 20 e; IIII: 10 e); Res. 2307/80 7.3 según d.</summary>
    public static (decimal Value, string Rule) MinCapacity(string standard, TruckScaleInstrument i)
    {
        if (standard == "25/2025") return i.AccuracyClass == "IIII" ? (10 * i.E, "10 e") : (20 * i.E, "20 e");
        var d = i.D is > 0 ? i.D.Value : i.E;
        var grams = i.Unit == "g" ? d : i.Unit == "t" ? d * 1_000_000 : d * 1000;
        if (grams <= 1) return (10 * d, "10 d");
        if (grams <= 20) return (20 * d, "20 d");
        var fifty = 50 * d;
        var thousandKg = i.Unit == "t" ? 1m : i.Unit == "g" ? 1_000_000m : 1000m;
        return fifty > thousandKg ? (Math.Max(thousandKg, 10 * d), "Res. 2307/80, nota (3)") : (fifty, "50 d");
    }

    private static bool Within(decimal error, decimal limit) => Math.Abs(error) <= limit + Tolerance;
    private static TruckScaleVerdict V(bool? pass) => pass is null ? TruckScaleVerdict.NoEnsayado : pass.Value ? TruckScaleVerdict.Satisface : TruckScaleVerdict.NoSatisface;

    public static TruckScaleEvaluation Evaluate(TruckScaleData data, DateTime testDate)
    {
        var standard = data.Standard == "25/2025" ? "25/2025" : "2307";
        var (shortName, name, requirements) = Standards[standard];
        var i = data.Instrument;
        var e = i.E;
        decimal Limit(decimal load) => Mpe(load, e, i.AccuracyClass);
        var (minCapacity, minRule) = MinCapacity(standard, i);

        var verdicts = new Dictionary<string, TruckScaleVerdict>();
        var steps = data.Weighing.Select(p =>
        {
            var lim = Limit(p.Load);
            var ea = p.Ascending - p.Load;
            decimal? ed = p.Descending is { } d ? d - p.Load : null;
            return new TruckScaleStepResult(p.Load, p.Weights, p.Substitution, p.Ascending, ea, p.Descending, ed, lim, Within(ea, lim) && (ed is null || Within(ed.Value, lim)));
        }).ToList();
        verdicts["pesaje"] = V(steps.Count == 0 ? null : steps.All(s => s.Pass));

        var rep = data.Repeatability;
        decimal? spread = rep?.Readings.Count > 0 ? rep.Readings.Max() - rep.Readings.Min() : null;
        decimal? repMpe = rep is null ? null : Limit(rep.Load);
        verdicts["rep"] = V(spread is null ? null : spread <= repMpe + Tolerance && rep!.Readings.All(l => Within(l - rep.Load, repMpe!.Value)));

        var x = data.Eccentricity;
        decimal? excMpe = x is null ? null : Limit(x.Load);
        var ecc = x?.Positions.Select(p => new TruckScalePositionResult(p.Position, p.Reading, p.Reading - x.Load, Within(p.Reading - x.Load, excMpe!.Value))).ToList() ?? [];
        verdicts["exc"] = V(ecc.Count == 0 ? null : ecc.All(p => p.Pass));

        var zero = data.Zero;
        verdicts["cero"] = V(zero?.At4Percent is null ? null : zero.At4Percent.Value && zero.At4PercentPlusE != true);
        verdicts["ceroExact"] = V(zero?.ZeroErrorE is null ? null : Math.Abs(zero.ZeroErrorE.Value) <= 0.25m + Tolerance);
        verdicts["mov"] = standard == "25/2025" && i.Indication == "digital" ? TruckScaleVerdict.NoAplica
            : V(data.Mobility.Count == 0 ? null : data.Mobility.All(m => m.ReadingAfter - m.Reading >= e - Tolerance));

        // Sustitución (3.7.3): pesas ≥ 50 % de Máx.; ≥ 1/3 si la repetibilidad es ≤ 0,3 e; ≥ 1/5 si es ≤ 0,2 e.
        var maxWeights = data.Weighing.Count > 0 ? data.Weighing.Max(p => p.Weights) : 0;
        var weightsFraction = i.Max > 0 ? maxWeights / i.Max : 0;
        decimal? repE = spread is null || e == 0 ? null : spread / e;
        var usesSubstitution = data.Weighing.Any(p => p.Substitution > 0);
        var requiredFraction = repE is null ? 0.5m : repE <= 0.2m ? 0.2m : repE <= 0.3m ? 1m / 3 : 0.5m;
        verdicts["sust"] = !usesSubstitution ? TruckScaleVerdict.NoAplica : V(weightsFraction + Tolerance >= requiredFraction);
        var maxLoad = data.Weighing.Count > 0 ? data.Weighing.Max(p => p.Load) : 0;
        var rangeFraction = i.Max > 0 ? maxLoad / i.Max : 0;

        var results = requirements.Select(r => new TruckScaleRequirement(r.Paragraph, r.Name, r.Key, verdicts[r.Key])).ToList();
        var applicable = results.Where(r => r.Verdict != TruckScaleVerdict.NoAplica).ToList();
        var conforming = applicable.All(r => r.Verdict != TruckScaleVerdict.NoSatisface) && applicable.Any(r => r.Verdict == TruckScaleVerdict.Satisface);
        var notTested = results.Where(r => r.Verdict == TruckScaleVerdict.NoEnsayado).Select(r => $"{r.Name} ({r.Paragraph})").ToList();

        var u = i.Unit;
        var observations = new List<string>(data.Observations.Where(o => !string.IsNullOrWhiteSpace(o)));
        if (notTested.Count > 0) observations.Add($"Ensayos no registrados en esta calibración: {string.Join("; ", notTested)}.");
        var rolling = x?.Method == "rodante";
        if (standard == "25/2025" && ecc.Count > 0 && !rolling)
            observations.Add("En básculas para vehículos la Res. 25/2025 prevé la excentricidad con carga rodante, aplicada por tercios del receptor en ambos sentidos (3.6.2.4 y A.4.7.4).");
        if (rolling && x!.Load > 0.8m * i.Max + Tolerance) observations.Add($"La carga de excentricidad supera 0,8 Máx. ({N(0.8m * i.Max)} {u}).");
        if (usesSubstitution && standard == "25/2025" && rangeFraction < 0.999m)
            observations.Add($"El ensayo de pesaje cubrió hasta {N(maxLoad)} {u} ({P(rangeFraction)} de Máx.). La Res. 25/2025 (A.4.4.5) prevé continuar la sustitución hasta Máx.");

        // Avisos para quien carga: patrones vencidos o insuficientes y lecturas fuera de toda lógica.
        var warnings = new List<string>();
        foreach (var w in data.Weights.Where(w => w.Expiration is { } exp && exp.Date < testDate.Date))
            warnings.Add($"El patrón {w.Identification} (cert. {w.Certificate}) venció el {w.Expiration:dd/MM/yyyy}, antes del ensayo.");
        var totalStandards = data.Weights.Sum(w => w.Mass * Math.Max(1, w.Quantity));
        if (maxWeights > totalStandards + Tolerance)
            warnings.Add($"Se aplicaron {N(maxWeights)} {u} de pesas pero los patrones declarados suman {N(totalStandards)} {u}.");
        foreach (var s in data.Weighing.Where(s => s.Load != s.Weights + s.Substitution))
            warnings.Add($"Escalón de {N(s.Load)} {u}: pesas ({N(s.Weights)}) + sustitución ({N(s.Substitution)}) no suman la carga.");
        void Implausible(string label, decimal load, decimal reading)
        {
            if (Math.Abs(reading - load) > 10 * Limit(load)) warnings.Add($"{label}: lectura {N(reading)} {u} muy lejos de la carga {N(load)} {u}; revisá el dato.");
        }
        foreach (var s in data.Weighing) { Implausible("Pesaje", s.Load, s.Ascending); if (s.Descending is { } d) Implausible("Pesaje (desc.)", s.Load, d); }
        if (rep is not null) foreach (var r in rep.Readings) Implausible("Repetibilidad", rep.Load, r);
        if (x is not null) foreach (var p in x.Positions) Implausible($"Excentricidad {p.Position}", x.Load, p.Reading);
        if (standard == "25/2025" && data.Weighing.Count is > 0 and < 5)
            warnings.Add("La Res. 25/2025 (8.3.3) pide al menos cinco valores de carga en el ensayo de pesaje.");
        if (rep is not null && rep.Readings.Count is > 0 and < 3)
            warnings.Add("La repetibilidad necesita al menos tres pesadas.");

        return new TruckScaleEvaluation(standard, shortName, name, minCapacity, minRule, Bands(i.AccuracyClass), results, steps,
            spread, repMpe, excMpe, ecc, usesSubstitution, maxWeights, weightsFraction, requiredFraction, maxLoad, rangeFraction,
            totalStandards, conforming, notTested, observations, warnings);
    }

    private static string N(decimal v) => v.ToString("#,##0.##", System.Globalization.CultureInfo.GetCultureInfo("es-AR"));
    private static string P(decimal v) => $"{(v * 100).ToString("0.0", System.Globalization.CultureInfo.GetCultureInfo("es-AR"))} %";
}
