using LealControl.BuildingBlocks.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Quality.Infrastructure;

internal static class QualityPg14Endpoints
{
    private static readonly HashSet<string> AllowedEquipmentKinds = new(StringComparer.Ordinal)
    {
        QualityEquipmentKinds.Truck,
        QualityEquipmentKinds.Trailer,
        QualityEquipmentKinds.Forklift,
        QualityEquipmentKinds.Other
    };

    private static readonly HashSet<string> AllowedEquipmentStatuses = new(StringComparer.Ordinal)
    {
        QualityEquipmentStatuses.Active,
        QualityEquipmentStatuses.OutOfService,
        QualityEquipmentStatuses.Retired
    };

    private static readonly HashSet<string> AllowedCheckStatuses = new(StringComparer.Ordinal)
    {
        QualityIntermediateCheckStatuses.Draft,
        QualityIntermediateCheckStatuses.Completed,
        QualityIntermediateCheckStatuses.Cancelled
    };

    private static readonly HashSet<string> AllowedCheckResults = new(StringComparer.Ordinal)
    {
        QualityIntermediateCheckResults.Pass,
        QualityIntermediateCheckResults.Fail,
        QualityIntermediateCheckResults.Conditional
    };

    private static readonly HashSet<string> AllowedFrequencies = new(StringComparer.Ordinal)
    {
        QualityMaintenanceFrequencies.Monthly,
        QualityMaintenanceFrequencies.Quarterly,
        QualityMaintenanceFrequencies.Semiannual,
        QualityMaintenanceFrequencies.Annual
    };

    private static readonly HashSet<string> AllowedMaintenanceStatuses = new(StringComparer.Ordinal)
    {
        QualityMaintenanceStatuses.Active,
        QualityMaintenanceStatuses.Done,
        QualityMaintenanceStatuses.Cancelled
    };

    public static RouteGroupBuilder MapPg14Records(this RouteGroupBuilder group)
    {
        group.MapGet("/records/pg14", async (ITenantContext tenant, QualityDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);

            var now = DateTime.UtcNow;
            var dueHorizon = now.AddDays(30);

            var equipmentActive = await db.Equipments.AsNoTracking()
                .CountAsync(e => e.TenantId == tenantId && e.Status == QualityEquipmentStatuses.Active, ct);
            var checksDraft = await db.IntermediateChecks.AsNoTracking()
                .CountAsync(c => c.TenantId == tenantId && c.Status == QualityIntermediateCheckStatuses.Draft, ct);
            var maintenanceDue = await db.MaintenancePlanItems.AsNoTracking()
                .CountAsync(m => m.TenantId == tenantId
                    && m.Status == QualityMaintenanceStatuses.Active
                    && m.NextDue != null
                    && m.NextDue < dueHorizon, ct);
            var maintenanceOverdue = await db.MaintenancePlanItems.AsNoTracking()
                .CountAsync(m => m.TenantId == tenantId
                    && m.Status == QualityMaintenanceStatuses.Active
                    && m.NextDue != null
                    && m.NextDue < now, ct);

            return Results.Ok(new
            {
                code = "PG14",
                title = "Equipamiento auxiliar / R5–R6",
                generatedAtUtc = now,
                equipmentActive,
                checksDraft,
                maintenanceDue,
                maintenanceOverdue
            });
        });

        MapEquipment(group);
        MapR05(group);
        MapR06(group);

        return group;
    }

    private static void MapEquipment(RouteGroupBuilder group)
    {
        group.MapGet("/records/pg14/equipment", async (ITenantContext tenant, QualityDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);

            var rows = await db.Equipments.AsNoTracking()
                .Where(e => e.TenantId == tenantId)
                .OrderBy(e => e.Code)
                .ToListAsync(ct);

            return Results.Ok(new
            {
                code = "PG14-EQ",
                title = "Equipos auxiliares",
                generatedAtUtc = DateTime.UtcNow,
                rows = rows.Select(ToEquipmentDto)
            });
        });

        group.MapGet("/records/pg14/equipment/{id:guid}", async (
            Guid id,
            ITenantContext tenant,
            QualityDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.Equipments.AsNoTracking()
                .FirstOrDefaultAsync(e => e.Id == id && e.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();
            return Results.Ok(ToEquipmentDto(entity));
        });

        group.MapPost("/records/pg14/equipment", async (
            CreateQualityEquipmentRequest req,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);

            var kind = NormalizeAllowed(req.Kind, AllowedEquipmentKinds);
            if (kind is null)
                return Results.BadRequest(new { message = "Tipo inválido. Use Truck, Trailer, Forklift u Other." });

            if (req.ParentEquipmentId.HasValue)
            {
                var parentOk = await db.Equipments.AsNoTracking()
                    .AnyAsync(e => e.Id == req.ParentEquipmentId.Value && e.TenantId == tenantId, ct);
                if (!parentOk)
                    return Results.BadRequest(new { message = "El equipo padre no existe en este tenant." });
            }

            string code;
            if (!string.IsNullOrWhiteSpace(req.Code))
            {
                code = req.Code.Trim();
                var exists = await db.Equipments.AsNoTracking()
                    .AnyAsync(e => e.TenantId == tenantId && e.Code == code, ct);
                if (exists)
                    return Results.BadRequest(new { message = $"Ya existe un equipo con código {code}." });
            }
            else
            {
                code = await NextEquipmentCodeAsync(db, tenantId, ct);
            }

            var entity = new QualityEquipment
            {
                TenantId = tenantId,
                Code = code,
                Kind = kind,
                Description = req.Description?.Trim() ?? string.Empty,
                Brand = req.Brand?.Trim() ?? string.Empty,
                Model = req.Model?.Trim() ?? string.Empty,
                SerialNumber = req.SerialNumber?.Trim() ?? string.Empty,
                Plate = req.Plate?.Trim() ?? string.Empty,
                ParentEquipmentId = req.ParentEquipmentId,
                FleetVehicleId = req.FleetVehicleId,
                Location = req.Location?.Trim() ?? string.Empty,
                Status = QualityEquipmentStatuses.Active,
                Notes = req.Notes?.Trim() ?? string.Empty,
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow
            };

            db.Equipments.Add(entity);
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.QualityEquipment, entity.Id, "EquipmentCreated",
                $"Equipo {entity.Code} creado.", null, ToEquipmentDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/quality/records/pg14/equipment/{entity.Id}", ToEquipmentDto(entity));
        });

        group.MapPut("/records/pg14/equipment/{id:guid}", async (
            Guid id,
            UpdateQualityEquipmentRequest req,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.Equipments.FirstOrDefaultAsync(e => e.Id == id && e.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();

            var before = ToEquipmentDto(entity);

            if (req.Kind is not null)
            {
                var kind = NormalizeAllowed(req.Kind, AllowedEquipmentKinds);
                if (kind is null)
                    return Results.BadRequest(new { message = "Tipo inválido. Use Truck, Trailer, Forklift u Other." });
                entity.Kind = kind;
            }

            if (req.Kind is not null || req.Description is not null)
            {
                if (req.ParentEquipmentId.HasValue)
                {
                    if (req.ParentEquipmentId.Value == entity.Id)
                        return Results.BadRequest(new { message = "Un equipo no puede ser padre de sí mismo." });
                    var parentOk = await db.Equipments.AsNoTracking()
                        .AnyAsync(e => e.Id == req.ParentEquipmentId.Value && e.TenantId == tenantId, ct);
                    if (!parentOk)
                        return Results.BadRequest(new { message = "El equipo padre no existe en este tenant." });
                    entity.ParentEquipmentId = req.ParentEquipmentId;
                }
                else
                {
                    entity.ParentEquipmentId = null;
                }
            }
            else if (req.ParentEquipmentId.HasValue)
            {
                if (req.ParentEquipmentId.Value == entity.Id)
                    return Results.BadRequest(new { message = "Un equipo no puede ser padre de sí mismo." });
                var parentOk = await db.Equipments.AsNoTracking()
                    .AnyAsync(e => e.Id == req.ParentEquipmentId.Value && e.TenantId == tenantId, ct);
                if (!parentOk)
                    return Results.BadRequest(new { message = "El equipo padre no existe en este tenant." });
                entity.ParentEquipmentId = req.ParentEquipmentId;
            }

            if (req.Description is not null) entity.Description = req.Description.Trim();
            if (req.Brand is not null) entity.Brand = req.Brand.Trim();
            if (req.Model is not null) entity.Model = req.Model.Trim();
            if (req.SerialNumber is not null) entity.SerialNumber = req.SerialNumber.Trim();
            if (req.Plate is not null) entity.Plate = req.Plate.Trim();
            if (req.FleetVehicleId.HasValue) entity.FleetVehicleId = req.FleetVehicleId;
            if (req.Location is not null) entity.Location = req.Location.Trim();
            if (req.Notes is not null) entity.Notes = req.Notes.Trim();

            if (req.Status is not null)
            {
                var st = NormalizeAllowed(req.Status, AllowedEquipmentStatuses);
                if (st is null)
                    return Results.BadRequest(new { message = "Estado inválido. Use Active, OutOfService o Retired." });
                entity.Status = st;
            }

            entity.UpdatedAtUtc = DateTime.UtcNow;
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.QualityEquipment, entity.Id, "EquipmentUpdated",
                $"Equipo {entity.Code} actualizado ({entity.Status}).", before, ToEquipmentDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToEquipmentDto(entity));
        });

        group.MapDelete("/records/pg14/equipment/{id:guid}", async (
            Guid id,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.Equipments.FirstOrDefaultAsync(e => e.Id == id && e.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();

            var before = ToEquipmentDto(entity);
            entity.Status = QualityEquipmentStatuses.Retired;
            entity.UpdatedAtUtc = DateTime.UtcNow;
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.QualityEquipment, entity.Id, "EquipmentRetired",
                $"Equipo {entity.Code} dado de baja (Retired).", before, ToEquipmentDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToEquipmentDto(entity));
        });
    }

    private static void MapR05(RouteGroupBuilder group)
    {
        group.MapGet("/records/pg14/r05", async (ITenantContext tenant, QualityDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);

            var rows = await db.IntermediateChecks.AsNoTracking()
                .Where(r => r.TenantId == tenantId)
                .OrderByDescending(r => r.CheckDate)
                .ThenByDescending(r => r.Number)
                .ToListAsync(ct);

            return Results.Ok(new
            {
                code = "PG14-R05",
                title = "Verificación intermedia",
                recordKind = QualityRecordKinds.Structured,
                generatedAtUtc = DateTime.UtcNow,
                draftCount = rows.Count(r => r.Status == QualityIntermediateCheckStatuses.Draft),
                completedCount = rows.Count(r => r.Status == QualityIntermediateCheckStatuses.Completed),
                rows = rows.Select(ToCheckDto)
            });
        });

        group.MapGet("/records/pg14/r05/{id:guid}", async (
            Guid id,
            ITenantContext tenant,
            QualityDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.IntermediateChecks.AsNoTracking()
                .FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();
            return Results.Ok(ToCheckDto(entity));
        });

        group.MapPost("/records/pg14/r05", async (
            CreateIntermediateCheckRequest req,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);

            if (req.EquipmentId.HasValue)
            {
                var eqOk = await db.Equipments.AsNoTracking()
                    .AnyAsync(e => e.Id == req.EquipmentId.Value && e.TenantId == tenantId, ct);
                if (!eqOk)
                    return Results.BadRequest(new { message = "El equipo indicado no existe." });
            }

            if (req.EvidenceFileId.HasValue)
            {
                var fileOk = await db.Files.AsNoTracking()
                    .AnyAsync(f => f.TenantId == tenantId && f.Id == req.EvidenceFileId.Value, ct);
                if (!fileOk)
                    return Results.BadRequest(new { message = "El archivo de evidencia no existe." });
            }

            if (!string.IsNullOrWhiteSpace(req.Result))
            {
                var result = NormalizeAllowed(req.Result, AllowedCheckResults);
                if (result is null)
                    return Results.BadRequest(new { message = "Resultado inválido. Use Pass, Fail o Conditional." });
            }

            var checkDate = req.CheckDate ?? DateTime.UtcNow;
            var number = await NextNumberAsync(
                db.IntermediateChecks.AsNoTracking()
                    .Where(r => r.TenantId == tenantId)
                    .Select(r => r.Number),
                $"VIC-{checkDate.Year}-",
                ct);

            var entity = new QualityIntermediateCheck
            {
                TenantId = tenantId,
                RecordCode = "PG14-R05",
                Number = number,
                CheckDate = checkDate,
                WeightUsed = string.IsNullOrWhiteSpace(req.WeightUsed) ? "1000 kg" : req.WeightUsed.Trim(),
                Instrument = req.Instrument?.Trim() ?? string.Empty,
                EquipmentId = req.EquipmentId,
                Readings = req.Readings?.Trim() ?? string.Empty,
                Result = string.IsNullOrWhiteSpace(req.Result) ? string.Empty : NormalizeAllowed(req.Result, AllowedCheckResults)!,
                Responsible = req.Responsible?.Trim() ?? string.Empty,
                EvidenceFileId = req.EvidenceFileId,
                Status = QualityIntermediateCheckStatuses.Draft,
                Notes = req.Notes?.Trim() ?? string.Empty,
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow
            };

            db.IntermediateChecks.Add(entity);
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.IntermediateCheck, entity.Id, "IntermediateCheckCreated",
                $"Verificación {entity.Number} creada (borrador).", null, ToCheckDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/quality/records/pg14/r05/{entity.Id}", ToCheckDto(entity));
        });

        group.MapPut("/records/pg14/r05/{id:guid}", async (
            Guid id,
            UpdateIntermediateCheckRequest req,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.IntermediateChecks.FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();
            if (entity.Status == QualityIntermediateCheckStatuses.Cancelled)
                return Results.BadRequest(new { message = "La verificación está anulada; no se puede editar." });

            var before = ToCheckDto(entity);

            if (req.CheckDate.HasValue) entity.CheckDate = req.CheckDate.Value;
            if (req.WeightUsed is not null) entity.WeightUsed = string.IsNullOrWhiteSpace(req.WeightUsed) ? "1000 kg" : req.WeightUsed.Trim();
            if (req.Instrument is not null) entity.Instrument = req.Instrument.Trim();
            if (req.Readings is not null) entity.Readings = req.Readings.Trim();
            if (req.Responsible is not null) entity.Responsible = req.Responsible.Trim();
            if (req.Notes is not null) entity.Notes = req.Notes.Trim();

            if (req.EquipmentId.HasValue)
            {
                var eqOk = await db.Equipments.AsNoTracking()
                    .AnyAsync(e => e.Id == req.EquipmentId.Value && e.TenantId == tenantId, ct);
                if (!eqOk)
                    return Results.BadRequest(new { message = "El equipo indicado no existe." });
                entity.EquipmentId = req.EquipmentId;
            }

            if (req.EvidenceFileId.HasValue)
            {
                var fileOk = await db.Files.AsNoTracking()
                    .AnyAsync(f => f.TenantId == tenantId && f.Id == req.EvidenceFileId.Value, ct);
                if (!fileOk)
                    return Results.BadRequest(new { message = "El archivo de evidencia no existe." });
                entity.EvidenceFileId = req.EvidenceFileId;
            }

            if (req.Result is not null)
            {
                if (string.IsNullOrWhiteSpace(req.Result))
                {
                    entity.Result = string.Empty;
                }
                else
                {
                    var result = NormalizeAllowed(req.Result, AllowedCheckResults);
                    if (result is null)
                        return Results.BadRequest(new { message = "Resultado inválido. Use Pass, Fail o Conditional." });
                    entity.Result = result;
                }
            }

            if (req.Status is not null)
            {
                var st = NormalizeAllowed(req.Status, AllowedCheckStatuses);
                if (st is null)
                    return Results.BadRequest(new { message = "Estado inválido. Use Draft, Completed o Cancelled." });

                if (st == QualityIntermediateCheckStatuses.Completed)
                {
                    var result = string.IsNullOrWhiteSpace(entity.Result) ? null : entity.Result;
                    if (result is null || !AllowedCheckResults.Contains(result))
                        return Results.BadRequest(new { message = "Para completar debe indicar Result: Pass, Fail o Conditional." });
                }

                entity.Status = st;
            }

            entity.UpdatedAtUtc = DateTime.UtcNow;
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.IntermediateCheck, entity.Id, "IntermediateCheckUpdated",
                $"Verificación {entity.Number} actualizada ({entity.Status}).", before, ToCheckDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToCheckDto(entity));
        });

        group.MapDelete("/records/pg14/r05/{id:guid}", async (
            Guid id,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.IntermediateChecks.FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();

            var before = ToCheckDto(entity);
            entity.Status = QualityIntermediateCheckStatuses.Cancelled;
            entity.UpdatedAtUtc = DateTime.UtcNow;
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.IntermediateCheck, entity.Id, "IntermediateCheckCancelled",
                $"Verificación {entity.Number} anulada.", before, ToCheckDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToCheckDto(entity));
        });
    }

    private static void MapR06(RouteGroupBuilder group)
    {
        group.MapGet("/records/pg14/r06", async (ITenantContext tenant, QualityDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);

            var rows = await db.MaintenancePlanItems.AsNoTracking()
                .Where(r => r.TenantId == tenantId)
                .OrderBy(r => r.NextDue == null)
                .ThenBy(r => r.NextDue)
                .ThenBy(r => r.Number)
                .ToListAsync(ct);

            return Results.Ok(new
            {
                code = "PG14-R06",
                title = "Programa de mantenimiento preventivo",
                recordKind = QualityRecordKinds.Structured,
                generatedAtUtc = DateTime.UtcNow,
                activeCount = rows.Count(r => r.Status == QualityMaintenanceStatuses.Active),
                overdueCount = rows.Count(r => IsOverdue(r)),
                rows = rows.Select(ToMaintenanceDto)
            });
        });

        group.MapGet("/records/pg14/r06/{id:guid}", async (
            Guid id,
            ITenantContext tenant,
            QualityDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.MaintenancePlanItems.AsNoTracking()
                .FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();
            return Results.Ok(ToMaintenanceDto(entity));
        });

        group.MapPost("/records/pg14/r06", async (
            CreateMaintenancePlanItemRequest req,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);

            if (req.EquipmentId == Guid.Empty)
                return Results.BadRequest(new { message = "EquipmentId es obligatorio." });
            if (string.IsNullOrWhiteSpace(req.Activity))
                return Results.BadRequest(new { message = "La actividad es obligatoria." });

            var equipment = await db.Equipments.AsNoTracking()
                .FirstOrDefaultAsync(e => e.Id == req.EquipmentId && e.TenantId == tenantId, ct);
            if (equipment is null)
                return Results.BadRequest(new { message = "El equipo indicado no existe." });

            var frequency = string.IsNullOrWhiteSpace(req.Frequency)
                ? QualityMaintenanceFrequencies.Monthly
                : NormalizeAllowed(req.Frequency, AllowedFrequencies);
            if (frequency is null)
                return Results.BadRequest(new { message = "Frecuencia inválida. Use Monthly, Quarterly, Semiannual o Annual." });

            var year = DateTime.UtcNow.Year;
            var number = await NextNumberAsync(
                db.MaintenancePlanItems.AsNoTracking()
                    .Where(r => r.TenantId == tenantId)
                    .Select(r => r.Number),
                $"MP-{year}-",
                ct);

            var entity = new QualityMaintenancePlanItem
            {
                TenantId = tenantId,
                RecordCode = "PG14-R06",
                Number = number,
                EquipmentId = equipment.Id,
                EquipmentCode = equipment.Code,
                EquipmentDescription = string.IsNullOrWhiteSpace(equipment.Description)
                    ? $"{equipment.Kind} {equipment.Code}".Trim()
                    : equipment.Description,
                Activity = req.Activity.Trim(),
                Frequency = frequency,
                NextDue = req.NextDue,
                Responsible = req.Responsible?.Trim() ?? string.Empty,
                Status = QualityMaintenanceStatuses.Active,
                Notes = req.Notes?.Trim() ?? string.Empty,
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow
            };

            db.MaintenancePlanItems.Add(entity);
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.MaintenancePlanItem, entity.Id, "MaintenancePlanItemCreated",
                $"Plan {entity.Number} creado para {entity.EquipmentCode}.", null, ToMaintenanceDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/quality/records/pg14/r06/{entity.Id}", ToMaintenanceDto(entity));
        });

        group.MapPut("/records/pg14/r06/{id:guid}", async (
            Guid id,
            UpdateMaintenancePlanItemRequest req,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.MaintenancePlanItems.FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();
            if (entity.Status == QualityMaintenanceStatuses.Cancelled)
                return Results.BadRequest(new { message = "El ítem está anulado; no se puede editar." });

            var before = ToMaintenanceDto(entity);

            if (req.Activity is not null)
            {
                if (string.IsNullOrWhiteSpace(req.Activity))
                    return Results.BadRequest(new { message = "La actividad es obligatoria." });
                entity.Activity = req.Activity.Trim();
            }

            if (req.Frequency is not null)
            {
                var frequency = NormalizeAllowed(req.Frequency, AllowedFrequencies);
                if (frequency is null)
                    return Results.BadRequest(new { message = "Frecuencia inválida. Use Monthly, Quarterly, Semiannual o Annual." });
                entity.Frequency = frequency;
            }

            if (req.NextDue.HasValue) entity.NextDue = req.NextDue;
            if (req.Responsible is not null) entity.Responsible = req.Responsible.Trim();
            if (req.Notes is not null) entity.Notes = req.Notes.Trim();

            if (req.LastDone.HasValue)
            {
                entity.LastDone = req.LastDone.Value;
                // Prefer keep Active and advance NextDue from LastDone by frequency
                entity.NextDue = AdvanceByFrequency(req.LastDone.Value, entity.Frequency);
                if (entity.Status != QualityMaintenanceStatuses.Done)
                    entity.Status = QualityMaintenanceStatuses.Active;
            }

            if (req.Status is not null)
            {
                var st = NormalizeAllowed(req.Status, AllowedMaintenanceStatuses);
                if (st is null)
                    return Results.BadRequest(new { message = "Estado inválido. Use Active, Done o Cancelled." });
                entity.Status = st;
            }

            entity.UpdatedAtUtc = DateTime.UtcNow;
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.MaintenancePlanItem, entity.Id, "MaintenancePlanItemUpdated",
                $"Plan {entity.Number} actualizado ({entity.Status}).", before, ToMaintenanceDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToMaintenanceDto(entity));
        });

        group.MapDelete("/records/pg14/r06/{id:guid}", async (
            Guid id,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.MaintenancePlanItems.FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();

            var before = ToMaintenanceDto(entity);
            entity.Status = QualityMaintenanceStatuses.Cancelled;
            entity.UpdatedAtUtc = DateTime.UtcNow;
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.MaintenancePlanItem, entity.Id, "MaintenancePlanItemCancelled",
                $"Plan {entity.Number} anulado.", before, ToMaintenanceDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToMaintenanceDto(entity));
        });
    }

    private static string? NormalizeAllowed(string? value, HashSet<string> allowed)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var trimmed = value.Trim();
        return allowed.Contains(trimmed) ? trimmed : null;
    }

    private static bool IsOverdue(QualityMaintenancePlanItem r) =>
        r.Status == QualityMaintenanceStatuses.Active
        && r.NextDue.HasValue
        && r.NextDue.Value < DateTime.UtcNow;

    private static DateTime AdvanceByFrequency(DateTime from, string frequency) =>
        frequency switch
        {
            QualityMaintenanceFrequencies.Quarterly => from.AddMonths(3),
            QualityMaintenanceFrequencies.Semiannual => from.AddMonths(6),
            QualityMaintenanceFrequencies.Annual => from.AddYears(1),
            _ => from.AddMonths(1)
        };

    private static object ToEquipmentDto(QualityEquipment e) => new
    {
        e.Id,
        e.Code,
        e.Kind,
        e.Description,
        e.Brand,
        e.Model,
        e.SerialNumber,
        e.Plate,
        e.ParentEquipmentId,
        e.FleetVehicleId,
        e.Location,
        e.Status,
        e.Notes,
        e.CreatedAtUtc,
        e.UpdatedAtUtc
    };

    private static object ToCheckDto(QualityIntermediateCheck r) => new
    {
        r.Id,
        r.RecordCode,
        r.Number,
        r.CheckDate,
        r.WeightUsed,
        r.Instrument,
        r.EquipmentId,
        r.Readings,
        r.Result,
        r.Responsible,
        r.EvidenceFileId,
        r.Status,
        r.Notes,
        r.CreatedAtUtc,
        r.UpdatedAtUtc
    };

    private static object ToMaintenanceDto(QualityMaintenancePlanItem r) => new
    {
        r.Id,
        r.RecordCode,
        r.Number,
        r.EquipmentId,
        r.EquipmentCode,
        r.EquipmentDescription,
        r.Activity,
        r.Frequency,
        r.NextDue,
        r.LastDone,
        r.Responsible,
        r.Status,
        isOverdue = IsOverdue(r),
        r.Notes,
        r.CreatedAtUtc,
        r.UpdatedAtUtc
    };

    private static async Task<string> NextEquipmentCodeAsync(QualityDbContext db, TenantId tenantId, CancellationToken ct)
    {
        var codes = await db.Equipments.AsNoTracking()
            .Where(e => e.TenantId == tenantId && e.Code.StartsWith("EQ "))
            .Select(e => e.Code)
            .ToListAsync(ct);

        var max = 0;
        foreach (var code in codes)
        {
            var suffix = code.Length > 3 ? code[3..].Trim() : string.Empty;
            if (int.TryParse(suffix, out var n) && n > max)
                max = n;
        }

        return $"EQ {(max + 1):D3}";
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
