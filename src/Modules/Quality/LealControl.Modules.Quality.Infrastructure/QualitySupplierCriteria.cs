using System.Text.Json;

namespace LealControl.Modules.Quality.Infrastructure;

public sealed record QualitySupplierCriterion(string Code, string Label, int Score, string Observation);

public static class QualitySupplierCriteria
{
    public static readonly IReadOnlyList<(string Code, string Label)> Required =
    [
        ("quality", "Calidad del producto/servicio"),
        ("timeliness", "Cumplimiento de plazos"),
        ("documentation", "Documentación"),
        ("support", "Atención y soporte técnico"),
        ("price", "Precio"),
        ("experience", "Experiencia del proveedor")
    ];

    public static bool TryNormalize(IReadOnlyList<QualitySupplierCriterion>? input,
        out List<QualitySupplierCriterion> criteria, out string error)
    {
        criteria = [];
        error = "Evaluá los seis criterios con un puntaje individual de 1 a 5.";
        if (input is null || input.Count != Required.Count)
            return false;
        var byCode = new Dictionary<string, QualitySupplierCriterion>(StringComparer.Ordinal);
        foreach (var item in input)
        {
            if (item is null || string.IsNullOrWhiteSpace(item.Code)
                || !byCode.TryAdd(item.Code, item)
                || item.Score is < 1 or > 5
                || (item.Observation?.Length ?? 0) > 1000)
                return false;
        }
        foreach (var (code, label) in Required)
        {
            if (!byCode.TryGetValue(code, out var item)) return false;
            criteria.Add(new QualitySupplierCriterion(code, label, item.Score, item.Observation?.Trim() ?? string.Empty));
        }
        error = string.Empty;
        return true;
    }

    public static List<QualitySupplierCriterion> Read(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];
        try
        {
            var parsed = JsonSerializer.Deserialize<List<QualitySupplierCriterion>>(json);
            return TryNormalize(parsed, out var result, out _) ? result : [];
        }
        catch (JsonException) { return []; }
    }

    public static string Serialize(IReadOnlyList<QualitySupplierCriterion> criteria) => JsonSerializer.Serialize(criteria);
    public static int Total(IReadOnlyList<QualitySupplierCriterion> criteria) => criteria.Sum(c => c.Score);
}
