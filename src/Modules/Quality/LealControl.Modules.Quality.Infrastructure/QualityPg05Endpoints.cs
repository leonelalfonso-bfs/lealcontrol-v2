using LealControl.BuildingBlocks.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Quality.Infrastructure;

internal static class QualityPg05Endpoints
{
    public static RouteGroupBuilder MapPg05Records(this RouteGroupBuilder group)
    {
        // ─── PG05 summary ────────────────────────────────────────────────────
        group.MapGet("/records/pg05", async (ITenantContext tenant, QualityDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);

            var now = DateTime.UtcNow;

            var evaluations = await db.SupplierEvaluations.AsNoTracking()
                .Where(e => e.TenantId == tenantId)
                .ToListAsync(ct);
            var performances = await db.SupplierPerformanceReviews.AsNoTracking()
                .Where(p => p.TenantId == tenantId)
                .Select(p => p.Status)
                .ToListAsync(ct);

            var enabledSuppliers = BuildEnabledEvaluations(evaluations, now).Count;

            return Results.Ok(new
            {
                code = "PG05",
                title = "Compras",
                recordKind = QualityRecordKinds.Structured,
                generatedAtUtc = now,
                evaluationsDraft = evaluations.Count(e => e.Status == QualitySupplierEvaluationStatuses.Draft),
                evaluationsApproved = evaluations.Count(e => e.Status == QualitySupplierEvaluationStatuses.Approved),
                performanceDraft = performances.Count(s => s == QualitySupplierPerformanceStatuses.Draft),
                enabledSuppliers,
                counts = new
                {
                    r01 = evaluations.Count,
                    r02 = enabledSuppliers,
                    r03 = performances.Count
                }
            });
        });

        MapR01(group);
        MapR02(group);
        MapR03(group);

        return group;
    }

    // ─── R01 supplier_evaluations ────────────────────────────────────────────

    private static void MapR01(RouteGroupBuilder group)
    {
        group.MapGet("/records/pg05/r01", async (ITenantContext tenant, QualityDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);

            var rows = await db.SupplierEvaluations.AsNoTracking()
                .Where(e => e.TenantId == tenantId)
                .OrderByDescending(e => e.EvaluatedAt)
                .ThenByDescending(e => e.Number)
                .ToListAsync(ct);

            return Results.Ok(new
            {
                code = "PG05-R01",
                title = "Evaluación inicial de proveedores",
                recordKind = QualityRecordKinds.Structured,
                generatedAtUtc = DateTime.UtcNow,
                draftCount = rows.Count(e => e.Status == QualitySupplierEvaluationStatuses.Draft),
                approvedCount = rows.Count(e => e.Status == QualitySupplierEvaluationStatuses.Approved),
                rows = rows.Select(ToSupplierEvaluationDto)
            });
        });

        group.MapGet("/records/pg05/r01/{id:guid}", async (
            Guid id,
            ITenantContext tenant,
            QualityDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.SupplierEvaluations.AsNoTracking()
                .FirstOrDefaultAsync(e => e.Id == id && e.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();
            return Results.Ok(ToSupplierEvaluationDto(entity));
        });

        group.MapPost("/records/pg05/r01", async (
            CreateSupplierEvaluationRequest req,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);

            if (req.SupplierId == Guid.Empty)
                return Results.BadRequest(new { message = "El proveedor es obligatorio." });
            if (string.IsNullOrWhiteSpace(req.SupplierName))
                return Results.BadRequest(new { message = "El nombre del proveedor es obligatorio." });
            if (req.Score is decimal score && (score < 0 || score > 100))
                return Results.BadRequest(new { message = "El puntaje debe estar entre 0 y 100." });

            if (req.EvidenceFileId.HasValue)
            {
                var fileOk = await db.Files.AsNoTracking()
                    .AnyAsync(f => f.TenantId == tenantId && f.Id == req.EvidenceFileId.Value, ct);
                if (!fileOk)
                    return Results.BadRequest(new { message = "El archivo de evidencia no existe." });
            }

            var evaluatedAt = req.EvaluatedAt ?? DateTime.UtcNow;
            var year = evaluatedAt.Year;
            var number = await NextNumberAsync(
                db.SupplierEvaluations.AsNoTracking()
                    .Where(e => e.TenantId == tenantId)
                    .Select(e => e.Number),
                $"EVA-{year}-",
                ct);

            var entity = new QualitySupplierEvaluation
            {
                TenantId = tenantId,
                RecordCode = "PG05-R01",
                Number = number,
                SupplierId = req.SupplierId,
                SupplierName = req.SupplierName.Trim(),
                SupplierDocument = req.SupplierDocument?.Trim() ?? string.Empty,
                ServiceScope = req.ServiceScope?.Trim() ?? string.Empty,
                EvaluatedAt = evaluatedAt,
                Score = req.Score,
                CriteriaNotes = req.CriteriaNotes?.Trim() ?? string.Empty,
                Strengths = req.Strengths?.Trim() ?? string.Empty,
                Weaknesses = req.Weaknesses?.Trim() ?? string.Empty,
                ValidUntil = req.ValidUntil,
                EvidenceFileId = req.EvidenceFileId,
                Status = QualitySupplierEvaluationStatuses.Draft,
                Notes = req.Notes?.Trim() ?? string.Empty,
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow
            };

            db.SupplierEvaluations.Add(entity);
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.SupplierEvaluation, entity.Id, "SupplierEvaluationCreated",
                $"Evaluación {entity.Number} creada (borrador).", null, ToSupplierEvaluationDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/quality/records/pg05/r01/{entity.Id}", ToSupplierEvaluationDto(entity));
        });

        group.MapPut("/records/pg05/r01/{id:guid}", async (
            Guid id,
            UpdateSupplierEvaluationRequest req,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.SupplierEvaluations.FirstOrDefaultAsync(e => e.Id == id && e.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();
            if (entity.Status == QualitySupplierEvaluationStatuses.Cancelled)
                return Results.BadRequest(new { message = "La evaluación está anulada; no se puede editar." });

            var before = ToSupplierEvaluationDto(entity);

            if (req.SupplierName is not null)
            {
                if (string.IsNullOrWhiteSpace(req.SupplierName))
                    return Results.BadRequest(new { message = "El nombre del proveedor no puede quedar vacío." });
                entity.SupplierName = req.SupplierName.Trim();
            }
            if (req.SupplierDocument is not null) entity.SupplierDocument = req.SupplierDocument.Trim();
            if (req.ServiceScope is not null) entity.ServiceScope = req.ServiceScope.Trim();
            if (req.EvaluatedAt.HasValue) entity.EvaluatedAt = req.EvaluatedAt.Value;
            if (req.Score.HasValue)
            {
                if (req.Score.Value is < 0 or > 100)
                    return Results.BadRequest(new { message = "El puntaje debe estar entre 0 y 100." });
                entity.Score = req.Score;
            }
            if (req.CriteriaNotes is not null) entity.CriteriaNotes = req.CriteriaNotes.Trim();
            if (req.Strengths is not null) entity.Strengths = req.Strengths.Trim();
            if (req.Weaknesses is not null) entity.Weaknesses = req.Weaknesses.Trim();
            if (req.ApprovedBy is not null) entity.ApprovedBy = req.ApprovedBy.Trim();
            if (req.ApprovedAt.HasValue) entity.ApprovedAt = req.ApprovedAt;
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
                    QualitySupplierEvaluationStatuses.Draft,
                    QualitySupplierEvaluationStatuses.Approved,
                    QualitySupplierEvaluationStatuses.Rejected,
                    QualitySupplierEvaluationStatuses.Suspended,
                    QualitySupplierEvaluationStatuses.Cancelled
                };
                if (!allowed.Contains(st))
                    return Results.BadRequest(new { message = "Estado de evaluación no válido." });

                if (st == QualitySupplierEvaluationStatuses.Approved)
                {
                    var score = req.Score ?? entity.Score;
                    if (score is null)
                        return Results.BadRequest(new { message = "Para aprobar se requiere un puntaje (Score)." });
                    if (score.Value is < 0 or > 100)
                        return Results.BadRequest(new { message = "El puntaje debe estar entre 0 y 100." });
                    entity.Score = score;
                    entity.ApprovedAt ??= req.ApprovedAt ?? DateTime.UtcNow;
                }

                entity.Status = st;
            }

            entity.UpdatedAtUtc = DateTime.UtcNow;
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.SupplierEvaluation, entity.Id, "SupplierEvaluationUpdated",
                $"Evaluación {entity.Number} actualizada ({entity.Status}).", before, ToSupplierEvaluationDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToSupplierEvaluationDto(entity));
        });

        group.MapDelete("/records/pg05/r01/{id:guid}", async (
            Guid id,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.SupplierEvaluations.FirstOrDefaultAsync(e => e.Id == id && e.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();
            var before = ToSupplierEvaluationDto(entity);
            entity.Status = QualitySupplierEvaluationStatuses.Cancelled;
            entity.UpdatedAtUtc = DateTime.UtcNow;
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.SupplierEvaluation, entity.Id, "SupplierEvaluationCancelled",
                $"Evaluación {entity.Number} anulada.", before, ToSupplierEvaluationDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToSupplierEvaluationDto(entity));
        });
    }

    // ─── R02 enabled suppliers (generated) ───────────────────────────────────

    private static void MapR02(RouteGroupBuilder group)
    {
        group.MapGet("/records/pg05/r02", async (ITenantContext tenant, QualityDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);

            var now = DateTime.UtcNow;

            var evaluations = await db.SupplierEvaluations.AsNoTracking()
                .Where(e => e.TenantId == tenantId)
                .ToListAsync(ct);

            var enabled = BuildEnabledEvaluations(evaluations, now);

            var supplierIds = enabled.Select(e => e.SupplierId).ToList();
            var performances = await db.SupplierPerformanceReviews.AsNoTracking()
                .Where(p => p.TenantId == tenantId
                    && p.Status == QualitySupplierPerformanceStatuses.Completed
                    && supplierIds.Contains(p.SupplierId))
                .ToListAsync(ct);

            var latestPerformanceBySupplier = performances
                .GroupBy(p => p.SupplierId)
                .ToDictionary(
                    g => g.Key,
                    g => g.OrderByDescending(p => p.ReviewDate)
                        .ThenByDescending(p => p.CreatedAtUtc)
                        .First());

            var rows = enabled
                .OrderBy(e => e.SupplierName)
                .ThenBy(e => e.Number)
                .Select(e =>
                {
                    latestPerformanceBySupplier.TryGetValue(e.SupplierId, out var perf);
                    return new
                    {
                        supplierId = e.SupplierId,
                        supplierName = e.SupplierName,
                        supplierDocument = e.SupplierDocument,
                        evaluationId = e.Id,
                        evaluationNumber = e.Number,
                        score = e.Score,
                        approvedAt = e.ApprovedAt,
                        validUntil = e.ValidUntil,
                        serviceScope = e.ServiceScope,
                        lastPerformanceScore = perf?.Score,
                        lastPerformancePeriod = perf?.Period,
                        lastPerformanceDate = perf?.ReviewDate
                    };
                });

            return Results.Ok(new
            {
                code = "PG05-R02",
                title = "Listado de proveedores habilitados",
                recordKind = QualityRecordKinds.Generated,
                generatedAtUtc = now,
                rows
            });
        });
    }

    // ─── R03 supplier_performance_reviews ────────────────────────────────────

    private static void MapR03(RouteGroupBuilder group)
    {
        group.MapGet("/records/pg05/r03", async (ITenantContext tenant, QualityDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);

            var rows = await db.SupplierPerformanceReviews.AsNoTracking()
                .Where(p => p.TenantId == tenantId)
                .OrderByDescending(p => p.ReviewDate)
                .ThenByDescending(p => p.Number)
                .ToListAsync(ct);

            return Results.Ok(new
            {
                code = "PG05-R03",
                title = "Evaluación del desempeño de proveedores",
                recordKind = QualityRecordKinds.Structured,
                generatedAtUtc = DateTime.UtcNow,
                draftCount = rows.Count(p => p.Status == QualitySupplierPerformanceStatuses.Draft),
                rows = rows.Select(ToSupplierPerformanceDto)
            });
        });

        group.MapGet("/records/pg05/r03/{id:guid}", async (
            Guid id,
            ITenantContext tenant,
            QualityDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.SupplierPerformanceReviews.AsNoTracking()
                .FirstOrDefaultAsync(p => p.Id == id && p.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();
            return Results.Ok(ToSupplierPerformanceDto(entity));
        });

        group.MapPost("/records/pg05/r03", async (
            CreateSupplierPerformanceRequest req,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);

            if (req.SupplierId == Guid.Empty)
                return Results.BadRequest(new { message = "El proveedor es obligatorio." });
            if (string.IsNullOrWhiteSpace(req.SupplierName))
                return Results.BadRequest(new { message = "El nombre del proveedor es obligatorio." });

            if (TryValidateScore(req.Score, out var scoreError)
                || TryValidateScore(req.QualityScore, out scoreError)
                || TryValidateScore(req.DeliveryScore, out scoreError)
                || TryValidateScore(req.ServiceScore, out scoreError))
            {
                return Results.BadRequest(new { message = scoreError });
            }

            if (req.EvidenceFileId.HasValue)
            {
                var fileOk = await db.Files.AsNoTracking()
                    .AnyAsync(f => f.TenantId == tenantId && f.Id == req.EvidenceFileId.Value, ct);
                if (!fileOk)
                    return Results.BadRequest(new { message = "El archivo de evidencia no existe." });
            }

            if (req.EvaluationId.HasValue)
            {
                var evalOk = await db.SupplierEvaluations.AsNoTracking()
                    .AnyAsync(e => e.TenantId == tenantId && e.Id == req.EvaluationId.Value, ct);
                if (!evalOk)
                    return Results.BadRequest(new { message = "La evaluación asociada no existe." });
            }

            var reviewDate = req.ReviewDate ?? DateTime.UtcNow;
            var year = reviewDate.Year;
            var number = await NextNumberAsync(
                db.SupplierPerformanceReviews.AsNoTracking()
                    .Where(p => p.TenantId == tenantId)
                    .Select(p => p.Number),
                $"DES-{year}-",
                ct);

            var entity = new QualitySupplierPerformanceReview
            {
                TenantId = tenantId,
                RecordCode = "PG05-R03",
                Number = number,
                SupplierId = req.SupplierId,
                SupplierName = req.SupplierName.Trim(),
                EvaluationId = req.EvaluationId,
                Period = req.Period?.Trim() ?? string.Empty,
                ReviewDate = reviewDate,
                Score = req.Score,
                QualityScore = req.QualityScore,
                DeliveryScore = req.DeliveryScore,
                ServiceScore = req.ServiceScore,
                Comments = req.Comments?.Trim() ?? string.Empty,
                ReviewedBy = req.ReviewedBy?.Trim() ?? string.Empty,
                EvidenceFileId = req.EvidenceFileId,
                Status = QualitySupplierPerformanceStatuses.Draft,
                Notes = req.Notes?.Trim() ?? string.Empty,
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow
            };

            db.SupplierPerformanceReviews.Add(entity);
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.SupplierPerformanceReview, entity.Id, "SupplierPerformanceReviewCreated",
                $"Desempeño {entity.Number} creado (borrador).", null, ToSupplierPerformanceDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/quality/records/pg05/r03/{entity.Id}", ToSupplierPerformanceDto(entity));
        });

        group.MapPut("/records/pg05/r03/{id:guid}", async (
            Guid id,
            UpdateSupplierPerformanceRequest req,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.SupplierPerformanceReviews.FirstOrDefaultAsync(p => p.Id == id && p.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();
            if (entity.Status == QualitySupplierPerformanceStatuses.Cancelled)
                return Results.BadRequest(new { message = "La evaluación de desempeño está anulada; no se puede editar." });

            var before = ToSupplierPerformanceDto(entity);

            if (req.SupplierName is not null)
            {
                if (string.IsNullOrWhiteSpace(req.SupplierName))
                    return Results.BadRequest(new { message = "El nombre del proveedor no puede quedar vacío." });
                entity.SupplierName = req.SupplierName.Trim();
            }
            if (req.Period is not null) entity.Period = req.Period.Trim();
            if (req.ReviewDate.HasValue) entity.ReviewDate = req.ReviewDate.Value;
            if (req.EvaluationId.HasValue)
            {
                var evalOk = await db.SupplierEvaluations.AsNoTracking()
                    .AnyAsync(e => e.TenantId == tenantId && e.Id == req.EvaluationId.Value, ct);
                if (!evalOk)
                    return Results.BadRequest(new { message = "La evaluación asociada no existe." });
                entity.EvaluationId = req.EvaluationId;
            }

            if (req.Score.HasValue)
            {
                if (TryValidateScore(req.Score, out var scoreError))
                    return Results.BadRequest(new { message = scoreError });
                entity.Score = req.Score;
            }
            if (req.QualityScore.HasValue)
            {
                if (TryValidateScore(req.QualityScore, out var scoreError))
                    return Results.BadRequest(new { message = scoreError });
                entity.QualityScore = req.QualityScore;
            }
            if (req.DeliveryScore.HasValue)
            {
                if (TryValidateScore(req.DeliveryScore, out var scoreError))
                    return Results.BadRequest(new { message = scoreError });
                entity.DeliveryScore = req.DeliveryScore;
            }
            if (req.ServiceScore.HasValue)
            {
                if (TryValidateScore(req.ServiceScore, out var scoreError))
                    return Results.BadRequest(new { message = scoreError });
                entity.ServiceScore = req.ServiceScore;
            }

            if (req.Comments is not null) entity.Comments = req.Comments.Trim();
            if (req.ReviewedBy is not null) entity.ReviewedBy = req.ReviewedBy.Trim();
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
                    QualitySupplierPerformanceStatuses.Draft,
                    QualitySupplierPerformanceStatuses.Completed,
                    QualitySupplierPerformanceStatuses.Cancelled
                };
                if (!allowed.Contains(st))
                    return Results.BadRequest(new { message = "Estado de desempeño no válido." });
                entity.Status = st;
            }

            entity.UpdatedAtUtc = DateTime.UtcNow;
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.SupplierPerformanceReview, entity.Id, "SupplierPerformanceReviewUpdated",
                $"Desempeño {entity.Number} actualizado ({entity.Status}).", before, ToSupplierPerformanceDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToSupplierPerformanceDto(entity));
        });

        group.MapDelete("/records/pg05/r03/{id:guid}", async (
            Guid id,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.SupplierPerformanceReviews.FirstOrDefaultAsync(p => p.Id == id && p.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();
            var before = ToSupplierPerformanceDto(entity);
            entity.Status = QualitySupplierPerformanceStatuses.Cancelled;
            entity.UpdatedAtUtc = DateTime.UtcNow;
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.SupplierPerformanceReview, entity.Id, "SupplierPerformanceReviewCancelled",
                $"Desempeño {entity.Number} anulado.", before, ToSupplierPerformanceDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToSupplierPerformanceDto(entity));
        });
    }

    // ─── helpers ─────────────────────────────────────────────────────────────

    private static List<QualitySupplierEvaluation> BuildEnabledEvaluations(
        IEnumerable<QualitySupplierEvaluation> evaluations,
        DateTime now) =>
        evaluations
            .Where(e => e.Status == QualitySupplierEvaluationStatuses.Approved)
            .GroupBy(e => e.SupplierId)
            .Select(g => g
                .OrderByDescending(e => e.ApprovedAt ?? e.EvaluatedAt)
                .ThenByDescending(e => e.EvaluatedAt)
                .First())
            .Where(e => !e.ValidUntil.HasValue || e.ValidUntil.Value >= now)
            .ToList();

    /// <returns>true if invalid (error message set).</returns>
    private static bool TryValidateScore(decimal? score, out string message)
    {
        message = "El puntaje debe estar entre 0 y 100.";
        if (score is null) return false;
        return score.Value is < 0 or > 100;
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

    private static object ToSupplierEvaluationDto(QualitySupplierEvaluation e)
    {
        var isExpired = e.Status == QualitySupplierEvaluationStatuses.Approved
            && e.ValidUntil.HasValue
            && e.ValidUntil.Value < DateTime.UtcNow;

        return new
        {
            e.Id,
            e.RecordCode,
            e.Number,
            e.SupplierId,
            e.SupplierName,
            e.SupplierDocument,
            e.ServiceScope,
            e.EvaluatedAt,
            e.Score,
            e.CriteriaNotes,
            e.Strengths,
            e.Weaknesses,
            e.ApprovedBy,
            e.ApprovedAt,
            e.ValidUntil,
            e.EvidenceFileId,
            e.Status,
            isExpired,
            e.Notes,
            e.CreatedAtUtc,
            e.UpdatedAtUtc
        };
    }

    private static object ToSupplierPerformanceDto(QualitySupplierPerformanceReview p) => new
    {
        p.Id,
        p.RecordCode,
        p.Number,
        p.SupplierId,
        p.SupplierName,
        p.EvaluationId,
        p.Period,
        p.ReviewDate,
        p.Score,
        p.QualityScore,
        p.DeliveryScore,
        p.ServiceScore,
        p.Comments,
        p.ReviewedBy,
        p.EvidenceFileId,
        p.Status,
        p.Notes,
        p.CreatedAtUtc,
        p.UpdatedAtUtc
    };
}
