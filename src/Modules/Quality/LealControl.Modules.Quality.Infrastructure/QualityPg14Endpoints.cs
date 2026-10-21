using LealControl.BuildingBlocks.Time;
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
        QualityMaintenanceFrequencies.Biennial,
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
            var maintenanceItems = await db.MaintenancePlanItems.AsNoTracking()
                .Where(m => m.TenantId == tenantId && m.Status == QualityMaintenanceStatuses.Active)
                .ToListAsync(ct);
            var maintenanceMarks = (await db.MaintenanceMonths.AsNoTracking().Where(m => m.TenantId == tenantId).ToListAsync(ct)).ToLookup(m => m.ItemId);
            var maintenanceDue = maintenanceItems.Count(m => IsDueSoon(m, maintenanceMarks[m.Id]));
            var maintenanceOverdue = maintenanceItems.Count(m => IsOverdue(m, maintenanceMarks[m.Id]));
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
                // Por número interno de PG14 (EQ-0001…); los que no tienen número, al final.
                .OrderBy(r => string.IsNullOrEmpty(r.InternalCode))
                .ThenBy(r => r.InternalCode, StringComparer.OrdinalIgnoreCase)
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
        a.ExpirationDate.HasValue && a.ExpirationDate.Value.Date < now.Date,
        a.InternalCode
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
        false,
        e.Code
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
        bool IsExpired,
        string InternalCode = "");

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
            IEquipmentNumbering numbering,
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
                // Una sola numeración EQ-0001 para pesas, termómetros y equipos auxiliares (PG14).
                if (EquipmentNumbers.Normalize(req.Code) is not { } normalized)
                    return Results.BadRequest(new { message = "El número interno tiene el formato EQ-0001." });
                code = normalized;
                if (await numbering.IsTakenAsync(tenantId.Value, code, null, ct))
                    return Results.BadRequest(new { message = $"El número {code} ya lo tiene otro equipo." });
            }
            else
            {
                code = await numbering.NextAsync(tenantId.Value, ct);
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
            IMetrologyAssetCatalog metrologyCatalog,
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

            var rows = await query.ToListAsync(ct);
            // La hoja de vida de un equipo suma sus verificaciones intermedias (R05) completadas que no tienen su evento:
            // las anteriores al registro automático o las cargadas antes de elegir la pesa del inventario.
            if (assetId.HasValue)
            {
                var checks = await db.IntermediateChecks.AsNoTracking()
                    .Where(c => c.TenantId == tenantId && c.Status == QualityIntermediateCheckStatuses.Completed
                        && (c.TargetWeightId == assetId || c.EquipmentId == assetId))
                    .ToListAsync(ct);
                foreach (var c in checks.Where(c => !rows.Any(r => r.Notes.Contains(c.Number) || r.Description.Contains(c.Number))))
                    rows.Add(new QualityEquipmentLogEntry(c.Id)
                    {
                        TenantId = tenantId, RecordCode = "PG14-R05", Number = c.Number,
                        AssetSource = c.TargetWeightId == assetId ? QualityEquipmentLogAssetSources.StandardWeight : QualityEquipmentLogAssetSources.QualityEquipment,
                        AssetId = assetId.Value, AssetCode = c.TargetWeightCode, AssetDescription = c.WeightUsed, EventDate = c.CheckDate,
                        Kind = QualityEquipmentLogKinds.Verification, Description = $"Verificación intermedia {c.Number}",
                        Verdict = c.Result switch
                        {
                            QualityIntermediateCheckResults.Pass => QualityEquipmentLogVerdicts.Fit,
                            QualityIntermediateCheckResults.Fail => QualityEquipmentLogVerdicts.Unfit,
                            QualityIntermediateCheckResults.Conditional => QualityEquipmentLogVerdicts.Conditional,
                            _ => string.Empty
                        },
                        Responsible = c.Responsible, EvidenceFileId = c.EvidenceFileId, Status = QualityEquipmentLogStatuses.Active,
                        Notes = "Desde PG14-R05", CreatedAtUtc = c.CreatedAtUtc, UpdatedAtUtc = c.UpdatedAtUtc
                    });
            }
            rows = rows.OrderByDescending(r => r.EventDate).ThenByDescending(r => r.Number).ToList();

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
                // El equipo de la hoja de vida, con su número interno actual (los eventos guardan el de su momento).
                asset = assetId.HasValue && assetSource is not null
                    && await ResolveAssetAsync(db, metrologyCatalog, tenantId, NormalizeAllowed(assetSource, AllowedLogAssetSources) ?? assetSource, assetId.Value, null, null, ct) is { } asset
                    ? new { code = asset.Code, description = asset.Description }
                    : null,
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
        group.MapGet("/records/pg14/r05", async (ITenantContext tenant, QualityDbContext db, IMetrologyAssetCatalog metrologyCatalog, CancellationToken ct) =>
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
                policy = new { intervalMonths = 6, alertDays = 30, referenceMassKg = 1000 },
                schedule = BuildCheckSchedule(await metrologyCatalog.ListCalibrationAssetsAsync(tenantId.Value, ct), rows),
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
            IMetrologyAssetCatalog metrologyCatalog,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);

            if (!HasCompleteAbba(req.TargetWeightId, req.MasterWeightId, req.ComparatorResolution,
                    req.ReadingA1, req.ReadingB1, req.ReadingB2, req.ReadingA2))
                return Results.BadRequest(new { message = "Seleccione dos pesas distintas e ingrese resolución y las cuatro lecturas ABBA." });
            var weights = (await metrologyCatalog.ListCalibrationAssetsAsync(tenantId.Value, ct))
                .Where(a => a.Source == "StandardWeight").ToList();
            var target = weights.FirstOrDefault(a => a.Id == req.TargetWeightId);
            var master = weights.FirstOrDefault(a => a.Id == req.MasterWeightId);
            if (target is null || master is null)
                return Results.BadRequest(new { message = "Las pesas deben existir en Metrología." });

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
                WeightUsed = string.IsNullOrWhiteSpace(req.WeightUsed) ? (target.Extra ?? target.Description) : req.WeightUsed.Trim(),
                Instrument = req.Instrument?.Trim() ?? string.Empty,
                EquipmentId = req.EquipmentId,
                Readings = req.Readings?.Trim() ?? string.Empty,
                TargetWeightId = target.Id,
                MasterWeightId = master.Id,
                TargetWeightCode = target.Code,
                MasterWeightCode = master.Code,
                ComparatorResolution = req.ComparatorResolution,
                ReadingA1 = req.ReadingA1,
                ReadingB1 = req.ReadingB1,
                ReadingB2 = req.ReadingB2,
                ReadingA2 = req.ReadingA2,
                MeanDifference = MeanDifference(req.ReadingA1, req.ReadingB1, req.ReadingB2, req.ReadingA2),
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
            IMetrologyAssetCatalog metrologyCatalog,
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

            if (req.TargetWeightId.HasValue || req.MasterWeightId.HasValue)
            {
                var weights = (await metrologyCatalog.ListCalibrationAssetsAsync(tenantId.Value, ct))
                    .Where(asset => asset.Source == "StandardWeight").ToList();
                if (req.TargetWeightId.HasValue)
                {
                    var target = weights.FirstOrDefault(asset => asset.Id == req.TargetWeightId.Value);
                    if (target is null) return Results.BadRequest(new { message = "Pesa objetivo no encontrada." });
                    entity.TargetWeightId = target.Id;
                    entity.TargetWeightCode = target.Code;
                }
                if (req.MasterWeightId.HasValue)
                {
                    var master = weights.FirstOrDefault(asset => asset.Id == req.MasterWeightId.Value);
                    if (master is null) return Results.BadRequest(new { message = "Patrón maestro no encontrado." });
                    entity.MasterWeightId = master.Id;
                    entity.MasterWeightCode = master.Code;
                }
            }
            if (req.ComparatorResolution.HasValue) entity.ComparatorResolution = req.ComparatorResolution;
            if (req.ReadingA1.HasValue) entity.ReadingA1 = req.ReadingA1;
            if (req.ReadingB1.HasValue) entity.ReadingB1 = req.ReadingB1;
            if (req.ReadingB2.HasValue) entity.ReadingB2 = req.ReadingB2;
            if (req.ReadingA2.HasValue) entity.ReadingA2 = req.ReadingA2;
            if (entity.TargetWeightId.HasValue && !HasCompleteAbba(entity.TargetWeightId, entity.MasterWeightId,
                    entity.ComparatorResolution, entity.ReadingA1, entity.ReadingB1, entity.ReadingB2, entity.ReadingA2))
                return Results.BadRequest(new { message = "Complete las cuatro lecturas ABBA y la resolución." });
            entity.MeanDifference = MeanDifference(entity.ReadingA1, entity.ReadingB1, entity.ReadingB2, entity.ReadingA2);

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

                if (becomingCompleted && (entity.EquipmentId.HasValue || entity.TargetWeightId.HasValue))
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
        // El programa se ve por año: cada ítem trae sus meses de ese año (P = programado, R = realizado).
        group.MapGet("/records/pg14/r06", async (int? year, ITenantContext tenant, QualityDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);
            var programYear = year ?? ArgentinaTime.TodayAsUtcDate(DateTimeOffset.UtcNow).Year;
            var items = await db.MaintenancePlanItems.AsNoTracking().Where(r => r.TenantId == tenantId).ToListAsync(ct);
            var marks = (await db.MaintenanceMonths.AsNoTracking().Where(m => m.TenantId == tenantId).ToListAsync(ct))
                .ToLookup(m => m.ItemId);
            // Entran los ítems con meses en ese año y los activos todavía sin programar.
            var rows = items
                .Where(r => marks[r.Id].Any(m => m.Year == programYear) || (r.Status == QualityMaintenanceStatuses.Active && !marks[r.Id].Any()))
                .OrderBy(r => r.EquipmentCode).ThenBy(r => r.Number)
                .ToList();
            return Results.Ok(new
            {
                code = "PG14-R06",
                title = "Programa de mantenimiento preventivo",
                recordKind = QualityRecordKinds.Structured,
                generatedAtUtc = DateTime.UtcNow,
                programYear,
                years = marks.SelectMany(g => g.Select(m => m.Year)).Append(programYear).Distinct().OrderBy(y => y),
                activeCount = rows.Count(r => r.Status == QualityMaintenanceStatuses.Active),
                overdueCount = rows.Count(r => IsOverdue(r, marks[r.Id])),
                rows = rows.Select(r => ToMaintenanceDto(r, marks[r.Id].ToList(), programYear))
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
            var marks = await db.MaintenanceMonths.AsNoTracking().Where(m => m.ItemId == id).ToListAsync(ct);
            return Results.Ok(ToMaintenanceDto(entity, marks, ArgentinaTime.TodayAsUtcDate(DateTimeOffset.UtcNow).Year));
        });

        group.MapPost("/records/pg14/r06", async (
            CreateMaintenancePlanItemRequest req,
            ITenantContext tenant,
            QualityDbContext db,
            IMetrologyAssetCatalog metrologyCatalog,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId;
            await db.EnsureQualityTablesAsync(ct);
            if (req.EquipmentId == Guid.Empty)
                return Results.BadRequest(new { message = "Seleccione un activo del listado." });
            if (string.IsNullOrWhiteSpace(req.Activity))
                return Results.BadRequest(new { message = "La actividad es obligatoria." });
            var source = string.IsNullOrWhiteSpace(req.AssetSource)
                ? QualityEquipmentLogAssetSources.QualityEquipment
                : NormalizeAllowed(req.AssetSource, AllowedLogAssetSources);
            if (source is null) return Results.BadRequest(new { message = "Origen del activo inválido." });
            var resolved = await ResolveAssetAsync(db, metrologyCatalog, tenantId, source,
                req.EquipmentId, null, null, ct);
            if (resolved is null) return Results.BadRequest(new { message = "El activo seleccionado no existe." });
            if (source == QualityEquipmentLogAssetSources.Instrument)
            {
                var instrument = (await metrologyCatalog.ListCalibrationAssetsAsync(tenantId.Value, ct))
                    .FirstOrDefault(a => a.Source == source && a.Id == req.EquipmentId);
                if (instrument?.Kind != "Thermometer")
                    return Results.BadRequest(new { message = "Seleccione un termómetro del listado." });
            }
            var frequency = string.IsNullOrWhiteSpace(req.Frequency)
                ? QualityMaintenanceFrequencies.Monthly
                : NormalizeAllowed(req.Frequency, AllowedFrequencies);
            if (frequency is null)
                return Results.BadRequest(new { message = "Frecuencia inválida." });
            if (req.FirstDate is not { } first || first.Year is < 2000 or > 2100)
                return Results.BadRequest(new { message = "Indicá el mes de la primera ejecución." });
            var number = await NextNumberAsync(
                db.MaintenancePlanItems.AsNoTracking()
                    .Where(r => r.TenantId == tenantId)
                    .Select(r => r.Number),
                $"MP-{first.Year}-",
                ct);
            var entity = new QualityMaintenancePlanItem
            {
                TenantId = tenantId,
                RecordCode = "PG14-R06",
                Number = number,
                EquipmentId = req.EquipmentId,
                AssetSource = source,
                EquipmentCode = resolved.Value.Code,
                EquipmentDescription = resolved.Value.Description,
                Activity = req.Activity.Trim(),
                Frequency = frequency,
                Responsible = req.Responsible?.Trim() ?? string.Empty,
                Status = QualityMaintenanceStatuses.Active,
                Notes = req.Notes?.Trim() ?? string.Empty,
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow
            };
            // Programa los meses desde la primera ejecución según la frecuencia, por 24 meses (cruzando años).
            var marks = new List<QualityMaintenanceMonth>();
            var start = new DateTime(first.Year, first.Month, 1, 0, 0, 0, DateTimeKind.Utc);
            for (var date = start; date < start.AddMonths(24) || marks.Count == 0; date = AdvanceByFrequency(date, frequency))
                marks.Add(new QualityMaintenanceMonth { TenantId = tenantId, ItemId = entity.Id, Year = date.Year, Month = date.Month });
            Recompute(entity, marks);
            db.MaintenancePlanItems.Add(entity);
            db.MaintenanceMonths.AddRange(marks);
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.MaintenancePlanItem, entity.Id, "MaintenancePlanItemCreated",
                $"Plan {entity.Number} creado para {entity.EquipmentCode}.", null, ToMaintenanceDto(entity, marks, start.Year), http);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/quality/records/pg14/r06/{entity.Id}", ToMaintenanceDto(entity, marks, start.Year));
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
            var marks = await db.MaintenanceMonths.Where(m => m.ItemId == id).ToListAsync(ct);
            var year = req.Year ?? ArgentinaTime.TodayAsUtcDate(DateTimeOffset.UtcNow).Year;
            var before = ToMaintenanceDto(entity, marks, year);

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
                    return Results.BadRequest(new { message = "Frecuencia inválida." });
                entity.Frequency = frequency;
            }
            // Un mes de un año: "P" programado, "R" realizado (va a la hoja de vida) o "-" sin programar.
            if (req.Month.HasValue)
            {
                if (req.Month.Value is < 1 or > 12 || year is < 2000 or > 2100 || req.MonthValue is not ("P" or "R" or "-"))
                    return Results.BadRequest(new { message = "Mes, año o estado inválido. Use P (programado), R (realizado) o -." });
                var mark = marks.FirstOrDefault(m => m.Year == year && m.Month == req.Month.Value);
                var wasDone = mark?.Status == QualityMaintenanceMonthStatuses.Done;
                if (req.MonthValue == "-")
                {
                    if (mark is not null)
                    {
                        db.MaintenanceMonths.Remove(mark);
                        marks.Remove(mark);
                    }
                }
                else
                {
                    if (mark is null)
                    {
                        mark = new QualityMaintenanceMonth { TenantId = tenantId, ItemId = id, Year = year, Month = req.Month.Value };
                        db.MaintenanceMonths.Add(mark);
                        marks.Add(mark);
                    }
                    mark.Status = req.MonthValue;
                    if (!wasDone && req.MonthValue == QualityMaintenanceMonthStatuses.Done)
                        await TryCreateMaintenanceLogAsync(db, tenantId, entity,
                            new DateTime(year, req.Month.Value, 15, 0, 0, 0, DateTimeKind.Utc), http, ct);
                }
            }
            if (req.Responsible is not null) entity.Responsible = req.Responsible.Trim();
            if (req.Notes is not null) entity.Notes = req.Notes.Trim();
            if (req.Status is not null)
            {
                var st = NormalizeAllowed(req.Status, AllowedMaintenanceStatuses);
                if (st is null)
                    return Results.BadRequest(new { message = "Estado inválido. Use Active, Done o Cancelled." });
                entity.Status = st;
            }
            Recompute(entity, marks);
            entity.UpdatedAtUtc = DateTime.UtcNow;
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.MaintenancePlanItem, entity.Id, "MaintenancePlanItemUpdated",
                $"Plan {entity.Number} actualizado ({entity.Status}).", before, ToMaintenanceDto(entity, marks, year), http);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToMaintenanceDto(entity, marks, year));
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
            var marks = await db.MaintenanceMonths.AsNoTracking().Where(m => m.ItemId == id).ToListAsync(ct);
            var year = ArgentinaTime.TodayAsUtcDate(DateTimeOffset.UtcNow).Year;
            var before = ToMaintenanceDto(entity, marks, year);
            entity.Status = QualityMaintenanceStatuses.Cancelled;
            entity.UpdatedAtUtc = DateTime.UtcNow;
            QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.MaintenancePlanItem, entity.Id, "MaintenancePlanItemCancelled",
                $"Plan {entity.Number} anulado.", before, ToMaintenanceDto(entity, marks, year), http);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToMaintenanceDto(entity, marks, year));
        });
    }

    /// <summary>Próximo vencimiento = primer mes programado sin realizar; último realizado = el R más reciente.</summary>
    private static void Recompute(QualityMaintenancePlanItem item, IEnumerable<QualityMaintenanceMonth> marks)
    {
        var list = marks.ToList();
        item.NextDue = list.Where(m => m.Status == QualityMaintenanceMonthStatuses.Planned)
            .Select(m => (DateTime?)MonthEnd(m)).OrderBy(d => d).FirstOrDefault();
        item.LastDone = list.Where(m => m.Status == QualityMaintenanceMonthStatuses.Done)
            .Select(m => (DateTime?)new DateTime(m.Year, m.Month, 15, 0, 0, 0, DateTimeKind.Utc)).OrderByDescending(d => d).FirstOrDefault();
    }

    private static DateTime MonthEnd(QualityMaintenanceMonth m) =>
        new(m.Year, m.Month, DateTime.DaysInMonth(m.Year, m.Month), 0, 0, 0, DateTimeKind.Utc);

    private static string? NormalizeAllowed(string? value, HashSet<string> allowed)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var trimmed = value.Trim();
        return allowed.Contains(trimmed) ? trimmed : null;
    }

    private static bool IsOverdue(QualityMaintenancePlanItem r, IEnumerable<QualityMaintenanceMonth> marks) =>
        r.Status == QualityMaintenanceStatuses.Active
        && marks.Any(m => m.Status == QualityMaintenanceMonthStatuses.Planned && MonthEnd(m) < ArgentinaTime.TodayAsUtcDate(DateTimeOffset.UtcNow));

    private static bool IsDueSoon(QualityMaintenancePlanItem r, IEnumerable<QualityMaintenanceMonth> marks) =>
        r.Status == QualityMaintenanceStatuses.Active
        && marks.Any(m => m.Status == QualityMaintenanceMonthStatuses.Planned && MonthEnd(m) < ArgentinaTime.TodayAsUtcDate(DateTimeOffset.UtcNow).AddDays(30));

    private static DateTime AdvanceByFrequency(DateTime from, string frequency) =>
        frequency switch
        {
            QualityMaintenanceFrequencies.Quarterly => from.AddMonths(3),
            QualityMaintenanceFrequencies.Semiannual => from.AddMonths(6),
            QualityMaintenanceFrequencies.Annual => from.AddYears(1),
            QualityMaintenanceFrequencies.Biennial => from.AddYears(2),
            _ => from.AddMonths(1)
        };

    private static bool HasCompleteAbba(Guid? target, Guid? master, decimal? resolution,
        decimal? a1, decimal? b1, decimal? b2, decimal? a2) =>
        target.HasValue && master.HasValue && target != master && resolution > 0
        && a1.HasValue && b1.HasValue && b2.HasValue && a2.HasValue;

    private static decimal? MeanDifference(decimal? a1, decimal? b1, decimal? b2, decimal? a2) =>
        a1.HasValue && b1.HasValue && b2.HasValue && a2.HasValue
            ? ((b1.Value - a1.Value) + (b2.Value - a2.Value)) / 2m : null;

    private static bool IsReferenceMass(MetrologyCatalogAsset asset)
    {
        var parts = asset.Extra?.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return parts is { Length: >= 2 } && parts[1].Equals("kg", StringComparison.OrdinalIgnoreCase)
            && decimal.TryParse(parts[0].Replace(',', '.'), System.Globalization.NumberStyles.AllowDecimalPoint,
                System.Globalization.CultureInfo.InvariantCulture, out var mass)
            && Math.Abs(mass - 1000m) <= 1m;
    }

    private static object[] BuildCheckSchedule(IReadOnlyList<MetrologyCatalogAsset> assets,
        IReadOnlyList<QualityIntermediateCheck> checks)
    {
        var now = ArgentinaTime.TodayAsUtcDate(DateTimeOffset.UtcNow);
        return assets.Where(a => a.Source == "StandardWeight").Select(asset =>
        {
            var last = checks.Where(c => c.TargetWeightId == asset.Id && c.Status == QualityIntermediateCheckStatuses.Completed)
                .OrderByDescending(c => c.CheckDate).FirstOrDefault();
            var next = last?.CheckDate.Date.AddMonths(6);
            var status = next is null ? "due_soon" : now > next ? "overdue"
                : now >= next.Value.AddDays(-30) ? "due_soon" : "ok";
            return (object)new { weightId = asset.Id, code = asset.Code, mass = asset.Extra,
                isReferenceMass = IsReferenceMass(asset),
                lastDate = last?.CheckDate, nextDate = next, status };
        }).ToArray();
    }

    private static async Task TryCreateMaintenanceLogAsync(QualityDbContext db, TenantId tenantId,
        QualityMaintenancePlanItem item, DateTime doneDate, HttpContext http, CancellationToken ct)
    {
        var marker = $"Origen R06 {item.Number} {doneDate:yyyy-MM}";
        if (await db.EquipmentLogEntries.AsNoTracking().AnyAsync(r => r.TenantId == tenantId
            && r.Kind == QualityEquipmentLogKinds.PreventiveMaintenance && r.Notes == marker, ct)) return;
        var number = await NextNumberAsync(db.EquipmentLogEntries.AsNoTracking()
            .Where(r => r.TenantId == tenantId).Select(r => r.Number), $"HV-{doneDate.Year}-", ct);
        var log = new QualityEquipmentLogEntry
        {
            TenantId = tenantId, RecordCode = "PG14-R01", Number = number,
            AssetSource = item.AssetSource,
            AssetId = item.EquipmentId, AssetCode = item.EquipmentCode,
            AssetDescription = item.EquipmentDescription, EventDate = doneDate,
            Kind = QualityEquipmentLogKinds.PreventiveMaintenance,
            Description = $"Mantenimiento preventivo: {item.Activity}",
            Responsible = item.Responsible, Status = QualityEquipmentLogStatuses.Active,
            Notes = marker, CreatedAtUtc = DateTime.UtcNow, UpdatedAtUtc = DateTime.UtcNow
        };
        db.EquipmentLogEntries.Add(log);
        QualityAudit.Record(db, tenantId, QualityAuditEntityTypes.EquipmentLogEntry, log.Id,
            "EquipmentLogEntryFromMaintenance", $"Evento {log.Number} desde {item.Number}.", null, ToLogDto(log), http);
    }

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
        r.TargetWeightId, r.MasterWeightId,
        r.TargetWeightCode, r.MasterWeightCode,
        r.ComparatorResolution, r.ReadingA1, r.ReadingB1, r.ReadingB2, r.ReadingA2, r.MeanDifference,
        r.Result,
        r.Responsible,
        r.EvidenceFileId,
        r.Status,
        r.Notes,
        r.CreatedAtUtc,
        r.UpdatedAtUtc
    };

    /// <summary>months: los 12 meses del año pedido (P, R o -); schedule: todos los meses programados, con su año.</summary>
    private static object ToMaintenanceDto(QualityMaintenancePlanItem r, IReadOnlyCollection<QualityMaintenanceMonth> marks, int year) => new
    {
        r.Id,
        r.RecordCode,
        r.Number,
        r.EquipmentId,
        r.AssetSource,
        r.EquipmentCode,
        r.EquipmentDescription,
        r.Activity,
        ProgramYear = year,
        Months = new string(Enumerable.Range(1, 12).Select(m => marks.FirstOrDefault(x => x.Year == year && x.Month == m)?.Status[0] ?? '-').ToArray()),
        Schedule = marks.OrderBy(m => m.Year).ThenBy(m => m.Month).Select(m => new { m.Year, m.Month, m.Status }),
        r.Frequency,
        r.NextDue,
        r.LastDone,
        r.Responsible,
        r.Status,
        isOverdue = IsOverdue(r, marks),
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
            string.IsNullOrWhiteSpace(assetCode) ? match.Label : assetCode.Trim(),
            string.IsNullOrWhiteSpace(assetDescription) ? match.Description : assetDescription.Trim());
    }

    private static async Task TryCreateVerificationLogFromCheckAsync(
        QualityDbContext db,
        TenantId tenantId,
        QualityIntermediateCheck check,
        HttpContext http,
        CancellationToken ct)
    {
        if (!check.EquipmentId.HasValue && !check.TargetWeightId.HasValue) return;
        var eq = check.EquipmentId.HasValue ? await db.Equipments.AsNoTracking()
            .FirstOrDefaultAsync(e => e.Id == check.EquipmentId.Value && e.TenantId == tenantId, ct) : null;
        if (check.EquipmentId.HasValue && eq is null) return;
        var source = check.TargetWeightId.HasValue ? QualityEquipmentLogAssetSources.StandardWeight
            : QualityEquipmentLogAssetSources.QualityEquipment;
        var assetId = check.TargetWeightId ?? eq!.Id;
        var assetCode = check.TargetWeightId.HasValue ? check.TargetWeightCode : eq!.Code;
        var assetDescription = check.TargetWeightId.HasValue ? check.WeightUsed : eq!.Description;

        var already = await db.EquipmentLogEntries.AsNoTracking()
            .AnyAsync(r => r.TenantId == tenantId
                && r.Status == QualityEquipmentLogStatuses.Active
                && r.Kind == QualityEquipmentLogKinds.Verification
                && r.AssetSource == source
                && r.AssetId == assetId
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
            AssetSource = source,
            AssetId = assetId,
            AssetCode = assetCode,
            AssetDescription = assetDescription,
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
