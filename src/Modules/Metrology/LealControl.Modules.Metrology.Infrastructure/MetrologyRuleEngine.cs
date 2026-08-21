using System;
using System.Collections.Generic;
using System.Linq;

namespace LealControl.Modules.Metrology.Infrastructure;

public static class MetrologyRuleEngine
{
    /// <summary>
    /// Calcula el Error Máximo Tolerado (EMT / emp) para una carga dada según la clase, el escalón e, y la resolución aplicable.
    /// Res. 2307/80 (EMT) vs Res. 25/2025 (emp OIML R 76-1).
    /// </summary>
    public static decimal CalculateEMT(decimal load, decimal e, string accuracyClass = "III", bool isInService = true, string standard = "Res25_2025")
    {
        if (e <= 0) return 0;
        var n = load / e; // Número de escalones de verificación
        var factor = isInService ? 2.0m : 1.0m; // En servicio el EMT/emp es el doble que en verificación inicial/primitiva

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
    public static List<MetrologyTestPointDto> GenerateLinearityTestPoints(
        decimal minCapacity, 
        decimal maxCapacity, 
        decimal e, 
        string accuracyClass = "III",
        bool isInService = true,
        string standard = "Res25_2025")
    {
        var points = new List<MetrologyTestPointDto>();
        if (maxCapacity <= 0 || e <= 0) return points;

        var term = standard == "Res2307_80" ? "EMT" : "emp";
        var norm = standard == "Res2307_80" ? "Res. 2307/80" : "Res. 25/2025";

        // Punto 1: Carga Mínima (Min)
        if (minCapacity > 0)
        {
            points.Add(new MetrologyTestPointDto(
                minCapacity,
                CalculateEMT(minCapacity, e, accuracyClass, isInService, standard),
                $"{norm} - Capacidad Mínima ({term} = ±{CalculateEMT(minCapacity, e, accuracyClass, isInService, standard)} kg)"
            ));
        }

        // Punto 2: Primer cambio de escalón (500e para Clase III)
        var p500e = 500m * e;
        if (p500e < maxCapacity && p500e > minCapacity)
        {
            points.Add(new MetrologyTestPointDto(
                p500e,
                CalculateEMT(p500e, e, accuracyClass, isInService, standard),
                $"{norm} - Límite 500e ({term} = ±{CalculateEMT(p500e, e, accuracyClass, isInService, standard)} kg)"
            ));
        }

        // Punto 3: Segundo cambio de escalón (2000e para Clase III)
        var p2000e = 2000m * e;
        if (p2000e < maxCapacity && p2000e > p500e)
        {
            points.Add(new MetrologyTestPointDto(
                p2000e,
                CalculateEMT(p2000e, e, accuracyClass, isInService, standard),
                $"{norm} - Límite 2000e ({term} = ±{CalculateEMT(p2000e, e, accuracyClass, isInService, standard)} kg)"
            ));
        }

        // Punto 4: 50% de Capacidad Máxima
        var p50Max = Math.Round(maxCapacity * 0.5m, 2);
        if (!points.Any(p => Math.Abs(p.NominalLoad - p50Max) < e))
        {
            points.Add(new MetrologyTestPointDto(
                p50Max,
                CalculateEMT(p50Max, e, accuracyClass, isInService, standard),
                $"{norm} - 50% Capacidad Máxima ({term} = ±{CalculateEMT(p50Max, e, accuracyClass, isInService, standard)} kg)"
            ));
        }

        // Punto 5: Capacidad Máxima (100% Max)
        points.Add(new MetrologyTestPointDto(
            maxCapacity,
            CalculateEMT(maxCapacity, e, accuracyClass, isInService, standard),
            $"{norm} - Capacidad Máxima ({term} = ±{CalculateEMT(maxCapacity, e, accuracyClass, isInService, standard)} kg)"
        ));

        return points.OrderBy(p => p.NominalLoad).ToList();
    }

    /// <summary>
    /// Configura el ensayo de Excentricidad según número de apoyos/celdas, tipo de plataforma y normativa aplicable.
    /// Res. 2307/80 vs Res. 25/2025 (OIML R 76-1).
    /// </summary>
    public static EccentricityConfigDto GenerateEccentricityConfig(
        decimal maxCapacity, 
        int loadCellsCount = 6, 
        decimal tare = 0,
        string standard = "Res25_2025",
        string platformType = "TruckScale")
    {
        decimal testLoad;
        string ruleApplied;
        var n = loadCellsCount > 0 ? loadCellsCount : 6;
        var totalCap = maxCapacity + tare;

        if (standard == "Res2307_80")
        {
            if (platformType == "Hopper")
            {
                testLoad = Math.Round(totalCap / 10m, 2);
                ruleApplied = "Res. 2307/80 Art. 13.4.1 (Tolva/Tanque: 1/10 de (Max + T))";
            }
            else if (platformType == "TruckScale" || platformType == "RollingLoad")
            {
                testLoad = Math.Round(totalCap / (decimal)n, 2);
                ruleApplied = $"Res. 2307/80 Art. 13.4.2.1 (Carga rodante sobre apoyos: 1/{n} de (Max + T))";
            }
            else if (n <= 4)
            {
                testLoad = Math.Round(totalCap / 3m, 2);
                ruleApplied = "Res. 2307/80 Art. 13.3 / 13.4.3 (Plataforma fija: 1/3 de (Max + T))";
            }
            else
            {
                testLoad = Math.Round(totalCap / (decimal)n, 2);
                ruleApplied = $"Res. 2307/80 Art. 13.4.2.1 (1/{n} de (Max + T))";
            }
        }
        else // Res. 25/2025 & OIML R 76-1
        {
            if (platformType == "Hopper")
            {
                testLoad = Math.Round(totalCap / 10m, 2);
                ruleApplied = "Res. 25/2025 OIML R 76-1 3.6.2.3 (Tolva/Tanque: 1/10 de (Max + T+))";
            }
            else if (n > 4)
            {
                testLoad = Math.Round(totalCap / (decimal)(n - 1), 2);
                ruleApplied = $"Res. 25/2025 OIML R 76-1 3.6.2.2 (n > 4 apoyos: 1/({n}-1) = 1/{n-1} de (Max + T+))";
            }
            else
            {
                testLoad = Math.Round(totalCap / 3m, 2);
                ruleApplied = "Res. 25/2025 OIML R 76-1 3.6.2.1 (n ≤ 4 apoyos: 1/3 de (Max + T+))";
            }
        }

        var positions = new List<string>();
        if (platformType == "TruckScale" || n > 4)
        {
            for (int i = 1; i <= n; i++)
            {
                positions.Add($"Apoyo / Celda {i} (Punto {i})");
            }
        }
        else
        {
            positions.Add("Posición 1 (Centro / Cuadrante Frontal Izq)");
            positions.Add("Posición 2 (Cuadrante Frontal Der)");
            positions.Add("Posición 3 (Cuadrante Posterior Der)");
            positions.Add("Posición 4 (Cuadrante Posterior Izq)");
        }

        return new EccentricityConfigDto(testLoad, n, positions, ruleApplied);
    }
}
