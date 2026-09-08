using System.Text.Json;
using LealControl.Modules.Quality.Contracts;

namespace LealControl.Modules.Metrology.Infrastructure;

/// <summary>Resuelve códigos SGC (PG/IT/externos) para un informe de ensayo.</summary>
public static class MetrologySgcLinkage
{
    public static string ResolveInstructionCode(MetrologyEquipment equipment)
    {
        var platform = (equipment.PlatformType ?? string.Empty).Trim();
        if (platform.Equals("Hopper", StringComparison.OrdinalIgnoreCase)
            || platform.Equals("Tolva", StringComparison.OrdinalIgnoreCase))
        {
            return "IT04";
        }

        if (platform.Equals("Counter", StringComparison.OrdinalIgnoreCase)
            || platform.Equals("Retail", StringComparison.OrdinalIgnoreCase))
        {
            return "IT03";
        }

        if (platform.Equals("TruckScale", StringComparison.OrdinalIgnoreCase)
            || platform.Equals("Camionera", StringComparison.OrdinalIgnoreCase))
        {
            return "IT01";
        }

        // Heurística por capacidad (kg)
        var max = equipment.MaxCapacity;
        if (max >= 30000m) return "IT01";
        if (max >= 3000m) return "IT02";
        return "IT03";
    }

    public static IReadOnlyList<string> ProcedureCodesFor(string instructionCode)
        => new[] { "PG12", instructionCode, "PG09" };

    public static IReadOnlyList<string> ExternalCodesFor(string standardApplied)
    {
        var is2307 = standardApplied.Contains("2307", StringComparison.OrdinalIgnoreCase);
        return is2307
            ? new[] { "EXT-RES2307", "EXT-OIMLR76", "EXT-RES25" }
            : new[] { "EXT-RES25", "EXT-OIMLR76" };
    }

    public static string SerializeSnapshots(IEnumerable<QualityDocumentSnapshot> snapshots)
        => JsonSerializer.Serialize(snapshots.Select(s => new
        {
            code = s.Code,
            displayCode = s.DisplayCode,
            title = s.Title,
            version = s.Version,
            versionId = s.VersionId,
            effectiveFromUtc = s.EffectiveFromUtc
        }));

    public static string SerializeCodes(IEnumerable<string> codes)
        => JsonSerializer.Serialize(codes.Distinct(StringComparer.OrdinalIgnoreCase).ToArray());
}
