using System.Text.Json;
using LealControl.BuildingBlocks.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Quality.Infrastructure;

internal static class QualityPg08Endpoints
{
    public static RouteGroupBuilder MapPg08Records(this RouteGroupBuilder group)
    {
        group.MapGet("/records/pg08-r01", async (ITenantContext tenant, QualityDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);

            var rows = await db.ManagementReviews.AsNoTracking()
                .Where(r => r.TenantId == tenantId)
                .OrderByDescending(r => r.ProgramYear)
                .ThenByDescending(r => r.ReviewDate)
                .ThenByDescending(r => r.Number)
                .ToListAsync(ct);

            return Results.Ok(new
            {
                code = "PG08-R01",
                title = "Revisión por la dirección",
                recordKind = QualityRecordKinds.Structured,
                generatedAtUtc = DateTime.UtcNow,
                draftCount = rows.Count(r => r.Status == QualityManagementReviewStatuses.Draft),
                completedCount = rows.Count(r => r.Status == QualityManagementReviewStatuses.Completed),
                rows = rows.Select(ToManagementReviewDto)
            });
        });

        group.MapGet("/records/pg08-r01/{id:guid}", async (
            Guid id,
            ITenantContext tenant,
            QualityDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.ManagementReviews.AsNoTracking()
                .FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();
            return Results.Ok(ToManagementReviewDto(entity));
        });

        group.MapPost("/records/pg08-r01", async (
            CreateManagementReviewRequest req,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);

            var year = req.ProgramYear > 2000 ? req.ProgramYear : DateTime.UtcNow.Year;
            var number = await NextNumberAsync(
                db.ManagementReviews.AsNoTracking()
                    .Where(r => r.TenantId == tenantId)
                    .Select(r => r.Number),
                $"REV-{year}-",
                ct);

            if (req.EvidenceFileId.HasValue)
            {
                var fileOk = await db.Files.AsNoTracking()
                    .AnyAsync(f => f.TenantId == tenantId && f.Id == req.EvidenceFileId.Value, ct);
                if (!fileOk)
                    return Results.BadRequest(new { message = "El archivo de evidencia no existe." });
            }

            var snapshotJson = await BuildInputsSnapshotJsonAsync(db, tenantId, year, ct);

            var entity = new QualityManagementReview
            {
                TenantId = tenantId,
                RecordCode = "PG08-R01",
                Number = number,
                ProgramYear = year,
                ReviewDate = req.ReviewDate ?? DateTime.UtcNow,
                Attendees = req.Attendees?.Trim() ?? string.Empty,
                InputsSnapshotJson = snapshotJson,
                InputsNotes = req.InputsNotes?.Trim() ?? string.Empty,
                Decisions = req.Decisions?.Trim() ?? string.Empty,
                Actions = req.Actions?.Trim() ?? string.Empty,
                FollowUp = req.FollowUp?.Trim() ?? string.Empty,
                EvidenceFileId = req.EvidenceFileId,
                Status = QualityManagementReviewStatuses.Draft,
                Notes = req.Notes?.Trim() ?? string.Empty,
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow
            };

            db.ManagementReviews.Add(entity);
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.ManagementReview, entity.Id, "ManagementReviewCreated",
                $"Revisión {entity.Number} creada (borrador).", null, ToManagementReviewDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/quality/records/pg08-r01/{entity.Id}", ToManagementReviewDto(entity));
        });

        group.MapPut("/records/pg08-r01/{id:guid}", async (
            Guid id,
            UpdateManagementReviewRequest req,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.ManagementReviews.FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();
            if (entity.Status == QualityManagementReviewStatuses.Cancelled)
                return Results.BadRequest(new { message = "La revisión está anulada; no se puede editar." });

            var before = ToManagementReviewDto(entity);

            if (req.ProgramYear.HasValue && req.ProgramYear.Value > 2000)
                entity.ProgramYear = req.ProgramYear.Value;
            if (req.ReviewDate.HasValue) entity.ReviewDate = req.ReviewDate.Value;
            if (req.Attendees is not null) entity.Attendees = req.Attendees.Trim();
            if (req.InputsNotes is not null) entity.InputsNotes = req.InputsNotes.Trim();
            if (req.Decisions is not null) entity.Decisions = req.Decisions.Trim();
            if (req.Actions is not null) entity.Actions = req.Actions.Trim();
            if (req.FollowUp is not null) entity.FollowUp = req.FollowUp.Trim();
            if (req.Notes is not null) entity.Notes = req.Notes.Trim();
            if (req.EvidenceFileId.HasValue)
            {
                var fileOk = await db.Files.AsNoTracking()
                    .AnyAsync(f => f.TenantId == tenantId && f.Id == req.EvidenceFileId.Value, ct);
                if (!fileOk)
                    return Results.BadRequest(new { message = "El archivo de evidencia no existe." });
                entity.EvidenceFileId = req.EvidenceFileId;
            }

            if (req.Status is not null)
            {
                var st = req.Status.Trim();
                var allowed = new HashSet<string>(StringComparer.Ordinal)
                {
                    QualityManagementReviewStatuses.Draft,
                    QualityManagementReviewStatuses.Completed,
                    QualityManagementReviewStatuses.Cancelled
                };
                if (!allowed.Contains(st))
                    return Results.BadRequest(new { message = "Estado inválido. Use Draft, Completed o Cancelled." });

                if (st == QualityManagementReviewStatuses.Completed)
                {
                    var decisions = req.Decisions ?? entity.Decisions;
                    if (string.IsNullOrWhiteSpace(decisions))
                        return Results.BadRequest(new { message = "Las decisiones son obligatorias para completar la revisión." });
                }

                entity.Status = st;
            }

            entity.UpdatedAtUtc = DateTime.UtcNow;
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.ManagementReview, entity.Id, "ManagementReviewUpdated",
                $"Revisión {entity.Number} actualizada ({entity.Status}).", before, ToManagementReviewDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToManagementReviewDto(entity));
        });

        group.MapPost("/records/pg08-r01/{id:guid}/refresh-inputs", async (
            Guid id,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.ManagementReviews.FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();
            if (entity.Status != QualityManagementReviewStatuses.Draft)
                return Results.BadRequest(new { message = "Solo se pueden refrescar los inputs en borrador." });

            var before = ToManagementReviewDto(entity);
            entity.InputsSnapshotJson = await BuildInputsSnapshotJsonAsync(db, tenantId, entity.ProgramYear, ct);
            entity.UpdatedAtUtc = DateTime.UtcNow;

            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.ManagementReview, entity.Id, "ManagementReviewInputsRefreshed",
                $"Inputs de {entity.Number} regenerados ({entity.ProgramYear}).", before, ToManagementReviewDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToManagementReviewDto(entity));
        });

        group.MapDelete("/records/pg08-r01/{id:guid}", async (
            Guid id,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.ManagementReviews.FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();

            var before = ToManagementReviewDto(entity);
            entity.Status = QualityManagementReviewStatuses.Cancelled;
            entity.UpdatedAtUtc = DateTime.UtcNow;
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.ManagementReview, entity.Id, "ManagementReviewCancelled",
                $"Revisión {entity.Number} anulada.", before, ToManagementReviewDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToManagementReviewDto(entity));
        });

        return group;
    }

    private static async Task<string> BuildInputsSnapshotJsonAsync(
        QualityDbContext db,
        TenantId tenantId,
        int programYear,
        CancellationToken ct)
    {
        var from = new DateTime(programYear, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var to = new DateTime(programYear, 12, 31, 23, 59, 59, DateTimeKind.Utc);
        var now = DateTime.UtcNow;
        var soon = now.AddDays(60);

        var complaints = await db.Complaints.AsNoTracking()
            .Where(c => c.TenantId == tenantId && c.ReceivedAt >= from && c.ReceivedAt <= to)
            .Select(c => c.Status)
            .ToListAsync(ct);

        var nonConformities = await db.NonConformities.AsNoTracking()
            .Where(n => n.TenantId == tenantId && n.DetectedAt >= from && n.DetectedAt <= to)
            .Select(n => new { n.Status, n.Kind })
            .ToListAsync(ct);

        var audits = await db.InternalAudits.AsNoTracking()
            .Where(a => a.TenantId == tenantId && a.ProgramYear == programYear)
            .Select(a => a.Status)
            .ToListAsync(ct);

        var trainings = await db.TrainingPlanItems.AsNoTracking()
            .Where(t => t.TenantId == tenantId && t.ProgramYear == programYear)
            .Select(t => t.Status)
            .ToListAsync(ct);

        var authorizations = await db.PersonnelAuthorizations.AsNoTracking()
            .Where(a => a.TenantId == tenantId)
            .Select(a => new { a.Status, a.ValidUntil })
            .ToListAsync(ct);

        var supplierEvaluations = await db.SupplierEvaluations.AsNoTracking()
            .Where(e => e.TenantId == tenantId)
            .Select(e => e.Status)
            .ToListAsync(ct);

        var performanceReviewsCompleted = await db.SupplierPerformanceReviews.AsNoTracking()
            .CountAsync(p => p.TenantId == tenantId
                && p.Status == QualitySupplierPerformanceStatuses.Completed
                && p.ReviewDate >= from
                && p.ReviewDate <= to, ct);

        var satisfactionSurveysReceived = await db.SatisfactionSurveys.AsNoTracking()
            .CountAsync(s => s.TenantId == tenantId
                && s.Status == QualitySatisfactionSurveyStatuses.Received
                && s.SurveyDate >= from
                && s.SurveyDate <= to, ct);

        var indicators = await db.Indicators.AsNoTracking()
            .Where(i => i.TenantId == tenantId)
            .Select(i => new { i.Id, i.Name, i.Status, i.TargetValue, i.Direction })
            .ToListAsync(ct);

        var activeIndicators = indicators.Where(i => i.Status == "Active").ToList();
        var activeIds = activeIndicators.Select(i => i.Id).ToList();
        var latestValues = activeIds.Count == 0
            ? new Dictionary<Guid, decimal>()
            : (await db.IndicatorValues.AsNoTracking()
                    .Where(v => v.TenantId == tenantId && activeIds.Contains(v.IndicatorId))
                    .OrderByDescending(v => v.Period)
                    .ThenByDescending(v => v.RecordedAtUtc)
                    .ToListAsync(ct))
                .GroupBy(v => v.IndicatorId)
                .ToDictionary(g => g.Key, g => g.First().Value);

        var belowNames = activeIndicators
            .Where(i => i.TargetValue.HasValue && latestValues.TryGetValue(i.Id, out var latest)
                && IsBelowTarget(latest, i.TargetValue.Value, i.Direction))
            .Select(i => i.Name)
            .Take(20)
            .ToList();

        var snapshot = new
        {
            complaints = new
            {
                total = complaints.Count,
                open = complaints.Count(s => s is not (
                    QualityComplaintStatuses.Closed
                    or QualityComplaintStatuses.Cancelled
                    or QualityComplaintStatuses.Invalid)),
                closed = complaints.Count(s => s == QualityComplaintStatuses.Closed)
            },
            nonConformities = new
            {
                total = nonConformities.Count,
                open = nonConformities.Count(n => n.Status is not (
                    QualityNonConformityStatuses.Closed
                    or QualityNonConformityStatuses.Cancelled)),
                byKind = nonConformities
                    .GroupBy(n => n.Kind)
                    .ToDictionary(g => g.Key, g => g.Count())
            },
            audits = new
            {
                total = audits.Count,
                byStatus = audits
                    .GroupBy(s => s)
                    .ToDictionary(g => g.Key, g => g.Count())
            },
            trainings = new
            {
                planned = trainings.Count(s => s == QualityTrainingStatuses.Planned),
                done = trainings.Count(s => s == QualityTrainingStatuses.Done)
            },
            authorizations = new
            {
                authorized = authorizations.Count(a => a.Status == QualityAuthorizationStatuses.Authorized),
                expiringSoon = authorizations.Count(a =>
                    a.Status == QualityAuthorizationStatuses.Authorized
                    && a.ValidUntil.HasValue
                    && a.ValidUntil.Value >= now
                    && a.ValidUntil.Value <= soon)
            },
            supplierEvaluations = new
            {
                approved = supplierEvaluations.Count(s => s == QualitySupplierEvaluationStatuses.Approved),
                suspended = supplierEvaluations.Count(s => s == QualitySupplierEvaluationStatuses.Suspended)
            },
            performanceReviews = new
            {
                completed = performanceReviewsCompleted
            },
            satisfactionSurveys = new
            {
                received = satisfactionSurveysReceived
            },
            indicators = new
            {
                active = activeIndicators.Count,
                belowTarget = belowNames
            },
            generatedAtUtc = now
        };

        return JsonSerializer.Serialize(snapshot);
    }

    private static bool IsBelowTarget(decimal value, decimal target, string direction) =>
        direction switch
        {
            "LowerIsBetter" => value > target,
            "Exact" => value != target,
            _ => value < target // HigherIsBetter (default)
        };

    private static object? TryParseInputsSnapshot(string json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            using var doc = JsonDocument.Parse(json);
            return doc.RootElement.Clone();
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static object ToManagementReviewDto(QualityManagementReview r)
    {
        var inputsSnapshot = TryParseInputsSnapshot(r.InputsSnapshotJson);
        return new
        {
            r.Id,
            r.RecordCode,
            r.Number,
            r.ProgramYear,
            r.ReviewDate,
            r.Attendees,
            inputsSnapshotJson = r.InputsSnapshotJson,
            inputsSnapshot,
            r.InputsNotes,
            r.Decisions,
            r.Actions,
            r.FollowUp,
            r.EvidenceFileId,
            r.Status,
            r.Notes,
            r.CreatedAtUtc,
            r.UpdatedAtUtc
        };
    }

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
}
