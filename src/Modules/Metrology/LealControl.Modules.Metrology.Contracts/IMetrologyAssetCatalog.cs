namespace LealControl.Modules.Metrology.Contracts;

public interface IMetrologyAssetCatalog
{
    Task<IReadOnlyList<MetrologyCatalogAsset>> ListCalibrationAssetsAsync(
        Guid tenantId,
        CancellationToken cancellationToken = default);
}

public sealed record MetrologyCatalogAsset(
    Guid Id,
    string Source, // StandardWeight | Instrument
    string Code,
    string Kind, // Weight | Thermometer | Other
    string Description,
    string BrandOrManufacturer,
    string Model,
    string SerialNumber,
    string CertificateNumber,
    string TraceabilityLab,
    DateTime? CalibrationDate,
    DateTime? ExpirationDate,
    string Status,
    string? Extra, // e.g. "1000 kg M1" or measurement range
    string? DeepLinkPath, // /metrologia/pesas/... or /metrologia/instrumentos/...
    string InternalCode = "" // EQ-0001 (PG14)
)
{
    /// <summary>Para los registros: "EQ-0001 (1051)", con el número interno y la identificación del equipo.</summary>
    public string Label => string.IsNullOrWhiteSpace(InternalCode) ? Code : string.IsNullOrWhiteSpace(Code) ? InternalCode : $"{InternalCode} ({Code})";
}
