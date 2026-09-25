using LealControl.BuildingBlocks.Storage;
using LealControl.BuildingBlocks.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Quality.Infrastructure;

public static class QualityExternalDocumentEndpoints
{
    private const long MaxPdfBytes = 20 * 1024 * 1024;

    public static void MapExternalDocumentRecords(this RouteGroupBuilder group)
    {
        group.MapGet("/records/pg01-r02", async (ITenantContext tenant, QualityDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);
            var docs = await db.Documents.AsNoTracking()
                .Where(d => d.TenantId == tenantId && d.Type == QualityDocumentTypes.External)
                .OrderBy(d => d.Title).ToListAsync(ct);
            var versions = await db.DocumentVersions.AsNoTracking()
                .Where(v => v.TenantId == tenantId).ToDictionaryAsync(v => v.Id, ct);
            var files = await db.Files.AsNoTracking()
                .Where(f => f.TenantId == tenantId && f.ContentType == "application/pdf")
                .ToDictionaryAsync(f => f.Id, ct);
            var record = await db.Documents.AsNoTracking()
                .FirstOrDefaultAsync(d => d.TenantId == tenantId && d.Code == "PG01-R02", ct);
            var recordVersion = record?.CurrentVersionId is Guid rv && versions.TryGetValue(rv, out var template)
                ? (int?)template.Version : null;

            return Results.Ok(new
            {
                code = "PG01-R02",
                title = "Lista de documentos externos",
                generatedAtUtc = DateTime.UtcNow,
                recordVersion,
                rows = docs.Select(d =>
                {
                    var version = d.CurrentVersionId is Guid vid && versions.TryGetValue(vid, out var v) ? v : null;
                    // Prefer the original; keep previously published PDFs downloadable too.
                    QualityFile? original = null;
                    if (version?.SourceFileId is Guid sourceId) files.TryGetValue(sourceId, out original);
                    if (original is null && version?.PublishedFileId is Guid publishedId) files.TryGetValue(publishedId, out original);
                    return new
                    {
                        d.Id, d.Code, codigo = d.DisplayCode, nombre = d.Title,
                        organismo = d.ExternalSource, url = d.ExternalUrl,
                        proximaRevision = d.NextReviewDate, estado = d.Status,
                        originalFileId = original?.Id, originalFileName = original?.FileName
                    };
                })
            });
        });

        // An external original is supporting source material, not a new approval of the document.
        // Preserve its status, published PDF and version, and audit each original replacement.
        group.MapPost("/documents/{code}/external-original", async (
            string code, HttpRequest request, ITenantContext tenant, QualityDbContext db,
            IFileStorage storage, HttpContext http, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);
            var normalized = code.Trim().ToUpperInvariant();
            var doc = await db.Documents.FirstOrDefaultAsync(d => d.TenantId == tenantId
                && d.Code == normalized && d.Type == QualityDocumentTypes.External, ct);
            if (doc is null) return Results.NotFound();
            var version = await db.DocumentVersions.FirstOrDefaultAsync(v => v.TenantId == tenantId
                && v.DocumentId == doc.Id && v.Id == doc.CurrentVersionId, ct);
            if (version is null) return Results.Conflict(new { message = "El documento no tiene una versión actual." });
            if (!request.HasFormContentType) return Results.BadRequest(new { message = "Se espera un archivo PDF." });
            var form = await request.ReadFormAsync(ct);
            var file = form.Files.GetFile("file");
            if (file is null || file.Length == 0 || file.Length > MaxPdfBytes)
                return Results.BadRequest(new { message = "Seleccioná un PDF de hasta 20 MB, no vacío." });
            if (!string.Equals(Path.GetExtension(file.FileName), ".pdf", StringComparison.OrdinalIgnoreCase))
                return Results.BadRequest(new { message = "El documento original debe ser PDF." });

            await using var stream = file.OpenReadStream();
            var signature = new byte[5];
            if (await stream.ReadAtLeastAsync(signature, signature.Length, throwOnEndOfStream: false, cancellationToken: ct) != 5
                || !signature.AsSpan().SequenceEqual("%PDF-"u8))
                return Results.BadRequest(new { message = "El contenido del archivo no corresponde a un PDF." });
            stream.Position = 0;
            var stored = await storage.SaveAsync("quality", tenantId.Value, file.FileName, "application/pdf", stream, ct);
            var original = new QualityFile(Guid.NewGuid())
            {
                TenantId = tenantId, FileName = Path.GetFileName(file.FileName), ContentType = "application/pdf",
                SizeBytes = stored.SizeBytes, Sha256 = stored.Sha256, StorageKey = stored.StorageKey,
                Role = QualityFileRoles.Source,
                UploadedByUserId = Guid.TryParse(http.User.FindFirst("sub")?.Value, out var uid) ? uid : null,
                UploadedByName = http.User.FindFirst("name")?.Value ?? string.Empty,
                UploadedAtUtc = DateTime.UtcNow
            };
            var previousFileId = version.SourceFileId;
            db.Files.Add(original);
            version.SourceFileId = original.Id;
            doc.UpdatedAtUtc = DateTime.UtcNow;
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.DocumentVersion, version.Id,
                "ExternalOriginalAttached", $"PDF original {original.FileName} adjunto a {doc.Code}.",
                new { sourceFileId = previousFileId }, new { sourceFileId = original.Id }, http);
            try
            {
                await db.SaveChangesAsync(ct);
            }
            catch
            {
                await storage.DeleteAsync(stored.StorageKey, CancellationToken.None);
                throw;
            }
            return Results.Ok(new { original.Id, original.FileName });
        });
    }
}
