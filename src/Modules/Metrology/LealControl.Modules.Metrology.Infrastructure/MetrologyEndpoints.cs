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
            try
            {
                var tenantId = tenantContext.TenantId;
                await db.EnsureMetrologyTablesAsync(ct);

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
                    equipments = new
                    {
                        total = totalEquipments,
                        active = activeEquipments,
                        expired = expiredCalibrations
                    },
                    weights = new
                    {
                        total = totalWeights,
                        valid = validWeights,
                        expired = expiredWeights
                    },
                    reports = new
                    {
                        total = totalReports,
                        recent = recentReports
                    },
                    Stats = new
                    {
                        TotalEquipments = totalEquipments,
                        ActiveEquipments = activeEquipments,
                        ExpiredCalibrations = expiredCalibrations,
                        TotalWeights = totalWeights,
                        ValidWeights = validWeights,
                        ExpiredWeights = expiredWeights,
                        TotalReports = totalReports
                    },
                    RecentReports = recentReports
                });
            }
            catch (Exception ex)
            {
                try { await db.EnsureMetrologyTablesAsync(ct); } catch { }
                return Results.Problem(detail: ex.Message, statusCode: 500);
            }
        });

        // ====================================================================
        // 2. Equipos e Instrumentos de Pesar (CRUD)
        // ====================================================================
        group.MapGet("/equipment", async (
            [FromQuery] string? search,
            [FromQuery] string? status,
            [FromQuery] Guid? customerId,
            ITenantContext tenantContext,
            MetrologyDbContext db,
            CancellationToken ct) =>
        {
            try
            {
                var tenantId = tenantContext.TenantId;
                await db.EnsureMetrologyTablesAsync(ct);
                var query = db.Equipments.AsNoTracking().Where(e => e.TenantId == tenantId);

                if (!string.IsNullOrWhiteSpace(search))
                {
                    var term = search.Trim().ToLower();
                    query = query.Where(e =>
                        e.Code.ToLower().Contains(term) ||
                        e.Description.ToLower().Contains(term) ||
                        e.Brand.ToLower().Contains(term) ||
                        e.Model.ToLower().Contains(term) ||
                        e.SerialNumber.ToLower().Contains(term) ||
                        e.CustomerName.ToLower().Contains(term) ||
                        e.Location.ToLower().Contains(term) ||
                        e.PlatformApprovalCode.ToLower().Contains(term) ||
                        e.PlatformApprovalNumber.ToLower().Contains(term) ||
                        e.Indicator1Brand.ToLower().Contains(term) ||
                        e.Indicator1Model.ToLower().Contains(term) ||
                        e.Indicator1ApprovalCode.ToLower().Contains(term) ||
                        e.Indicator1ApprovalNumber.ToLower().Contains(term) ||
                        e.Indicator2ApprovalCode.ToLower().Contains(term) ||
                        e.Indicator2ApprovalNumber.ToLower().Contains(term));
                }

                if (!string.IsNullOrWhiteSpace(status))
                {
                    query = query.Where(e => e.Status == status.Trim());
                }

                if (customerId.HasValue && customerId.Value != Guid.Empty)
                {
                    query = query.Where(e => e.CustomerId == customerId.Value);
                }

                var items = await query.OrderBy(e => e.Code).ToListAsync(ct);
                return Results.Ok(items);
            }
            catch (Exception ex)
            {
                try
                {
                    await db.EnsureMetrologyTablesAsync(ct);
                    var tenantId = tenantContext.TenantId;
                    var items = await db.Equipments.AsNoTracking().Where(e => e.TenantId == tenantId).OrderBy(e => e.Code).ToListAsync(ct);
                    return Results.Ok(items);
                }
                catch
                {
                    return Results.Problem(detail: ex.Message, statusCode: 500);
                }
            }
        });

        group.MapGet("/equipment/{id:guid}", async (Guid id, ITenantContext tenantContext, MetrologyDbContext db, CancellationToken ct) =>
        {
            try
            {
                var tenantId = tenantContext.TenantId;
                var equipment = await db.Equipments.AsNoTracking().FirstOrDefaultAsync(e => e.Id == id && e.TenantId == tenantId, ct);
                if (equipment == null) return Results.NotFound(new { message = "Instrumento no encontrado." });

                var reportsHistory = await db.CalibrationReports
                    .AsNoTracking()
                    .Where(r => r.EquipmentId == id && r.TenantId == tenantId)
                    .OrderByDescending(r => r.CalibrationDate)
                    .ToListAsync(ct);

                return Results.Ok(new
                {
                    Equipment = equipment,
                    History = reportsHistory
                });
            }
            catch (Exception ex)
            {
                return Results.Problem(detail: ex.Message, statusCode: 500);
            }
        });

        group.MapPost("/equipment", async (
            MetrologyEquipmentWriteDto req,
            ITenantContext tenantContext,
            MetrologyDbContext db,
            CancellationToken ct) =>
        {
            try
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

                var equipment = new MetrologyEquipment
                {
                    TenantId = tenantId,
                    Code = req.Code.Trim(),
                    Description = req.Description.Trim(),
                    Brand = req.Brand?.Trim() ?? "",
                    Model = req.Model?.Trim() ?? "",
                    SerialNumber = req.SerialNumber?.Trim() ?? "",
                    CustomerId = req.CustomerId,
                    CustomerName = req.CustomerName?.Trim() ?? "",
                    Location = req.Location?.Trim() ?? "",
                    ApplicableStandard = string.IsNullOrWhiteSpace(req.ApplicableStandard) ? "Res25_2025" : req.ApplicableStandard,
                    ApprovalCode = req.ApprovalCode?.Trim() ?? "",
                    PlatformType = string.IsNullOrWhiteSpace(req.PlatformType) ? "TruckScale" : req.PlatformType,
                    PlatformApprovalCode = req.PlatformApprovalCode?.Trim() ?? "",
                    PlatformApprovalNumber = req.PlatformApprovalNumber?.Trim() ?? "",
                    PlatformApprovalDate = req.PlatformApprovalDate,
                    PlatformDimensions = req.PlatformDimensions?.Trim() ?? "",
                    Indicator1Brand = req.Indicator1Brand?.Trim() ?? "",
                    Indicator1Model = req.Indicator1Model?.Trim() ?? "",
                    Indicator1SerialNumber = req.Indicator1SerialNumber?.Trim() ?? "",
                    Indicator1ApprovalCode = req.Indicator1ApprovalCode?.Trim() ?? "",
                    Indicator1ApprovalNumber = req.Indicator1ApprovalNumber?.Trim() ?? "",
                    Indicator1ApprovalDate = req.Indicator1ApprovalDate,
                    Indicator1Type = req.Indicator1Type?.Trim() ?? "Digital",
                    HasSecondaryIndicator = req.HasSecondaryIndicator,
                    Indicator2Brand = req.Indicator2Brand?.Trim() ?? "",
                    Indicator2Model = req.Indicator2Model?.Trim() ?? "",
                    Indicator2SerialNumber = req.Indicator2SerialNumber?.Trim() ?? "",
                    Indicator2ApprovalCode = req.Indicator2ApprovalCode?.Trim() ?? "",
                    Indicator2ApprovalNumber = req.Indicator2ApprovalNumber?.Trim() ?? "",
                    Indicator2ApprovalDate = req.Indicator2ApprovalDate,
                    Indicator2Type = req.Indicator2Type?.Trim() ?? "",
                    MaxCapacity = req.MaxCapacity,
                    MaximumOperationalLoad = req.MaximumOperationalLoad is > 0 ? req.MaximumOperationalLoad.Value : req.MaxCapacity,
                    MinCapacity = req.MinCapacity,
                    DivisionD = req.DivisionD,
                    VerificationIntervalE = req.VerificationIntervalE,
                    Unit = req.Unit ?? "kg",
                    AccuracyClass = req.AccuracyClass ?? "III",
                    IndicationType = req.IndicationType ?? "Digital",
                    LoadCellsCount = req.LoadCellsCount > 0 ? req.LoadCellsCount : 6,
                    HasTare = req.HasTare,
                    Status = "Active",
                    Notes = req.Notes,
                    CreatedAtUtc = DateTime.UtcNow
                };

                db.Equipments.Add(equipment);
                await db.SaveChangesAsync(ct);

                return Results.Created($"/api/v1/metrology/equipment/{equipment.Id}", equipment);
            }
            catch (Exception ex)
            {
                try { await db.EnsureMetrologyTablesAsync(ct); } catch { }
                return Results.Problem(detail: ex.Message, statusCode: 500);
            }
        });

        group.MapPut("/equipment/{id:guid}", async (
            Guid id,
            MetrologyEquipmentWriteDto req,
            ITenantContext tenantContext,
            MetrologyDbContext db,
            CancellationToken ct) =>
        {
            try
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
                equipment.ApplicableStandard = string.IsNullOrWhiteSpace(req.ApplicableStandard) ? "Res25_2025" : req.ApplicableStandard;
                equipment.ApprovalCode = req.ApprovalCode?.Trim() ?? "";
                equipment.PlatformType = string.IsNullOrWhiteSpace(req.PlatformType) ? "TruckScale" : req.PlatformType;
                equipment.PlatformApprovalCode = req.PlatformApprovalCode?.Trim() ?? "";
                equipment.PlatformApprovalNumber = req.PlatformApprovalNumber?.Trim() ?? "";
                equipment.PlatformApprovalDate = req.PlatformApprovalDate;
                equipment.PlatformDimensions = req.PlatformDimensions?.Trim() ?? "";
                equipment.Indicator1Brand = req.Indicator1Brand?.Trim() ?? "";
                equipment.Indicator1Model = req.Indicator1Model?.Trim() ?? "";
                equipment.Indicator1SerialNumber = req.Indicator1SerialNumber?.Trim() ?? "";
                equipment.Indicator1ApprovalCode = req.Indicator1ApprovalCode?.Trim() ?? "";
                equipment.Indicator1ApprovalNumber = req.Indicator1ApprovalNumber?.Trim() ?? "";
                equipment.Indicator1ApprovalDate = req.Indicator1ApprovalDate;
                equipment.Indicator1Type = req.Indicator1Type?.Trim() ?? "Digital";
                equipment.HasSecondaryIndicator = req.HasSecondaryIndicator;
                equipment.Indicator2Brand = req.Indicator2Brand?.Trim() ?? "";
                equipment.Indicator2Model = req.Indicator2Model?.Trim() ?? "";
                equipment.Indicator2SerialNumber = req.Indicator2SerialNumber?.Trim() ?? "";
                equipment.Indicator2ApprovalCode = req.Indicator2ApprovalCode?.Trim() ?? "";
                equipment.Indicator2ApprovalNumber = req.Indicator2ApprovalNumber?.Trim() ?? "";
                equipment.Indicator2ApprovalDate = req.Indicator2ApprovalDate;
                equipment.Indicator2Type = req.Indicator2Type?.Trim() ?? "";
                equipment.MaxCapacity = req.MaxCapacity;
                equipment.MaximumOperationalLoad = req.MaximumOperationalLoad is > 0 ? req.MaximumOperationalLoad.Value : req.MaxCapacity;
                equipment.MinCapacity = req.MinCapacity;
                equipment.DivisionD = req.DivisionD;
                equipment.VerificationIntervalE = req.VerificationIntervalE;
                if (!string.IsNullOrWhiteSpace(req.Unit)) equipment.Unit = req.Unit.Trim();
                if (!string.IsNullOrWhiteSpace(req.AccuracyClass)) equipment.AccuracyClass = req.AccuracyClass.Trim();
                if (!string.IsNullOrWhiteSpace(req.IndicationType)) equipment.IndicationType = req.IndicationType.Trim();
                if (req.LoadCellsCount > 0) equipment.LoadCellsCount = req.LoadCellsCount;
                equipment.HasTare = req.HasTare;
                equipment.Notes = req.Notes;

                await db.SaveChangesAsync(ct);
                return Results.Ok(equipment);
            }
            catch (Exception ex)
            {
                return Results.Problem(detail: ex.Message, statusCode: 500);
            }
        });

        group.MapDelete("/equipment/{id:guid}", async (Guid id, ITenantContext tenantContext, MetrologyDbContext db, CancellationToken ct) =>
        {
            try
            {
                var tenantId = tenantContext.TenantId;
                var equipment = await db.Equipments.FirstOrDefaultAsync(e => e.Id == id && e.TenantId == tenantId, ct);
                if (equipment == null) return Results.NotFound(new { message = "Instrumento no encontrado." });

                db.Equipments.Remove(equipment);
                await db.SaveChangesAsync(ct);
                return Results.Ok(new { message = "Instrumento eliminado correctamente." });
            }
            catch (Exception ex)
            {
                return Results.Problem(detail: ex.Message, statusCode: 500);
            }
        });

        // ====================================================================
        // 3. Pesas Patrón & Trazabilidad Metrológica (CRUD + Importación)
        // ====================================================================
        group.MapGet("/weights", async (
            [FromQuery] string? search,
            [FromQuery] string? status,
            [FromQuery] string? lot,
            ITenantContext tenantContext,
            MetrologyDbContext db,
            CancellationToken ct) =>
        {
            try
            {
                await db.EnsureMetrologyTablesAsync(ct);
                var tenantId = tenantContext.TenantId;
                var query = db.StandardWeights.AsNoTracking().Where(w => w.TenantId == tenantId);

                if (!string.IsNullOrWhiteSpace(search))
                {
                    var term = search.Trim().ToLower();
                    query = query.Where(w =>
                        w.Code.ToLower().Contains(term) ||
                        w.NormalizedId.ToLower().Contains(term) ||
                        w.SerialNumber.ToLower().Contains(term) ||
                        w.Manufacturer.ToLower().Contains(term) ||
                        w.LotName.ToLower().Contains(term) ||
                        w.CertificateNumber.ToLower().Contains(term) ||
                        w.TraceabilityLab.ToLower().Contains(term));
                }

                if (!string.IsNullOrWhiteSpace(status))
                {
                    query = query.Where(w => w.Status == status.Trim());
                }

                if (!string.IsNullOrWhiteSpace(lot))
                {
                    query = query.Where(w => w.LotName == lot.Trim());
                }

                var items = await query.OrderBy(w => w.Code).ThenBy(w => w.NominalValue).ToListAsync(ct);
                return Results.Ok(items);
            }
            catch (Exception ex)
            {
                return Results.Problem(detail: ex.Message, statusCode: 500);
            }
        });

        group.MapPost("/weights", async (
            StandardWeightWriteDto req,
            ITenantContext tenantContext,
            MetrologyDbContext db,
            CancellationToken ct) =>
        {
            try
            {
                await db.EnsureMetrologyTablesAsync(ct);
                if (string.IsNullOrWhiteSpace(req.Code))
                {
                    return Results.BadRequest(new { message = "El código de la pesa patrón es obligatorio." });
                }

                var tenantId = tenantContext.TenantId;
                var code = req.Code.Trim();
                var normId = System.Text.RegularExpressions.Regex.Replace(code.ToUpperInvariant(), @"[^A-Z0-9]", "");

                var weight = new StandardWeight
                {
                    TenantId = tenantId,
                    Code = code,
                    NormalizedId = normId,
                    SerialNumber = req.SerialNumber?.Trim() ?? "",
                    Manufacturer = req.Manufacturer?.Trim() ?? "",
                    LotName = req.LotName?.Trim() ?? "",
                    NominalValue = req.NominalValue,
                    Unit = req.Unit ?? "kg",
                    AccuracyClass = req.AccuracyClass ?? "M1",
                    Material = req.Material ?? "Hierro Fundido",
                    ErrorAsFound = req.ErrorAsFound,
                    ConventionalMassCorrection = req.ConventionalMassCorrection ?? 0,
                    Uncertainty = req.Uncertainty ?? 0,
                    UnitEc = req.UnitEc ?? "g",
                    FactorK = req.FactorK ?? 2.0m,
                    CertificateNumber = req.CertificateNumber?.Trim() ?? "",
                    TraceabilityLab = req.TraceabilityLab ?? "Laboratorio Acreditado",
                    CalibrationDate = req.CalibrationDate,
                    ExpirationDate = req.ExpirationDate,
                    Status = req.Status ?? "Valid",
                    Notes = req.Notes
                };

                db.StandardWeights.Add(weight);
                await db.SaveChangesAsync(ct);

                return Results.Created($"/api/v1/metrology/weights/{weight.Id}", weight);
            }
            catch (Exception ex)
            {
                return Results.Problem(detail: ex.Message, statusCode: 500);
            }
        });

        group.MapPut("/weights/{id:guid}", async (
            Guid id,
            StandardWeightWriteDto req,
            ITenantContext tenantContext,
            MetrologyDbContext db,
            CancellationToken ct) =>
        {
            try
            {
                await db.EnsureMetrologyTablesAsync(ct);
                var tenantId = tenantContext.TenantId;
                var weight = await db.StandardWeights.FirstOrDefaultAsync(w => w.Id == id && w.TenantId == tenantId, ct);
                if (weight == null) return Results.NotFound(new { message = "Pesa patrón no encontrada." });

                if (!string.IsNullOrWhiteSpace(req.Code))
                {
                    weight.Code = req.Code.Trim();
                    weight.NormalizedId = System.Text.RegularExpressions.Regex.Replace(weight.Code.ToUpperInvariant(), @"[^A-Z0-9]", "");
                }

                if (req.SerialNumber != null) weight.SerialNumber = req.SerialNumber.Trim();
                if (req.Manufacturer != null) weight.Manufacturer = req.Manufacturer.Trim();
                if (req.LotName != null) weight.LotName = req.LotName.Trim();
                if (req.NominalValue > 0) weight.NominalValue = req.NominalValue;
                if (req.Unit != null) weight.Unit = req.Unit;
                if (req.AccuracyClass != null) weight.AccuracyClass = req.AccuracyClass;
                if (req.Material != null) weight.Material = req.Material;
                if (req.ErrorAsFound.HasValue) weight.ErrorAsFound = req.ErrorAsFound;
                if (req.ConventionalMassCorrection.HasValue) weight.ConventionalMassCorrection = req.ConventionalMassCorrection.Value;
                if (req.Uncertainty.HasValue) weight.Uncertainty = req.Uncertainty.Value;
                if (req.UnitEc != null) weight.UnitEc = req.UnitEc;
                if (req.FactorK.HasValue) weight.FactorK = req.FactorK.Value;
                if (req.CertificateNumber != null) weight.CertificateNumber = req.CertificateNumber.Trim();
                if (req.TraceabilityLab != null) weight.TraceabilityLab = req.TraceabilityLab.Trim();
                if (req.CalibrationDate.HasValue) weight.CalibrationDate = req.CalibrationDate;
                if (req.ExpirationDate.HasValue) weight.ExpirationDate = req.ExpirationDate;
                if (req.Status != null) weight.Status = req.Status;
                if (req.Notes != null) weight.Notes = req.Notes;

                await db.SaveChangesAsync(ct);
                return Results.Ok(weight);
            }
            catch (Exception ex)
            {
                return Results.Problem(detail: ex.Message, statusCode: 500);
            }
        });

        group.MapPost("/weights/bulk-import", async (
            StandardWeightBulkImportRequest req,
            ITenantContext tenantContext,
            MetrologyDbContext db,
            CancellationToken ct) =>
        {
            try
            {
                await db.EnsureMetrologyTablesAsync(ct);
                if (req.Weights == null || req.Weights.Count == 0)
                {
                    return Results.BadRequest(new { message = "Sin pesas para importar." });
                }

                var tenantId = tenantContext.TenantId;
                var existingWeights = await db.StandardWeights.Where(w => w.TenantId == tenantId).ToListAsync(ct);
                var existingByCode = existingWeights.ToDictionary(w => w.Code.Trim().ToUpperInvariant(), StringComparer.OrdinalIgnoreCase);

                var importedCount = 0;
                var updatedCount = 0;

                foreach (var item in req.Weights)
                {
                    var code = item.Code?.Trim() ?? "";
                    if (string.IsNullOrWhiteSpace(code) || item.NominalValue <= 0) continue;

                    var normId = System.Text.RegularExpressions.Regex.Replace(code.ToUpperInvariant(), @"[^A-Z0-9]", "");
                    var upperKey = code.ToUpperInvariant();

                    if (existingByCode.TryGetValue(upperKey, out var existing))
                    {
                        // Update existing record
                        existing.NormalizedId = normId;
                        if (!string.IsNullOrWhiteSpace(item.SerialNumber)) existing.SerialNumber = item.SerialNumber.Trim();
                        if (!string.IsNullOrWhiteSpace(item.Manufacturer)) existing.Manufacturer = item.Manufacturer.Trim();
                        if (!string.IsNullOrWhiteSpace(item.LotName)) existing.LotName = item.LotName.Trim();
                        existing.NominalValue = item.NominalValue;
                        if (!string.IsNullOrWhiteSpace(item.Unit)) existing.Unit = item.Unit;
                        if (!string.IsNullOrWhiteSpace(item.AccuracyClass)) existing.AccuracyClass = item.AccuracyClass;
                        if (!string.IsNullOrWhiteSpace(item.Material)) existing.Material = item.Material;
                        existing.ErrorAsFound = item.ErrorAsFound;
                        existing.ConventionalMassCorrection = item.ConventionalMassCorrection ?? 0;
                        existing.Uncertainty = item.Uncertainty ?? 0;
                        existing.UnitEc = item.UnitEc ?? "g";
                        existing.FactorK = item.FactorK ?? 2.0m;
                        if (!string.IsNullOrWhiteSpace(item.CertificateNumber)) existing.CertificateNumber = item.CertificateNumber.Trim();
                        if (!string.IsNullOrWhiteSpace(item.TraceabilityLab)) existing.TraceabilityLab = item.TraceabilityLab.Trim();
                        if (item.CalibrationDate.HasValue) existing.CalibrationDate = item.CalibrationDate;
                        if (item.ExpirationDate.HasValue) existing.ExpirationDate = item.ExpirationDate;
                        existing.Status = item.Status ?? "Valid";
                        updatedCount++;
                    }
                    else
                    {
                        // Create new record
                        var newWeight = new StandardWeight
                        {
                            TenantId = tenantId,
                            Code = code,
                            NormalizedId = normId,
                            SerialNumber = item.SerialNumber?.Trim() ?? "",
                            Manufacturer = item.Manufacturer?.Trim() ?? "",
                            LotName = item.LotName?.Trim() ?? "",
                            NominalValue = item.NominalValue,
                            Unit = item.Unit ?? "kg",
                            AccuracyClass = item.AccuracyClass ?? "M1",
                            Material = item.Material ?? "Hierro Fundido",
                            ErrorAsFound = item.ErrorAsFound,
                            ConventionalMassCorrection = item.ConventionalMassCorrection ?? 0,
                            Uncertainty = item.Uncertainty ?? 0,
                            UnitEc = item.UnitEc ?? "g",
                            FactorK = item.FactorK ?? 2.0m,
                            CertificateNumber = item.CertificateNumber?.Trim() ?? "",
                            TraceabilityLab = item.TraceabilityLab ?? "Laboratorio Acreditado",
                            CalibrationDate = item.CalibrationDate,
                            ExpirationDate = item.ExpirationDate,
                            Status = item.Status ?? "Valid"
                        };
                        db.StandardWeights.Add(newWeight);
                        existingByCode[upperKey] = newWeight;
                        importedCount++;
                    }
                }

                await db.SaveChangesAsync(ct);
                return Results.Ok(new
                {
                    success = true,
                    imported = importedCount,
                    updated = updatedCount,
                    total = importedCount + updatedCount,
                    message = $"{importedCount + updatedCount} patrón/es procesado/s ({importedCount} creados, {updatedCount} actualizados)."
                });
            }
            catch (Exception ex)
            {
                return Results.Problem(detail: ex.Message, statusCode: 500);
            }
        });

        group.MapPost("/weights/bulk-lot", async (
            StandardWeightBulkLotRequest req,
            ITenantContext tenantContext,
            MetrologyDbContext db,
            CancellationToken ct) =>
        {
            try
            {
                await db.EnsureMetrologyTablesAsync(ct);
                if (req.Ids == null || req.Ids.Count == 0)
                {
                    return Results.BadRequest(new { message = "Sin patrones seleccionados." });
                }

                var tenantId = tenantContext.TenantId;
                var weights = await db.StandardWeights.Where(w => w.TenantId == tenantId && req.Ids.Contains(w.Id)).ToListAsync(ct);
                var lotName = req.LotName?.Trim() ?? "";

                foreach (var w in weights)
                {
                    w.LotName = lotName;
                }

                await db.SaveChangesAsync(ct);
                return Results.Ok(new
                {
                    success = true,
                    count = weights.Count,
                    message = string.IsNullOrEmpty(lotName)
                        ? $"Se quitó el lote de {weights.Count} patrones."
                        : $"Se asignó el lote \"{lotName}\" a {weights.Count} patrones."
                });
            }
            catch (Exception ex)
            {
                return Results.Problem(detail: ex.Message, statusCode: 500);
            }
        });

        group.MapPost("/weights/clear-all", async (
            ITenantContext tenantContext,
            MetrologyDbContext db,
            CancellationToken ct) =>
        {
            try
            {
                await db.EnsureMetrologyTablesAsync(ct);
                var tenantId = tenantContext.TenantId;
                var weights = await db.StandardWeights.Where(w => w.TenantId == tenantId).ToListAsync(ct);
                var count = weights.Count;
                db.StandardWeights.RemoveRange(weights);
                await db.SaveChangesAsync(ct);
                return Results.Ok(new { success = true, deleted = count, message = $"Se vació el inventario ({count} patrones eliminados)." });
            }
            catch (Exception ex)
            {
                return Results.Problem(detail: ex.Message, statusCode: 500);
            }
        });

        group.MapGet("/weights/history", async (
            [FromQuery] string code,
            ITenantContext tenantContext,
            MetrologyDbContext db,
            CancellationToken ct) =>
        {
            try
            {
                await db.EnsureMetrologyTablesAsync(ct);
                if (string.IsNullOrWhiteSpace(code)) return Results.BadRequest(new { message = "Código de patrón requerido." });

                var tenantId = tenantContext.TenantId;
                var term = code.Trim().ToUpperInvariant();
                var normId = System.Text.RegularExpressions.Regex.Replace(term, @"[^A-Z0-9]", "");

                var history = await db.StandardWeights.AsNoTracking()
                    .Where(w => w.TenantId == tenantId && (w.Code.ToUpper() == term || w.NormalizedId == normId || w.SerialNumber.ToUpper() == term))
                    .OrderByDescending(w => w.CalibrationDate)
                    .ThenByDescending(w => w.CreatedAtUtc)
                    .ToListAsync(ct);

                return Results.Ok(history);
            }
            catch (Exception ex)
            {
                return Results.Problem(detail: ex.Message, statusCode: 500);
            }
        });

        group.MapDelete("/weights/{id:guid}", async (Guid id, ITenantContext tenantContext, MetrologyDbContext db, CancellationToken ct) =>
        {
            try
            {
                await db.EnsureMetrologyTablesAsync(ct);
                var tenantId = tenantContext.TenantId;
                var weight = await db.StandardWeights.FirstOrDefaultAsync(w => w.Id == id && w.TenantId == tenantId, ct);
                if (weight == null) return Results.NotFound(new { message = "Pesa patrón no encontrada." });

                db.StandardWeights.Remove(weight);
                await db.SaveChangesAsync(ct);
                return Results.Ok(new { message = "Pesa patrón eliminada correctamente." });
            }
            catch (Exception ex)
            {
                return Results.Problem(detail: ex.Message, statusCode: 500);
            }
        });

        // ====================================================================
        // 4. Motor de Reglas & Cálculo Metrológico
        // ====================================================================
        group.MapGet("/test-plan", ([FromQuery] string? profileCode, [FromQuery] string? operationType) =>
        {
            var profile = MetrologyRegulatoryProfiles.Resolve(profileCode);
            var operation = string.IsNullOrWhiteSpace(operationType) ? "Calibration" : operationType.Trim();
            return Results.Ok(new
            {
                profile.Code,
                profile.DisplayName,
                profile.RegulatoryStatus,
                operationType = operation,
                operationLabel = MetrologyRegulatoryProfiles.ResolveOperationLabel(profile, operation),
                testPlanVersion = profile.Code == MetrologyRegulatoryProfiles.Transitional2307 ? "MET-2307-1" : "MET-25-1",
                items = MetrologyRegulatoryProfiles.GetTestPlan(profile, operation)
            });
        });

        group.MapPost("/calculate-rules", (MetrologyRulesCalculationRequest req) =>
        {
            var standard = string.IsNullOrWhiteSpace(req.StandardApplied) ? "Res25_2025" : req.StandardApplied;
            var platformType = string.IsNullOrWhiteSpace(req.PlatformType) ? "TruckScale" : req.PlatformType;

            var points = MetrologyRuleEngine.GenerateLinearityTestPoints(
                req.MinCapacity,
                req.MaxCapacity,
                req.VerificationIntervalE,
                req.AccuracyClass,
                req.IsInService,
                standard
            );

            var eccentricity = MetrologyRuleEngine.GenerateEccentricityConfig(
                req.MaxCapacity,
                req.LoadCellsCount,
                req.Tare,
                standard,
                platformType
            );

            var errorTerm = standard == "Res2307_80" ? "EMT (Error Máximo Tolerado)" : "emp (Error Máximo Permitido)";
            var repTerm = standard == "Res2307_80" ? "Ensayo de Fidelidad" : "Ensayo de Repetibilidad";
            var totalDivisions = req.VerificationIntervalE > 0 ? (int)(req.MaxCapacity / req.VerificationIntervalE) : 0;

            var response = new MetrologyRulesCalculationResponse(
                standard,
                errorTerm,
                repTerm,
                points,
                eccentricity,
                req.MinCapacity,
                req.MaxCapacity,
                req.VerificationIntervalE,
                totalDivisions
            );

            return Results.Ok(response);
        });

        // ====================================================================
        // 5. Certificados de Calibración & Ensayos Oficiales
        // ====================================================================
        group.MapGet("/reports", async (
            [FromQuery] Guid? equipmentId,
            [FromQuery] Guid? customerId,
            ITenantContext tenantContext,
            MetrologyDbContext db,
            CancellationToken ct) =>
        {
            try
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

                var items = await query.OrderByDescending(r => r.CalibrationDate).ToListAsync(ct);
                return Results.Ok(items);
            }
            catch (Exception ex)
            {
                return Results.Problem(detail: ex.Message, statusCode: 500);
            }
        });

        group.MapGet("/reports/{id:guid}", async (Guid id, ITenantContext tenantContext, MetrologyDbContext db, CancellationToken ct) =>
        {
            try
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
            }
            catch (Exception ex)
            {
                return Results.Problem(detail: ex.Message, statusCode: 500);
            }
        });

        group.MapPost("/reports", async (
            CalibrationReportWriteDto req,
            ITenantContext tenantContext,
            MetrologyDbContext db,
            CancellationToken ct) =>
        {
            try
            {
                var tenantId = tenantContext.TenantId;
                var equipment = await db.Equipments.FirstOrDefaultAsync(e => e.Id == req.EquipmentId && e.TenantId == tenantId, ct);
                if (equipment == null) return Results.BadRequest(new { message = "El instrumento especificado no existe." });

                // Generate report number if not provided
                var maxReportNum = await db.CalibrationReports
                    .Where(r => r.TenantId == tenantId && r.CalibrationDate.Year == req.CalibrationDate.Year)
                    .CountAsync(ct) + 1;

                var profile = MetrologyRegulatoryProfiles.Resolve(req.RegulatoryProfile, equipment.ApplicableStandard);
                var operationType = string.IsNullOrWhiteSpace(req.OperationType) ? "Calibration" : req.OperationType.Trim();
                if (!profile.Operations.ContainsKey(operationType))
                {
                    return Results.BadRequest(new { message = "La operación seleccionada no corresponde al perfil reglamentario." });
                }

                var standard = profile.Code == MetrologyRegulatoryProfiles.Transitional2307 ? "Res2307_80" : "Res25_2025";
                var certNumber = !string.IsNullOrWhiteSpace(req.CertificateNumber)
                    ? req.CertificateNumber.Trim()
                    : $"CERT-{req.CalibrationDate.Year}-{maxReportNum:D4}";

                var expirationDate = req.ExpirationDate ?? (profile.DefaultValidityMonths.HasValue
                    ? req.CalibrationDate.AddMonths(profile.DefaultValidityMonths.Value)
                    : null);
                var documentTitle = string.IsNullOrWhiteSpace(req.DocumentTitle)
                    ? "Informe de ensayo metrológico"
                    : req.DocumentTitle.Trim();

                var report = new CalibrationReport
                {
                    TenantId = tenantId,
                    CertificateNumber = certNumber,
                    EquipmentId = equipment.Id,
                    EquipmentCode = equipment.Code,
                    EquipmentDescription = equipment.Description,
                    CustomerId = equipment.CustomerId,
                    CustomerName = equipment.CustomerName,
                    Location = equipment.Location,
                    StandardApplied = standard,
                    CalibrationType = req.CalibrationType ?? "InService",
                    RegulatoryProfile = profile.Code,
                    OperationType = operationType,
                    DocumentTitle = documentTitle,
                    RegulatoryStatus = profile.RegulatoryStatus,
                    RegulatoryNotice = profile.Notice,
                    TestPlanVersion = string.IsNullOrWhiteSpace(req.TestPlanVersion)
                        ? (profile.Code == MetrologyRegulatoryProfiles.Transitional2307 ? "MET-2307-1" : "MET-25-1")
                        : req.TestPlanVersion.Trim(),
                    ReportStatus = string.IsNullOrWhiteSpace(req.ReportStatus) ? "Issued" : req.ReportStatus.Trim(),
                    CalibrationDate = req.CalibrationDate,
                    ExpirationDate = expirationDate,
                    TemperatureCelsius = req.TemperatureCelsius,
                    RelativeHumidityPercent = req.RelativeHumidityPercent,
                    AtmosphericPressureHpa = req.AtmosphericPressureHpa,
                    PerformedBy = req.PerformedBy?.Trim() ?? "Metrólogo Autorizado",
                    ApprovedBy = req.ApprovedBy?.Trim() ?? "",
                    Verdict = req.Verdict ?? "Approved",
                    MaxObservedError = req.MaxObservedError,
                    MaxAllowedError = req.MaxAllowedError,
                    ExpandedUncertaintyK2 = req.ExpandedUncertaintyK2,
                    VisualInspectionJson = req.VisualInspectionJson ?? "{}",
                    RepeatabilityTestJson = req.RepeatabilityTestJson ?? "[]",
                    EccentricityTestJson = req.EccentricityTestJson ?? "[]",
                    LinearityTestJson = req.LinearityTestJson ?? "[]",
                    WeightsUsedJson = req.WeightsUsedJson ?? "[]",
                    Observations = req.Observations,
                    SealsPlaced = req.SealsPlaced,
                    CreatedAtUtc = DateTime.UtcNow
                };

                db.CalibrationReports.Add(report);

                // Update equipment calibration dates
                equipment.LastCalibrationDate = report.CalibrationDate;
                equipment.NextCalibrationDate = report.ExpirationDate;
                equipment.Status = report.Verdict == "Approved" ? "Active" : "Maintenance";

                await db.SaveChangesAsync(ct);

                return Results.Created($"/api/v1/metrology/reports/{report.Id}", report);
            }
            catch (Exception ex)
            {
                return Results.Problem(detail: ex.Message, statusCode: 500);
            }
        });

        return endpoints;
    }
}
