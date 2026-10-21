using System.Text.RegularExpressions;

namespace LealControl.Modules.Metrology.Contracts;

/// <summary>
/// Número interno de equipo de PG14 (EQ-0001): una sola numeración para pesas patrón, termómetros y equipos auxiliares.
/// El número de serie o de identificación de cada equipo se sigue mostrando al lado.
/// </summary>
public static partial class EquipmentNumbers
{
    [GeneratedRegex(@"^EQ[\s-]?0*(\d{1,6})$", RegexOptions.IgnoreCase)]
    private static partial Regex Pattern();

    public static string Format(int number) => $"EQ-{number:D4}";

    /// <summary>"EQ-0012", "EQ 012", "eq12" → 12; cualquier otra cosa → null.</summary>
    public static int? Parse(string? code) =>
        code is not null && Pattern().Match(code.Trim()) is { Success: true } m ? int.Parse(m.Groups[1].Value) : null;

    /// <summary>Normaliza a EQ-0000 o devuelve null si no tiene el formato.</summary>
    public static string? Normalize(string? code) => Parse(code) is { } n ? Format(n) : null;
}

/// <summary>Numeración compartida entre los módulos de Metrología y Calidad (misma base de la empresa).</summary>
public interface IEquipmentNumbering
{
    Task<string> NextAsync(Guid tenantId, CancellationToken ct = default);
    /// <summary>True si otro equipo (de cualquier tipo) ya usa ese número.</summary>
    Task<bool> IsTakenAsync(Guid tenantId, string code, Guid? exceptId, CancellationToken ct = default);
}
