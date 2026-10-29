using LealControl.Modules.Metrology.Infrastructure;
using Xunit;

namespace LealControl.Modules.Quality.Tests;

/// <summary>
/// Cálculo del informe de báscula camionera con los números del ejemplo del paquete "Informes BFS" (servicio 2601, 80 t,
/// e = 20 kg, 8 apoyos, carga de sustitución de 21.320 kg), contra lo que muestran los informes de ejemplo de ambas normas.
/// </summary>
public sealed class TruckScaleEvaluatorTests
{
    private static readonly DateTime TestDate = new(2026, 7, 21);

    private static TruckScaleData Example(string standard, TruckScaleEccentricity eccentricity) => new()
    {
        Standard = standard,
        Instrument = new TruckScaleInstrument { Max = 80000, E = 20, D = 20, AccuracyClass = "III", Unit = "kg", Indication = "digital", Supports = 8, Modules = 4 },
        Weights =
        [
            new(1000, 16, "Juego A", "CERT-1", new DateTime(2026, 9, 2)), new(1000, 6, "Juego B", "CERT-1", new DateTime(2026, 9, 2)),
            new(10, 3, "Juego C", "CERT-2", new DateTime(2026, 9, 2)), new(20, 1, "Pesa D", "CERT-2", new DateTime(2026, 9, 2))
        ],
        Substitution = new("Camión cargado", 21320),
        Weighing =
        [
            new(1000, 1000, 0, 1000, 1000), new(2000, 2000, 0, 2000, 2000), new(6000, 6000, 0, 6000, 6000), new(10000, 10000, 0, 10000, 10000),
            new(14000, 14000, 0, 14000, 14000), new(16000, 16000, 0, 16000, 16000), new(20000, 20000, 0, 20000, 20000), new(22000, 22000, 0, 22000, null),
            new(31320, 10000, 21320, 31320, 31320), new(43320, 22000, 21320, 43320, null)
        ],
        Repeatability = new(21320, [21320, 21320, 21320]),
        Eccentricity = eccentricity,
        Zero = new(true, false, null)
    };

    private static readonly TruckScaleEccentricity BySupport = new("apoyos", 10000, Enumerable.Range(1, 8).Select(i => new TruckScalePosition($"Apoyo {i}", 10000)).ToList(), null);
    private static readonly TruckScaleEccentricity Rolling = new("rodante", 21320,
        [new("Ida – inicio", 21320), new("Ida – centro", 21320), new("Ida – final", 21340), new("Vuelta – inicio", 21320), new("Vuelta – centro", 21300), new("Vuelta – final", 21320)],
        ["Ida  →", "Vuelta  ←"]);

    [Fact]
    public void Res_2307_example_satisfies_with_mobility_not_tested()
    {
        var r = TruckScaleEvaluator.Evaluate(Example("2307", BySupport), TestDate);
        Assert.Equal((1000m, "50 d"), (r.MinCapacity, r.MinCapacityRule));
        Assert.Equal(["Satisface", "Satisface", "Satisface", "NoEnsayado", "Satisface"], r.Requirements.Select(q => q.Verdict.ToString()));
        Assert.True(r.Conforming);
        Assert.Contains("Movilidad (14.2.2.1.2)", r.NotTested);
        Assert.Equal(20m, r.EccentricityMpe);
        Assert.Empty(r.Warnings);
    }

    [Fact]
    public void Res_25_2025_example_matches_the_published_report()
    {
        var r = TruckScaleEvaluator.Evaluate(Example("25/2025", Rolling), TestDate);
        Assert.Equal((400m, "20 e"), (r.MinCapacity, r.MinCapacityRule));
        Assert.Equal(["Satisface", "Satisface", "Satisface", "Satisface", "NoEnsayado", "NoAplica", "Satisface"], r.Requirements.Select(q => q.Verdict.ToString()));
        Assert.True(r.Conforming);
        // E.M.T. por tramo: hasta 500 e ± 20; hasta 2000 e ± 40; 43.320 kg (2.166 e) ± 60.
        Assert.Equal([20m, 20m, 20m, 20m, 40m, 40m, 40m, 40m, 40m, 60m], r.Weighing.Select(s => s.Mpe));
        Assert.Equal(40m, r.EccentricityMpe);
        Assert.Equal(20m, r.Eccentricity[2].Error);
        // Sustitución: repetibilidad 0 e → alcanza con 1/5 de Máx.; se aplicaron 22.000 kg (27,5 %).
        Assert.Equal((0.2m, 0.275m), (r.RequiredWeightsFraction, r.WeightsFraction));
        Assert.Equal(22050m, r.TotalStandardsMass);
        Assert.Contains(r.Observations, o => o.Contains("A.4.4.5"));
    }

    [Fact]
    public void Out_of_tolerance_readings_fail_and_bad_data_warns()
    {
        var data = Example("2307", BySupport) with
        {
            Weights = [new(1000, 10, "Juego A", "CERT-1", new DateTime(2026, 7, 1))],
            Weighing = [new(10000, 10000, 0, 10060, null), new(20000, 15000, 0, 20000, null)],
            Repeatability = new(21320, [21320, 17400]),
            Zero = new(true, true, null)
        };
        var r = TruckScaleEvaluator.Evaluate(data, TestDate);
        Assert.False(r.Conforming);
        Assert.Equal(TruckScaleVerdict.NoSatisface, r.Requirements.Single(q => q.Key == "pesaje").Verdict);
        Assert.Equal(TruckScaleVerdict.NoSatisface, r.Requirements.Single(q => q.Key == "rep").Verdict);
        Assert.Equal(TruckScaleVerdict.NoSatisface, r.Requirements.Single(q => q.Key == "cero").Verdict);
        Assert.Contains(r.Warnings, w => w.Contains("venció el 01/07/2026"));
        Assert.Contains(r.Warnings, w => w.Contains("patrones declarados suman 10.000"));
        Assert.Contains(r.Warnings, w => w.Contains("no suman la carga"));
        Assert.Contains(r.Warnings, w => w.Contains("17.400"));
    }

    [Fact]
    public void Nothing_measured_is_not_conforming()
    {
        var r = TruckScaleEvaluator.Evaluate(new TruckScaleData { Standard = "25/2025", Instrument = new TruckScaleInstrument { Max = 60000, E = 20 } }, TestDate);
        Assert.False(r.Conforming);
        Assert.All(r.Requirements.Where(q => q.Key is not ("mov" or "sust")), q => Assert.Equal(TruckScaleVerdict.NoEnsayado, q.Verdict));
    }
}
