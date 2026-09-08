using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Metrology.Contracts;
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

    private static readonly HashSet<string> AllowedLogAssetSources = new(StringComparer.Ordinal)
    {
        QualityEquipmentLogAssetSources.StandardWeight,
        QualityEquipmentLogAssetSources.Instrument,
        QualityEquipmentLogAssetSources.QualityEquipment
    };

    private static readonly HashSet<string> AllowedLogKinds = new(StringComparer.Ordinal)
    {
        QualityEquipmentLogKinds.Calibration,
        QualityEquipmentLogKinds.Verification,
        QualityEquipmentLogKinds.PreventiveMaintenance,
        QualityEquipmentLogKinds.CorrectiveMaintenance,
        QualityEquipmentLogKinds.Decommission
    };

    private static readonly HashSet<string> AllowedLogVerdicts = new(StringComparer.Ordinal)
    {
        QualityEquipmentLogVerdicts.Fit,
        QualityEquipmentLogVerdicts.Unfit,
        QualityEquipmentLogVerdicts.Conditional
    };

    public static RouteGroupBuilder MapPg14Records(this RouteGroupBuilder group)
    {
        group.MapGet("/records/pg14", async (
            ITenantContext tenant,
            QualityDbContext db,
            IMetrologyAssetCatalog metrologyCatalog,
            CancellationToken ct) =>
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
            var logEntries = await db.EquipmentLogEntries.AsNoTracking()
                .CountAsync(e => e.TenantId == tenantId && e.Status == QualityEquipmentLogStatuses.Active, ct);

            var assets = await metrologyCatalog.ListCalibrationAssetsAsync(tenantId.Value, ct);
            var weightsCount = assets.Count(a => a.Source == "StandardWeight");
            var instrumentsCount = assets.Count(a => a.Source == "Instrument");

            return Results.Ok(new
            {
                code = "PG14",
                title = "Equipamiento / calibraciones / R5–R6",
                generatedAtUtc = now,
                equipmentActive,
                checksDraft,
                maintenanceDue,
                maintenanceOverdue,
                logEntries,
                weightsCount,
                instrumentsCount
            });
        });

        MapR04(group);
        MapR03(group);
        MapEquipment(group);
        MapR01(group);
        MapR05(group);
        MapR06(group);

        return group;
    }

    private static void MapR04(RouteGroupBuilder group)
    {
        group.MapGet("/records/pg14-r04", async (
            ITenantContext tenant,
            QualityDbContext db,
            IMetrologyAssetCatalog metrologyCatalog,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);

            var now = DateTime.UtcNow;
            var metrologyAssets = await metrologyCatalog.ListCalibrationAssetsAsync(tenantId.Value, ct);

            var auxiliaries = await db.Equipments.AsNoTracking()
                .Where(e => e.TenantId == tenantId && e.Status != QualityEquipmentStatuses.Retired)
                .OrderBy(e => e.Code)
                .ToListAsync(ct);

            var rows = metrologyAssets
                .Select(a => ToUnifiedRow(a, now))
                .Concat(auxiliaries.Select(e => ToUnifiedRow(e, now)))
                .OrderBy(r => SourceSortKey(r.Source))
                .ThenBy(r => r.Code, StringComparer.OrdinalIgnoreCase)
                .ToList();

            var weights = rows.Count(r => r.Source == "StandardWeight");
            var instruments = rows.Count(r => r.Source == "Instrument");
            var auxCount = rows.Count(r => r.Source == "QualityEquipment");

            return Results.Ok(new
            {
                code = "PG14-R04",
                title = "Listado de equipos",
                recordKind = QualityRecordKinds.Generated,
                generatedAtUtc = now,
                counts = new
                {
                    weights,
                    instruments,
                    auxiliaries = auxCount,
                    total = rows.Count
                },
                rows
            });
        });
    }

    private static void MapR03(RouteGroupBuilder group)
    {
        group.MapGet("/records/pg14-r03", async (
            ITenantContext tenant,
            IMetrologyAssetCatalog metrologyCatalog,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var now = DateTime.UtcNow;
            var dueSoonHorizon = now.AddDays(60);

            // Auxiliares (QualityEquipment) no tienen fechas de calibración aún — solo pesas + instrumentos.
            var assets = (await metrologyCatalog.ListCalibrationAssetsAsync(tenantId.Value, ct))
                .Where(a => a.CalibrationDate.HasValue || a.ExpirationDate.HasValue)
                .ToList();

            var rows = assets
                .Select(a =>
                {
                    var isExpired = a.ExpirationDate.HasValue && a.ExpirationDate.Value.Date < now.Date;
                    var daysUntilExpiry = a.ExpirationDate.HasValue
                        ? (int?)(a.ExpirationDate.Value.Date - now.Date).TotalDays
                        : null;
                    var isDueSoon = !isExpired
                        && a.ExpirationDate.HasValue
                        && a.ExpirationDate.Value.Date <= dueSoonHorizon.Date;

                    return new
                    {
                        id = a.Id,
                        source = a.Source,
                        code = a.Code,
                        kind = a.Kind,
                        description = a.Description,
                        brandOrManufacturer = a.BrandOrManufacturer,
                        model = a.Model,
                        serialNumber = a.SerialNumber,
                        certificateNumber = a.CertificateNumber,
                        calibrationDate = a.CalibrationDate,
                        expirationDate = a.ExpirationDate,
                        status = a.Status,
                        extra = a.Extra,
                        deepLinkPath = a.DeepLinkPath,
                        daysUntilExpiry,
                        isExpired,
                        isDueSoon
                    };
                })
                .OrderBy(r => r.expirationDate == null)
                .ThenBy(r => r.expirationDate)
                .ThenBy(r => r.code, StringComparer.OrdinalIgnoreCase)
                .ToList();

            var expired = rows.Count(r => r.isExpired);
            var dueSoon = rows.Count(r => r.isDueSoon);
            var ok = rows.Count - expired - dueSoon;

            return Results.Ok(new
            {
                code = "PG14-R03",
                title = "Programa de calibraciones",
                recordKind = QualityRecordKinds.Generated,
                generatedAtUtc = now,
                summary = new
                {
                    expired,
                    dueSoon,
                    ok,
                    total = rows.Count
                },
                rows
            });
        });
    }

    private static int SourceSortKey(string source) => source switch
    {
        "StandardWeight" => 0,
        "Instrument" => 1,
        "QualityEquipment" => 2,
        _ => 9
    };

    private static UnifiedInventoryRow ToUnifiedRow(MetrologyCatalogAsset a, DateTime now) => new(
        a.Id,
        a.Source,
        a.Code,
        a.Kind,
        a.Description,
        a.BrandOrManufacturer,
        a.Model,
        a.SerialNumber,
        a.CertificateNumber,
        a.CalibrationDate,
        a.ExpirationDate,
        a.Status,
        a.Extra,
        a.DeepLinkPath,
        a.ExpirationDate.HasValue && a.ExpirationDate.Value.Date < now.Date
    );

    private static UnifiedInventoryRow ToUnifiedRow(QualityEquipment e, DateTime now) => new(
        e.Id,
        "QualityEquipment",
        e.Code,
        e.Kind,
        string.IsNullOrWhiteSpace(e.Description)
            ? $"{e.Kind} {e.Code}".Trim()
            : e.Description,
        e.Brand,
        e.Model,
        e.SerialNumber,
        string.Empty,
        null,
        null,
        e.Status,
        string.IsNullOrWhiteSpace(e.Plate) ? e.Location : $"Patente {e.Plate}",
        "/calidad/registros/equipos?tab=equipos",
        false
    );

    private sealed record UnifiedInventoryRow(
        Guid Id,
        string Source,
        string Code,
        string Kind,
        string Description,
        string BrandOrManufacturer,
        string Model,
        string SerialNumber,
        string CertificateNumber,
        DateTime? CalibrationDate,
        DateTime? ExpirationDate,
        string Status,
        string? Extra,
        string? DeepLinkPath,
        bool IsExpired);

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

    private static void MapR01(RouteGroupBuilder group)
    {
        group.MapGet("/records/pg14/r01", async (
            string? assetSource,
            Guid? assetId,
            ITenantContext tenant,
            QualityDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);

            var query = db.EquipmentLogEntries.AsNoTracking().Where(r => r.TenantId == tenantId);
            if (!string.IsNullOrWhiteSpace(assetSource))
            {
                var src = NormalizeAllowed(assetSource, AllowedLogAssetSources);
                if (src is null)
                    return Results.BadRequest(new { message = "assetSource inválido. Use StandardWeight, Instrument o QualityEquipment." });
                query = query.Where(r => r.AssetSource == src);
            }

            if (assetId.HasValue)
                query = query.Where(r => r.AssetId == assetId.Value);

            var rows = await query
                .OrderByDescending(r => r.EventDate)
                .ThenByDescending(r => r.Number)
                .ToListAsync(ct);

            var active = rows.Where(r => r.Status == QualityEquipmentLogStatuses.Active).ToList();
            return Results.Ok(new
            {
                code = "PG14-R01",
                title = "Hoja de vida del equipo",
                recordKind = QualityRecordKinds.Structured,
                generatedAtUtc = DateTime.UtcNow,
                countsByKind = new
                {
                    C = active.Count(r => r.Kind == QualityEquipmentLogKinds.Calibration),
                    V = active.Count(r => r.Kind == QualityEquipmentLogKinds.Verification),
                    MP = active.Count(r => r.Kind == QualityEquipmentLogKinds.PreventiveMaintenance),
                    MC = active.Count(r => r.Kind == QualityEquipmentLogKinds.CorrectiveMaintenance),
                    Baja = active.Count(r => r.Kind == QualityEquipmentLogKinds.Decommission)
                },
                totalActive = active.Count,
                rows = rows.Select(ToLogDto)
            });
        });

        group.MapGet("/records/pg14/r01/{id:guid}", async (
            Guid id,
            ITenantContext tenant,
            QualityDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.EquipmentLogEntries.AsNoTracking()
                .FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();
            return Results.Ok(ToLogDto(entity));
        });

        group.MapPost("/records/pg14/r01", async (
            CreateEquipmentLogEntryRequest req,
            ITenantContext tenant,
            QualityDbContext db,
            IMetrologyAssetCatalog metrologyCatalog,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);

            var source = NormalizeAllowed(req.AssetSource, AllowedLogAssetSources);
            if (source is null)
                return Results.BadRequest(new { message = "AssetSource inválido. Use StandardWeight, Instrument o QualityEquipment." });

            var kind = NormalizeAllowed(req.Kind, AllowedLogKinds);
            if (kind is null)
                return Results.BadRequest(new { message = "Kind inválido. Use C, V, MP, MC o Baja." });

            string? verdict = null;
            if (!string.IsNullOrWhiteSpace(req.Verdict))
            {
                verdict = NormalizeAllowed(req.Verdict, AllowedLogVerdicts);
                if (verdict is null)
                    return Results.BadRequest(new { message = "Verdict inválido. Use Apto, NoApto, Condicional o vacío." });
            }

            if (req.EvidenceFileId.HasValue)
            {
                var fileOk = await db.Files.AsNoTracking()
                    .AnyAsync(f => f.TenantId == tenantId && f.Id == req.EvidenceFileId.Value, ct);
                if (!fileOk)
                    return Results.BadRequest(new { message = "El archivo de evidencia no existe." });
            }

            var resolved = await ResolveAssetAsync(db, metrologyCatalog, tenantId, source, req.AssetId, req.AssetCode, req.AssetDescription, ct);
            if (resolved is null)
                return Results.BadRequest(new { message = "No se encontró el activo indicado (AssetSource + AssetId)." });

            var eventDate = req.EventDate ?? DateTime.UtcNow;
            var number = await NextNumberAsync(
                db.EquipmentLogEntries.AsNoTracking()
                    .Where(r => r.TenantId == tenantId)
                    .Select(r => r.Number),
                $"HV-{eventDate.Year}-",
                ct);

            var entity = new QualityEquipmentLogEntry
            {
                TenantId = tenantId,
                RecordCode = "PG14-R01",
                Number = number,
                AssetSource = source,
                AssetId = req.AssetId,
                AssetCode = resolved.Value.Code,
                AssetDescription = resolved.Value.Description,
                EventDate = eventDate,
                Kind = kind,
                Description = req.Description?.Trim() ?? string.Empty,
                CertificateNumber = req.CertificateNumber?.Trim() ?? string.Empty,
                Verdict = verdict ?? string.Empty,
                ApprovedByTechnicalDirector = req.ApprovedByTechnicalDirector ?? false,
                Responsible = req.Responsible?.Trim() ?? string.Empty,
                EvidenceFileId = req.EvidenceFileId,
                Status = QualityEquipmentLogStatuses.Active,
                Notes = req.Notes?.Trim() ?? string.Empty,
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow
            };

            db.EquipmentLogEntries.Add(entity);
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.EquipmentLogEntry, entity.Id, "EquipmentLogEntryCreated",
                $"Evento {entity.Number} ({entity.Kind}) creado para {entity.AssetCode}.", null, ToLogDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/quality/records/pg14/r01/{entity.Id}", ToLogDto(entity));
        });

        group.MapPut("/records/pg14/r01/{id:guid}", async (
            Guid id,
            UpdateEquipmentLogEntryRequest req,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.EquipmentLogEntries.FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();
            if (entity.Status == QualityEquipmentLogStatuses.Cancelled)
                return Results.BadRequest(new { message = "El evento está anulado; no se puede editar." });

            var before = ToLogDto(entity);

            if (req.EventDate.HasValue) entity.EventDate = req.EventDate.Value;
            if (req.Description is not null) entity.Description = req.Description.Trim();
            if (req.CertificateNumber is not null) entity.CertificateNumber = req.CertificateNumber.Trim();
            if (req.Responsible is not null) entity.Responsible = req.Responsible.Trim();
            if (req.Notes is not null) entity.Notes = req.Notes.Trim();
            if (req.ApprovedByTechnicalDirector.HasValue) entity.ApprovedByTechnicalDirector = req.ApprovedByTechnicalDirector.Value;

            if (req.Kind is not null)
            {
                var kind = NormalizeAllowed(req.Kind, AllowedLogKinds);
                if (kind is null)
                    return Results.BadRequest(new { message = "Kind inválido. Use C, V, MP, MC o Baja." });
                entity.Kind = kind;
            }

            if (req.Verdict is not null)
            {
                if (string.IsNullOrWhiteSpace(req.Verdict))
                {
                    entity.Verdict = string.Empty;
                }
                else
                {
                    var verdict = NormalizeAllowed(req.Verdict, AllowedLogVerdicts);
                    if (verdict is null)
                        return Results.BadRequest(new { message = "Verdict inválido. Use Apto, NoApto, Condicional o vacío." });
                    entity.Verdict = verdict;
                }
            }

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
                if (req.Status.Trim() == QualityEquipmentLogStatuses.Cancelled)
                    entity.Status = QualityEquipmentLogStatuses.Cancelled;
                else if (req.Status.Trim() == QualityEquipmentLogStatuses.Active)
                    entity.Status = QualityEquipmentLogStatuses.Active;
                else
                    return Results.BadRequest(new { message = "Estado inválido. Use Active o Cancelled." });
            }

            entity.UpdatedAtUtc = DateTime.UtcNow;
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.EquipmentLogEntry, entity.Id, "EquipmentLogEntryUpdated",
                $"Evento {entity.Number} actualizado ({entity.Status}).", before, ToLogDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToLogDto(entity));
        });

        group.MapDelete("/records/pg14/r01/{id:guid}", async (
            Guid id,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            var entity = await db.EquipmentLogEntries.FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tenantId, ct);
            if (entity is null) return Results.NotFound();

            var before = ToLogDto(entity);
            entity.Status = QualityEquipmentLogStatuses.Cancelled;
            entity.UpdatedAtUtc = DateTime.UtcNow;
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.EquipmentLogEntry, entity.Id, "EquipmentLogEntryCancelled",
                $"Evento {entity.Number} anulado.", before, ToLogDto(entity), http);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToLogDto(entity));
        });

        group.MapPost("/records/pg14/r01/sync-calibrations", async (
            ITenantContext tenant,
            QualityDbContext db,
            IMetrologyAssetCatalog metrologyCatalog,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);

            var assets = (await metrologyCatalog.ListCalibrationAssetsAsync(tenantId.Value, ct))
                .Where(a => a.CalibrationDate.HasValue)
                .ToList();

            var existing = await db.EquipmentLogEntries
                .Where(r => r.TenantId == tenantId
                    && r.Status == QualityEquipmentLogStatuses.Active
                    && r.Kind == QualityEquipmentLogKinds.Calibration)
                .ToListAsync(ct);

            var created = 0;
            var skipped = 0;
            var yearCounters = new Dictionary<int, int>();

            var existingNumbers = await db.EquipmentLogEntries.AsNoTracking()
                .Where(r => r.TenantId == tenantId)
                .Select(r => r.Number)
                .ToListAsync(ct);

            foreach (var asset in assets)
            {
                var calDate = asset.CalibrationDate!.Value;
                var cert = asset.CertificateNumber ?? string.Empty;
                var calDay = calDate.Date;

                var duplicate = existing.Any(r =>
                    r.AssetSource == asset.Source
                    && r.AssetId == asset.Id
                    && (
                        (!string.IsNullOrWhiteSpace(cert) && string.Equals(r.CertificateNumber, cert, StringComparison.Ordinal))
                        || r.EventDate.Date == calDay
                    ));

                if (duplicate)
                {
                    skipped++;
                    continue;
                }

                if (!yearCounters.TryGetValue(calDate.Year, out var seq))
                {
                    var prefix = $"HV-{calDate.Year}-";
                    var max = 0;
                    foreach (var n in existingNumbers.Where(x => x.StartsWith(prefix, StringComparison.Ordinal)))
                    {
                        if (n.Length >= prefix.Length + 4 && int.TryParse(n.AsSpan(^4), out var parsed) && parsed > max)
                            max = parsed;
                    }
                    seq = max;
                }

                seq++;
                yearCounters[calDate.Year] = seq;
                var number = $"HV-{calDate.Year}-{seq:D4}";
                existingNumbers.Add(number);

                var entity = new QualityEquipmentLogEntry
                {
                    TenantId = tenantId,
                    RecordCode = "PG14-R01",
                    Number = number,
                    AssetSource = asset.Source,
                    AssetId = asset.Id,
                    AssetCode = asset.Code,
                    AssetDescription = asset.Description,
                    EventDate = calDate,
                    Kind = QualityEquipmentLogKinds.Calibration,
                    Description = "Calibración registrada en Metrología",
                    CertificateNumber = cert,
                    Verdict = string.Equals(asset.Status, "Valid", StringComparison.Ordinal) ? QualityEquipmentLogVerdicts.Fit : string.Empty,
                    ApprovedByTechnicalDirector = false,
                    Responsible = string.Empty,
                    Status = QualityEquipmentLogStatuses.Active,
                    Notes = string.Empty,
                    CreatedAtUtc = DateTime.UtcNow,
                    UpdatedAtUtc = DateTime.UtcNow
                };

                db.EquipmentLogEntries.Add(entity);
                existing.Add(entity);
                QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.EquipmentLogEntry, entity.Id, "EquipmentLogEntrySynced",
                    $"Evento {entity.Number} sincronizado desde Metrología ({entity.AssetCode}).", null, ToLogDto(entity), http);
                created++;
            }

            await db.SaveChangesAsync(ct);
            return Results.Ok(new { created, skipped });
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

                var becomingCompleted = st == QualityIntermediateCheckStatuses.Completed
                    && entity.Status != QualityIntermediateCheckStatuses.Completed;
                entity.Status = st;

                if (becomingCompleted && entity.EquipmentId.HasValue)
                {
                    await TryCreateVerificationLogFromCheckAsync(db, tenantId, entity, http, ct);
                }
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

    private static object ToLogDto(QualityEquipmentLogEntry r) => new
    {
        r.Id,
        r.RecordCode,
        r.Number,
        r.AssetSource,
        r.AssetId,
        r.AssetCode,
        r.AssetDescription,
        r.EventDate,
        r.Kind,
        r.Description,
        r.CertificateNumber,
        r.Verdict,
        r.ApprovedByTechnicalDirector,
        r.Responsible,
        r.EvidenceFileId,
        r.Status,
        r.Notes,
        r.CreatedAtUtc,
        r.UpdatedAtUtc
    };

    private static async Task<(string Code, string Description)?> ResolveAssetAsync(
        QualityDbContext db,
        IMetrologyAssetCatalog metrologyCatalog,
        TenantId tenantId,
        string source,
        Guid assetId,
        string? assetCode,
        string? assetDescription,
        CancellationToken ct)
    {
        if (source == QualityEquipmentLogAssetSources.QualityEquipment)
        {
            var eq = await db.Equipments.AsNoTracking()
                .FirstOrDefaultAsync(e => e.Id == assetId && e.TenantId == tenantId, ct);
            if (eq is null) return null;
            return (
                string.IsNullOrWhiteSpace(assetCode) ? eq.Code : assetCode.Trim(),
                string.IsNullOrWhiteSpace(assetDescription) ? eq.Description : assetDescription.Trim());
        }

        var assets = await metrologyCatalog.ListCalibrationAssetsAsync(tenantId.Value, ct);
        var match = assets.FirstOrDefault(a => a.Id == assetId && a.Source == source);
        if (match is null) return null;
        return (
            string.IsNullOrWhiteSpace(assetCode) ? match.Code : assetCode.Trim(),
            string.IsNullOrWhiteSpace(assetDescription) ? match.Description : assetDescription.Trim());
    }

    private static async Task TryCreateVerificationLogFromCheckAsync(
        QualityDbContext db,
        TenantId tenantId,
        QualityIntermediateCheck check,
        HttpContext http,
        CancellationToken ct)
    {
        if (!check.EquipmentId.HasValue) return;

        var eq = await db.Equipments.AsNoTracking()
            .FirstOrDefaultAsync(e => e.Id == check.EquipmentId.Value && e.TenantId == tenantId, ct);
        if (eq is null) return;

        var already = await db.EquipmentLogEntries.AsNoTracking()
            .AnyAsync(r => r.TenantId == tenantId
                && r.Status == QualityEquipmentLogStatuses.Active
                && r.Kind == QualityEquipmentLogKinds.Verification
                && r.AssetSource == QualityEquipmentLogAssetSources.QualityEquipment
                && r.AssetId == eq.Id
                && r.Notes.Contains(check.Number), ct);
        if (already) return;

        var verdict = check.Result switch
        {
            QualityIntermediateCheckResults.Pass => QualityEquipmentLogVerdicts.Fit,
            QualityIntermediateCheckResults.Fail => QualityEquipmentLogVerdicts.Unfit,
            QualityIntermediateCheckResults.Conditional => QualityEquipmentLogVerdicts.Conditional,
            _ => string.Empty
        };

        var number = await NextNumberAsync(
            db.EquipmentLogEntries.AsNoTracking()
                .Where(r => r.TenantId == tenantId)
                .Select(r => r.Number),
            $"HV-{check.CheckDate.Year}-",
            ct);

        var log = new QualityEquipmentLogEntry
        {
            TenantId = tenantId,
            RecordCode = "PG14-R01",
            Number = number,
            AssetSource = QualityEquipmentLogAssetSources.QualityEquipment,
            AssetId = eq.Id,
            AssetCode = eq.Code,
            AssetDescription = eq.Description,
            EventDate = check.CheckDate,
            Kind = QualityEquipmentLogKinds.Verification,
            Description = $"Verificación intermedia {check.Number}",
            CertificateNumber = string.Empty,
            Verdict = verdict,
            ApprovedByTechnicalDirector = false,
            Responsible = check.Responsible,
            EvidenceFileId = check.EvidenceFileId,
            Status = QualityEquipmentLogStatuses.Active,
            Notes = $"Origen R05 {check.Number}",
            CreatedAtUtc = DateTime.UtcNow,
            UpdatedAtUtc = DateTime.UtcNow
        };

        db.EquipmentLogEntries.Add(log);
        QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.EquipmentLogEntry, log.Id, "EquipmentLogEntryFromCheck",
            $"Evento {log.Number} (V) desde verificación {check.Number}.", null, ToLogDto(log), http);
    }

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
