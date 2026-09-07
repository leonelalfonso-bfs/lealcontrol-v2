using System.Security.Claims;
using LealControl.BuildingBlocks.Persistence;
using LealControl.BuildingBlocks.Security;
using LealControl.BuildingBlocks.Storage;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Quality.Contracts;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace LealControl.Modules.Quality.Infrastructure;

public static class QualityEndpoints
{
    public static IServiceCollection AddQualityModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddTenantDbContext<QualityDbContext>(
            migrationsHistorySchema: QualityDbContext.Schema,
            configureNpgsql: b => b.MigrationsAssembly(typeof(QualityDbContext).Assembly.FullName));

        services.AddSingleton<IFileStorage, LocalDiskFileStorage>();
        services.AddScoped<IQualityAuthorizationGateway, QualityAuthorizationGatewayStub>();
        services.AddScoped<IQualityDocumentSnapshotProvider, QualityDocumentSnapshotProvider>();

        return services;
    }

    public static IEndpointRouteBuilder MapQualityModule(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/quality")
            .WithTags("Quality ISO 17025")
            .RequirePolicyOnWrites("RequireQuality");

        group.MapGet("/dashboard", async (ITenantContext tenant, QualityDbContext db, CancellationToken ct) =>
        {
            try
            {
                var tenantId = tenant.TenantId;
                await db.EnsureQualityTablesAsync(ct);
                await QualitySeed.EnsureCatalogAsync(db, tenantId, ct);

                var docs = await db.Documents.AsNoTracking()
                    .Where(d => d.TenantId == tenantId)
                    .ToListAsync(ct);

                var now = DateTime.UtcNow;
                return Results.Ok(new
                {
                    totalDocuments = docs.Count,
                    byType = docs.GroupBy(d => d.Type).ToDictionary(g => g.Key, g => g.Count()),
                    current = docs.Count(d => d.Status == QualityDocumentStatuses.Current),
                    draft = docs.Count(d => d.Status == QualityDocumentStatuses.Draft),
                    reviewDue = docs.Count(d => d.NextReviewDate.HasValue && d.NextReviewDate.Value <= now.AddDays(60)
                        && d.Status is QualityDocumentStatuses.Current or QualityDocumentStatuses.Approved),
                    overdueReview = docs.Count(d => d.NextReviewDate.HasValue && d.NextReviewDate.Value < now
                        && d.Status is QualityDocumentStatuses.Current or QualityDocumentStatuses.Approved)
                });
            }
            catch (Exception ex)
            {
                return Results.Problem(
                    detail: ex.InnerException?.Message ?? ex.Message,
                    title: "Error al cargar el tablero de Calidad",
                    statusCode: StatusCodes.Status500InternalServerError);
            }
        });

        group.MapGet("/documents/tree", async (ITenantContext tenant, QualityDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);
            await QualitySeed.EnsureCatalogAsync(db, tenantId, ct);

            var docs = await db.Documents.AsNoTracking()
                .Where(d => d.TenantId == tenantId)
                .OrderBy(d => d.SortOrder)
                .ThenBy(d => d.Code)
                .ToListAsync(ct);

            var versions = await db.DocumentVersions.AsNoTracking()
                .Where(v => v.TenantId == tenantId)
                .ToListAsync(ct);
            var versionMap = versions.ToDictionary(v => v.Id);

            object MapNode(QualityDocument doc)
            {
                QualityDocumentVersion? current = null;
                if (doc.CurrentVersionId.HasValue)
                {
                    versionMap.TryGetValue(doc.CurrentVersionId.Value, out current);
                }

                var children = docs.Where(c => c.ParentId == doc.Id)
                    .OrderBy(c => c.SortOrder)
                    .Select(MapNode)
                    .ToList();

                return new
                {
                    doc.Id,
                    doc.Code,
                    doc.DisplayCode,
                    doc.Type,
                    doc.Title,
                    doc.Status,
                    doc.RecordKind,
                    doc.LinkedModule,
                    doc.Iso17025Clauses,
                    doc.NextReviewDate,
                    doc.ReviewPeriodMonths,
                    currentVersion = current == null ? null : new
                    {
                        current.Id,
                        current.Version,
                        current.Status,
                        current.PublishedFileId,
                        current.SourceFileId,
                        current.ElaboratedBy,
                        current.ReviewedBy,
                        current.ApprovedBy,
                        current.EffectiveFrom
                    },
                    children
                };
            }

            var roots = docs.Where(d => d.ParentId == null).OrderBy(d => d.SortOrder).Select(MapNode).ToList();
            return Results.Ok(roots);
        });

        group.MapGet("/documents", async (ITenantContext tenant, QualityDbContext db, string? type, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);
            await QualitySeed.EnsureCatalogAsync(db, tenantId, ct);

            var query = db.Documents.AsNoTracking().Where(d => d.TenantId == tenantId);
            if (!string.IsNullOrWhiteSpace(type))
            {
                query = query.Where(d => d.Type == type);
            }

            var items = await query.OrderBy(d => d.SortOrder).ThenBy(d => d.Code).ToListAsync(ct);
            return Results.Ok(items.Select(ToDocumentDto));
        });

        // PG01-R01 generated
        group.MapGet("/records/pg01-r01", async (ITenantContext tenant, QualityDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);
            await QualitySeed.EnsureCatalogAsync(db, tenantId, ct);

            var docs = await db.Documents.AsNoTracking()
                .Where(d => d.TenantId == tenantId && d.Type != QualityDocumentTypes.External)
                .OrderBy(d => d.Code)
                .ToListAsync(ct);

            var versions = await db.DocumentVersions.AsNoTracking()
                .Where(v => v.TenantId == tenantId)
                .ToListAsync(ct);

            var rows = docs.Select(d =>
            {
                var current = d.CurrentVersionId.HasValue
                    ? versions.FirstOrDefault(v => v.Id == d.CurrentVersionId.Value)
                    : null;
                return new
                {
                    codigo = d.DisplayCode,
                    nombre = d.Title,
                    tipo = d.Type,
                    versionActual = current?.Version,
                    fechaAprobacion = current?.ApprovedAt,
                    fechaRevision = d.NextReviewDate,
                    estado = d.Status
                };
            });

            return Results.Ok(new
            {
                code = "PG01-R01",
                title = "Lista de documentos internos",
                generatedAtUtc = DateTime.UtcNow,
                rows
            });
        });

        // PG01-R02 generated
        group.MapGet("/records/pg01-r02", async (ITenantContext tenant, QualityDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);
            await QualitySeed.EnsureCatalogAsync(db, tenantId, ct);

            var docs = await db.Documents.AsNoTracking()
                .Where(d => d.TenantId == tenantId && d.Type == QualityDocumentTypes.External)
                .OrderBy(d => d.Title)
                .ToListAsync(ct);

            return Results.Ok(new
            {
                code = "PG01-R02",
                title = "Lista de documentos externos",
                generatedAtUtc = DateTime.UtcNow,
                rows = docs.Select(d => new
                {
                    nombre = d.Title,
                    organismo = d.ExternalSource,
                    url = d.ExternalUrl,
                    proximaRevision = d.NextReviewDate,
                    estado = d.Status
                })
            });
        });

        // MC01-R01 — Compromisos de confidencialidad internos (instancias firmadas)
        group.MapGet("/records/mc01-r01", async (ITenantContext tenant, QualityDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);
            await QualitySeed.EnsureCatalogAsync(db, tenantId, ct);

            var rows = await db.ConfidentialityCommitments.AsNoTracking()
                .Where(c => c.TenantId == tenantId && c.Kind == QualityConfidentialityKinds.Internal)
                .OrderByDescending(c => c.SignedAt)
                .ThenBy(c => c.PersonName)
                .ToListAsync(ct);

            return Results.Ok(new
            {
                code = "MC01-R01",
                title = "Compromiso de confidencialidad e imparcialidad interno",
                recordKind = QualityRecordKinds.Attachment,
                generatedAtUtc = DateTime.UtcNow,
                rows = rows.Select(ToConfidentialityDto)
            });
        });

        group.MapPost("/records/mc01-r01", async (
            CreateConfidentialityCommitmentRequest req,
            ITenantContext tenant,
            QualityDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);

            if (string.IsNullOrWhiteSpace(req.PersonName))
            {
                return Results.BadRequest(new { message = "El nombre de la persona es obligatorio." });
            }

            if (req.SignedFileId.HasValue)
            {
                var fileOk = await db.Files.AsNoTracking()
                    .AnyAsync(f => f.TenantId == tenantId && f.Id == req.SignedFileId.Value, ct);
                if (!fileOk)
                {
                    return Results.BadRequest(new { message = "El PDF firmado no existe. Subilo antes con POST /files." });
                }
            }

            var entity = new QualityConfidentialityCommitment
            {
                TenantId = tenantId,
                Kind = QualityConfidentialityKinds.Internal,
                RecordCode = "MC01-R01",
                PersonUserId = req.PersonUserId,
                PersonName = req.PersonName.Trim(),
                PersonEmail = req.PersonEmail?.Trim() ?? string.Empty,
                PersonRole = req.PersonRole?.Trim() ?? string.Empty,
                Organization = req.Organization?.Trim() ?? string.Empty,
                SignedAt = req.SignedAt ?? DateTime.UtcNow,
                SignedFileId = req.SignedFileId,
                Notes = req.Notes?.Trim() ?? string.Empty,
                Status = "Active",
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow
            };

            db.ConfidentialityCommitments.Add(entity);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/quality/records/mc01-r01/{entity.Id}", ToConfidentialityDto(entity));
        });

        group.MapDelete("/records/mc01-r01/{id:guid}", async (
            Guid id,
            ITenantContext tenant,
            QualityDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.ConfidentialityCommitments
                .FirstOrDefaultAsync(c => c.Id == id && c.TenantId == tenantId && c.Kind == QualityConfidentialityKinds.Internal, ct);
            if (entity is null) return Results.NotFound();
            entity.Status = "Cancelled";
            entity.UpdatedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToConfidentialityDto(entity));
        });

        group.MapGet("/documents/{code}", async (string code, ITenantContext tenant, QualityDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);
            var normalized = NormalizeCode(code);

            var doc = await db.Documents.AsNoTracking()
                .FirstOrDefaultAsync(d => d.TenantId == tenantId && d.Code == normalized, ct);
            if (doc is null)
            {
                return Results.NotFound(new { message = $"Documento {code} no encontrado." });
            }

            var versions = await db.DocumentVersions.AsNoTracking()
                .Where(v => v.TenantId == tenantId && v.DocumentId == doc.Id)
                .OrderByDescending(v => v.Version)
                .ToListAsync(ct);

            var children = await db.Documents.AsNoTracking()
                .Where(d => d.TenantId == tenantId && d.ParentId == doc.Id)
                .OrderBy(d => d.SortOrder)
                .ToListAsync(ct);

            var relations = await db.DocumentRelations.AsNoTracking()
                .Where(r => r.TenantId == tenantId && (r.FromDocumentId == doc.Id || r.ToDocumentId == doc.Id))
                .ToListAsync(ct);

            return Results.Ok(new
            {
                document = ToDocumentDto(doc),
                versions = versions.Select(ToVersionDto),
                children = children.Select(ToDocumentDto),
                relations
            });
        });

        group.MapPost("/documents", async (CreateDocumentRequest req, ITenantContext tenant, QualityDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);

            var code = NormalizeCode(req.Code);
            if (string.IsNullOrWhiteSpace(code) || string.IsNullOrWhiteSpace(req.Title))
            {
                return Results.BadRequest(new { message = "Código y título son obligatorios." });
            }

            var exists = await db.Documents.AnyAsync(d => d.TenantId == tenantId && d.Code == code, ct);
            if (exists)
            {
                return Results.Conflict(new { message = $"Ya existe el documento {code}." });
            }

            var id = Guid.NewGuid();
            var versionId = Guid.NewGuid();
            var doc = new QualityDocument(id)
            {
                TenantId = tenantId,
                Code = code,
                DisplayCode = string.IsNullOrWhiteSpace(req.DisplayCode) ? code : req.DisplayCode.Trim(),
                Type = req.Type ?? QualityDocumentTypes.Procedure,
                Title = req.Title.Trim(),
                ParentId = req.ParentId,
                SortOrder = req.SortOrder,
                Status = QualityDocumentStatuses.Draft,
                CurrentVersionId = versionId,
                ReviewPeriodMonths = req.ReviewPeriodMonths ?? (req.Type == QualityDocumentTypes.External ? 12 : 24),
                NextReviewDate = DateTime.UtcNow.AddMonths(req.ReviewPeriodMonths ?? 24),
                OwnerRole = req.OwnerRole ?? "Responsable de calidad",
                Iso17025Clauses = req.Iso17025Clauses ?? string.Empty,
                RecordKind = req.RecordKind,
                LinkedModule = req.LinkedModule,
                ExternalSource = req.ExternalSource,
                ExternalUrl = req.ExternalUrl,
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow
            };

            var version = new QualityDocumentVersion(versionId)
            {
                TenantId = tenantId,
                DocumentId = id,
                Version = 1,
                Status = QualityDocumentStatuses.Draft,
                ChangeSummary = req.ChangeSummary ?? "Alta inicial",
                ElaboratedBy = req.ElaboratedBy ?? string.Empty,
                ElaboratedAt = req.ElaboratedAt,
                CreatedAtUtc = DateTime.UtcNow
            };

            db.Documents.Add(doc);
            db.DocumentVersions.Add(version);
            await db.SaveChangesAsync(ct);

            return Results.Created($"/api/v1/quality/documents/{doc.Code}", ToDocumentDto(doc));
        });

        group.MapPost("/documents/{code}/versions", async (
            string code,
            CreateVersionRequest req,
            ITenantContext tenant,
            QualityDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);
            var normalized = NormalizeCode(code);

            var doc = await db.Documents.FirstOrDefaultAsync(d => d.TenantId == tenantId && d.Code == normalized, ct);
            if (doc is null)
            {
                return Results.NotFound(new { message = $"Documento {code} no encontrado." });
            }

            var nextVersion = await db.DocumentVersions
                .Where(v => v.TenantId == tenantId && v.DocumentId == doc.Id)
                .MaxAsync(v => (int?)v.Version, ct) ?? 0;
            nextVersion++;

            var version = new QualityDocumentVersion(Guid.NewGuid())
            {
                TenantId = tenantId,
                DocumentId = doc.Id,
                Version = nextVersion,
                Status = QualityDocumentStatuses.Draft,
                ChangeSummary = req.ChangeSummary ?? string.Empty,
                ElaboratedBy = req.ElaboratedBy ?? string.Empty,
                ElaboratedAt = req.ElaboratedAt ?? DateTime.UtcNow,
                PublishedFileId = req.PublishedFileId,
                SourceFileId = req.SourceFileId,
                CreatedAtUtc = DateTime.UtcNow
            };

            doc.CurrentVersionId = version.Id;
            doc.Status = QualityDocumentStatuses.Draft;
            doc.UpdatedAtUtc = DateTime.UtcNow;

            db.DocumentVersions.Add(version);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToVersionDto(version));
        });

        group.MapPost("/documents/{code}/versions/{version:int}/approve", async (
            string code,
            int version,
            ApproveVersionRequest req,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);
            var normalized = NormalizeCode(code);

            var doc = await db.Documents.FirstOrDefaultAsync(d => d.TenantId == tenantId && d.Code == normalized, ct);
            if (doc is null)
            {
                return Results.NotFound(new { message = $"Documento {code} no encontrado." });
            }

            var ver = await db.DocumentVersions.FirstOrDefaultAsync(
                v => v.TenantId == tenantId && v.DocumentId == doc.Id && v.Version == version, ct);
            if (ver is null)
            {
                return Results.NotFound(new { message = $"Versión {version} no encontrada." });
            }

            if (doc.Type != QualityDocumentTypes.External && ver.PublishedFileId is null)
            {
                return Results.BadRequest(new { message = "La versión vigente debe tener PDF publicado (PublishedFileId)." });
            }

            // Aplicar ReviewedBy del body ANTES de validar elaborador ≠ revisor (PG01).
            if (!string.IsNullOrWhiteSpace(req.ReviewedBy))
            {
                ver.ReviewedBy = req.ReviewedBy.Trim();
                ver.ReviewedAt ??= DateTime.UtcNow;
            }

            if (string.IsNullOrWhiteSpace(ver.ReviewedBy) || string.Equals(ver.ReviewedBy, ver.ElaboratedBy, StringComparison.OrdinalIgnoreCase))
            {
                return Results.BadRequest(new { message = "Debe existir un revisor distinto del elaborador (PG01)." });
            }

            var approver = req.ApprovedBy
                ?? http.User.FindFirst("name")?.Value
                ?? http.User.FindFirst(ClaimTypes.Name)?.Value
                ?? "Director Técnico";

            // Marcar versión anterior Current como Obsolete
            var previous = await db.DocumentVersions
                .Where(v => v.TenantId == tenantId && v.DocumentId == doc.Id && v.Status == QualityDocumentStatuses.Current && v.Id != ver.Id)
                .ToListAsync(ct);
            foreach (var old in previous)
            {
                old.Status = QualityDocumentStatuses.Obsolete;
                old.EffectiveTo = DateTime.UtcNow;
            }

            ver.Status = QualityDocumentStatuses.Current;
            ver.ApprovedBy = approver;
            ver.ApprovedAt = req.ApprovedAt ?? DateTime.UtcNow;
            ver.EffectiveFrom ??= ver.ApprovedAt;
            ver.ReviewedAt ??= DateTime.UtcNow;

            doc.CurrentVersionId = ver.Id;
            doc.Status = QualityDocumentStatuses.Current;
            doc.NextReviewDate = DateTime.UtcNow.AddMonths(doc.ReviewPeriodMonths);
            doc.UpdatedAtUtc = DateTime.UtcNow;

            await db.SaveChangesAsync(ct);
            return Results.Ok(ToVersionDto(ver));
        }).RequireAuthorization("RequireTechnicalDirector");

        group.MapPost("/files", async (
            HttpRequest request,
            ITenantContext tenant,
            QualityDbContext db,
            IFileStorage storage,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);

            if (!request.HasFormContentType)
            {
                return Results.BadRequest(new { message = "Se espera multipart/form-data." });
            }

            var form = await request.ReadFormAsync(ct);
            var file = form.Files.GetFile("file") ?? form.Files.FirstOrDefault();
            if (file is null || file.Length == 0)
            {
                return Results.BadRequest(new { message = "Archivo requerido." });
            }

            var role = form["role"].ToString();
            if (string.IsNullOrWhiteSpace(role))
            {
                role = QualityFileRoles.Published;
            }

            if (role == QualityFileRoles.Published
                && !string.Equals(Path.GetExtension(file.FileName), ".pdf", StringComparison.OrdinalIgnoreCase)
                && !string.Equals(file.ContentType, "application/pdf", StringComparison.OrdinalIgnoreCase))
            {
                return Results.BadRequest(new { message = "El archivo publicado debe ser PDF." });
            }

            await using var stream = file.OpenReadStream();
            var stored = await storage.SaveAsync("quality", tenantId.Value, file.FileName, file.ContentType, stream, ct);

            var entity = new QualityFile(Guid.NewGuid())
            {
                TenantId = tenantId,
                FileName = Path.GetFileName(file.FileName),
                ContentType = file.ContentType,
                SizeBytes = stored.SizeBytes,
                Sha256 = stored.Sha256,
                StorageKey = stored.StorageKey,
                Role = role,
                UploadedByUserId = Guid.TryParse(http.User.FindFirst("sub")?.Value, out var uid) ? uid : null,
                UploadedByName = http.User.FindFirst("name")?.Value ?? string.Empty,
                UploadedAtUtc = DateTime.UtcNow
            };

            db.Files.Add(entity);
            await db.SaveChangesAsync(ct);

            return Results.Ok(new
            {
                entity.Id,
                entity.FileName,
                entity.ContentType,
                entity.SizeBytes,
                entity.Sha256,
                entity.Role,
                entity.UploadedAtUtc
            });
        });

        group.MapGet("/files/{id:guid}", async (
            Guid id,
            ITenantContext tenant,
            QualityDbContext db,
            IFileStorage storage,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var file = await db.Files.AsNoTracking()
                .FirstOrDefaultAsync(f => f.TenantId == tenantId && f.Id == id, ct);
            if (file is null)
            {
                return Results.NotFound();
            }

            var content = await storage.OpenReadAsync(file.StorageKey, ct);
            if (content is null)
            {
                return Results.NotFound(new { message = "Archivo no encontrado en storage." });
            }

            var downloadName = file.Role == QualityFileRoles.Published
                ? $"COPIA_NO_CONTROLADA_{file.FileName}"
                : file.FileName;

            return Results.File(content.Stream, file.ContentType, downloadName);
        });

        group.MapPost("/documents/{code}/versions/{version:int}/attach", async (
            string code,
            int version,
            AttachFileRequest req,
            ITenantContext tenant,
            QualityDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var normalized = NormalizeCode(code);
            var doc = await db.Documents.FirstOrDefaultAsync(d => d.TenantId == tenantId && d.Code == normalized, ct);
            if (doc is null) return Results.NotFound();

            var ver = await db.DocumentVersions.FirstOrDefaultAsync(
                v => v.TenantId == tenantId && v.DocumentId == doc.Id && v.Version == version, ct);
            if (ver is null) return Results.NotFound();

            var file = await db.Files.AsNoTracking()
                .FirstOrDefaultAsync(f => f.TenantId == tenantId && f.Id == req.FileId, ct);
            if (file is null) return Results.BadRequest(new { message = "Archivo inexistente." });

            if (string.Equals(req.Role, QualityFileRoles.Source, StringComparison.OrdinalIgnoreCase))
            {
                // Idempotente: mismo fileId ya adjunto → OK; otro fileId reemplaza.
                ver.SourceFileId = file.Id;
            }
            else
            {
                if (file.Role != QualityFileRoles.Published
                    && !string.Equals(Path.GetExtension(file.FileName), ".pdf", StringComparison.OrdinalIgnoreCase))
                {
                    return Results.BadRequest(new { message = "PublishedFile debe ser PDF." });
                }

                // Idempotente: si ya hay PublishedFileId y es el mismo, no falla.
                if (ver.PublishedFileId.HasValue && ver.PublishedFileId.Value == file.Id)
                {
                    return Results.Ok(ToVersionDto(ver));
                }

                ver.PublishedFileId = file.Id;
            }

            doc.UpdatedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToVersionDto(ver));
        });

        group.MapMethods("/documents/{code}/versions/{version:int}", new[] { "PATCH" }, async (
            string code,
            int version,
            UpdateVersionRequest req,
            ITenantContext tenant,
            QualityDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);
            var normalized = NormalizeCode(code);

            var doc = await db.Documents.FirstOrDefaultAsync(d => d.TenantId == tenantId && d.Code == normalized, ct);
            if (doc is null)
            {
                return Results.NotFound(new { message = $"Documento {code} no encontrado." });
            }

            var ver = await db.DocumentVersions.FirstOrDefaultAsync(
                v => v.TenantId == tenantId && v.DocumentId == doc.Id && v.Version == version, ct);
            if (ver is null)
            {
                return Results.NotFound(new { message = $"Versión {version} no encontrada." });
            }

            if (req.ChangeSummary is not null) ver.ChangeSummary = req.ChangeSummary;
            if (req.ElaboratedBy is not null) ver.ElaboratedBy = req.ElaboratedBy.Trim();
            if (req.ElaboratedAt.HasValue) ver.ElaboratedAt = req.ElaboratedAt;
            if (req.ReviewedBy is not null) ver.ReviewedBy = req.ReviewedBy.Trim();
            if (req.ReviewedAt.HasValue) ver.ReviewedAt = req.ReviewedAt;
            if (req.ApprovedBy is not null) ver.ApprovedBy = req.ApprovedBy.Trim();
            if (req.ApprovedAt.HasValue) ver.ApprovedAt = req.ApprovedAt;
            if (req.EffectiveFrom.HasValue) ver.EffectiveFrom = req.EffectiveFrom;

            doc.UpdatedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToVersionDto(ver));
        });

        return endpoints;
    }

    private static string NormalizeCode(string code)
    {
        return new string(code.Trim().ToUpperInvariant()
            .Where(ch => !char.IsWhiteSpace(ch))
            .ToArray())
            .Replace('_', '-');
    }

    private static object ToDocumentDto(QualityDocument d) => new
    {
        d.Id,
        d.Code,
        d.DisplayCode,
        d.Type,
        d.Title,
        d.ParentId,
        d.SortOrder,
        d.Status,
        d.CurrentVersionId,
        d.ReviewPeriodMonths,
        d.NextReviewDate,
        d.OwnerRole,
        d.Iso17025Clauses,
        d.RecordKind,
        d.LinkedModule,
        d.ExternalSource,
        d.ExternalUrl,
        d.DeactivationReason,
        d.CreatedAtUtc,
        d.UpdatedAtUtc
    };

    private static object ToConfidentialityDto(QualityConfidentialityCommitment c) => new
    {
        c.Id,
        c.Kind,
        c.RecordCode,
        c.PersonUserId,
        c.PersonName,
        c.PersonEmail,
        c.PersonRole,
        c.Organization,
        c.SignedAt,
        c.SignedFileId,
        c.Notes,
        c.Status,
        c.CreatedAtUtc,
        c.UpdatedAtUtc
    };

    private static object ToVersionDto(QualityDocumentVersion v) => new
    {
        v.Id,
        v.DocumentId,
        v.Version,
        v.PublishedFileId,
        v.SourceFileId,
        v.ChangeSummary,
        v.ElaboratedBy,
        v.ElaboratedAt,
        v.ReviewedBy,
        v.ReviewedAt,
        v.ApprovedBy,
        v.ApprovedAt,
        v.EffectiveFrom,
        v.EffectiveTo,
        v.Status,
        v.CreatedAtUtc
    };
}

public sealed record CreateDocumentRequest(
    string Code,
    string Title,
    string? DisplayCode = null,
    string? Type = null,
    Guid? ParentId = null,
    int SortOrder = 0,
    int? ReviewPeriodMonths = null,
    string? OwnerRole = null,
    string? Iso17025Clauses = null,
    string? RecordKind = null,
    string? LinkedModule = null,
    string? ExternalSource = null,
    string? ExternalUrl = null,
    string? ChangeSummary = null,
    string? ElaboratedBy = null,
    DateTime? ElaboratedAt = null);

public sealed record CreateVersionRequest(
    string? ChangeSummary = null,
    string? ElaboratedBy = null,
    DateTime? ElaboratedAt = null,
    Guid? PublishedFileId = null,
    Guid? SourceFileId = null);

public sealed record ApproveVersionRequest(
    string? ApprovedBy = null,
    DateTime? ApprovedAt = null,
    string? ReviewedBy = null);

public sealed record UpdateVersionRequest(
    string? ChangeSummary = null,
    string? ElaboratedBy = null,
    DateTime? ElaboratedAt = null,
    string? ReviewedBy = null,
    DateTime? ReviewedAt = null,
    string? ApprovedBy = null,
    DateTime? ApprovedAt = null,
    DateTime? EffectiveFrom = null);

public sealed record AttachFileRequest(Guid FileId, string? Role = null);

/// <summary>Stub C1: autorizaciones reales en C3. Snapshot sí funciona.</summary>
public sealed class QualityAuthorizationGatewayStub : IQualityAuthorizationGateway
{
    public Task<bool> IsAuthorizedAsync(Guid tenantId, Guid userId, string methodDocumentCode, DateTime asOfUtc, CancellationToken cancellationToken = default)
        => Task.FromResult(true);

    public Task<bool> IsTechnicalDirectorAsync(Guid tenantId, Guid userId, CancellationToken cancellationToken = default)
        => Task.FromResult(false);
}

public sealed class QualityDocumentSnapshotProvider(QualityDbContext db) : IQualityDocumentSnapshotProvider
{
    public async Task<IReadOnlyList<QualityDocumentSnapshot>> GetCurrentSnapshotsAsync(
        Guid tenantId,
        IEnumerable<string> documentCodes,
        DateTime asOfUtc,
        CancellationToken cancellationToken = default)
    {
        var codes = documentCodes
            .Select(c => new string(c.Trim().ToUpperInvariant().Where(ch => !char.IsWhiteSpace(ch)).ToArray()).Replace('_', '-'))
            .Distinct()
            .ToList();

        if (codes.Count == 0)
        {
            return Array.Empty<QualityDocumentSnapshot>();
        }

        var tid = new TenantId(tenantId);
        var docs = await db.Documents.AsNoTracking()
            .Where(d => d.TenantId == tid && codes.Contains(d.Code))
            .ToListAsync(cancellationToken);

        var versionIds = docs.Where(d => d.CurrentVersionId.HasValue).Select(d => d.CurrentVersionId!.Value).ToList();
        var versions = await db.DocumentVersions.AsNoTracking()
            .Where(v => v.TenantId == tid && versionIds.Contains(v.Id))
            .ToListAsync(cancellationToken);
        var map = versions.ToDictionary(v => v.Id);

        return docs
            .Where(d => d.CurrentVersionId.HasValue && map.ContainsKey(d.CurrentVersionId.Value))
            .Select(d =>
            {
                var v = map[d.CurrentVersionId!.Value];
                return new QualityDocumentSnapshot(d.Code, d.DisplayCode, d.Title, v.Version, v.Id, v.EffectiveFrom);
            })
            .ToList();
    }
}
