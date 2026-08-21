using System;
using System.Collections.Generic;
using System.Linq;

namespace LealControl.Modules.Metrology.Infrastructure;

public static class MetrologyRuleEngine
{
    /// <summary>
    /// Calcula el Error Máximo Tolerado (EMT) para una carga dada según la clase y el escalón de verificación e.
    /// Basado en OIML R 76-1 y Resolución 67/2025 (Ensayos de Verificación Inicial y Periódica).
    /// </summary>
    public static decimal CalculateEMT(decimal load, decimal e, string accuracyClass = "III", bool isInService = true)
    {
        if (e <= 0) return 0;
        var n = load / e; // Número de escalones de verificación
        var factor = isInService ? 2.0m : 1.0m; // En servicio el EMT es el doble que en verificación inicial

        decimal baseEmt;
        var accClass = accuracyClass.ToUpperInvariant();

        switch (accClass)
        {
            case "I":
                if (n <= 50000) baseEmt = 0.5m * e;
                else if (n <= 200000) baseEmt = 1.0m * e;
                else baseEmt = 1.5m * e;
                break;

            case "II":
                if (n <= 5000) baseEmt = 0.5m * e;
                else if (n <= 20000) baseEmt = 1.0m * e;
                else baseEmt = 1.5m * e;
                break;

            case "IIII":
                if (n <= 50) baseEmt = 0.5m * e;
                else if (n <= 200) baseEmt = 1.0m * e;
                else baseEmt = 1.5m * e;
                break;

            case "III":
            default:
                if (n <= 500) baseEmt = 0.5m * e;
                else if (n <= 2000) baseEmt = 1.0m * e;
                else baseEmt = 1.5m * e;
                break;
        }

        return baseEmt * factor;
    }

    /// <summary>
    /// Genera la matriz de puntos de ensayo de Linealidad/Pesaje recomendados.
    /// </summary>
    public static List<MetrologyTestPointDto> GenerateLinearityTestPoints(decimal minCapacity, decimal maxCapacity, decimal e, string accuracyClass = "III")
    {
        var points = new List<MetrologyTestPointDto>();
        if (maxCapacity <= 0 || e <= 0) return points;

        var accClass = accuracyClass.ToUpperInvariant();
        var candidateLoads = new SortedSet<decimal>();

        // 1. Capacidad Mínima
        candidateLoads.Add(minCapacity > 0 ? minCapacity : e * 20);

        // 2. Puntos de cambio de escalón EMT
        if (accClass == "III")
        {
            if (500 * e < maxCapacity) candidateLoads.Add(500 * e);
            if (1000 * e < maxCapacity) candidateLoads.Add(1000 * e);
            if (2000 * e < maxCapacity) candidateLoads.Add(2000 * e);
        }
        else if (accClass == "II")
        {
            if (5000 * e < maxCapacity) candidateLoads.Add(5000 * e);
            if (20000 * e < maxCapacity) candidateLoads.Add(20000 * e);
        }

        // 3. Cargas intermedias (25%, 50%, 75%) y Capacidad Máxima (100%)
        candidateLoads.Add(Math.Round(maxCapacity * 0.25m / e) * e);
        candidateLoads.Add(Math.Round(maxCapacity * 0.50m / e) * e);
        candidateLoads.Add(Math.Round(maxCapacity * 0.75m / e) * e);
        candidateLoads.Add(maxCapacity);

        int step = 1;
        foreach (var load in candidateLoads.Where(l => l > 0 && l <= maxCapacity))
        {
            var emt = CalculateEMT(load, e, accuracyClass, isInService: true);
            points.Add(new MetrologyTestPointDto(
                Step: step++,
                TargetLoad: load,
                Emt: emt,
                MinAllowed: load - emt,
                MaxAllowed: load + emt
            ));
        }

        return points;
    }

    /// <summary>
    /// Genera la configuración del ensayo de Excentricidad (Esquinas / Secciones de Celdas).
    /// </summary>
    public static EccentricityConfigDto GenerateEccentricityConfig(decimal maxCapacity, decimal e, int loadCellsCount = 6, string accuracyClass = "III")
    {
        // En instrumentos con N puntos de apoyo (celdas), la carga de excentricidad es Max / (N - 1).
        // En receptores con 4 apoyos o menos, es Max / 3.
        decimal testLoad;
        int positionsCount;

        if (loadCellsCount <= 4)
        {
            testLoad = Math.Round((maxCapacity / 3m) / e) * e;
            positionsCount = 4; // 4 esquinas
        }
        else
        {
            testLoad = Math.Round((maxCapacity / (loadCellsCount - 1m)) / e) * e;
            positionsCount = loadCellsCount; // 1 por cada celda/sección de balanza
        }

        if (testLoad <= 0) testLoad = maxCapacity * 0.3m;
        var emt = CalculateEMT(testLoad, e, accuracyClass, isInService: true);

        return new EccentricityConfigDto(
            TestLoad: testLoad,
            PositionsCount: positionsCount,
            Emt: emt,
            Description: loadCellsCount > 4
                ? $"Carga sobre cada uno de los {loadCellsCount} puntos de apoyo (secciones de celdas de carga)"
                : "Carga en las 4 esquinas del receptor de carga"
        );
    }

    /// <summary>
    /// Calcula el resumen de Repetibilidad (desviación estándar y error máximo de fidelidad).
    /// </summary>
    public static RepeatabilitySummaryDto CalculateRepeatability(List<decimal> indications, decimal testLoad, decimal e, string accuracyClass = "III")
    {
        if (indications == null || indications.Count < 2)
        {
            return new RepeatabilitySummaryDto(0, 0, 0, 0, true);
        }

        var avg = indications.Average();
        var max = indications.Max();
        var min = indications.Min();
        var range = max - min;

        // Desviación estándar muestral
        var sumSquares = indications.Sum(x => (x - avg) * (x - avg));
        var stdDev = (decimal)Math.Sqrt((double)(sumSquares / (indications.Count - 1)));

        var emt = CalculateEMT(testLoad, e, accuracyClass, isInService: true);
        var isConform = range <= emt;

        return new RepeatabilitySummaryDto(
            Average: Math.Round(avg, 4),
            RangeError: range,
            StandardDeviation: Math.Round(stdDev, 4),
            Emt: emt,
            IsConform: isConform
        );
    }

    /// <summary>
    /// Calcula la Incertidumbre Expandida de Calibración U (k=2, nivel de confianza 95.45%).
    /// </summary>
    public static decimal CalculateExpandedUncertainty(
        decimal standardWeightsUncertainty, // u(pesa)
        decimal scaleDivisionD,             // d
        decimal repeatabilityStdDev,        // s
        decimal eccentricityMaxError        // e_exc
    )
    {
        // 1. Incertidumbre de las pesas patrón u_pat = U_pat / 2
        var uPat = (double)(standardWeightsUncertainty / 2m);

        // 2. Incertidumbre por resolución del display u_res = d / (2 * sqrt(3))
        var uRes = (double)scaleDivisionD / (2.0 * Math.Sqrt(3.0));

        // 3. Incertidumbre por repetibilidad u_rep = s / sqrt(n) (suponiendo n=3)
        var uRep = (double)repeatabilityStdDev / Math.Sqrt(3.0);

        // 4. Incertidumbre por excentricidad u_exc = e_exc / (2 * sqrt(3))
        var uExc = (double)eccentricityMaxError / (2.0 * Math.Sqrt(3.0));

        // Incertidumbre combinada uc = sqrt(u_pat^2 + 2*u_res^2 + u_rep^2 + u_exc^2)
        var uc = Math.Sqrt((uPat * uPat) + (2.0 * uRes * uRes) + (uRep * uRep) + (uExc * uExc));

        // Incertidumbre expandida U = k * uc (con k = 2.0)
        var expandedU = (decimal)(2.0 * uc);

        return Math.Round(expandedU, 4);
    }
}

public sealed record MetrologyTestPointDto(int Step, decimal TargetLoad, decimal Emt, decimal MinAllowed, decimal MaxAllowed);
public sealed record EccentricityConfigDto(decimal TestLoad, int PositionsCount, decimal Emt, string Description);
public sealed record RepeatabilitySummaryDto(decimal Average, decimal RangeError, decimal StandardDeviation, decimal Emt, bool IsConform);
