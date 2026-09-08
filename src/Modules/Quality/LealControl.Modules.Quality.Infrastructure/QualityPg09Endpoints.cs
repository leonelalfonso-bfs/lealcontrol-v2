using LealControl.BuildingBlocks.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Quality.Infrastructure;

internal static class QualityPg09Endpoints
{
    private static readonly HashSet<string> AllowedChannels = new(StringComparer.OrdinalIgnoreCase)
    {
        "Email", "Phone", "InPerson", "Other"
    };

    private static readonly HashSet<string> AllowedStatuses = new(StringComparer.Ordinal)
    {
        QualitySatisfactionSurveyStatuses.Draft,
        QualitySatisfactionSurveyStatuses.Received,
        QualitySatisfactionSurveyStatuses.Cancelled
    };

    public static RouteGroupBuilder MapPg09Records(this RouteGroupBuilder group)
    {
        group.MapGet("/records/pg09-r03", async (ITenantContext tenant, QualityDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);

            var rows = await db.SatisfactionSurveys.AsNoTracking()
                .Where(r => r.TenantId == tenantId)
                .OrderByDescending(r => r.SurveyDate)
                .ThenByDescending(r => r.Number)
                .ToListAsync(ct);

            var received = rows.Where(r => r.Status == QualitySatisfactionSurveyStatuses.Received).ToList();
            var overallScores = received
                .Select(AverageScore)
                .Where(s => s.HasValue)
                .Select(s => s!.Value)
                .ToList();

            return Results.Ok(new
            {
                code = "PG09-R03",
                title = "Encuesta de satisfacción",
                recordKind = QualityRecordKinds.Structured,
                generatedAtUtc = DateTime.UtcNow,
                draftCount = rows.Count(r => r.Status == QualitySatisfactionSurveyStatuses.Draft),
                receivedCount = received.Count,
                averageOverall = overallScores.Count == 0 ? (double?)null : Math.Round(overallScores.Average(), 2),
                rows = rows.Select(ToSurveyDto)
            });
        });

        group.MapGet("/records/pg09-r03/{id:guid}", async (
            Guid id,
            ITenantContext tenant,
            QualityDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.SatisfactionSurveys.AsNoTracking()
                .FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();
            return Results.Ok(ToSurveyDto(entity));
        });

        group.MapPost("/records/pg09-r03", async (
            CreateSatisfactionSurveyRequest req,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);

            if (string.IsNullOrWhiteSpace(req.CustomerName))
                return Results.BadRequest(new { message = "El nombre del cliente es obligatorio." });

            var scoreError = ValidateScores(
                req.ScorePunctuality, req.ScoreQuality, req.ScoreCommunication, req.ScoreOverall);
            if (scoreError is not null)
                return Results.BadRequest(new { message = scoreError });

            var channel = NormalizeChannel(req.Channel);
            if (channel is null)
                return Results.BadRequest(new { message = "Canal inválido. Use Email, Phone, InPerson u Other." });

            if (req.EvidenceFileId.HasValue)
            {
                var fileOk = await db.Files.AsNoTracking()
                    .AnyAsync(f => f.TenantId == tenantId && f.Id == req.EvidenceFileId.Value, ct);
                if (!fileOk)
                    return Results.BadRequest(new { message = "El archivo de evidencia no existe." });
            }

            var surveyDate = req.SurveyDate ?? DateTime.UtcNow;
            var year = surveyDate.Year;
            var number = await NextNumberAsync(
                db.SatisfactionSurveys.AsNoTracking()
                    .Where(r => r.TenantId == tenantId)
                    .Select(r => r.Number),
                $"ENC-{year}-",
                ct);

            var entity = new QualitySatisfactionSurvey
            {
                TenantId = tenantId,
                RecordCode = "PG09-R03",
                Number = number,
                CalibrationReportId = req.CalibrationReportId,
                CertificateNumber = req.CertificateNumber?.Trim() ?? string.Empty,
                CustomerId = req.CustomerId,
                CustomerName = req.CustomerName.Trim(),
                SurveyDate = surveyDate,
                Channel = channel,
                ScorePunctuality = req.ScorePunctuality,
                ScoreQuality = req.ScoreQuality,
                ScoreCommunication = req.ScoreCommunication,
                ScoreOverall = req.ScoreOverall,
                Comments = req.Comments?.Trim() ?? string.Empty,
                AnswersJson = req.AnswersJson?.Trim() ?? string.Empty,
                EvidenceFileId = req.EvidenceFileId,
                Status = QualitySatisfactionSurveyStatuses.Draft,
                Notes = req.Notes?.Trim() ?? string.Empty,
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow
            };

            db.SatisfactionSurveys.Add(entity);
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.SatisfactionSurvey, entity.Id, "SatisfactionSurveyCreated",
                $"Encuesta {entity.Number} creada (borrador).", null, ToSurveyDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/quality/records/pg09-r03/{entity.Id}", ToSurveyDto(entity));
        });

        group.MapPut("/records/pg09-r03/{id:guid}", async (
            Guid id,
            UpdateSatisfactionSurveyRequest req,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.SatisfactionSurveys.FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();
            if (entity.Status == QualitySatisfactionSurveyStatuses.Cancelled)
                return Results.BadRequest(new { message = "La encuesta está anulada; no se puede editar." });

            var before = ToSurveyDto(entity);

            if (req.CustomerName is not null)
            {
                if (string.IsNullOrWhiteSpace(req.CustomerName))
                    return Results.BadRequest(new { message = "El nombre del cliente es obligatorio." });
                entity.CustomerName = req.CustomerName.Trim();
            }

            if (req.SurveyDate.HasValue) entity.SurveyDate = req.SurveyDate.Value;
            if (req.CalibrationReportId.HasValue) entity.CalibrationReportId = req.CalibrationReportId;
            if (req.CertificateNumber is not null) entity.CertificateNumber = req.CertificateNumber.Trim();
            if (req.CustomerId.HasValue) entity.CustomerId = req.CustomerId;
            if (req.Channel is not null)
            {
                var channel = NormalizeChannel(req.Channel);
                if (channel is null)
                    return Results.BadRequest(new { message = "Canal inválido. Use Email, Phone, InPerson u Other." });
                entity.Channel = channel;
            }

            var scorePunctuality = req.ScorePunctuality ?? entity.ScorePunctuality;
            var scoreQuality = req.ScoreQuality ?? entity.ScoreQuality;
            var scoreCommunication = req.ScoreCommunication ?? entity.ScoreCommunication;
            var scoreOverall = req.ScoreOverall ?? entity.ScoreOverall;
            if (req.ScorePunctuality.HasValue || req.ScoreQuality.HasValue
                || req.ScoreCommunication.HasValue || req.ScoreOverall.HasValue)
            {
                var scoreError = ValidateScores(scorePunctuality, scoreQuality, scoreCommunication, scoreOverall);
                if (scoreError is not null)
                    return Results.BadRequest(new { message = scoreError });
                if (req.ScorePunctuality.HasValue) entity.ScorePunctuality = req.ScorePunctuality;
                if (req.ScoreQuality.HasValue) entity.ScoreQuality = req.ScoreQuality;
                if (req.ScoreCommunication.HasValue) entity.ScoreCommunication = req.ScoreCommunication;
                if (req.ScoreOverall.HasValue) entity.ScoreOverall = req.ScoreOverall;
            }

            if (req.Comments is not null) entity.Comments = req.Comments.Trim();
            if (req.AnswersJson is not null) entity.AnswersJson = req.AnswersJson.Trim();
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
                if (!AllowedStatuses.Contains(st))
                    return Results.BadRequest(new { message = "Estado inválido. Use Draft, Received o Cancelled." });

                if (st == QualitySatisfactionSurveyStatuses.Received
                    && entity.Status != QualitySatisfactionSurveyStatuses.Draft
                    && entity.Status != QualitySatisfactionSurveyStatuses.Received)
                {
                    return Results.BadRequest(new { message = "Solo se puede marcar como recibida desde borrador." });
                }

                entity.Status = st;
            }

            entity.UpdatedAtUtc = DateTime.UtcNow;
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.SatisfactionSurvey, entity.Id, "SatisfactionSurveyUpdated",
                $"Encuesta {entity.Number} actualizada ({entity.Status}).", before, ToSurveyDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToSurveyDto(entity));
        });

        group.MapDelete("/records/pg09-r03/{id:guid}", async (
            Guid id,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.SatisfactionSurveys.FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();

            var before = ToSurveyDto(entity);
            entity.Status = QualitySatisfactionSurveyStatuses.Cancelled;
            entity.UpdatedAtUtc = DateTime.UtcNow;
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.SatisfactionSurvey, entity.Id, "SatisfactionSurveyCancelled",
                $"Encuesta {entity.Number} anulada.", before, ToSurveyDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToSurveyDto(entity));
        });

        return group;
    }

    private static string? NormalizeChannel(string? channel)
    {
        if (string.IsNullOrWhiteSpace(channel)) return "Other";
        var trimmed = channel.Trim();
        var match = AllowedChannels.FirstOrDefault(c => c.Equals(trimmed, StringComparison.OrdinalIgnoreCase));
        return match;
    }

    private static string? ValidateScores(int? punctuality, int? quality, int? communication, int? overall)
    {
        foreach (var (name, value) in new (string, int?)[]
                 {
                     ("puntualidad", punctuality),
                     ("calidad técnica", quality),
                     ("comunicación", communication),
                     ("satisfacción general", overall)
                 })
        {
            if (value is null) continue;
            if (value is < 1 or > 5)
                return $"El puntaje de {name} debe estar entre 1 y 5.";
        }

        return null;
    }

    private static double? AverageScore(QualitySatisfactionSurvey r)
    {
        var scores = new List<int>(4);
        if (r.ScorePunctuality.HasValue) scores.Add(r.ScorePunctuality.Value);
        if (r.ScoreQuality.HasValue) scores.Add(r.ScoreQuality.Value);
        if (r.ScoreCommunication.HasValue) scores.Add(r.ScoreCommunication.Value);
        if (r.ScoreOverall.HasValue) scores.Add(r.ScoreOverall.Value);
        if (scores.Count == 0) return null;
        return Math.Round(scores.Average(), 2);
    }

    private static object ToSurveyDto(QualitySatisfactionSurvey r) => new
    {
        r.Id,
        r.RecordCode,
        r.Number,
        r.CalibrationReportId,
        r.CertificateNumber,
        r.CustomerId,
        r.CustomerName,
        r.SurveyDate,
        r.Channel,
        r.ScorePunctuality,
        r.ScoreQuality,
        r.ScoreCommunication,
        r.ScoreOverall,
        averageScore = AverageScore(r),
        r.Comments,
        r.AnswersJson,
        r.EvidenceFileId,
        r.Status,
        r.Notes,
        r.CreatedAtUtc,
        r.UpdatedAtUtc
    };

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
