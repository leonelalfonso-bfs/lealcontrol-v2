using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace LealControl.Modules.Metrology.Infrastructure;

public static class MetrologyEndpoints
{
    public static IServiceCollection AddMetrologyModule(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("Database")
            ?? "Host=localhost;Port=5432;Database=lealcontrol;Username=leal;Password=leal";

        services.AddDbContext<MetrologyDbContext>(options =>
            options.UseNpgsql(connectionString, b => b.MigrationsAssembly(typeof(MetrologyDbContext).Assembly.FullName)));

        return services;
    }

    public static IEndpointRouteBuilder MapMetrologyModule(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/metrology").WithTags("Metrology & Quality Professional");

        // ====================================================================
        // 1. Dashboard de Metrología
        // ====================================================================
        group.MapGet("/dashboard", async (ITenantContext tenantContext, MetrologyDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            await db.SeedDefaultMetrologyDataAsync(tenantId, ct);

            var totalEquipments = await db.Equipments.CountAsync(e => e.TenantId == tenantId, ct);
            var activeEquipments = await db.Equipments.CountAsync(e => e.TenantId == tenantId && e.Status == "Active", ct);
            var expiredCalibrations = await db.Equipments.CountAsync(e => e.TenantId == tenantId && e.NextCalibrationDate.HasValue && e.NextCalibrationDate.Value < DateTime.UtcNow, ct);
            
            var totalWeights = await db.StandardWeights.CountAsync(w => w.TenantId == tenantId, ct);
            var validWeights = await db.StandardWeights.CountAsync(w => w.TenantId == tenantId && w.Status == "Valid" && (!w.ExpirationDate.HasValue || w.ExpirationDate.Value >= DateTime.UtcNow), ct);
            var expiredWeights = await db.StandardWeights.CountAsync(w => w.TenantId == tenantId && w.ExpirationDate.HasValue && w.ExpirationDate.Value < DateTime.UtcNow, ct);

            var totalReports = await db.CalibrationReports.CountAsync(r => r.TenantId == tenantId, ct);
            var recentReports = await db.CalibrationReports
                .AsNoTracking()
                .Where(r => r.TenantId == tenantId)
                .OrderByDescending(r => r.CalibrationDate)
                .Take(5)
                .ToListAsync(ct);

            return Results.Ok(new
            {
                Equipments = new { Total = totalEquipments, Active = activeEquipments, Expired = expiredCalibrations },
                Weights = new { Total = totalWeights, Valid = validWeights, Expired = expiredWeights },
                Reports = new { Total = totalReports, Recent = recentReports }
            });
        });

        // ====================================================================
        // 2. Parque de Instrumentos / Balanzas (Equipment)
        // ====================================================================
        group.MapGet("/equipment", async (
            [FromQuery] string? search,
            [FromQuery] Guid? customerId,
            [FromQuery] string? status,
            ITenantContext tenantContext,
            MetrologyDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            await db.SeedDefaultMetrologyDataAsync(tenantId, ct);

            var query = db.Equipments.AsNoTracking().Where(e => e.TenantId == tenantId);

            if (!string.IsNullOrWhiteSpace(search))
            {
                var s = search.Trim().ToLowerInvariant();
                query = query.Where(e =>
                    e.Code.ToLower().Contains(s) ||
                    e.Description.ToLower().Contains(s) ||
                    e.Brand.ToLower().Contains(s) ||
                    e.Model.ToLower().Contains(s) ||
                    e.SerialNumber.ToLower().Contains(s) ||
                    e.CustomerName.ToLower().Contains(s));
            }

            if (customerId.HasValue && customerId.Value != Guid.Empty)
            {
                query = query.Where(e => e.CustomerId == customerId.Value);
            }

            if (!string.IsNullOrWhiteSpace(status))
            {
                query = query.Where(e => e.Status.ToLower() == status.Trim().ToLower());
            }

            var list = await query.OrderBy(e => e.Code).ToListAsync(ct);
            return Results.Ok(list);
        });

        group.MapGet("/equipment/{id:guid}", async (Guid id, ITenantContext tenantContext, MetrologyDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            var equipment = await db.Equipments.AsNoTracking().FirstOrDefaultAsync(e => e.Id == id && e.TenantId == tenantId, ct);
            if (equipment == null) return Results.NotFound(new { message = "Instrumento no encontrado." });

            var reportsHistory = await db.CalibrationReports
                .AsNoTracking()
                .Where(r => r.TenantId == tenantId && r.EquipmentId == id)
                .OrderByDescending(r => r.CalibrationDate)
                .ToListAsync(ct);

            return Results.Ok(new
            {
                Equipment = equipment,
                History = reportsHistory
            });
        });

        group.MapPost("/equipment", async (
            CreateEquipmentRequest req,
            ITenantContext tenantContext,
            MetrologyDbContext db,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(req.Code) || string.IsNullOrWhiteSpace(req.Description))
            {
                return Results.BadRequest(new { message = "Código y descripción del instrumento son obligatorios." });
            }

            var tenantId = tenantContext.TenantId;
            var exists = await db.Equipments.AnyAsync(e => e.TenantId == tenantId && e.Code == req.Code.Trim(), ct);
            if (exists)
            {
                return Results.BadRequest(new { message = $"Ya existe un equipo con el código '{req.Code}'." });
            }

            var equipment = new MetrologyEquipment(
                Guid.NewGuid(),
                tenantId,
                req.Code.Trim(),
                req.Description.Trim(),
                req.Brand?.Trim() ?? "",
                req.Model?.Trim() ?? "",
                req.SerialNumber?.Trim() ?? "",
                req.CustomerId,
                req.CustomerName?.Trim() ?? "",
                req.Location?.Trim() ?? "",
                req.MaxCapacity,
                req.MinCapacity,
                req.DivisionD,
                req.VerificationIntervalE,
                req.Unit ?? "kg",
                req.AccuracyClass ?? "III",
                req.IndicationType ?? "Digital",
                req.LoadCellsCount > 0 ? req.LoadCellsCount : 6,
                req.HasTare
            )
            {
                Notes = req.Notes
            };

            db.Equipments.Add(equipment);
            await db.SaveChangesAsync(ct);

            return Results.Created($"/api/v1/metrology/equipment/{equipment.Id}", equipment);
        });

        group.MapPut("/equipment/{id:guid}", async (
            Guid id,
            UpdateEquipmentRequest req,
            ITenantContext tenantContext,
            MetrologyDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            var equipment = await db.Equipments.FirstOrDefaultAsync(e => e.Id == id && e.TenantId == tenantId, ct);
            if (equipment == null) return Results.NotFound(new { message = "Instrumento no encontrado." });

            if (!string.IsNullOrWhiteSpace(req.Code) && req.Code.Trim() != equipment.Code)
            {
                var codeExists = await db.Equipments.AnyAsync(e => e.TenantId == tenantId && e.Code == req.Code.Trim() && e.Id != id, ct);
                if (codeExists)
                {
                    return Results.BadRequest(new { message = $"Ya existe otro equipo con el código '{req.Code}'." });
                }
                equipment.Code = req.Code.Trim();
            }

            equipment.Description = req.Description.Trim();
            equipment.Brand = req.Brand?.Trim() ?? "";
            equipment.Model = req.Model?.Trim() ?? "";
            equipment.SerialNumber = req.SerialNumber?.Trim() ?? "";
            equipment.CustomerId = req.CustomerId;
            equipment.CustomerName = req.CustomerName?.Trim() ?? "";
            equipment.Location = req.Location?.Trim() ?? "";
            equipment.MaxCapacity = req.MaxCapacity;
            equipment.MinCapacity = req.MinCapacity;
            equipment.DivisionD = req.DivisionD;
            equipment.VerificationIntervalE = req.VerificationIntervalE;
            if (!string.IsNullOrWhiteSpace(req.Unit)) equipment.Unit = req.Unit.Trim();
            if (!string.IsNullOrWhiteSpace(req.AccuracyClass)) equipment.AccuracyClass = req.AccuracyClass.Trim();
            if (!string.IsNullOrWhiteSpace(req.IndicationType)) equipment.IndicationType = req.IndicationType.Trim();
            if (req.LoadCellsCount > 0) equipment.LoadCellsCount = req.LoadCellsCount;
            equipment.HasTare = req.HasTare;
            if (!string.IsNullOrWhiteSpace(req.Status)) equipment.Status = req.Status.Trim();
            equipment.Notes = req.Notes;

            await db.SaveChangesAsync(ct);
            return Results.Ok(equipment);
        });

        group.MapDelete("/equipment/{id:guid}", async (Guid id, ITenantContext tenantContext, MetrologyDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            var equipment = await db.Equipments.FirstOrDefaultAsync(e => e.Id == id && e.TenantId == tenantId, ct);
            if (equipment == null) return Results.NotFound(new { message = "Instrumento no encontrado." });

            var hasReports = await db.CalibrationReports.AnyAsync(r => r.TenantId == tenantId && r.EquipmentId == id, ct);
            if (hasReports)
            {
                return Results.BadRequest(new { message = $"No se puede eliminar el instrumento '{equipment.Code}' porque tiene certificados de calibración asociados. Puede cambiar su estado a 'Fuera de Servicio'." });
            }

            db.Equipments.Remove(equipment);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { message = "Instrumento eliminado correctamente." });
        });

        // ====================================================================
        // 3. Padrón de Pesas Patrón (Standard Weights)
        // ====================================================================
        group.MapGet("/weights", async (ITenantContext tenantContext, MetrologyDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            await db.SeedDefaultMetrologyDataAsync(tenantId, ct);

            var weights = await db.StandardWeights
                .AsNoTracking()
                .Where(w => w.TenantId == tenantId)
                .OrderBy(w => w.NominalValue)
                .ThenBy(w => w.Code)
                .ToListAsync(ct);

            // Auto-update status if expired
            foreach (var w in weights)
            {
                if (w.ExpirationDate.HasValue && w.ExpirationDate.Value < DateTime.UtcNow)
                {
                    w.Status = "Expired";
                }
            }

            return Results.Ok(weights);
        });

        group.MapPost("/weights", async (
            CreateStandardWeightRequest req,
            ITenantContext tenantContext,
            MetrologyDbContext db,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(req.Code))
            {
                return Results.BadRequest(new { message = "El código de la pesa patrón es obligatorio." });
            }

            var tenantId = tenantContext.TenantId;
            var exists = await db.StandardWeights.AnyAsync(w => w.TenantId == tenantId && w.Code == req.Code.Trim(), ct);
            if (exists)
            {
                return Results.BadRequest(new { message = $"Ya existe una pesa con el código '{req.Code}'." });
            }

            var weight = new StandardWeight(
                Guid.NewGuid(),
                tenantId,
                req.Code.Trim(),
                req.SerialNumber?.Trim() ?? "",
                req.NominalValue,
                req.Unit ?? "kg",
                req.AccuracyClass ?? "M1",
                req.Material ?? "Hierro Fundido",
                req.ConventionalMassCorrection,
                req.Uncertainty,
                req.CertificateNumber?.Trim() ?? "",
                req.TraceabilityLab ?? "INTI - Metrología Legal",
                req.CalibrationDate,
                req.ExpirationDate
            );

            db.StandardWeights.Add(weight);
            await db.SaveChangesAsync(ct);

            return Results.Created($"/api/v1/metrology/weights/{weight.Id}", weight);
        });

        group.MapDelete("/weights/{id:guid}", async (Guid id, ITenantContext tenantContext, MetrologyDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            var weight = await db.StandardWeights.FirstOrDefaultAsync(w => w.Id == id && w.TenantId == tenantId, ct);
            if (weight == null) return Results.NotFound(new { message = "Pesa patrón no encontrada." });

            db.StandardWeights.Remove(weight);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { message = "Pesa patrón eliminada correctamente." });
        });

        // ====================================================================
        // 4. Motor de Reglas & Cálculo Metrológico
        // ====================================================================
        group.MapPost("/calculate-rules", (CalculateMetrologyRulesRequest req) =>
        {
            var points = MetrologyRuleEngine.GenerateLinearityTestPoints(
                req.MinCapacity,
                req.MaxCapacity,
                req.VerificationIntervalE,
                req.AccuracyClass
            );

            var eccentricity = MetrologyRuleEngine.GenerateEccentricityConfig(
                req.MaxCapacity,
                req.VerificationIntervalE,
                req.LoadCellsCount,
                req.AccuracyClass
            );

            var repeatabilityEmt = MetrologyRuleEngine.CalculateEMT(
                req.MaxCapacity * 0.5m,
                req.VerificationIntervalE,
                req.AccuracyClass,
                isInService: true
            );

            return Results.Ok(new
            {
                LinearityPoints = points,
                EccentricityConfig = eccentricity,
                RepeatabilityConfig = new
                {
                    HalfMaxLoad = req.MaxCapacity * 0.5m,
                    FullMaxLoad = req.MaxCapacity,
                    Emt = repeatabilityEmt,
                    RecommendedRepetitions = 3
                }
            });
        });

        // ====================================================================
        // 5. Informes & Certificados de Calibración
        // ====================================================================
        group.MapGet("/reports", async (
            [FromQuery] Guid? equipmentId,
            [FromQuery] Guid? customerId,
            ITenantContext tenantContext,
            MetrologyDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            var query = db.CalibrationReports.AsNoTracking().Where(r => r.TenantId == tenantId);

            if (equipmentId.HasValue && equipmentId.Value != Guid.Empty)
            {
                query = query.Where(r => r.EquipmentId == equipmentId.Value);
            }

            if (customerId.HasValue && customerId.Value != Guid.Empty)
            {
                query = query.Where(r => r.CustomerId == customerId.Value);
            }

            var list = await query.OrderByDescending(r => r.CalibrationDate).ToListAsync(ct);
            return Results.Ok(list);
        });

        group.MapGet("/reports/{id:guid}", async (Guid id, ITenantContext tenantContext, MetrologyDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            var report = await db.CalibrationReports.AsNoTracking().FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tenantId, ct);
            if (report == null) return Results.NotFound(new { message = "Informe de calibración no encontrado." });

            var equipment = await db.Equipments.AsNoTracking().FirstOrDefaultAsync(e => e.Id == report.EquipmentId && e.TenantId == tenantId, ct);

            return Results.Ok(new
            {
                Report = report,
                Equipment = equipment
            });
        });

        group.MapPost("/reports", async (
            SaveCalibrationReportRequest req,
            ITenantContext tenantContext,
            MetrologyDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            var equipment = await db.Equipments.FirstOrDefaultAsync(e => e.Id == req.EquipmentId && e.TenantId == tenantId, ct);
            if (equipment == null) return Results.BadRequest(new { message = "El instrumento especificado no existe." });

            // Generate report number if not provided
            var maxReportNum = await db.CalibrationReports
                .Where(r => r.TenantId == tenantId && r.CalibrationDate.Year == req.CalibrationDate.Year)
                .CountAsync(ct) + 1;

            var reportNumber = !string.IsNullOrWhiteSpace(req.ReportNumber)
                ? req.ReportNumber.Trim()
                : $"CAL-{req.CalibrationDate.Year}-{maxReportNum:D4}";

            var report = new CalibrationReport
            {
                TenantId = tenantId,
                ReportNumber = reportNumber,
                CertificateType = req.CertificateType ?? "Ensayo Oficial Res. 67/2025",
                NormativeApplied = req.NormativeApplied ?? "Resolución 67/2025 (OIML R 76-1)",
                EquipmentId = equipment.Id,
                EquipmentCode = equipment.Code,
                EquipmentDescription = equipment.Description,
                CustomerId = req.CustomerId ?? equipment.CustomerId,
                CustomerName = !string.IsNullOrWhiteSpace(req.CustomerName) ? req.CustomerName : equipment.CustomerName,
                CustomerAddress = req.CustomerAddress ?? "",
                CustomerCuit = req.CustomerCuit ?? "",
                Location = !string.IsNullOrWhiteSpace(req.Location) ? req.Location : equipment.Location,
                CalibrationDate = req.CalibrationDate,
                NextCalibrationDate = req.NextCalibrationDate ?? req.CalibrationDate.AddYears(1),
                PerformedBy = req.PerformedBy?.Trim() ?? "Metrólogo Autorizado",
                AmbientTemperature = req.AmbientTemperature,
                AmbientHumidity = req.AmbientHumidity,
                AtmosphericPressure = req.AtmosphericPressure,
                InitialInspectionPassed = req.InitialInspectionPassed,
                InspectionNotes = req.InspectionNotes,
                RepeatabilityDataJson = req.RepeatabilityDataJson ?? "[]",
                EccentricityDataJson = req.EccentricityDataJson ?? "[]",
                LinearityDataJson = req.LinearityDataJson ?? "[]",
                UncertaintyDataJson = req.UncertaintyDataJson ?? "{}",
                WeightsUsedJson = req.WeightsUsedJson ?? "[]",
                ExpandedUncertainty = req.ExpandedUncertainty,
                Result = req.Result ?? "Apto",
                Observations = req.Observations,
                Status = req.Status ?? "Issued",
                CreatedAtUtc = DateTime.UtcNow
            };

            db.CalibrationReports.Add(report);

            // Update equipment calibration dates
            equipment.LastCalibrationDate = report.CalibrationDate;
            equipment.NextCalibrationDate = report.NextCalibrationDate;
            equipment.Status = report.Result == "Apto" ? "Active" : "Maintenance";

            await db.SaveChangesAsync(ct);

            return Results.Created($"/api/v1/metrology/reports/{report.Id}", report);
        });

        return endpoints;
    }
}
