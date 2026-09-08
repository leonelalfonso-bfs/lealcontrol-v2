using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Metrology.Contracts;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Metrology.Infrastructure;

public sealed class MetrologyAssetCatalog : IMetrologyAssetCatalog
{
    private readonly MetrologyDbContext _db;

    public MetrologyAssetCatalog(MetrologyDbContext db) => _db = db;

    public async Task<IReadOnlyList<MetrologyCatalogAsset>> ListCalibrationAssetsAsync(
        Guid tenantId,
        CancellationToken cancellationToken = default)
    {
        await _db.EnsureMetrologyTablesAsync(cancellationToken);

        var tenant = new TenantId(tenantId);

        var weights = await _db.StandardWeights.AsNoTracking()
            .Where(w => w.TenantId == tenant)
            .OrderBy(w => w.Code)
            .ToListAsync(cancellationToken);

        var instruments = await _db.Instruments.AsNoTracking()
            .Where(i => i.TenantId == tenant)
            .OrderBy(i => i.Code)
            .ToListAsync(cancellationToken);

        var result = new List<MetrologyCatalogAsset>(weights.Count + instruments.Count);

        foreach (var w in weights)
        {
            var lotOrCode = !string.IsNullOrWhiteSpace(w.LotName) ? w.LotName : w.Code;
            var description = $"{w.NominalValue} {w.Unit}".Trim();
            if (!string.IsNullOrWhiteSpace(lotOrCode))
                description = $"{description} · {lotOrCode}";

            result.Add(new MetrologyCatalogAsset(
                Id: w.Id,
                Source: "StandardWeight",
                Code: w.Code,
                Kind: "Weight",
                Description: description,
                BrandOrManufacturer: w.Manufacturer ?? string.Empty,
                Model: string.Empty,
                SerialNumber: w.SerialNumber ?? string.Empty,
                CertificateNumber: w.CertificateNumber ?? string.Empty,
                TraceabilityLab: w.TraceabilityLab ?? string.Empty,
                CalibrationDate: w.CalibrationDate,
                ExpirationDate: w.ExpirationDate,
                Status: w.Status ?? string.Empty,
                Extra: $"{w.NominalValue} {w.Unit} {w.AccuracyClass}".Trim(),
                DeepLinkPath: $"/metrologia/patrones/{w.Id}"
            ));
        }

        foreach (var i in instruments)
        {
            var kind = string.Equals(i.Kind, MetrologyInstrumentKinds.Thermometer, StringComparison.Ordinal)
                ? MetrologyInstrumentKinds.Thermometer
                : MetrologyInstrumentKinds.Other;

            result.Add(new MetrologyCatalogAsset(
                Id: i.Id,
                Source: "Instrument",
                Code: i.Code,
                Kind: kind,
                Description: i.Description ?? string.Empty,
                BrandOrManufacturer: i.Brand ?? string.Empty,
                Model: i.Model ?? string.Empty,
                SerialNumber: i.SerialNumber ?? string.Empty,
                CertificateNumber: i.CertificateNumber ?? string.Empty,
                TraceabilityLab: i.TraceabilityLab ?? string.Empty,
                CalibrationDate: i.CalibrationDate,
                ExpirationDate: i.ExpirationDate,
                Status: i.Status ?? string.Empty,
                Extra: string.IsNullOrWhiteSpace(i.MeasurementRange) ? null : i.MeasurementRange,
                DeepLinkPath: $"/metrologia/instrumentos/{i.Id}"
            ));
        }

        return result;
    }
}
