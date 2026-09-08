using System.Security.Claims;
using LealControl.BuildingBlocks.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Quality.Infrastructure;

internal static class QualityPg06Endpoints
{
    public static RouteGroupBuilder MapPg06Records(this RouteGroupBuilder group)
    {
        // ─── PG06 summary ────────────────────────────────────────────────────
        group.MapGet("/records/pg06", async (ITenantContext tenant, QualityDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);

            var now = DateTime.UtcNow;
            var soon = now.AddDays(60);

            var trainings = await db.TrainingPlanItems.AsNoTracking()
                .Where(t => t.TenantId == tenantId)
                .Select(t => t.Status)
                .ToListAsync(ct);
            var auths = await db.PersonnelAuthorizations.AsNoTracking()
                .Where(a => a.TenantId == tenantId)
                .Select(a => new { a.Status, a.ValidUntil })
                .ToListAsync(ct);
            var comps = await db.CompetenceReviews.AsNoTracking()
                .Where(c => c.TenantId == tenantId)
                .Select(c => c.Status)
                .ToListAsync(ct);
            var roles = await db.RoleAssignments.AsNoTracking()
                .Where(r => r.TenantId == tenantId)
                .Select(r => r.Status)
                .ToListAsync(ct);

            return Results.Ok(new
            {
                code = "PG06",
                title = "Gestión de personal",
                recordKind = QualityRecordKinds.Structured,
                generatedAtUtc = now,
                trainingOpen = trainings.Count(s => s == QualityTrainingStatuses.Planned),
                authorizationsExpiringSoon = auths.Count(a =>
                    a.Status == QualityAuthorizationStatuses.Authorized
                    && a.ValidUntil.HasValue
                    && a.ValidUntil.Value >= now
                    && a.ValidUntil.Value <= soon),
                competenceDraft = comps.Count(s => s == QualityCompetenceStatuses.Draft),
                roleActive = roles.Count(s => s == QualityRoleAssignmentStatuses.Active),
                counts = new
                {
                    r01 = trainings.Count,
                    r02 = auths.Count,
                    r03 = comps.Count,
                    r04 = roles.Count
                }
            });
        });

        MapR01(group);
        MapR02(group);
        MapR03(group);
        MapR04(group);

        return group;
    }

    // ─── R01 training_plan_items ─────────────────────────────────────────────

    private static void MapR01(RouteGroupBuilder group)
    {
        group.MapGet("/records/pg06/r01", async (ITenantContext tenant, QualityDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);

            var rows = await db.TrainingPlanItems.AsNoTracking()
                .Where(t => t.TenantId == tenantId)
                .OrderByDescending(t => t.ProgramYear)
                .ThenByDescending(t => t.PlannedDate)
                .ThenByDescending(t => t.Number)
                .ToListAsync(ct);

            return Results.Ok(new
            {
                code = "PG06-R01",
                title = "Programa de capacitaciones",
                recordKind = QualityRecordKinds.Structured,
                generatedAtUtc = DateTime.UtcNow,
                openCount = rows.Count(t => t.Status == QualityTrainingStatuses.Planned),
                rows = rows.Select(ToTrainingPlanItemDto)
            });
        });

        group.MapGet("/records/pg06/r01/{id:guid}", async (
            Guid id,
            ITenantContext tenant,
            QualityDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.TrainingPlanItems.AsNoTracking()
                .FirstOrDefaultAsync(t => t.Id == id && t.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();
            return Results.Ok(ToTrainingPlanItemDto(entity));
        });

        group.MapPost("/records/pg06/r01", async (
            CreateTrainingPlanItemRequest req,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);

            if (string.IsNullOrWhiteSpace(req.Topic))
                return Results.BadRequest(new { message = "El tema de capacitación es obligatorio." });

            var year = req.ProgramYear > 2000 ? req.ProgramYear : DateTime.UtcNow.Year;
            var number = await NextNumberAsync(
                db.TrainingPlanItems.AsNoTracking()
                    .Where(t => t.TenantId == tenantId)
                    .Select(t => t.Number),
                $"CAP-{year}-",
                ct);

            var entity = new QualityTrainingPlanItem
            {
                TenantId = tenantId,
                RecordCode = "PG06-R01",
                Number = number,
                ProgramYear = year,
                Topic = req.Topic.Trim(),
                TargetRoles = req.TargetRoles?.Trim() ?? string.Empty,
                PlannedDate = req.PlannedDate ?? DateTime.UtcNow,
                Status = QualityTrainingStatuses.Planned,
                Notes = req.Notes?.Trim() ?? string.Empty,
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow
            };

            db.TrainingPlanItems.Add(entity);
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.TrainingPlanItem, entity.Id, "TrainingPlanItemCreated",
                $"Capacitación {entity.Number} planificada.", null, ToTrainingPlanItemDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/quality/records/pg06/r01/{entity.Id}", ToTrainingPlanItemDto(entity));
        });

        group.MapPut("/records/pg06/r01/{id:guid}", async (
            Guid id,
            UpdateTrainingPlanItemRequest req,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.TrainingPlanItems.FirstOrDefaultAsync(t => t.Id == id && t.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();
            if (entity.Status == QualityTrainingStatuses.Cancelled)
                return Results.BadRequest(new { message = "La capacitación está anulada; no se puede editar." });

            var before = ToTrainingPlanItemDto(entity);

            if (req.ProgramYear.HasValue)
            {
                if (req.ProgramYear.Value <= 2000)
                    return Results.BadRequest(new { message = "Año de programa no válido." });
                entity.ProgramYear = req.ProgramYear.Value;
            }
            if (req.Topic is not null)
            {
                if (string.IsNullOrWhiteSpace(req.Topic))
                    return Results.BadRequest(new { message = "El tema no puede quedar vacío." });
                entity.Topic = req.Topic.Trim();
            }
            if (req.TargetRoles is not null) entity.TargetRoles = req.TargetRoles.Trim();
            if (req.PlannedDate.HasValue) entity.PlannedDate = req.PlannedDate.Value;
            if (req.DoneDate.HasValue) entity.DoneDate = req.DoneDate;
            if (req.EffectivenessCheck is not null) entity.EffectivenessCheck = req.EffectivenessCheck.Trim();
            if (req.Notes is not null) entity.Notes = req.Notes.Trim();

            if (req.Status is not null)
            {
                var st = req.Status.Trim();
                var allowed = new HashSet<string>(StringComparer.Ordinal)
                {
                    QualityTrainingStatuses.Planned,
                    QualityTrainingStatuses.Done,
                    QualityTrainingStatuses.Cancelled
                };
                if (!allowed.Contains(st))
                    return Results.BadRequest(new { message = "Estado de capacitación no válido." });

                entity.Status = st;
                if (st == QualityTrainingStatuses.Done)
                {
                    entity.DoneDate ??= DateTime.UtcNow;
                    if (req.EffectivenessCheck is not null)
                        entity.EffectivenessCheck = req.EffectivenessCheck.Trim();
                }
            }
            else if (entity.Status == QualityTrainingStatuses.Done && req.DoneDate is null && entity.DoneDate is null)
            {
                entity.DoneDate = DateTime.UtcNow;
            }

            entity.UpdatedAtUtc = DateTime.UtcNow;
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.TrainingPlanItem, entity.Id, "TrainingPlanItemUpdated",
                $"Capacitación {entity.Number} actualizada ({entity.Status}).", before, ToTrainingPlanItemDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToTrainingPlanItemDto(entity));
        });

        group.MapDelete("/records/pg06/r01/{id:guid}", async (
            Guid id,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.TrainingPlanItems.FirstOrDefaultAsync(t => t.Id == id && t.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();
            var before = ToTrainingPlanItemDto(entity);
            entity.Status = QualityTrainingStatuses.Cancelled;
            entity.UpdatedAtUtc = DateTime.UtcNow;
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.TrainingPlanItem, entity.Id, "TrainingPlanItemCancelled",
                $"Capacitación {entity.Number} anulada.", before, ToTrainingPlanItemDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToTrainingPlanItemDto(entity));
        });
    }

    // ─── R02 personnel_authorizations ────────────────────────────────────────

    private static void MapR02(RouteGroupBuilder group)
    {
        group.MapGet("/records/pg06/r02", async (ITenantContext tenant, QualityDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);

            var rows = await db.PersonnelAuthorizations.AsNoTracking()
                .Where(a => a.TenantId == tenantId)
                .OrderByDescending(a => a.CreatedAtUtc)
                .ThenByDescending(a => a.Number)
                .ToListAsync(ct);

            var now = DateTime.UtcNow;
            return Results.Ok(new
            {
                code = "PG06-R02",
                title = "Entrenamiento y autorización del personal",
                recordKind = QualityRecordKinds.Structured,
                generatedAtUtc = now,
                authorizedCount = rows.Count(a => a.Status == QualityAuthorizationStatuses.Authorized),
                expiringSoon = rows.Count(a =>
                    a.Status == QualityAuthorizationStatuses.Authorized
                    && a.ValidUntil.HasValue
                    && a.ValidUntil.Value >= now
                    && a.ValidUntil.Value <= now.AddDays(60)),
                rows = rows.Select(ToPersonnelAuthorizationDto)
            });
        });

        group.MapGet("/records/pg06/r02/{id:guid}", async (
            Guid id,
            ITenantContext tenant,
            QualityDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.PersonnelAuthorizations.AsNoTracking()
                .FirstOrDefaultAsync(a => a.Id == id && a.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();
            return Results.Ok(ToPersonnelAuthorizationDto(entity));
        });

        group.MapPost("/records/pg06/r02", async (
            CreatePersonnelAuthorizationRequest req,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);

            if (req.UserId == Guid.Empty)
                return Results.BadRequest(new { message = "El usuario es obligatorio." });
            if (string.IsNullOrWhiteSpace(req.PersonName))
                return Results.BadRequest(new { message = "El nombre de la persona es obligatorio." });
            if (string.IsNullOrWhiteSpace(req.MethodDocumentCode))
                return Results.BadRequest(new { message = "El código del método/instructivo es obligatorio." });

            if (req.EvidenceFileId.HasValue)
            {
                var fileOk = await db.Files.AsNoTracking()
                    .AnyAsync(f => f.TenantId == tenantId && f.Id == req.EvidenceFileId.Value, ct);
                if (!fileOk)
                    return Results.BadRequest(new { message = "El archivo de evidencia no existe." });
            }

            var year = DateTime.UtcNow.Year;
            var number = await NextNumberAsync(
                db.PersonnelAuthorizations.AsNoTracking()
                    .Where(a => a.TenantId == tenantId)
                    .Select(a => a.Number),
                $"AUT-{year}-",
                ct);

            var entity = new QualityPersonnelAuthorization
            {
                TenantId = tenantId,
                RecordCode = "PG06-R02",
                Number = number,
                UserId = req.UserId,
                PersonName = req.PersonName.Trim(),
                MethodDocumentCode = NormalizeMethodCode(req.MethodDocumentCode),
                MethodTitle = req.MethodTitle?.Trim() ?? string.Empty,
                TrainingEvidence = req.TrainingEvidence?.Trim() ?? string.Empty,
                SupervisedBy = req.SupervisedBy?.Trim() ?? string.Empty,
                ValidUntil = req.ValidUntil,
                EvidenceFileId = req.EvidenceFileId,
                Status = QualityAuthorizationStatuses.Draft,
                Notes = req.Notes?.Trim() ?? string.Empty,
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow
            };

            db.PersonnelAuthorizations.Add(entity);
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.PersonnelAuthorization, entity.Id, "PersonnelAuthorizationCreated",
                $"Autorización {entity.Number} creada (borrador).", null, ToPersonnelAuthorizationDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/quality/records/pg06/r02/{entity.Id}", ToPersonnelAuthorizationDto(entity));
        });

        group.MapPut("/records/pg06/r02/{id:guid}", async (
            Guid id,
            UpdatePersonnelAuthorizationRequest req,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.PersonnelAuthorizations.FirstOrDefaultAsync(a => a.Id == id && a.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();
            if (entity.Status == QualityAuthorizationStatuses.Cancelled)
                return Results.BadRequest(new { message = "La autorización está anulada; no se puede editar." });

            var before = ToPersonnelAuthorizationDto(entity);
            var isAuthorized = entity.Status == QualityAuthorizationStatuses.Authorized;

            if (isAuthorized)
            {
                // Actualizaciones limitadas: evidencia de entrenamiento, vigencia, suspensión.
                if (req.TrainingEvidence is not null) entity.TrainingEvidence = req.TrainingEvidence.Trim();
                if (req.ValidUntil.HasValue) entity.ValidUntil = req.ValidUntil;
                if (req.Notes is not null) entity.Notes = req.Notes.Trim();
                if (req.Status is not null)
                {
                    var st = req.Status.Trim();
                    if (st != QualityAuthorizationStatuses.Suspended && st != QualityAuthorizationStatuses.Authorized)
                        return Results.BadRequest(new { message = "En estado Authorized solo se puede suspender." });
                    entity.Status = st;
                }

                if (req.PersonName is not null
                    || req.MethodDocumentCode is not null
                    || req.MethodTitle is not null
                    || req.SupervisedBy is not null
                    || req.EvidenceFileId.HasValue)
                {
                    return Results.BadRequest(new
                    {
                        message = "Autorización vigente: solo se pueden actualizar evidencia de entrenamiento, vigencia o suspender."
                    });
                }
            }
            else
            {
                if (req.PersonName is not null)
                {
                    if (string.IsNullOrWhiteSpace(req.PersonName))
                        return Results.BadRequest(new { message = "El nombre no puede quedar vacío." });
                    entity.PersonName = req.PersonName.Trim();
                }
                if (req.MethodDocumentCode is not null)
                {
                    if (string.IsNullOrWhiteSpace(req.MethodDocumentCode))
                        return Results.BadRequest(new { message = "El código del método no puede quedar vacío." });
                    entity.MethodDocumentCode = NormalizeMethodCode(req.MethodDocumentCode);
                }
                if (req.MethodTitle is not null) entity.MethodTitle = req.MethodTitle.Trim();
                if (req.TrainingEvidence is not null) entity.TrainingEvidence = req.TrainingEvidence.Trim();
                if (req.SupervisedBy is not null) entity.SupervisedBy = req.SupervisedBy.Trim();
                if (req.ValidUntil.HasValue) entity.ValidUntil = req.ValidUntil;
                if (req.EvidenceFileId.HasValue)
                {
                    var fileOk = await db.Files.AsNoTracking()
                        .AnyAsync(f => f.TenantId == tenantId && f.Id == req.EvidenceFileId.Value, ct);
                    if (!fileOk)
                        return Results.BadRequest(new { message = "El archivo de evidencia no existe." });
                    entity.EvidenceFileId = req.EvidenceFileId;
                }
                if (req.Notes is not null) entity.Notes = req.Notes.Trim();
                if (req.Status is not null)
                {
                    var st = req.Status.Trim();
                    var allowed = new HashSet<string>(StringComparer.Ordinal)
                    {
                        QualityAuthorizationStatuses.Draft,
                        QualityAuthorizationStatuses.Suspended,
                        QualityAuthorizationStatuses.Cancelled
                    };
                    if (!allowed.Contains(st))
                        return Results.BadRequest(new { message = "Use POST .../authorize para autorizar; estado no válido en PUT." });
                    entity.Status = st;
                }
            }

            entity.UpdatedAtUtc = DateTime.UtcNow;
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.PersonnelAuthorization, entity.Id, "PersonnelAuthorizationUpdated",
                $"Autorización {entity.Number} actualizada ({entity.Status}).", before, ToPersonnelAuthorizationDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToPersonnelAuthorizationDto(entity));
        });

        group.MapPost("/records/pg06/r02/{id:guid}/authorize", async (
            Guid id,
            AuthorizePersonnelRequest req,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);

            var entity = await db.PersonnelAuthorizations.FirstOrDefaultAsync(a => a.Id == id && a.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();

            if (entity.Status is not (QualityAuthorizationStatuses.Draft or QualityAuthorizationStatuses.Suspended))
                return Results.BadRequest(new { message = "Solo se pueden autorizar registros en Draft o Suspended." });

            var before = ToPersonnelAuthorizationDto(entity);

            if (!Guid.TryParse(http.User.FindFirst("sub")?.Value, out var authUserId))
                return Results.BadRequest(new { message = "No se pudo determinar el Director Técnico (claim sub)." });

            var authName = http.User.FindFirst("name")?.Value
                ?? http.User.FindFirst(ClaimTypes.Name)?.Value
                ?? string.Empty;

            entity.AuthorizedByUserId = authUserId;
            entity.AuthorizedByName = authName;
            entity.AuthorizedAt = req.AuthorizedAt ?? DateTime.UtcNow;
            if (req.ValidUntil.HasValue)
                entity.ValidUntil = req.ValidUntil;
            if (req.Notes is not null)
                entity.Notes = req.Notes.Trim();
            entity.Status = QualityAuthorizationStatuses.Authorized;
            entity.UpdatedAtUtc = DateTime.UtcNow;

            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.PersonnelAuthorization, entity.Id, "PersonnelAuthorized",
                $"Autorización {entity.Number} firmada por DT.", before, ToPersonnelAuthorizationDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToPersonnelAuthorizationDto(entity));
        }).RequireAuthorization("RequireTechnicalDirector");

        group.MapDelete("/records/pg06/r02/{id:guid}", async (
            Guid id,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.PersonnelAuthorizations.FirstOrDefaultAsync(a => a.Id == id && a.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();
            var before = ToPersonnelAuthorizationDto(entity);
            entity.Status = QualityAuthorizationStatuses.Cancelled;
            entity.UpdatedAtUtc = DateTime.UtcNow;
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.PersonnelAuthorization, entity.Id, "PersonnelAuthorizationCancelled",
                $"Autorización {entity.Number} anulada.", before, ToPersonnelAuthorizationDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToPersonnelAuthorizationDto(entity));
        });
    }

    // ─── R03 competence_reviews ──────────────────────────────────────────────

    private static void MapR03(RouteGroupBuilder group)
    {
        group.MapGet("/records/pg06/r03", async (ITenantContext tenant, QualityDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);

            var rows = await db.CompetenceReviews.AsNoTracking()
                .Where(c => c.TenantId == tenantId)
                .OrderByDescending(c => c.ReviewYear)
                .ThenByDescending(c => c.Number)
                .ToListAsync(ct);

            return Results.Ok(new
            {
                code = "PG06-R03",
                title = "Seguimiento de las competencias técnicas y personales",
                recordKind = QualityRecordKinds.Structured,
                generatedAtUtc = DateTime.UtcNow,
                draftCount = rows.Count(c => c.Status == QualityCompetenceStatuses.Draft),
                rows = rows.Select(ToCompetenceReviewDto)
            });
        });

        group.MapGet("/records/pg06/r03/{id:guid}", async (
            Guid id,
            ITenantContext tenant,
            QualityDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.CompetenceReviews.AsNoTracking()
                .FirstOrDefaultAsync(c => c.Id == id && c.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();
            return Results.Ok(ToCompetenceReviewDto(entity));
        });

        group.MapPost("/records/pg06/r03", async (
            CreateCompetenceReviewRequest req,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);

            if (req.UserId == Guid.Empty)
                return Results.BadRequest(new { message = "El usuario es obligatorio." });
            if (string.IsNullOrWhiteSpace(req.PersonName))
                return Results.BadRequest(new { message = "El nombre de la persona es obligatorio." });

            var year = req.ReviewYear > 2000 ? req.ReviewYear : DateTime.UtcNow.Year;
            if (req.TechnicalScore is int ts && (ts < 1 || ts > 5))
                return Results.BadRequest(new { message = "Puntaje técnico debe estar entre 1 y 5." });
            if (req.PersonalScore is int ps && (ps < 1 || ps > 5))
                return Results.BadRequest(new { message = "Puntaje personal debe estar entre 1 y 5." });

            var number = await NextNumberAsync(
                db.CompetenceReviews.AsNoTracking()
                    .Where(c => c.TenantId == tenantId)
                    .Select(c => c.Number),
                $"COMP-{year}-",
                ct);

            var entity = new QualityCompetenceReview
            {
                TenantId = tenantId,
                RecordCode = "PG06-R03",
                Number = number,
                UserId = req.UserId,
                PersonName = req.PersonName.Trim(),
                ReviewYear = year,
                Evaluator = req.Evaluator?.Trim() ?? string.Empty,
                TechnicalScore = req.TechnicalScore,
                PersonalScore = req.PersonalScore,
                Conclusions = req.Conclusions?.Trim() ?? string.Empty,
                Status = QualityCompetenceStatuses.Draft,
                Notes = req.Notes?.Trim() ?? string.Empty,
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow
            };

            db.CompetenceReviews.Add(entity);
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.CompetenceReview, entity.Id, "CompetenceReviewCreated",
                $"Evaluación {entity.Number} creada.", null, ToCompetenceReviewDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/quality/records/pg06/r03/{entity.Id}", ToCompetenceReviewDto(entity));
        });

        group.MapPut("/records/pg06/r03/{id:guid}", async (
            Guid id,
            UpdateCompetenceReviewRequest req,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.CompetenceReviews.FirstOrDefaultAsync(c => c.Id == id && c.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();
            if (entity.Status == QualityCompetenceStatuses.Cancelled)
                return Results.BadRequest(new { message = "La evaluación está anulada; no se puede editar." });

            var before = ToCompetenceReviewDto(entity);

            if (req.PersonName is not null)
            {
                if (string.IsNullOrWhiteSpace(req.PersonName))
                    return Results.BadRequest(new { message = "El nombre no puede quedar vacío." });
                entity.PersonName = req.PersonName.Trim();
            }
            if (req.ReviewYear.HasValue)
            {
                if (req.ReviewYear.Value <= 2000)
                    return Results.BadRequest(new { message = "Año de revisión no válido." });
                entity.ReviewYear = req.ReviewYear.Value;
            }
            if (req.Evaluator is not null) entity.Evaluator = req.Evaluator.Trim();
            if (req.TechnicalScore.HasValue)
            {
                if (req.TechnicalScore.Value is < 1 or > 5)
                    return Results.BadRequest(new { message = "Puntaje técnico debe estar entre 1 y 5." });
                entity.TechnicalScore = req.TechnicalScore;
            }
            if (req.PersonalScore.HasValue)
            {
                if (req.PersonalScore.Value is < 1 or > 5)
                    return Results.BadRequest(new { message = "Puntaje personal debe estar entre 1 y 5." });
                entity.PersonalScore = req.PersonalScore;
            }
            if (req.Conclusions is not null) entity.Conclusions = req.Conclusions.Trim();
            if (req.Notes is not null) entity.Notes = req.Notes.Trim();

            if (req.Status is not null)
            {
                var st = req.Status.Trim();
                var allowed = new HashSet<string>(StringComparer.Ordinal)
                {
                    QualityCompetenceStatuses.Draft,
                    QualityCompetenceStatuses.Completed,
                    QualityCompetenceStatuses.Cancelled
                };
                if (!allowed.Contains(st))
                    return Results.BadRequest(new { message = "Estado de competencia no válido." });
                entity.Status = st;
            }

            entity.UpdatedAtUtc = DateTime.UtcNow;
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.CompetenceReview, entity.Id, "CompetenceReviewUpdated",
                $"Evaluación {entity.Number} actualizada ({entity.Status}).", before, ToCompetenceReviewDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToCompetenceReviewDto(entity));
        });

        group.MapDelete("/records/pg06/r03/{id:guid}", async (
            Guid id,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.CompetenceReviews.FirstOrDefaultAsync(c => c.Id == id && c.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();
            var before = ToCompetenceReviewDto(entity);
            entity.Status = QualityCompetenceStatuses.Cancelled;
            entity.UpdatedAtUtc = DateTime.UtcNow;
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.CompetenceReview, entity.Id, "CompetenceReviewCancelled",
                $"Evaluación {entity.Number} anulada.", before, ToCompetenceReviewDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToCompetenceReviewDto(entity));
        });
    }

    // ─── R04 role_assignments ────────────────────────────────────────────────

    private static void MapR04(RouteGroupBuilder group)
    {
        group.MapGet("/records/pg06/r04", async (ITenantContext tenant, QualityDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);

            var rows = await db.RoleAssignments.AsNoTracking()
                .Where(r => r.TenantId == tenantId)
                .OrderByDescending(r => r.Since)
                .ThenByDescending(r => r.Number)
                .ToListAsync(ct);

            return Results.Ok(new
            {
                code = "PG06-R04",
                title = "Asignación de funciones y reemplazos",
                recordKind = QualityRecordKinds.Structured,
                generatedAtUtc = DateTime.UtcNow,
                activeCount = rows.Count(r => r.Status == QualityRoleAssignmentStatuses.Active),
                rows = rows.Select(ToRoleAssignmentDto)
            });
        });

        group.MapGet("/records/pg06/r04/{id:guid}", async (
            Guid id,
            ITenantContext tenant,
            QualityDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.RoleAssignments.AsNoTracking()
                .FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();
            return Results.Ok(ToRoleAssignmentDto(entity));
        });

        group.MapPost("/records/pg06/r04", async (
            CreateRoleAssignmentRequest req,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);

            if (string.IsNullOrWhiteSpace(req.Role))
                return Results.BadRequest(new { message = "La función/rol es obligatorio." });
            if (req.UserId == Guid.Empty)
                return Results.BadRequest(new { message = "El usuario es obligatorio." });
            if (string.IsNullOrWhiteSpace(req.PersonName))
                return Results.BadRequest(new { message = "El nombre de la persona es obligatorio." });

            var since = req.Since ?? DateTime.UtcNow;
            var year = since.Year;
            var number = await NextNumberAsync(
                db.RoleAssignments.AsNoTracking()
                    .Where(r => r.TenantId == tenantId)
                    .Select(r => r.Number),
                $"ASG-{year}-",
                ct);

            var entity = new QualityRoleAssignment
            {
                TenantId = tenantId,
                RecordCode = "PG06-R04",
                Number = number,
                Role = req.Role.Trim(),
                UserId = req.UserId,
                PersonName = req.PersonName.Trim(),
                SubstituteUserId = req.SubstituteUserId,
                SubstituteName = req.SubstituteName?.Trim() ?? string.Empty,
                Since = since,
                Status = QualityRoleAssignmentStatuses.Active,
                Notes = req.Notes?.Trim() ?? string.Empty,
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow
            };

            db.RoleAssignments.Add(entity);
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.RoleAssignment, entity.Id, "RoleAssignmentCreated",
                $"Asignación {entity.Number} creada.", null, ToRoleAssignmentDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/quality/records/pg06/r04/{entity.Id}", ToRoleAssignmentDto(entity));
        });

        group.MapPut("/records/pg06/r04/{id:guid}", async (
            Guid id,
            UpdateRoleAssignmentRequest req,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.RoleAssignments.FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();
            if (entity.Status == QualityRoleAssignmentStatuses.Cancelled)
                return Results.BadRequest(new { message = "La asignación está anulada; no se puede editar." });

            var before = ToRoleAssignmentDto(entity);

            if (req.Role is not null)
            {
                if (string.IsNullOrWhiteSpace(req.Role))
                    return Results.BadRequest(new { message = "La función no puede quedar vacía." });
                entity.Role = req.Role.Trim();
            }
            if (req.PersonName is not null)
            {
                if (string.IsNullOrWhiteSpace(req.PersonName))
                    return Results.BadRequest(new { message = "El nombre no puede quedar vacío." });
                entity.PersonName = req.PersonName.Trim();
            }
            if (req.SubstituteUserId.HasValue) entity.SubstituteUserId = req.SubstituteUserId;
            if (req.SubstituteName is not null) entity.SubstituteName = req.SubstituteName.Trim();
            if (req.Since.HasValue) entity.Since = req.Since.Value;
            if (req.Until.HasValue) entity.Until = req.Until;
            if (req.Notes is not null) entity.Notes = req.Notes.Trim();

            if (req.Status is not null)
            {
                var st = req.Status.Trim();
                var allowed = new HashSet<string>(StringComparer.Ordinal)
                {
                    QualityRoleAssignmentStatuses.Active,
                    QualityRoleAssignmentStatuses.Ended,
                    QualityRoleAssignmentStatuses.Cancelled
                };
                if (!allowed.Contains(st))
                    return Results.BadRequest(new { message = "Estado de asignación no válido." });

                entity.Status = st;
                if (st == QualityRoleAssignmentStatuses.Ended)
                    entity.Until ??= DateTime.UtcNow;
            }

            entity.UpdatedAtUtc = DateTime.UtcNow;
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.RoleAssignment, entity.Id, "RoleAssignmentUpdated",
                $"Asignación {entity.Number} actualizada ({entity.Status}).", before, ToRoleAssignmentDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToRoleAssignmentDto(entity));
        });

        group.MapDelete("/records/pg06/r04/{id:guid}", async (
            Guid id,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.RoleAssignments.FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();
            var before = ToRoleAssignmentDto(entity);
            entity.Status = QualityRoleAssignmentStatuses.Cancelled;
            entity.UpdatedAtUtc = DateTime.UtcNow;
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.RoleAssignment, entity.Id, "RoleAssignmentCancelled",
                $"Asignación {entity.Number} anulada.", before, ToRoleAssignmentDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToRoleAssignmentDto(entity));
        });
    }

    // ─── helpers ─────────────────────────────────────────────────────────────

    private static async Task<string> NextNumberAsync(
        IQueryable<string> numbers,
        string prefix,
        CancellationToken ct)
    {
        var lastNumber = await numbers
            .Where(n => n.StartsWith(prefix))
            .OrderByDescending(n => n)
            .FirstOrDefaultAsync(ct);

        var seq = 1;
        if (!string.IsNullOrEmpty(lastNumber)
            && lastNumber.Length >= prefix.Length + 4
            && int.TryParse(lastNumber.AsSpan(^4), out var parsed))
        {
            seq = parsed + 1;
        }
        else if (!string.IsNullOrEmpty(lastNumber)
                 && lastNumber.Length > prefix.Length
                 && int.TryParse(lastNumber.AsSpan(prefix.Length), out var parsedFull))
        {
            seq = parsedFull + 1;
        }

        return $"{prefix}{seq:D4}";
    }

    private static string NormalizeMethodCode(string code) =>
        new string(code.Trim().ToUpperInvariant()
            .Where(ch => !char.IsWhiteSpace(ch))
            .ToArray())
            .Replace('_', '-');

    private static object ToTrainingPlanItemDto(QualityTrainingPlanItem t) => new
    {
        t.Id,
        t.RecordCode,
        t.Number,
        t.ProgramYear,
        t.Topic,
        t.TargetRoles,
        t.PlannedDate,
        t.DoneDate,
        t.EffectivenessCheck,
        t.Status,
        t.Notes,
        t.CreatedAtUtc,
        t.UpdatedAtUtc
    };

    private static object ToPersonnelAuthorizationDto(QualityPersonnelAuthorization a)
    {
        var isExpired = a.Status == QualityAuthorizationStatuses.Authorized
            && a.ValidUntil.HasValue
            && a.ValidUntil.Value < DateTime.UtcNow;

        return new
        {
            a.Id,
            a.RecordCode,
            a.Number,
            a.UserId,
            a.PersonName,
            a.MethodDocumentCode,
            a.MethodTitle,
            a.TrainingEvidence,
            a.SupervisedBy,
            a.AuthorizedByUserId,
            a.AuthorizedByName,
            a.AuthorizedAt,
            a.ValidUntil,
            a.EvidenceFileId,
            a.Status,
            isExpired,
            Notes = isExpired && string.IsNullOrWhiteSpace(a.Notes)
                ? "Vencida (ValidUntil < UtcNow)."
                : a.Notes,
            a.CreatedAtUtc,
            a.UpdatedAtUtc
        };
    }

    private static object ToCompetenceReviewDto(QualityCompetenceReview c) => new
    {
        c.Id,
        c.RecordCode,
        c.Number,
        c.UserId,
        c.PersonName,
        c.ReviewYear,
        c.Evaluator,
        c.TechnicalScore,
        c.PersonalScore,
        c.Conclusions,
        c.Status,
        c.Notes,
        c.CreatedAtUtc,
        c.UpdatedAtUtc
    };

    private static object ToRoleAssignmentDto(QualityRoleAssignment r) => new
    {
        r.Id,
        r.RecordCode,
        r.Number,
        r.Role,
        r.UserId,
        r.PersonName,
        r.SubstituteUserId,
        r.SubstituteName,
        r.Since,
        r.Until,
        r.Status,
        r.Notes,
        r.CreatedAtUtc,
        r.UpdatedAtUtc
    };
}
