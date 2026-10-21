using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.BuildingBlocks.Time;
using LealControl.Modules.Metrology.Contracts;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Quality.Infrastructure;

/// <summary>
/// Certificado de calibración (PG17, trazabilidad): el certificado en sí, con su laboratorio, fechas y el PDF como
/// evidencia. Se vincula con las pesas y los termómetros por el número de certificado que tiene cada equipo.
/// </summary>
public sealed class QualityCalibrationCertificate : Entity<Guid>
{
    public QualityCalibrationCertificate() : base(Guid.NewGuid()) { }
    public TenantId TenantId { get; set; }
    public string Number { get; set; } = string.Empty;
    public string Laboratory { get; set; } = string.Empty;
    public DateTime? CalibrationDate { get; set; }
    public DateTime? ExpirationDate { get; set; }
    public Guid? FileId { get; set; }
    public string Notes { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed record CalibrationCertificateRequest(
    string Number, string? Laboratory = null, DateTime? CalibrationDate = null, DateTime? ExpirationDate = null, Guid? FileId = null, string? Notes = null);

internal static class QualityTraceabilityEndpoints
{
    private static string Key(string? number) => (number ?? "").Trim().ToUpperInvariant();

    public static RouteGroupBuilder MapTraceabilityRecords(this RouteGroupBuilder group)
    {
        // Listado de certificados con sus equipos (pesas y termómetros que tienen ese número de certificado).
        group.MapGet("/records/pg17/certificates", async (ITenantContext tenant, QualityDbContext db, IMetrologyAssetCatalog catalog, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);
            var certificates = await db.CalibrationCertificates.AsNoTracking().Where(c => c.TenantId == tenantId).ToListAsync(ct);
            var assets = await catalog.ListCalibrationAssetsAsync(tenantId.Value, ct);
            var files = await FileNamesAsync(db, tenantId, certificates.Select(c => c.FileId), ct);
            var today = ArgentinaTime.TodayAsUtcDate(DateTimeOffset.UtcNow);
            // Equipos con un certificado que todavía no se cargó en la pantalla: se listan para completarlo.
            var known = certificates.Select(c => Key(c.Number)).ToHashSet();
            var missing = assets.Where(a => !string.IsNullOrWhiteSpace(a.CertificateNumber) && !known.Contains(Key(a.CertificateNumber)))
                .GroupBy(a => Key(a.CertificateNumber))
                .Select(g => new { Number = g.First().CertificateNumber.Trim(), Laboratory = g.First().TraceabilityLab, g.First().CalibrationDate, g.First().ExpirationDate, Assets = g.Count() });
            return Results.Ok(new
            {
                code = "PG17",
                title = "Trazabilidad: certificados de calibración",
                rows = certificates
                    .OrderBy(c => c.ExpirationDate ?? DateTime.MaxValue).ThenBy(c => c.Number)
                    .Select(c => ToDto(c, assets.Where(a => Key(a.CertificateNumber) == Key(c.Number)), files.GetValueOrDefault(c.FileId ?? Guid.Empty), today)),
                missing
            });
        });

        group.MapGet("/records/pg17/certificates/by-number/{number}", async (string number, ITenantContext tenant, QualityDbContext db, IMetrologyAssetCatalog catalog, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);
            var key = Key(Uri.UnescapeDataString(number));
            var certificate = (await db.CalibrationCertificates.AsNoTracking().Where(c => c.TenantId == tenantId).ToListAsync(ct))
                .FirstOrDefault(c => Key(c.Number) == key);
            if (certificate is null) return Results.NotFound(new { message = "Ese certificado no está cargado en Trazabilidad." });
            var assets = await catalog.ListCalibrationAssetsAsync(tenantId.Value, ct);
            var files = await FileNamesAsync(db, tenantId, [certificate.FileId], ct);
            return Results.Ok(ToDto(certificate, assets.Where(a => Key(a.CertificateNumber) == key), files.GetValueOrDefault(certificate.FileId ?? Guid.Empty),
                ArgentinaTime.TodayAsUtcDate(DateTimeOffset.UtcNow)));
        });

        // Alta o actualización por número: la importación del certificado en Pesas lo registra acá con su PDF.
        group.MapPost("/records/pg17/certificates", async (CalibrationCertificateRequest req, ITenantContext tenant, QualityDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);
            if (string.IsNullOrWhiteSpace(req.Number)) return Results.BadRequest(new { message = "Indicá el número de certificado." });
            if (req.CalibrationDate is { } cal && req.ExpirationDate is { } exp && exp < cal)
                return Results.BadRequest(new { message = "El vencimiento no puede ser anterior a la calibración." });
            if (req.FileId is { } fileId && !await db.Files.AnyAsync(f => f.Id == fileId && f.TenantId == tenantId, ct))
                return Results.BadRequest(new { message = "El archivo del certificado no existe." });
            var key = Key(req.Number);
            var certificate = (await db.CalibrationCertificates.Where(c => c.TenantId == tenantId).ToListAsync(ct)).FirstOrDefault(c => Key(c.Number) == key);
            var created = certificate is null;
            certificate ??= db.CalibrationCertificates.Add(new QualityCalibrationCertificate { TenantId = tenantId, Number = req.Number.Trim() }).Entity;
            if (req.Laboratory is not null) certificate.Laboratory = req.Laboratory.Trim();
            if (req.CalibrationDate.HasValue) certificate.CalibrationDate = DateTime.SpecifyKind(req.CalibrationDate.Value.Date, DateTimeKind.Utc);
            if (req.ExpirationDate.HasValue) certificate.ExpirationDate = DateTime.SpecifyKind(req.ExpirationDate.Value.Date, DateTimeKind.Utc);
            if (req.FileId.HasValue) certificate.FileId = req.FileId;
            if (req.Notes is not null) certificate.Notes = req.Notes.Trim();
            certificate.UpdatedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return created ? Results.Created($"/api/v1/quality/records/pg17/certificates/{certificate.Id}", new { certificate.Id, certificate.Number }) : Results.Ok(new { certificate.Id, certificate.Number });
        });

        group.MapDelete("/records/pg17/certificates/{id:guid}", async (Guid id, ITenantContext tenant, QualityDbContext db, IMetrologyAssetCatalog catalog, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var certificate = await db.CalibrationCertificates.FirstOrDefaultAsync(c => c.Id == id && c.TenantId == tenantId, ct);
            if (certificate is null) return Results.NotFound();
            if ((await catalog.ListCalibrationAssetsAsync(tenantId.Value, ct)).Any(a => Key(a.CertificateNumber) == Key(certificate.Number)))
                return Results.BadRequest(new { message = "Hay equipos con este certificado: no se borra, es la evidencia de su calibración." });
            db.CalibrationCertificates.Remove(certificate);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        return group;
    }

    private static async Task<Dictionary<Guid, string>> FileNamesAsync(QualityDbContext db, TenantId tenantId, IEnumerable<Guid?> ids, CancellationToken ct)
    {
        var list = ids.OfType<Guid>().Distinct().ToList();
        return list.Count == 0 ? [] : await db.Files.AsNoTracking().Where(f => f.TenantId == tenantId && list.Contains(f.Id)).ToDictionaryAsync(f => f.Id, f => f.FileName, ct);
    }

    private static object ToDto(QualityCalibrationCertificate c, IEnumerable<MetrologyCatalogAsset> assets, string? fileName, DateTime today) => new
    {
        c.Id, c.Number, c.Laboratory, c.CalibrationDate, c.ExpirationDate, c.FileId, FileName = fileName, c.Notes, c.UpdatedAtUtc,
        Status = c.ExpirationDate is not { } exp ? "SinVencimiento" : exp < today ? "Vencido" : exp < today.AddDays(60) ? "PorVencer" : "Vigente",
        Assets = assets.OrderBy(a => a.InternalCode).ThenBy(a => a.Code).Select(a => new
        {
            a.Id, a.Source, a.Kind, a.InternalCode, a.Code, a.SerialNumber, a.Description, a.DeepLinkPath, a.ExpirationDate
        })
    };
}
