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

        // MC01-R02 — Compromisos de confidencialidad externos
        group.MapGet("/records/mc01-r02", async (ITenantContext tenant, QualityDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);
            await QualitySeed.EnsureCatalogAsync(db, tenantId, ct);

            var rows = await db.ConfidentialityCommitments.AsNoTracking()
                .Where(c => c.TenantId == tenantId && c.Kind == QualityConfidentialityKinds.External)
                .OrderByDescending(c => c.SignedAt)
                .ThenBy(c => c.PersonName)
                .ToListAsync(ct);

            return Results.Ok(new
            {
                code = "MC01-R02",
                title = "Compromiso de confidencialidad e imparcialidad externo",
                recordKind = QualityRecordKinds.Attachment,
                generatedAtUtc = DateTime.UtcNow,
                rows = rows.Select(ToConfidentialityDto)
            });
        });

        group.MapPost("/records/mc01-r02", async (
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
                Kind = QualityConfidentialityKinds.External,
                RecordCode = "MC01-R02",
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
            return Results.Created($"/api/v1/quality/records/mc01-r02/{entity.Id}", ToConfidentialityDto(entity));
        });

        group.MapDelete("/records/mc01-r02/{id:guid}", async (
            Guid id,
            ITenantContext tenant,
            QualityDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.ConfidentialityCommitments
                .FirstOrDefaultAsync(c => c.Id == id && c.TenantId == tenantId && c.Kind == QualityConfidentialityKinds.External, ct);
            if (entity is null) return Results.NotFound();
            entity.Status = "Cancelled";
            entity.UpdatedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToConfidentialityDto(entity));
        });

        // MC01-R03 — Seguimiento de objetivos e indicadores
        group.MapGet("/records/mc01-r03", async (ITenantContext tenant, QualityDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);
            await QualitySeed.EnsureCatalogAsync(db, tenantId, ct);

            var indicators = await db.Indicators.AsNoTracking()
                .Where(i => i.TenantId == tenantId)
                .OrderBy(i => i.Status == "Active" ? 0 : 1)
                .ThenBy(i => i.Name)
                .ToListAsync(ct);

            var ids = indicators.Select(i => i.Id).ToList();
            var values = await db.IndicatorValues.AsNoTracking()
                .Where(v => v.TenantId == tenantId && ids.Contains(v.IndicatorId))
                .OrderByDescending(v => v.Period)
                .ThenByDescending(v => v.RecordedAtUtc)
                .ToListAsync(ct);

            var byIndicator = values.GroupBy(v => v.IndicatorId).ToDictionary(g => g.Key, g => g.ToList());

            return Results.Ok(new
            {
                code = "MC01-R03",
                title = "Seguimiento de objetivos e indicadores",
                recordKind = QualityRecordKinds.Structured,
                generatedAtUtc = DateTime.UtcNow,
                rows = indicators.Select(i =>
                {
                    byIndicator.TryGetValue(i.Id, out var vals);
                    vals ??= new List<QualityIndicatorValue>();
                    var latest = vals.FirstOrDefault();
                    return ToIndicatorDto(i, vals, latest);
                })
            });
        });

        group.MapPost("/records/mc01-r03", async (
            CreateQualityIndicatorRequest req,
            ITenantContext tenant,
            QualityDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);

            if (string.IsNullOrWhiteSpace(req.Name))
            {
                return Results.BadRequest(new { message = "El nombre del indicador es obligatorio." });
            }

            var entity = new QualityIndicator
            {
                TenantId = tenantId,
                RecordCode = "MC01-R03",
                Name = req.Name.Trim(),
                Objective = req.Objective?.Trim() ?? string.Empty,
                Formula = req.Formula?.Trim() ?? string.Empty,
                TargetValue = req.TargetValue,
                TargetUnit = req.TargetUnit?.Trim() ?? string.Empty,
                Direction = string.IsNullOrWhiteSpace(req.Direction) ? "HigherIsBetter" : req.Direction.Trim(),
                Responsible = req.Responsible?.Trim() ?? string.Empty,
                Frequency = string.IsNullOrWhiteSpace(req.Frequency) ? "Monthly" : req.Frequency.Trim(),
                Notes = req.Notes?.Trim() ?? string.Empty,
                Status = "Active",
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow
            };

            db.Indicators.Add(entity);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/quality/records/mc01-r03/{entity.Id}", ToIndicatorDto(entity, Array.Empty<QualityIndicatorValue>(), null));
        });

        group.MapPut("/records/mc01-r03/{id:guid}", async (
            Guid id,
            UpdateQualityIndicatorRequest req,
            ITenantContext tenant,
            QualityDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.Indicators.FirstOrDefaultAsync(i => i.Id == id && i.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();

            if (req.Name is not null)
            {
                if (string.IsNullOrWhiteSpace(req.Name))
                    return Results.BadRequest(new { message = "El nombre no puede quedar vacío." });
                entity.Name = req.Name.Trim();
            }
            if (req.Objective is not null) entity.Objective = req.Objective.Trim();
            if (req.Formula is not null) entity.Formula = req.Formula.Trim();
            if (req.TargetValue.HasValue) entity.TargetValue = req.TargetValue;
            if (req.TargetUnit is not null) entity.TargetUnit = req.TargetUnit.Trim();
            if (req.Direction is not null) entity.Direction = req.Direction.Trim();
            if (req.Responsible is not null) entity.Responsible = req.Responsible.Trim();
            if (req.Frequency is not null) entity.Frequency = req.Frequency.Trim();
            if (req.Notes is not null) entity.Notes = req.Notes.Trim();
            if (req.Status is not null)
            {
                var st = req.Status.Trim();
                if (st is not ("Active" or "Inactive"))
                    return Results.BadRequest(new { message = "Status debe ser Active o Inactive." });
                entity.Status = st;
            }

            entity.UpdatedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);

            var vals = await db.IndicatorValues.AsNoTracking()
                .Where(v => v.TenantId == tenantId && v.IndicatorId == entity.Id)
                .OrderByDescending(v => v.Period)
                .ToListAsync(ct);
            return Results.Ok(ToIndicatorDto(entity, vals, vals.FirstOrDefault()));
        });

        group.MapDelete("/records/mc01-r03/{id:guid}", async (
            Guid id,
            ITenantContext tenant,
            QualityDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.Indicators.FirstOrDefaultAsync(i => i.Id == id && i.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();
            entity.Status = "Inactive";
            entity.UpdatedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToIndicatorDto(entity, Array.Empty<QualityIndicatorValue>(), null));
        });

        group.MapPost("/records/mc01-r03/{id:guid}/values", async (
            Guid id,
            CreateQualityIndicatorValueRequest req,
            ITenantContext tenant,
            QualityDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);

            var indicator = await db.Indicators.AsNoTracking()
                .FirstOrDefaultAsync(i => i.Id == id && i.TenantId == tenantId, ct);
            if (indicator is null) return Results.NotFound(new { message = "Indicador no encontrado." });
            if (indicator.Status != "Active")
                return Results.BadRequest(new { message = "El indicador está inactivo." });

            if (string.IsNullOrWhiteSpace(req.Period))
                return Results.BadRequest(new { message = "El período es obligatorio (ej. 2026-09 o 2026-Q3)." });

            var period = req.Period.Trim();
            var existing = await db.IndicatorValues
                .FirstOrDefaultAsync(v => v.TenantId == tenantId && v.IndicatorId == id && v.Period == period, ct);

            if (existing is not null)
            {
                existing.Value = req.Value;
                existing.Notes = req.Notes?.Trim() ?? string.Empty;
                existing.RecordedBy = req.RecordedBy?.Trim() ?? existing.RecordedBy;
                existing.RecordedAtUtc = DateTime.UtcNow;
                await db.SaveChangesAsync(ct);
                return Results.Ok(ToIndicatorValueDto(existing));
            }

            var entity = new QualityIndicatorValue
            {
                TenantId = tenantId,
                IndicatorId = id,
                Period = period,
                Value = req.Value,
                Notes = req.Notes?.Trim() ?? string.Empty,
                RecordedBy = req.RecordedBy?.Trim() ?? string.Empty,
                RecordedAtUtc = DateTime.UtcNow
            };
            db.IndicatorValues.Add(entity);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/quality/records/mc01-r03/{id}/values/{entity.Id}", ToIndicatorValueDto(entity));
        });

        group.MapDelete("/records/mc01-r03/{indicatorId:guid}/values/{valueId:guid}", async (
            Guid indicatorId,
            Guid valueId,
            ITenantContext tenant,
            QualityDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.IndicatorValues
                .FirstOrDefaultAsync(v => v.Id == valueId && v.IndicatorId == indicatorId && v.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();
            db.IndicatorValues.Remove(entity);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
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

    private static object ToIndicatorValueDto(QualityIndicatorValue v) => new
    {
        v.Id,
        v.IndicatorId,
        v.Period,
        v.Value,
        v.Notes,
        v.RecordedBy,
        v.RecordedAtUtc
    };

    private static object ToIndicatorDto(
        QualityIndicator i,
        IReadOnlyList<QualityIndicatorValue> values,
        QualityIndicatorValue? latest)
    {
        string? compliance = null;
        if (latest is not null && i.TargetValue.HasValue)
        {
            compliance = i.Direction switch
            {
                "LowerIsBetter" => latest.Value <= i.TargetValue.Value ? "Met" : "Below",
                "Exact" => latest.Value == i.TargetValue.Value ? "Met" : "Below",
                _ => latest.Value >= i.TargetValue.Value ? "Met" : "Below"
            };
        }

        return new
        {
            i.Id,
            i.RecordCode,
            i.Name,
            i.Objective,
            i.Formula,
            i.TargetValue,
            i.TargetUnit,
            i.Direction,
            i.Responsible,
            i.Frequency,
            i.Notes,
            i.Status,
            i.CreatedAtUtc,
            i.UpdatedAtUtc,
            latestPeriod = latest?.Period,
            latestValue = latest?.Value,
            compliance,
            values = values.Select(ToIndicatorValueDto)
        };
    }

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
