using System.Security.Claims;
using LealControl.BuildingBlocks.Persistence;
using LealControl.BuildingBlocks.Security;
using LealControl.BuildingBlocks.Storage;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Metrology.Contracts;
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
        services.AddScoped<IQualityAuthorizationGateway, QualityAuthorizationGateway>();
        services.AddScoped<IQualityDocumentSnapshotProvider, QualityDocumentSnapshotProvider>();

        return services;
    }

    public static IEndpointRouteBuilder MapQualityModule(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/quality")
            .WithTags("Quality ISO 17025")
            .RequirePolicyOnWrites("RequireQuality");

        group.MapPg06Records();
        group.MapPg05Records();
        group.MapPg08Records();
        group.MapPg09Records();
        group.MapPg14Records();
        group.MapPresentationMode();

        group.MapGet("/dashboard", async (
            ITenantContext tenant,
            QualityDbContext db,
            IMetrologyAssetCatalog metrologyCatalog,
            CancellationToken ct) =>
        {
            try
            {
                var tenantId = tenant.TenantId;
                await db.EnsureQualityTablesAsync(ct);
                var now = DateTime.UtcNow;
                var horizon60 = now.AddDays(60);
                var horizon30 = now.AddDays(30);

                var docs = await db.Documents.AsNoTracking()
                    .Where(d => d.TenantId == tenantId)
                    .ToListAsync(ct);

                var openNcStatuses = new[]
                {
                    QualityNonConformityStatuses.Open,
                    QualityNonConformityStatuses.InAnalysis,
                    QualityNonConformityStatuses.ActionPending,
                    QualityNonConformityStatuses.EffectivenessCheck
                };
                var openNcQuery = db.NonConformities.AsNoTracking()
                    .Where(n => n.TenantId == tenantId && openNcStatuses.Contains(n.Status));
                var openNcCount = await openNcQuery.CountAsync(ct);
                var openNcs = await openNcQuery
                    .OrderBy(n => n.DueDate ?? n.DetectedAt)
                    .Take(20)
                    .ToListAsync(ct);

                var openComplaints = await db.Complaints.AsNoTracking()
                    .Where(c => c.TenantId == tenantId
                        && c.Status != QualityComplaintStatuses.Closed
                        && c.Status != QualityComplaintStatuses.Invalid
                        && c.Status != QualityComplaintStatuses.Cancelled)
                    .ToListAsync(ct);
                var overdueComplaints = openComplaints.Where(IsComplaintOverdue).OrderBy(c => c.CloseDueAt).Take(20).ToList();

                var authRows = await db.PersonnelAuthorizations.AsNoTracking()
                    .Where(a => a.TenantId == tenantId
                        && a.Status == QualityAuthorizationStatuses.Authorized
                        && a.ValidUntil.HasValue
                        && a.ValidUntil.Value <= horizon60)
                    .OrderBy(a => a.ValidUntil)
                    .Take(20)
                    .ToListAsync(ct);

                var maintOverdue = await db.MaintenancePlanItems.AsNoTracking()
                    .Where(m => m.TenantId == tenantId
                        && m.Status == "Active"
                        && m.NextDue.HasValue
                        && m.NextDue.Value < now)
                    .OrderBy(m => m.NextDue)
                    .Take(20)
                    .ToListAsync(ct);

                IReadOnlyList<MetrologyCatalogAsset> assets = Array.Empty<MetrologyCatalogAsset>();
                try
                {
                    assets = await metrologyCatalog.ListCalibrationAssetsAsync(tenantId.Value, ct);
                }
                catch
                {
                    // Metrología puede no estar inicializada en el tenant; el tablero sigue con el resto.
                }

                var calibSoon = assets
                    .Where(a => a.ExpirationDate.HasValue
                        && a.ExpirationDate.Value >= now
                        && a.ExpirationDate.Value <= horizon30
                        && !string.Equals(a.Status, "Retired", StringComparison.OrdinalIgnoreCase)
                        && !string.Equals(a.Status, "Obsolete", StringComparison.OrdinalIgnoreCase))
                    .OrderBy(a => a.ExpirationDate)
                    .Take(20)
                    .ToList();
                var calibOverdue = assets
                    .Where(a => a.ExpirationDate.HasValue
                        && a.ExpirationDate.Value < now
                        && !string.Equals(a.Status, "Retired", StringComparison.OrdinalIgnoreCase)
                        && !string.Equals(a.Status, "Obsolete", StringComparison.OrdinalIgnoreCase))
                    .OrderBy(a => a.ExpirationDate)
                    .Take(20)
                    .ToList();

                var docsDueReview = docs
                    .Where(d => d.NextReviewDate.HasValue
                        && d.NextReviewDate.Value <= horizon60
                        && d.Status is QualityDocumentStatuses.Current or QualityDocumentStatuses.Approved)
                    .OrderBy(d => d.NextReviewDate)
                    .Take(20)
                    .Select(d => new
                    {
                        d.Code,
                        d.DisplayCode,
                        d.Title,
                        d.Status,
                        nextReviewDate = d.NextReviewDate,
                        overdue = d.NextReviewDate < now
                    })
                    .ToList();

                // Matriz cláusulas ISO 17025: verde si hay al menos un doc Current/Approved que la cubre.
                var clauseCoverage = new Dictionary<string, (bool Covered, List<string> Codes)>(StringComparer.Ordinal);
                foreach (var doc in docs.Where(d => !string.IsNullOrWhiteSpace(d.Iso17025Clauses)))
                {
                    var covered = doc.Status is QualityDocumentStatuses.Current or QualityDocumentStatuses.Approved;
                    foreach (var raw in doc.Iso17025Clauses.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
                    {
                        if (!clauseCoverage.TryGetValue(raw, out var entry))
                            entry = (false, new List<string>());
                        if (covered) entry.Covered = true;
                        if (!entry.Codes.Contains(doc.Code, StringComparer.OrdinalIgnoreCase))
                            entry.Codes.Add(doc.Code);
                        clauseCoverage[raw] = entry;
                    }
                }

                var clauseMatrix = clauseCoverage
                    .OrderBy(kv => kv.Key, StringComparer.Ordinal)
                    .Select(kv => new
                    {
                        clause = kv.Key,
                        status = kv.Value.Covered ? "ok" : "gap",
                        documents = kv.Value.Codes
                    })
                    .ToList();

                return Results.Ok(new
                {
                    totalDocuments = docs.Count,
                    byType = docs.GroupBy(d => d.Type).ToDictionary(g => g.Key, g => g.Count()),
                    current = docs.Count(d => d.Status == QualityDocumentStatuses.Current),
                    draft = docs.Count(d => d.Status == QualityDocumentStatuses.Draft),
                    reviewDue = docs.Count(d => d.NextReviewDate.HasValue && d.NextReviewDate.Value <= horizon60
                        && d.Status is QualityDocumentStatuses.Current or QualityDocumentStatuses.Approved),
                    overdueReview = docs.Count(d => d.NextReviewDate.HasValue && d.NextReviewDate.Value < now
                        && d.Status is QualityDocumentStatuses.Current or QualityDocumentStatuses.Approved),
                    openNonConformities = openNcCount,
                    overdueComplaints = overdueComplaints.Count,
                    authorizationsExpiring = authRows.Count,
                    calibrationsDueSoon = calibSoon.Count,
                    calibrationsOverdue = calibOverdue.Count,
                    maintenanceOverdue = maintOverdue.Count,
                    alerts = new
                    {
                        documentsReview = docsDueReview,
                        nonConformities = openNcs.Select(n => new
                        {
                            n.Id,
                            n.Number,
                            n.Kind,
                            n.Status,
                            n.Description,
                            dueDate = n.NewDueDate ?? n.DueDate,
                            href = "/calidad/registros/nc"
                        }),
                        complaints = overdueComplaints.Select(c => new
                        {
                            c.Id,
                            c.Number,
                            c.PartyName,
                            c.Status,
                            currentDueAt = ComplaintCurrentDue(c),
                            href = "/calidad/registros/quejas"
                        }),
                        authorizations = authRows.Select(a => new
                        {
                            a.Id,
                            a.Number,
                            a.PersonName,
                            a.MethodDocumentCode,
                            a.ValidUntil,
                            href = "/calidad/registros/personal"
                        }),
                        calibrations = calibOverdue.Concat(calibSoon).Select(a => new
                        {
                            a.Id,
                            a.Code,
                            a.Description,
                            a.ExpirationDate,
                            a.Status,
                            overdue = a.ExpirationDate < now,
                            href = a.DeepLinkPath ?? "/calidad/registros/equipos"
                        }),
                        maintenance = maintOverdue.Select(m => new
                        {
                            m.Id,
                            m.Number,
                            m.EquipmentCode,
                            m.Activity,
                            m.NextDue,
                            href = "/calidad/registros/equipos"
                        })
                    },
                    clauseMatrix
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
            HttpContext http,
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
                var before = ToIndicatorValueDto(existing);
                existing.Value = req.Value;
                existing.Notes = req.Notes?.Trim() ?? string.Empty;
                existing.RecordedBy = req.RecordedBy?.Trim() ?? existing.RecordedBy;
                existing.RecordedAtUtc = DateTime.UtcNow;
                QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.IndicatorValue, existing.Id, "ValueCorrected", $"Indicador {indicator.Name}, periodo {period}.", before, ToIndicatorValueDto(existing), http);
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
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.IndicatorValue, entity.Id, "ValueRecorded", $"Indicador {indicator.Name}, periodo {period}.", null, ToIndicatorValueDto(entity), http);
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
            return Results.BadRequest(new { message = "Un valor registrado no se elimina. Registre una correccion trazable." });
        });

        // MC01-R05 — Notas institucionales
        group.MapGet("/records/mc01-r05", async (ITenantContext tenant, QualityDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);
            var rows = await db.InstitutionalNotes.AsNoTracking()
                .Where(n => n.TenantId == tenantId)
                .OrderByDescending(n => n.IssuedAt)
                .ThenBy(n => n.Subject)
                .ToListAsync(ct);

            return Results.Ok(new
            {
                code = "MC01-R05",
                title = "Nota institucional",
                recordKind = QualityRecordKinds.Attachment,
                generatedAtUtc = DateTime.UtcNow,
                rows = rows.Select(ToInstitutionalNoteDto)
            });
        });

        group.MapPost("/records/mc01-r05", async (
            CreateInstitutionalNoteRequest req,
            ITenantContext tenant,
            QualityDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);

            if (string.IsNullOrWhiteSpace(req.Subject))
            {
                return Results.BadRequest(new { message = "El asunto de la nota es obligatorio." });
            }

            if (req.FileId.HasValue)
            {
                var fileOk = await db.Files.AsNoTracking()
                    .AnyAsync(f => f.TenantId == tenantId && f.Id == req.FileId.Value, ct);
                if (!fileOk)
                {
                    return Results.BadRequest(new { message = "El archivo adjunto no existe. Subilo antes con POST /files." });
                }
            }

            var entity = new QualityInstitutionalNote
            {
                TenantId = tenantId,
                RecordCode = "MC01-R05",
                Subject = req.Subject.Trim(),
                Body = req.Body?.Trim() ?? string.Empty,
                IssuedBy = req.IssuedBy?.Trim() ?? string.Empty,
                Audience = req.Audience?.Trim() ?? string.Empty,
                IssuedAt = req.IssuedAt ?? DateTime.UtcNow,
                FileId = req.FileId,
                Notes = req.Notes?.Trim() ?? string.Empty,
                Status = "Active",
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow
            };

            db.InstitutionalNotes.Add(entity);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/quality/records/mc01-r05/{entity.Id}", ToInstitutionalNoteDto(entity));
        });

        group.MapDelete("/records/mc01-r05/{id:guid}", async (
            Guid id,
            ITenantContext tenant,
            QualityDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.InstitutionalNotes
                .FirstOrDefaultAsync(n => n.Id == id && n.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();
            entity.Status = "Cancelled";
            entity.UpdatedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToInstitutionalNoteDto(entity));
        });

        // PG03-R01 — Seguimiento de quejas (Structured: se genera en el sistema)
        group.MapGet("/records/pg03-r01", async (ITenantContext tenant, QualityDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);
            var rows = await db.Complaints.AsNoTracking()
                .Where(c => c.TenantId == tenantId)
                .OrderByDescending(c => c.ReceivedAt)
                .ThenByDescending(c => c.Number)
                .ToListAsync(ct);

            var overdueOpen = rows.Count(c => IsComplaintOverdue(c));

            return Results.Ok(new
            {
                code = "PG03-R01",
                title = "Seguimiento de quejas",
                recordKind = QualityRecordKinds.Structured,
                generatedAtUtc = DateTime.UtcNow,
                overdueOpen,
                rows = rows.Select(ToComplaintDto)
            });
        });

        group.MapGet("/records/pg03-r01/{id:guid}", async (
            Guid id,
            ITenantContext tenant,
            QualityDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.Complaints.AsNoTracking()
                .FirstOrDefaultAsync(c => c.Id == id && c.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();
            return Results.Ok(ToComplaintDto(entity));
        });

        group.MapPost("/records/pg03-r01", async (
            CreateComplaintRequest req,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);

            if (string.IsNullOrWhiteSpace(req.PartyName))
                return Results.BadRequest(new { message = "El reclamante es obligatorio." });
            if (string.IsNullOrWhiteSpace(req.Description))
                return Results.BadRequest(new { message = "La descripción de la queja es obligatoria." });

            if (req.EvidenceFileId.HasValue)
            {
                var fileOk = await db.Files.AsNoTracking()
                    .AnyAsync(f => f.TenantId == tenantId && f.Id == req.EvidenceFileId.Value, ct);
                if (!fileOk)
                    return Results.BadRequest(new { message = "El archivo de evidencia no existe." });
            }

            var receivedAt = req.ReceivedAt ?? DateTime.UtcNow;
            var year = receivedAt.Year;
            var prefix = $"QJ-{year}-";
            var lastNumber = await db.Complaints.AsNoTracking()
                .Where(c => c.TenantId == tenantId && c.Number.StartsWith(prefix))
                .OrderByDescending(c => c.Number)
                .Select(c => c.Number)
                .FirstOrDefaultAsync(ct);
            var seq = 1;
            if (!string.IsNullOrEmpty(lastNumber) && lastNumber.Length >= prefix.Length + 4
                && int.TryParse(lastNumber.AsSpan(prefix.Length), out var parsed))
            {
                seq = parsed + 1;
            }

            var entity = new QualityComplaint
            {
                TenantId = tenantId,
                RecordCode = "PG03-R01",
                Number = $"{prefix}{seq:D4}",
                ReceivedAt = receivedAt,
                Channel = string.IsNullOrWhiteSpace(req.Channel) ? "Other" : req.Channel.Trim(),
                PartyName = req.PartyName.Trim(),
                PartyContact = req.PartyContact?.Trim() ?? string.Empty,
                Description = req.Description.Trim(),
                Responsible = req.Responsible?.Trim() ?? string.Empty,
                EvidenceFileId = req.EvidenceFileId,
                Notes = req.Notes?.Trim() ?? string.Empty,
                Status = QualityComplaintStatuses.Open,
                RegisterDueAt = receivedAt.AddDays(1),
                ValidateDueAt = receivedAt.AddDays(1 + 2),
                InvestigateDueAt = receivedAt.AddDays(1 + 2 + 5),
                CloseDueAt = receivedAt.AddDays(1 + 2 + 5 + 2),
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow
            };

            db.Complaints.Add(entity);
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.Complaint, entity.Id, "ComplaintCreated",
                $"Queja {entity.Number} registrada.", null, ToComplaintDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/quality/records/pg03-r01/{entity.Id}", ToComplaintDto(entity));
        });

        group.MapPut("/records/pg03-r01/{id:guid}", async (
            Guid id,
            UpdateComplaintRequest req,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.Complaints.FirstOrDefaultAsync(c => c.Id == id && c.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();
            if (entity.Status is QualityComplaintStatuses.Cancelled or QualityComplaintStatuses.Closed or QualityComplaintStatuses.Invalid)
                return Results.BadRequest(new { message = "La queja está cerrada; no se puede editar." });

            var before = ToComplaintDto(entity);

            if (req.Channel is not null) entity.Channel = req.Channel.Trim();
            if (req.PartyName is not null)
            {
                if (string.IsNullOrWhiteSpace(req.PartyName))
                    return Results.BadRequest(new { message = "El reclamante no puede quedar vacío." });
                entity.PartyName = req.PartyName.Trim();
            }
            if (req.PartyContact is not null) entity.PartyContact = req.PartyContact.Trim();
            if (req.Description is not null)
            {
                if (string.IsNullOrWhiteSpace(req.Description))
                    return Results.BadRequest(new { message = "La descripción no puede quedar vacía." });
                entity.Description = req.Description.Trim();
            }
            if (req.ValidationNotes is not null) entity.ValidationNotes = req.ValidationNotes.Trim();
            if (req.Investigation is not null) entity.Investigation = req.Investigation.Trim();
            if (req.Actions is not null) entity.Actions = req.Actions.Trim();
            if (req.Responsible is not null) entity.Responsible = req.Responsible.Trim();
            if (req.Notes is not null) entity.Notes = req.Notes.Trim();
            if (req.EvidenceFileId.HasValue) entity.EvidenceFileId = req.EvidenceFileId;
            if (req.LinkedNonConformityId.HasValue) entity.LinkedNonConformityId = req.LinkedNonConformityId;
            if (req.CommunicatedAt.HasValue) entity.CommunicatedAt = req.CommunicatedAt;
            if (req.ClosedAt.HasValue) entity.ClosedAt = req.ClosedAt;

            if (req.IsValid.HasValue)
            {
                entity.IsValid = req.IsValid;
                entity.ValidatedAt = req.ValidatedAt ?? DateTime.UtcNow;
                if (req.IsValid == false)
                {
                    entity.Status = QualityComplaintStatuses.Invalid;
                    entity.ClosedAt = entity.ClosedAt ?? DateTime.UtcNow;
                }
                else if (entity.Status is QualityComplaintStatuses.Open or QualityComplaintStatuses.UnderValidation)
                {
                    entity.Status = QualityComplaintStatuses.Investigating;
                }
            }

            if (req.Status is not null)
            {
                var st = req.Status.Trim();
                var allowed = new HashSet<string>(StringComparer.Ordinal)
                {
                    QualityComplaintStatuses.Open,
                    QualityComplaintStatuses.UnderValidation,
                    QualityComplaintStatuses.Investigating,
                    QualityComplaintStatuses.PendingCommunication,
                    QualityComplaintStatuses.Closed,
                    QualityComplaintStatuses.Cancelled
                };
                if (!allowed.Contains(st) && st != QualityComplaintStatuses.Invalid)
                    return Results.BadRequest(new { message = "Estado de queja no válido." });

                entity.Status = st;
                if (st == QualityComplaintStatuses.UnderValidation && entity.ValidatedAt is null)
                {
                    // waiting validation
                }
                if (st == QualityComplaintStatuses.Closed)
                {
                    entity.ClosedAt ??= DateTime.UtcNow;
                    entity.CommunicatedAt ??= entity.ClosedAt;
                }
                if (st == QualityComplaintStatuses.PendingCommunication && string.IsNullOrWhiteSpace(entity.Actions))
                    return Results.BadRequest(new { message = "Cargá las acciones antes de pasar a comunicación." });
            }

            entity.UpdatedAtUtc = DateTime.UtcNow;
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.Complaint, entity.Id, "ComplaintUpdated",
                $"Queja {entity.Number} actualizada ({entity.Status}).", before, ToComplaintDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToComplaintDto(entity));
        });

        group.MapDelete("/records/pg03-r01/{id:guid}", async (
            Guid id,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.Complaints.FirstOrDefaultAsync(c => c.Id == id && c.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();
            var before = ToComplaintDto(entity);
            entity.Status = QualityComplaintStatuses.Cancelled;
            entity.UpdatedAtUtc = DateTime.UtcNow;
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.Complaint, entity.Id, "ComplaintCancelled",
                $"Queja {entity.Number} anulada.", before, ToComplaintDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToComplaintDto(entity));
        });

        // PG07-R1 — NC / TNC / Riesgos / OM (Structured)
        group.MapGet("/records/pg07-r01", async (ITenantContext tenant, QualityDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);
            var rows = await db.NonConformities.AsNoTracking()
                .Where(n => n.TenantId == tenantId)
                .OrderByDescending(n => n.DetectedAt)
                .ThenByDescending(n => n.Number)
                .ToListAsync(ct);

            var overdueOpen = rows.Count(IsNonConformityOverdue);

            return Results.Ok(new
            {
                code = "PG07-R01",
                title = "Registro y seguimiento de NC, R y OP",
                recordKind = QualityRecordKinds.Structured,
                generatedAtUtc = DateTime.UtcNow,
                overdueOpen,
                rows = rows.Select(ToNonConformityDto)
            });
        });

        group.MapGet("/records/pg07-r01/{id:guid}", async (
            Guid id,
            ITenantContext tenant,
            QualityDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.NonConformities.AsNoTracking()
                .FirstOrDefaultAsync(n => n.Id == id && n.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();
            return Results.Ok(ToNonConformityDto(entity));
        });

        group.MapPost("/records/pg07-r01", async (
            CreateNonConformityRequest req,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);

            if (string.IsNullOrWhiteSpace(req.Description))
                return Results.BadRequest(new { message = "La descripción es obligatoria." });

            var kind = string.IsNullOrWhiteSpace(req.Kind) ? QualityNonConformityKinds.NonConformity : req.Kind.Trim();
            if (!IsValidNcKind(kind))
                return Results.BadRequest(new { message = "Tipo inválido. Use NonConformity, NonConformingWork, Risk u Opportunity." });

            if (req.EvidenceFileId.HasValue)
            {
                var fileOk = await db.Files.AsNoTracking()
                    .AnyAsync(f => f.TenantId == tenantId && f.Id == req.EvidenceFileId.Value, ct);
                if (!fileOk)
                    return Results.BadRequest(new { message = "El archivo de evidencia no existe." });
            }

            if (req.SourceComplaintId.HasValue)
            {
                var complaintOk = await db.Complaints.AsNoTracking()
                    .AnyAsync(c => c.TenantId == tenantId && c.Id == req.SourceComplaintId.Value, ct);
                if (!complaintOk)
                    return Results.BadRequest(new { message = "La queja de origen no existe." });
            }

            var detectedAt = req.DetectedAt ?? DateTime.UtcNow;
            var prefix = NcNumberPrefix(kind) + $"-{detectedAt.Year}-";
            var lastNumber = await db.NonConformities.AsNoTracking()
                .Where(n => n.TenantId == tenantId && n.Number.StartsWith(prefix))
                .OrderByDescending(n => n.Number)
                .Select(n => n.Number)
                .FirstOrDefaultAsync(ct);
            var seq = 1;
            if (!string.IsNullOrEmpty(lastNumber) && lastNumber.Length > prefix.Length
                && int.TryParse(lastNumber.AsSpan(prefix.Length), out var parsed))
            {
                seq = parsed + 1;
            }

            int? level = null;
            if (kind == QualityNonConformityKinds.Risk && req.Probability.HasValue && req.Impact.HasValue)
                level = req.Probability.Value * req.Impact.Value;

            var entity = new QualityNonConformity
            {
                TenantId = tenantId,
                RecordCode = "PG07-R01",
                Number = $"{prefix}{seq:D4}",
                Kind = kind,
                Origin = string.IsNullOrWhiteSpace(req.Origin)
                    ? (req.SourceComplaintId.HasValue ? "Complaint" : "Internal")
                    : req.Origin.Trim(),
                DetectedAt = detectedAt,
                Description = req.Description.Trim(),
                ImmediateAction = req.ImmediateAction?.Trim() ?? string.Empty,
                ImpactOnPreviousResults = req.ImpactOnPreviousResults ?? false,
                CustomerNotified = req.CustomerNotified ?? false,
                Responsible = req.Responsible?.Trim() ?? string.Empty,
                DueDate = req.DueDate,
                Probability = req.Probability,
                Impact = req.Impact,
                Level = level,
                Controls = req.Controls?.Trim() ?? string.Empty,
                SourceComplaintId = req.SourceComplaintId,
                EvidenceFileId = req.EvidenceFileId,
                Notes = req.Notes?.Trim() ?? string.Empty,
                Status = QualityNonConformityStatuses.Open,
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow
            };

            db.NonConformities.Add(entity);

            if (req.SourceComplaintId.HasValue)
            {
                var complaint = await db.Complaints
                    .FirstOrDefaultAsync(c => c.Id == req.SourceComplaintId.Value && c.TenantId == tenantId, ct);
                if (complaint is not null)
                {
                    complaint.LinkedNonConformityId = entity.Id;
                    complaint.UpdatedAtUtc = DateTime.UtcNow;
                }
            }

            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.NonConformity, entity.Id, "NonConformityCreated",
                $"{entity.Number} ({kind}) registrada.", null, ToNonConformityDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/quality/records/pg07-r01/{entity.Id}", ToNonConformityDto(entity));
        });

        group.MapPut("/records/pg07-r01/{id:guid}", async (
            Guid id,
            UpdateNonConformityRequest req,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.NonConformities.FirstOrDefaultAsync(n => n.Id == id && n.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();
            if (entity.Status is QualityNonConformityStatuses.Closed or QualityNonConformityStatuses.Cancelled)
                return Results.BadRequest(new { message = "El registro está cerrado; no se puede editar." });

            var before = ToNonConformityDto(entity);

            if (req.Kind is not null)
            {
                if (!IsValidNcKind(req.Kind.Trim()))
                    return Results.BadRequest(new { message = "Tipo inválido." });
                entity.Kind = req.Kind.Trim();
            }
            if (req.Origin is not null) entity.Origin = req.Origin.Trim();
            if (req.DetectedAt.HasValue) entity.DetectedAt = req.DetectedAt.Value;
            if (req.Description is not null)
            {
                if (string.IsNullOrWhiteSpace(req.Description))
                    return Results.BadRequest(new { message = "La descripción no puede quedar vacía." });
                entity.Description = req.Description.Trim();
            }
            if (req.ImmediateAction is not null) entity.ImmediateAction = req.ImmediateAction.Trim();
            if (req.ImpactOnPreviousResults.HasValue) entity.ImpactOnPreviousResults = req.ImpactOnPreviousResults.Value;
            if (req.CustomerNotified.HasValue) entity.CustomerNotified = req.CustomerNotified.Value;
            if (req.RootCauseMethod is not null) entity.RootCauseMethod = req.RootCauseMethod.Trim();
            if (req.RootCause is not null) entity.RootCause = req.RootCause.Trim();
            if (req.CorrectiveAction is not null) entity.CorrectiveAction = req.CorrectiveAction.Trim();
            if (req.Responsible is not null) entity.Responsible = req.Responsible.Trim();
            if (req.DueDate.HasValue) entity.DueDate = req.DueDate;
            if (req.NewDueDate.HasValue) entity.NewDueDate = req.NewDueDate;
            if (req.EffectivenessCheck is not null) entity.EffectivenessCheck = req.EffectivenessCheck.Trim();
            if (req.EffectivenessResult is not null) entity.EffectivenessResult = req.EffectivenessResult.Trim();
            if (req.ClosedAt.HasValue) entity.ClosedAt = req.ClosedAt;
            if (req.Probability.HasValue) entity.Probability = req.Probability;
            if (req.Impact.HasValue) entity.Impact = req.Impact;
            if (req.Controls is not null) entity.Controls = req.Controls.Trim();
            if (req.ResidualLevel.HasValue) entity.ResidualLevel = req.ResidualLevel;
            if (req.EvidenceFileId.HasValue) entity.EvidenceFileId = req.EvidenceFileId;
            if (req.Notes is not null) entity.Notes = req.Notes.Trim();

            if (entity.Probability.HasValue && entity.Impact.HasValue)
                entity.Level = entity.Probability.Value * entity.Impact.Value;

            if (req.Status is not null)
            {
                var st = req.Status.Trim();
                var allowed = new HashSet<string>(StringComparer.Ordinal)
                {
                    QualityNonConformityStatuses.Open,
                    QualityNonConformityStatuses.InAnalysis,
                    QualityNonConformityStatuses.ActionPending,
                    QualityNonConformityStatuses.EffectivenessCheck,
                    QualityNonConformityStatuses.Closed,
                    QualityNonConformityStatuses.Cancelled
                };
                if (!allowed.Contains(st))
                    return Results.BadRequest(new { message = "Estado no válido." });
                entity.Status = st;
                if (st == QualityNonConformityStatuses.Closed)
                    entity.ClosedAt ??= DateTime.UtcNow;
            }

            entity.UpdatedAtUtc = DateTime.UtcNow;
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.NonConformity, entity.Id, "NonConformityUpdated",
                $"{entity.Number} actualizado ({entity.Status}).", before, ToNonConformityDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToNonConformityDto(entity));
        });

        group.MapDelete("/records/pg07-r01/{id:guid}", async (
            Guid id,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.NonConformities.FirstOrDefaultAsync(n => n.Id == id && n.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();
            var before = ToNonConformityDto(entity);
            entity.Status = QualityNonConformityStatuses.Cancelled;
            entity.UpdatedAtUtc = DateTime.UtcNow;
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.NonConformity, entity.Id, "NonConformityCancelled",
                $"{entity.Number} anulado.", before, ToNonConformityDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToNonConformityDto(entity));
        });

        // PG04 — Auditorías internas (programa / plan / informe / checklist unificados)
        group.MapGet("/records/pg04", async (ITenantContext tenant, QualityDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);
            var rows = await db.InternalAudits.AsNoTracking()
                .Where(a => a.TenantId == tenantId)
                .OrderByDescending(a => a.ProgramYear)
                .ThenByDescending(a => a.PlannedDate)
                .ThenByDescending(a => a.Number)
                .ToListAsync(ct);
            var openCount = rows.Count(a => a.Status is QualityInternalAuditStatuses.Planned
                or QualityInternalAuditStatuses.InProgress
                or QualityInternalAuditStatuses.Reported);
            return Results.Ok(new
            {
                code = "PG04",
                title = "Auditorías internas",
                recordKind = "Structured",
                generatedAtUtc = DateTime.UtcNow,
                openCount,
                rows = rows.Select(ToInternalAuditDto)
            });
        });

        group.MapGet("/records/pg04/{id:guid}", async (Guid id, ITenantContext tenant, QualityDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.InternalAudits.AsNoTracking()
                .FirstOrDefaultAsync(a => a.Id == id && a.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();
            return Results.Ok(ToInternalAuditDto(entity));
        });

        group.MapPost("/records/pg04", async (
            CreateInternalAuditRequest req,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);

            var year = req.ProgramYear > 2000 ? req.ProgramYear : DateTime.UtcNow.Year;
            var planned = req.PlannedDate ?? DateTime.UtcNow;
            if (string.IsNullOrWhiteSpace(req.Scope))
                return Results.BadRequest(new { message = "El alcance es obligatorio." });
            if (string.IsNullOrWhiteSpace(req.Auditor))
                return Results.BadRequest(new { message = "El auditor es obligatorio." });

            var prefix = $"AUD-{year}-";
            var lastNumber = await db.InternalAudits.AsNoTracking()
                .Where(a => a.TenantId == tenantId && a.Number.StartsWith(prefix))
                .OrderByDescending(a => a.Number)
                .Select(a => a.Number)
                .FirstOrDefaultAsync(ct);
            var seq = 1;
            if (!string.IsNullOrEmpty(lastNumber) && lastNumber.Length >= prefix.Length + 4
                && int.TryParse(lastNumber.AsSpan(prefix.Length), out var parsed))
            {
                seq = parsed + 1;
            }

            var entity = new QualityInternalAudit
            {
                TenantId = tenantId,
                RecordCode = "PG04-R01",
                Number = $"{prefix}{seq:D4}",
                ProgramYear = year,
                PlannedDate = planned,
                Scope = req.Scope.Trim(),
                Clauses = req.Clauses?.Trim() ?? string.Empty,
                Auditor = req.Auditor.Trim(),
                Auditee = req.Auditee?.Trim() ?? string.Empty,
                Objectives = req.Objectives?.Trim() ?? string.Empty,
                Notes = req.Notes?.Trim() ?? string.Empty,
                Status = QualityInternalAuditStatuses.Planned,
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow
            };

            db.InternalAudits.Add(entity);
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.InternalAudit, entity.Id, "InternalAuditCreated",
                $"Auditoría {entity.Number} programada.", null, ToInternalAuditDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/quality/records/pg04/{entity.Id}", ToInternalAuditDto(entity));
        });

        group.MapPut("/records/pg04/{id:guid}", async (
            Guid id,
            UpdateInternalAuditRequest req,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.InternalAudits.FirstOrDefaultAsync(a => a.Id == id && a.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();
            if (entity.Status is QualityInternalAuditStatuses.Closed or QualityInternalAuditStatuses.Cancelled)
                return Results.BadRequest(new { message = "La auditoría está cerrada; no se puede editar." });

            var before = ToInternalAuditDto(entity);

            if (req.ProgramYear.HasValue && req.ProgramYear.Value > 2000)
                entity.ProgramYear = req.ProgramYear.Value;
            if (req.PlannedDate.HasValue) entity.PlannedDate = req.PlannedDate.Value;
            if (req.ExecutedDate.HasValue) entity.ExecutedDate = req.ExecutedDate;
            if (req.Scope is not null)
            {
                if (string.IsNullOrWhiteSpace(req.Scope))
                    return Results.BadRequest(new { message = "El alcance no puede quedar vacío." });
                entity.Scope = req.Scope.Trim();
            }
            if (req.Clauses is not null) entity.Clauses = req.Clauses.Trim();
            if (req.Auditor is not null)
            {
                if (string.IsNullOrWhiteSpace(req.Auditor))
                    return Results.BadRequest(new { message = "El auditor no puede quedar vacío." });
                entity.Auditor = req.Auditor.Trim();
            }
            if (req.Auditee is not null) entity.Auditee = req.Auditee.Trim();
            if (req.Objectives is not null) entity.Objectives = req.Objectives.Trim();
            if (req.FindingsSummary is not null) entity.FindingsSummary = req.FindingsSummary.Trim();
            if (req.Conclusions is not null) entity.Conclusions = req.Conclusions.Trim();
            if (req.Recommendations is not null) entity.Recommendations = req.Recommendations.Trim();
            if (req.ChecklistNotes is not null) entity.ChecklistNotes = req.ChecklistNotes.Trim();
            if (req.Notes is not null) entity.Notes = req.Notes.Trim();

            async Task<IResult?> ValidateFileAsync(Guid? fileId)
            {
                if (!fileId.HasValue) return null;
                var ok = await db.Files.AsNoTracking()
                    .AnyAsync(f => f.TenantId == tenantId && f.Id == fileId.Value, ct);
                return ok ? null : Results.BadRequest(new { message = "El archivo adjunto no existe." });
            }

            if (req.PlanFileId.HasValue)
            {
                var err = await ValidateFileAsync(req.PlanFileId);
                if (err is not null) return err;
                entity.PlanFileId = req.PlanFileId;
            }
            if (req.ReportFileId.HasValue)
            {
                var err = await ValidateFileAsync(req.ReportFileId);
                if (err is not null) return err;
                entity.ReportFileId = req.ReportFileId;
            }
            if (req.ChecklistFileId.HasValue)
            {
                var err = await ValidateFileAsync(req.ChecklistFileId);
                if (err is not null) return err;
                entity.ChecklistFileId = req.ChecklistFileId;
            }

            if (req.Status is not null)
            {
                var st = req.Status.Trim();
                var allowed = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                {
                    QualityInternalAuditStatuses.Planned,
                    QualityInternalAuditStatuses.InProgress,
                    QualityInternalAuditStatuses.Reported,
                    QualityInternalAuditStatuses.Closed,
                    QualityInternalAuditStatuses.Cancelled
                };
                if (!allowed.Contains(st))
                    return Results.BadRequest(new { message = "Estado inválido." });

                if (st == QualityInternalAuditStatuses.Reported)
                {
                    entity.ExecutedDate ??= DateTime.UtcNow;
                    if (string.IsNullOrWhiteSpace(entity.FindingsSummary) && string.IsNullOrWhiteSpace(req.FindingsSummary))
                        return Results.BadRequest(new { message = "Indique el resumen de hallazgos antes de informar." });
                }

                if (st == QualityInternalAuditStatuses.Closed)
                {
                    entity.ExecutedDate ??= DateTime.UtcNow;
                    if (string.IsNullOrWhiteSpace(entity.Conclusions) && string.IsNullOrWhiteSpace(req.Conclusions))
                        return Results.BadRequest(new { message = "Indique las conclusiones antes de cerrar." });
                }

                entity.Status = st;
            }

            entity.UpdatedAtUtc = DateTime.UtcNow;
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.InternalAudit, entity.Id, "InternalAuditUpdated",
                $"Auditoría {entity.Number} actualizada ({entity.Status}).", before, ToInternalAuditDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToInternalAuditDto(entity));
        });

        group.MapDelete("/records/pg04/{id:guid}", async (
            Guid id,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.InternalAudits.FirstOrDefaultAsync(a => a.Id == id && a.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();
            var before = ToInternalAuditDto(entity);
            entity.Status = QualityInternalAuditStatuses.Cancelled;
            entity.UpdatedAtUtc = DateTime.UtcNow;
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.InternalAudit, entity.Id, "InternalAuditCancelled",
                $"Auditoría {entity.Number} anulada.", before, ToInternalAuditDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToInternalAuditDto(entity));
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
            var versionNumber = req.VersionNumber ?? 1;
            var markCurrent = req.MarkCurrent || !string.IsNullOrWhiteSpace(req.ApprovedBy);
            var status = markCurrent ? QualityDocumentStatuses.Current : QualityDocumentStatuses.Draft;
            var reviewMonths = req.ReviewPeriodMonths ?? (req.Type == QualityDocumentTypes.External ? 12 : 24);

            var doc = new QualityDocument(id)
            {
                TenantId = tenantId,
                Code = code,
                DisplayCode = string.IsNullOrWhiteSpace(req.DisplayCode) ? code : req.DisplayCode.Trim(),
                Type = req.Type ?? QualityDocumentTypes.Procedure,
                Title = req.Title.Trim(),
                ParentId = req.ParentId,
                SortOrder = req.SortOrder,
                Status = status,
                CurrentVersionId = versionId,
                ReviewPeriodMonths = reviewMonths,
                NextReviewDate = DateTime.UtcNow.AddMonths(reviewMonths),
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
                Version = versionNumber,
                Status = status,
                ChangeSummary = req.ChangeSummary ?? "Alta inicial",
                ElaboratedBy = req.ElaboratedBy ?? string.Empty,
                ElaboratedAt = req.ElaboratedAt,
                ReviewedBy = req.ReviewedBy,
                ReviewedAt = req.ReviewedAt ?? (markCurrent && !string.IsNullOrWhiteSpace(req.ReviewedBy) ? DateTime.UtcNow : null),
                ApprovedBy = req.ApprovedBy,
                ApprovedAt = req.ApprovedAt ?? (markCurrent && !string.IsNullOrWhiteSpace(req.ApprovedBy) ? DateTime.UtcNow : null),
                EffectiveFrom = req.EffectiveFrom ?? (markCurrent ? req.ApprovedAt ?? DateTime.UtcNow : null),
                PublishedFileId = req.PublishedFileId,
                SourceFileId = req.SourceFileId,
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

            if (!doc.CurrentVersionId.HasValue)
            {
                doc.CurrentVersionId = version.Id;
                doc.Status = QualityDocumentStatuses.Draft;
            }
            doc.UpdatedAtUtc = DateTime.UtcNow;

            db.DocumentVersions.Add(version);
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.DocumentVersion, version.Id, "VersionCreated", $"Borrador v{version.Version} creado.", null, ToVersionDto(version), http);
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

            if (ver.Status is not (QualityDocumentStatuses.Draft or QualityDocumentStatuses.InReview))
            {
                return Results.BadRequest(new { message = "Solo se pueden aprobar versiones en borrador o revision." });
            }

            if (doc.Type != QualityDocumentTypes.External && ver.PublishedFileId is null)
            {
                return Results.BadRequest(new { message = "La versión vigente debe tener PDF publicado (PublishedFileId)." });
            }

            // Aplicar ReviewedBy del body ANTES de validar elaborador ≠ revisor (PG01).
            var beforeApproval = ToVersionDto(ver);
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

            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.DocumentVersion, ver.Id, "VersionApproved", $"Version v{ver.Version} aprobada y vigente.", beforeApproval, ToVersionDto(ver), http);
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
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var normalized = NormalizeCode(code);
            var doc = await db.Documents.FirstOrDefaultAsync(d => d.TenantId == tenantId && d.Code == normalized, ct);
            if (doc is null) return Results.NotFound();

            var ver = await db.DocumentVersions.FirstOrDefaultAsync(
                v => v.TenantId == tenantId && v.DocumentId == doc.Id && v.Version == version, ct);
            if (ver is null) return Results.NotFound();

            if (ver.Status is not (QualityDocumentStatuses.Draft or QualityDocumentStatuses.InReview))
            {
                return Results.BadRequest(new { message = "La version aprobada o vigente no puede modificar sus archivos. Cree una nueva version." });
            }

            var beforeAttachment = ToVersionDto(ver);
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
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.DocumentVersion, ver.Id, "VersionFileAttached", $"Archivo {file.FileName} asociado a v{ver.Version}.", beforeAttachment, ToVersionDto(ver), http);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToVersionDto(ver));
        });

        group.MapMethods("/documents/{code}/versions/{version:int}", new[] { "PATCH" }, async (
            string code,
            int version,
            UpdateVersionRequest req,
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

            if (ver.Status is not (QualityDocumentStatuses.Draft or QualityDocumentStatuses.InReview))
            {
                return Results.BadRequest(new { message = "La version aprobada o vigente no puede editarse. Cree una nueva version." });
            }

            var beforeUpdate = ToVersionDto(ver);
            if (req.ChangeSummary is not null) ver.ChangeSummary = req.ChangeSummary;
            if (req.ElaboratedBy is not null) ver.ElaboratedBy = req.ElaboratedBy.Trim();
            if (req.ElaboratedAt.HasValue) ver.ElaboratedAt = req.ElaboratedAt;
            if (req.ReviewedBy is not null) ver.ReviewedBy = req.ReviewedBy.Trim();
            if (req.ReviewedAt.HasValue) ver.ReviewedAt = req.ReviewedAt;
            if (req.ApprovedBy is not null) ver.ApprovedBy = req.ApprovedBy.Trim();
            if (req.ApprovedAt.HasValue) ver.ApprovedAt = req.ApprovedAt;
            if (req.EffectiveFrom.HasValue) ver.EffectiveFrom = req.EffectiveFrom;

            doc.UpdatedAtUtc = DateTime.UtcNow;
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.DocumentVersion, ver.Id, "VersionMetadataUpdated", $"Metadatos de v{ver.Version} actualizados.", beforeUpdate, ToVersionDto(ver), http);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToVersionDto(ver));
        });

        group.MapGet("/audit/{entityType}/{entityId:guid}", async (
            string entityType,
            Guid entityId,
            ITenantContext tenant,
            QualityDbContext db,
            CancellationToken ct) =>
        {
            await db.EnsureQualityTablesAsync(ct);
            var rows = await db.AuditEvents.AsNoTracking()
                .Where(e => e.TenantId == tenant.TenantId
                    && e.EntityType == entityType
                    && e.EntityId == entityId)
                .OrderByDescending(e => e.OccurredAtUtc)
                .Take(250)
                .ToListAsync(ct);

            return Results.Ok(new
            {
                entityType,
                entityId,
                rows = rows.Select(e => new
                {
                    e.Id,
                    e.EventType,
                    e.Summary,
                    e.BeforeJson,
                    e.AfterJson,
                    e.PerformedByUserId,
                    e.PerformedByName,
                    e.OccurredAtUtc
                })
            });
        }).RequireAuthorization("RequireQuality");
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

    private static object ToInstitutionalNoteDto(QualityInstitutionalNote n) => new
    {
        n.Id,
        n.RecordCode,
        n.Subject,
        n.Body,
        n.IssuedBy,
        n.Audience,
        n.IssuedAt,
        n.FileId,
        n.Notes,
        n.Status,
        n.CreatedAtUtc,
        n.UpdatedAtUtc
    };

    private static bool IsComplaintOverdue(QualityComplaint c)
    {
        if (c.Status is QualityComplaintStatuses.Closed or QualityComplaintStatuses.Invalid or QualityComplaintStatuses.Cancelled)
            return false;
        var now = DateTime.UtcNow;
        return c.Status switch
        {
            QualityComplaintStatuses.Open => now > c.RegisterDueAt,
            QualityComplaintStatuses.UnderValidation => now > c.ValidateDueAt,
            QualityComplaintStatuses.Investigating => now > c.InvestigateDueAt,
            QualityComplaintStatuses.PendingCommunication => now > c.CloseDueAt,
            _ => now > c.CloseDueAt
        };
    }

    private static DateTime? ComplaintCurrentDue(QualityComplaint c) => c.Status switch
    {
        QualityComplaintStatuses.Open => c.RegisterDueAt,
        QualityComplaintStatuses.UnderValidation => c.ValidateDueAt,
        QualityComplaintStatuses.Investigating => c.InvestigateDueAt,
        QualityComplaintStatuses.PendingCommunication => c.CloseDueAt,
        _ => null
    };

    private static object ToComplaintDto(QualityComplaint c)
    {
        var overdue = IsComplaintOverdue(c);
        DateTime? currentDue = ComplaintCurrentDue(c);

        return new
        {
            c.Id,
            c.RecordCode,
            c.Number,
            c.ReceivedAt,
            c.Channel,
            c.PartyName,
            c.PartyContact,
            c.Description,
            c.IsValid,
            c.ValidatedAt,
            c.ValidationNotes,
            c.Investigation,
            c.Actions,
            c.Responsible,
            c.CommunicatedAt,
            c.ClosedAt,
            c.LinkedNonConformityId,
            c.EvidenceFileId,
            c.Notes,
            c.Status,
            c.RegisterDueAt,
            c.ValidateDueAt,
            c.InvestigateDueAt,
            c.CloseDueAt,
            currentDueAt = currentDue,
            isOverdue = overdue,
            c.CreatedAtUtc,
            c.UpdatedAtUtc
        };
    }

    private static bool IsValidNcKind(string kind) =>
        kind is QualityNonConformityKinds.NonConformity
            or QualityNonConformityKinds.NonConformingWork
            or QualityNonConformityKinds.Risk
            or QualityNonConformityKinds.Opportunity;

    private static string NcNumberPrefix(string kind) => kind switch
    {
        QualityNonConformityKinds.NonConformingWork => "TNC",
        QualityNonConformityKinds.Risk => "R",
        QualityNonConformityKinds.Opportunity => "OM",
        _ => "NC"
    };

    private static bool IsNonConformityOverdue(QualityNonConformity n)
    {
        if (n.Status is QualityNonConformityStatuses.Closed or QualityNonConformityStatuses.Cancelled)
            return false;
        var due = n.NewDueDate ?? n.DueDate;
        return due.HasValue && DateTime.UtcNow > due.Value;
    }

    private static object ToNonConformityDto(QualityNonConformity n) => new
    {
        n.Id,
        n.RecordCode,
        n.Number,
        n.Kind,
        n.Origin,
        n.DetectedAt,
        n.Description,
        n.ImmediateAction,
        n.ImpactOnPreviousResults,
        n.CustomerNotified,
        n.RootCauseMethod,
        n.RootCause,
        n.CorrectiveAction,
        n.Responsible,
        n.DueDate,
        n.NewDueDate,
        n.EffectivenessCheck,
        n.EffectivenessResult,
        n.ClosedAt,
        n.Status,
        n.Probability,
        n.Impact,
        n.Level,
        n.Controls,
        n.ResidualLevel,
        n.SourceComplaintId,
        n.EvidenceFileId,
        n.Notes,
        effectiveDueAt = n.NewDueDate ?? n.DueDate,
        isOverdue = IsNonConformityOverdue(n),
        n.CreatedAtUtc,
        n.UpdatedAtUtc
    };

    private static object ToInternalAuditDto(QualityInternalAudit a) => new
    {
        a.Id,
        a.RecordCode,
        a.Number,
        a.ProgramYear,
        a.PlannedDate,
        a.ExecutedDate,
        a.Scope,
        a.Clauses,
        a.Auditor,
        a.Auditee,
        a.Objectives,
        a.FindingsSummary,
        a.Conclusions,
        a.Recommendations,
        a.ChecklistNotes,
        a.PlanFileId,
        a.ReportFileId,
        a.ChecklistFileId,
        a.Status,
        a.Notes,
        a.CreatedAtUtc,
        a.UpdatedAtUtc
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
    DateTime? ElaboratedAt = null,
    string? ReviewedBy = null,
    DateTime? ReviewedAt = null,
    string? ApprovedBy = null,
    DateTime? ApprovedAt = null,
    DateTime? EffectiveFrom = null,
    Guid? PublishedFileId = null,
    Guid? SourceFileId = null,
    int? VersionNumber = null,
    bool MarkCurrent = false);

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

/// <summary>Autorizaciones PG06-R02 reales; DT se valida por claim JWT (policy RequireTechnicalDirector).</summary>
public sealed class QualityAuthorizationGateway(QualityDbContext db) : IQualityAuthorizationGateway
{
    public async Task<bool> IsAuthorizedAsync(
        Guid tenantId,
        Guid userId,
        string methodDocumentCode,
        DateTime asOfUtc,
        CancellationToken cancellationToken = default)
    {
        var tid = new TenantId(tenantId);
        var code = NormalizeMethod(methodDocumentCode);
        if (string.IsNullOrEmpty(code))
            return false;

        await db.EnsureQualityTablesAsync(cancellationToken);

        var rows = await db.PersonnelAuthorizations.AsNoTracking()
            .Where(a => a.TenantId == tid
                        && a.UserId == userId
                        && a.Status == QualityAuthorizationStatuses.Authorized)
            .ToListAsync(cancellationToken);

        return rows.Any(a =>
        {
            var method = NormalizeMethod(a.MethodDocumentCode);
            if (!string.Equals(method, code, StringComparison.OrdinalIgnoreCase))
                return false;
            if (a.AuthorizedAt.HasValue && a.AuthorizedAt.Value > asOfUtc)
                return false;
            if (a.ValidUntil.HasValue && a.ValidUntil.Value < asOfUtc)
                return false;
            return true;
        });
    }

    public Task<bool> IsTechnicalDirectorAsync(
        Guid tenantId,
        Guid userId,
        CancellationToken cancellationToken = default)
        // El flag vive en CRM (JWT claim technical_director). Esta consulta no cruza módulos.
        => Task.FromResult(false);

    private static string NormalizeMethod(string code) =>
        string.IsNullOrWhiteSpace(code)
            ? string.Empty
            : new string(code.Trim().ToUpperInvariant().Where(ch => !char.IsWhiteSpace(ch)).ToArray())
                .Replace('_', '-');
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
