using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Persistence;
using LealControl.BuildingBlocks.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace LealControl.Modules.Fleet.Infrastructure;

public sealed record SaveVehicleRequest(
    VehicleType Type,
    string? Plate,
    string? InternalCode,
    string? Brand,
    string? Model,
    int? Year,
    MeterType MeterType,
    string? VinChassis,
    string? EngineNumber,
    string? FuelType,
    VehicleStatus Status = VehicleStatus.Active,
    string? Notes = null,
    /// <summary>Solo al crear: lectura inicial.</summary>
    int? InitialKilometers = null,
    decimal? InitialHours = null);

public sealed record RecordReadingRequest(int? Kilometers, decimal? Hours, string? Date = null, bool Correction = false, string? Note = null);

public sealed record SaveVehicleDocumentRequest(
    FleetDocType DocumentType,
    string? ExpirationDate,
    string? Number = null,
    string? Issuer = null,
    string? IssueDate = null,
    int AlertDaysBefore = 30,
    decimal Cost = 0,
    string? Title = null);

public sealed record VehicleDocumentView(
    Guid Id, Guid VehicleId, FleetDocType DocumentType, string Title, string Number, string? Issuer,
    string? IssueDate, string ExpirationDate, int AlertDaysBefore, decimal Cost, bool IsActive,
    int DaysRemaining, ExpirationState State);

public sealed record VehicleView(
    Guid Id, string Plate, string? InternalCode, string Label, string Brand, string Model, int Year,
    VehicleType Type, MeterType MeterType, string VinChassis, string EngineNumber, int CurrentKilometers,
    decimal CurrentEngineHours, string FuelType, VehicleStatus Status, string? Notes, DateTime CreatedAtUtc,
    int ExpiredCount, int DueSoonCount, int MissingCount, string? NextExpirationDate);

public sealed record ExpirationItem(
    Guid VehicleId, string VehicleLabel, string VehicleName, VehicleType VehicleType, FleetDocType DocumentType,
    Guid? DocumentId, string? ExpirationDate, int? DaysRemaining, ExpirationState State);

public static class FleetModule
{
    public static IServiceCollection AddFleetModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddTenantDbContext<FleetDbContext>(FleetDbContext.Schema);
        services.TryAddSingleton(TimeProvider.System);
        return services;
    }

    private static string Label(Vehicle v) => v.Plate.Length > 0 ? v.Plate : v.InternalCode ?? "";

    private static string UserName(HttpContext http) =>
        http.User.FindFirst("name")?.Value ?? http.User.FindFirst(ClaimTypes.Name)?.Value ?? http.User.Identity?.Name ?? "";

    private static VehicleDocumentView ToView(VehicleDocument d, DateOnly today)
    {
        var expiration = FleetRules.FromStoredDate(d.ExpirationDateUtc);
        var (state, days) = FleetRules.Evaluate(expiration, d.AlertDaysBefore, today);
        return new VehicleDocumentView(d.Id, d.VehicleId, d.DocumentType, d.Title, d.PolicyOrDocNumber, d.IssuerCompany,
            d.IssueDateUtc == default ? null : FleetRules.FromStoredDate(d.IssueDateUtc).ToString("yyyy-MM-dd"),
            expiration.ToString("yyyy-MM-dd"), d.AlertDaysBefore, d.Cost, d.IsActive, days, d.IsActive ? state : ExpirationState.Ok);
    }

    /// <summary>Vencidos, por vencer y faltantes de cada unidad (sin las dadas de baja).</summary>
    internal static List<ExpirationItem> Expirations(IEnumerable<Vehicle> vehicles, IEnumerable<VehicleDocument> activeDocuments, DateOnly today)
    {
        var docsByVehicle = activeDocuments.GroupBy(d => d.VehicleId).ToDictionary(g => g.Key, g => g.ToList());
        var items = new List<ExpirationItem>();
        foreach (var v in vehicles.Where(v => v.Status != VehicleStatus.Sold))
        {
            var docs = docsByVehicle.TryGetValue(v.Id, out var list) ? list : [];
            var name = $"{v.Brand} {v.Model}".Trim();
            foreach (var d in docs)
            {
                var view = ToView(d, today);
                if (view.State != ExpirationState.Ok)
                    items.Add(new ExpirationItem(v.Id, Label(v), name, v.Type, d.DocumentType, d.Id, view.ExpirationDate, view.DaysRemaining, view.State));
            }
            foreach (var required in FleetRules.RequiredDocuments(v.Type).Where(t => docs.All(d => d.DocumentType != t)))
                items.Add(new ExpirationItem(v.Id, Label(v), name, v.Type, required, null, null, null, ExpirationState.Missing));
        }
        return items
            .OrderBy(i => i.State switch { ExpirationState.Expired => 0, ExpirationState.Missing => 1, _ => 2 })
            .ThenBy(i => i.DaysRemaining ?? int.MinValue)
            .ThenBy(i => i.VehicleLabel)
            .ToList();
    }

    private static VehicleView ToView(Vehicle v, List<ExpirationItem> problems, IEnumerable<VehicleDocument> docs, DateOnly today)
    {
        var mine = problems.Where(p => p.VehicleId == v.Id).ToList();
        var next = docs.Where(d => d.VehicleId == v.Id)
            .Select(d => FleetRules.FromStoredDate(d.ExpirationDateUtc))
            .Where(d => d >= today)
            .OrderBy(d => d)
            .Select(d => (DateOnly?)d)
            .FirstOrDefault();
        return new VehicleView(v.Id, v.Plate, v.InternalCode, Label(v), v.Brand, v.Model, v.Year, v.Type, v.MeterType,
            v.VinChassis, v.EngineNumber, v.CurrentKilometers, v.CurrentEngineHours, v.FuelType, v.Status, v.Notes, v.CreatedAtUtc,
            mine.Count(p => p.State == ExpirationState.Expired), mine.Count(p => p.State == ExpirationState.DueSoon),
            mine.Count(p => p.State == ExpirationState.Missing), next?.ToString("yyyy-MM-dd"));
    }

    private static async Task<string?> DuplicateAsync(FleetDbContext db, Guid tenantId, Guid? exceptId, string plate, string? code, CancellationToken ct)
    {
        if (plate.Length > 0 && await db.Vehicles.AnyAsync(x => x.TenantId == tenantId && x.Id != exceptId && x.Plate.ToUpper() == plate, ct))
            return $"Ya hay una unidad con la patente {plate}.";
        if (code is not null && await db.Vehicles.AnyAsync(x => x.TenantId == tenantId && x.Id != exceptId && x.InternalCode != null && x.InternalCode.ToUpper() == code, ct))
            return $"Ya hay una unidad con el código {code}.";
        return null;
    }

    private static IResult Problem(string message) => Results.BadRequest(new { detail = message });

    public static IEndpointRouteBuilder MapFleetModule(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/fleet").WithTags("Fleet");

        // -------------------------------------------------------------
        // UNIDADES
        // -------------------------------------------------------------
        group.MapGet("/vehicles", async (string? search, bool? includeSold, FleetDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var q = db.Vehicles.AsNoTracking().Where(x => x.TenantId == tenantId);
            if (includeSold != true) q = q.Where(x => x.Status != VehicleStatus.Sold);
            if (!string.IsNullOrWhiteSpace(search))
            {
                foreach (var token in SearchText.Parse(search))
                {
                    var text = token.Text;
                    q = q.Where(x => SearchText.Fold(x.Plate).Contains(text) || SearchText.Fold(x.InternalCode ?? "").Contains(text)
                        || SearchText.Fold(x.Brand).Contains(text) || SearchText.Fold(x.Model).Contains(text));
                }
            }
            var vehicles = await q.OrderBy(x => x.Type).ThenBy(x => x.Plate).ThenBy(x => x.InternalCode).ToListAsync(ct);
            var ids = vehicles.Select(v => v.Id).ToList();
            var docs = await db.VehicleDocuments.AsNoTracking()
                .Where(d => d.TenantId == tenantId && d.IsActive && ids.Contains(d.VehicleId)).ToListAsync(ct);
            var today = FleetRules.TodayInArgentina(clock.GetUtcNow());
            var problems = Expirations(vehicles, docs, today);
            return Results.Ok(vehicles.Select(v => ToView(v, problems, docs, today)));
        });

        group.MapGet("/vehicles/{id:guid}", async (Guid id, FleetDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var v = await db.Vehicles.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            if (v is null) return Results.NotFound(new { detail = "Unidad no encontrada." });
            var docs = await db.VehicleDocuments.AsNoTracking().Where(d => d.TenantId == tenantId && d.VehicleId == id && d.IsActive).ToListAsync(ct);
            var today = FleetRules.TodayInArgentina(clock.GetUtcNow());
            return Results.Ok(ToView(v, Expirations([v], docs, today), docs, today));
        });

        group.MapPost("/vehicles", async (SaveVehicleRequest req, HttpContext http, FleetDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var now = clock.GetUtcNow();
            var plate = FleetRules.NormalizePlate(req.Plate);
            var code = FleetRules.NormalizeCode(req.InternalCode);
            var initialKm = req.MeterType is MeterType.Kilometers or MeterType.Both ? req.InitialKilometers ?? 0 : (int?)null;
            var initialHours = req.MeterType is MeterType.Hours or MeterType.Both ? req.InitialHours ?? 0 : (decimal?)null;
            var error = FleetRules.ValidateVehicle(req.Type, plate, code, req.Brand ?? "", req.Model ?? "", req.Year, req.MeterType, now.Year);
            if (error is null && req.MeterType != MeterType.None)
                error = FleetRules.ValidateReading(req.MeterType, initialKm, initialHours, 0, 0, false, null);
            error ??= await DuplicateAsync(db, tenantId, null, plate, code, ct);
            if (error is not null) return Problem(error);

            var vehicle = new Vehicle
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                Plate = plate,
                InternalCode = code,
                Brand = req.Brand!.Trim(),
                Model = (req.Model ?? "").Trim(),
                Year = req.Year ?? now.Year,
                Type = req.Type,
                MeterType = req.MeterType,
                VinChassis = (req.VinChassis ?? "").Trim(),
                EngineNumber = (req.EngineNumber ?? "").Trim(),
                FuelType = string.IsNullOrWhiteSpace(req.FuelType) ? "Diesel" : req.FuelType.Trim(),
                Status = Enum.IsDefined(req.Status) ? req.Status : VehicleStatus.Active,
                Notes = string.IsNullOrWhiteSpace(req.Notes) ? null : req.Notes.Trim(),
                CurrentKilometers = req.MeterType is MeterType.Kilometers or MeterType.Both ? req.InitialKilometers ?? 0 : 0,
                CurrentEngineHours = req.MeterType is MeterType.Hours or MeterType.Both ? req.InitialHours ?? 0 : 0,
                CreatedAtUtc = now.UtcDateTime
            };
            db.Vehicles.Add(vehicle);
            if (vehicle.MeterType != MeterType.None)
            {
                db.VehicleMeterReadings.Add(new VehicleMeterReading
                {
                    Id = Guid.NewGuid(), TenantId = tenantId, VehicleId = vehicle.Id, ReadAtUtc = now.UtcDateTime,
                    Kilometers = vehicle.MeterType is MeterType.Kilometers or MeterType.Both ? vehicle.CurrentKilometers : null,
                    Hours = vehicle.MeterType is MeterType.Hours or MeterType.Both ? vehicle.CurrentEngineHours : null,
                    Note = "Lectura inicial", CreatedBy = UserName(http), CreatedAtUtc = now.UtcDateTime
                });
            }
            await db.SaveChangesAsync(ct);
            var today = FleetRules.TodayInArgentina(now);
            return Results.Created($"/api/v1/fleet/vehicles/{vehicle.Id}", ToView(vehicle, Expirations([vehicle], [], today), [], today));
        });

        group.MapPut("/vehicles/{id:guid}", async (Guid id, SaveVehicleRequest req, FleetDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var now = clock.GetUtcNow();
            var v = await db.Vehicles.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            if (v is null) return Results.NotFound(new { detail = "Unidad no encontrada." });

            var plate = FleetRules.NormalizePlate(req.Plate);
            var code = FleetRules.NormalizeCode(req.InternalCode);
            var error = FleetRules.ValidateVehicle(req.Type, plate, code, req.Brand ?? "", req.Model ?? "", req.Year, req.MeterType, now.Year)
                ?? (Enum.IsDefined(req.Status) ? null : "Estado inválido.")
                ?? await DuplicateAsync(db, tenantId, id, plate, code, ct);
            if (error is not null) return Problem(error);

            // Los kilómetros y horas no se editan acá: van por lecturas, que guardan historial.
            v.Plate = plate;
            v.InternalCode = code;
            v.Brand = req.Brand!.Trim();
            v.Model = (req.Model ?? "").Trim();
            v.Year = req.Year ?? v.Year;
            v.Type = req.Type;
            v.MeterType = req.MeterType;
            v.VinChassis = (req.VinChassis ?? "").Trim();
            v.EngineNumber = (req.EngineNumber ?? "").Trim();
            v.FuelType = string.IsNullOrWhiteSpace(req.FuelType) ? v.FuelType : req.FuelType.Trim();
            v.Status = req.Status;
            v.Notes = string.IsNullOrWhiteSpace(req.Notes) ? null : req.Notes.Trim();
            await db.SaveChangesAsync(ct);

            var docs = await db.VehicleDocuments.AsNoTracking().Where(d => d.TenantId == tenantId && d.VehicleId == id && d.IsActive).ToListAsync(ct);
            var today = FleetRules.TodayInArgentina(now);
            return Results.Ok(ToView(v, Expirations([v], docs, today), docs, today));
        });

        // -------------------------------------------------------------
        // LECTURAS DE KM / HORAS (no pueden bajar, salvo corrección con motivo)
        // -------------------------------------------------------------
        group.MapGet("/vehicles/{id:guid}/readings", async (Guid id, FleetDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var readings = await db.VehicleMeterReadings.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.VehicleId == id)
                .OrderByDescending(x => x.ReadAtUtc).ThenByDescending(x => x.CreatedAtUtc)
                .Take(200)
                .ToListAsync(ct);
            return Results.Ok(readings);
        });

        group.MapPost("/vehicles/{id:guid}/readings", async (Guid id, RecordReadingRequest req, HttpContext http, FleetDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var now = clock.GetUtcNow();
            var v = await db.Vehicles.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            if (v is null) return Results.NotFound(new { detail = "Unidad no encontrada." });

            var error = FleetRules.ValidateReading(v.MeterType, req.Kilometers, req.Hours, v.CurrentKilometers, v.CurrentEngineHours, req.Correction, req.Note);
            DateOnly readDate = FleetRules.TodayInArgentina(now);
            if (error is null && !string.IsNullOrWhiteSpace(req.Date))
            {
                if (!FleetRules.TryParseDate(req.Date, out readDate)) error = "Fecha de lectura inválida.";
                else if (readDate > FleetRules.TodayInArgentina(now)) error = "La fecha de la lectura no puede ser futura.";
            }
            if (error is not null) return Problem(error);

            db.VehicleMeterReadings.Add(new VehicleMeterReading
            {
                Id = Guid.NewGuid(), TenantId = tenantId, VehicleId = id, ReadAtUtc = FleetRules.ToStoredDate(readDate),
                Kilometers = req.Kilometers, Hours = req.Hours, IsCorrection = req.Correction,
                Note = string.IsNullOrWhiteSpace(req.Note) ? null : req.Note.Trim(), CreatedBy = UserName(http), CreatedAtUtc = now.UtcDateTime
            });
            if (req.Kilometers is { } km) v.CurrentKilometers = km;
            if (req.Hours is { } hours) v.CurrentEngineHours = hours;
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { v.CurrentKilometers, v.CurrentEngineHours });
        });

        // -------------------------------------------------------------
        // VENCIMIENTOS (VTV, seguro, RUTA, matafuego, habilitación...)
        // -------------------------------------------------------------
        group.MapGet("/vehicles/{id:guid}/documents", async (Guid id, bool? history, FleetDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var q = db.VehicleDocuments.AsNoTracking().Where(x => x.TenantId == tenantId && x.VehicleId == id);
            if (history != true) q = q.Where(x => x.IsActive);
            var docs = await q.OrderBy(x => x.DocumentType).ThenByDescending(x => x.ExpirationDateUtc).ToListAsync(ct);
            var today = FleetRules.TodayInArgentina(clock.GetUtcNow());
            return Results.Ok(docs.Select(d => ToView(d, today)));
        });

        static string? ValidateDocument(SaveVehicleDocumentRequest req, out DateOnly expiration, out DateOnly? issue)
        {
            issue = null;
            expiration = default;
            if (!Enum.IsDefined(req.DocumentType)) return "Tipo de vencimiento inválido.";
            if (!FleetRules.TryParseDate(req.ExpirationDate, out expiration)) return "La fecha de vencimiento es obligatoria.";
            if (!string.IsNullOrWhiteSpace(req.IssueDate))
            {
                if (!FleetRules.TryParseDate(req.IssueDate, out var parsed)) return "Fecha de emisión inválida.";
                if (parsed > expiration) return "La emisión no puede ser posterior al vencimiento.";
                issue = parsed;
            }
            if (req.AlertDaysBefore is < 0 or > 365) return "Los días de aviso van de 0 a 365.";
            if (req.Cost < 0) return "El costo no puede ser negativo.";
            if ((req.Number ?? "").Trim().Length > 60 || (req.Issuer ?? "").Trim().Length > 120 || (req.Title ?? "").Trim().Length > 120)
                return "Número, emisor o descripción demasiado largos.";
            return null;
        }

        group.MapPost("/vehicles/{id:guid}/documents", async (Guid id, SaveVehicleDocumentRequest req, FleetDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var now = clock.GetUtcNow();
            if (!await db.Vehicles.AnyAsync(x => x.Id == id && x.TenantId == tenantId, ct))
                return Results.NotFound(new { detail = "Unidad no encontrada." });
            if (ValidateDocument(req, out var expiration, out var issue) is { } error) return Problem(error);

            // Renovación: el vigente del mismo tipo pasa al historial ("Otro" admite varios).
            if (req.DocumentType != FleetDocType.Other)
            {
                var previous = await db.VehicleDocuments
                    .Where(x => x.TenantId == tenantId && x.VehicleId == id && x.DocumentType == req.DocumentType && x.IsActive)
                    .ToListAsync(ct);
                foreach (var p in previous) p.IsActive = false;
            }

            var doc = new VehicleDocument
            {
                Id = Guid.NewGuid(), TenantId = tenantId, VehicleId = id, DocumentType = req.DocumentType,
                Title = (req.Title ?? "").Trim(), PolicyOrDocNumber = (req.Number ?? "").Trim(),
                IssuerCompany = string.IsNullOrWhiteSpace(req.Issuer) ? null : req.Issuer.Trim(),
                IssueDateUtc = issue is { } i ? FleetRules.ToStoredDate(i) : default,
                ExpirationDateUtc = FleetRules.ToStoredDate(expiration), AlertDaysBefore = req.AlertDaysBefore,
                Cost = req.Cost, IsActive = true, CreatedAtUtc = now.UtcDateTime
            };
            db.VehicleDocuments.Add(doc);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/fleet/documents/{doc.Id}", ToView(doc, FleetRules.TodayInArgentina(now)));
        });

        group.MapPut("/documents/{id:guid}", async (Guid id, SaveVehicleDocumentRequest req, FleetDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var doc = await db.VehicleDocuments.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            if (doc is null) return Results.NotFound(new { detail = "Vencimiento no encontrado." });
            if (req.DocumentType != doc.DocumentType) return Problem("El tipo no se cambia: borrá este y cargá uno nuevo.");
            if (ValidateDocument(req, out var expiration, out var issue) is { } error) return Problem(error);

            doc.Title = (req.Title ?? "").Trim();
            doc.PolicyOrDocNumber = (req.Number ?? "").Trim();
            doc.IssuerCompany = string.IsNullOrWhiteSpace(req.Issuer) ? null : req.Issuer.Trim();
            doc.IssueDateUtc = issue is { } i ? FleetRules.ToStoredDate(i) : default;
            doc.ExpirationDateUtc = FleetRules.ToStoredDate(expiration);
            doc.AlertDaysBefore = req.AlertDaysBefore;
            doc.Cost = req.Cost;
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToView(doc, FleetRules.TodayInArgentina(clock.GetUtcNow())));
        });

        group.MapDelete("/documents/{id:guid}", async (Guid id, FleetDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var doc = await db.VehicleDocuments.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            if (doc is null) return Results.NotFound(new { detail = "Vencimiento no encontrado." });
            db.VehicleDocuments.Remove(doc);
            // Si se borra el vigente (carga equivocada), vuelve a regir el anterior del mismo tipo.
            if (doc.IsActive && doc.DocumentType != FleetDocType.Other)
            {
                var previous = await db.VehicleDocuments
                    .Where(x => x.TenantId == tenantId && x.VehicleId == doc.VehicleId && x.DocumentType == doc.DocumentType && x.Id != id)
                    .OrderByDescending(x => x.ExpirationDateUtc).ThenByDescending(x => x.CreatedAtUtc)
                    .FirstOrDefaultAsync(ct);
                if (previous is not null) previous.IsActive = true;
            }
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        group.MapGet("/expirations", async (FleetDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var vehicles = await db.Vehicles.AsNoTracking().Where(x => x.TenantId == tenantId && x.Status != VehicleStatus.Sold).ToListAsync(ct);
            var docs = await db.VehicleDocuments.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive).ToListAsync(ct);
            var items = Expirations(vehicles, docs, FleetRules.TodayInArgentina(clock.GetUtcNow()));
            return Results.Ok(new
            {
                expired = items.Count(i => i.State == ExpirationState.Expired),
                dueSoon = items.Count(i => i.State == ExpirationState.DueSoon),
                missing = items.Count(i => i.State == ExpirationState.Missing),
                items
            });
        });

        // -------------------------------------------------------------
        // DRIVERS (Choferes)
        // -------------------------------------------------------------
        group.MapGet("/drivers", async (FleetDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var drivers = await db.VehicleDrivers.AsNoTracking()
                .Where(x => x.TenantId == tenantId)
                .OrderBy(x => x.FullName)
                .ToListAsync(ct);
            return Results.Ok(drivers);
        });

        group.MapPost("/drivers", async (VehicleDriver body, FleetDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            body.Id = Guid.NewGuid();
            body.TenantId = tenantId;
            body.CreatedAtUtc = DateTime.UtcNow;

            db.VehicleDrivers.Add(body);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/fleet/drivers/{body.Id}", body);
        });

        // -------------------------------------------------------------
        // MAINTENANCE & SERVICES
        // -------------------------------------------------------------
        group.MapGet("/maintenances", async (Guid? vehicleId, FleetDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var q = db.VehicleMaintenances.AsNoTracking().Where(x => x.TenantId == tenantId);
            if (vehicleId.HasValue) q = q.Where(x => x.VehicleId == vehicleId.Value);

            var items = await q.OrderByDescending(x => x.ServiceDateUtc).ToListAsync(ct);
            return Results.Ok(items);
        });

        group.MapPost("/maintenances", async (VehicleMaintenance body, FleetDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            body.Id = Guid.NewGuid();
            body.TenantId = tenantId;
            body.CreatedAtUtc = DateTime.UtcNow;
            if (body.ServiceDateUtc == default) body.ServiceDateUtc = DateTime.UtcNow;

            db.VehicleMaintenances.Add(body);

            // If KM at service is higher than vehicle KM, update vehicle current KM
            var v = await db.Vehicles.FirstOrDefaultAsync(x => x.Id == body.VehicleId && x.TenantId == tenantId, ct);
            if (v is not null && body.KmAtService > v.CurrentKilometers)
            {
                v.CurrentKilometers = body.KmAtService;
            }

            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/fleet/maintenances/{body.Id}", body);
        });

        // -------------------------------------------------------------
        // FUEL LOGS & CONSUMPTION (KM/L)
        // -------------------------------------------------------------
        group.MapGet("/fuel-logs", async (Guid? vehicleId, FleetDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var q = db.VehicleFuelLogs.AsNoTracking().Where(x => x.TenantId == tenantId);
            if (vehicleId.HasValue) q = q.Where(x => x.VehicleId == vehicleId.Value);

            var logs = await q.OrderByDescending(x => x.LogDateUtc).ToListAsync(ct);
            return Results.Ok(logs);
        });

        group.MapPost("/fuel-logs", async (VehicleFuelLog body, FleetDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            body.Id = Guid.NewGuid();
            body.TenantId = tenantId;
            body.CreatedAtUtc = DateTime.UtcNow;
            if (body.LogDateUtc == default) body.LogDateUtc = DateTime.UtcNow;
            if (body.TotalCost <= 0 && body.Liters > 0 && body.PricePerLiter > 0)
            {
                body.TotalCost = Math.Round(body.Liters * body.PricePerLiter, 2);
            }

            var v = await db.Vehicles.FirstOrDefaultAsync(x => x.Id == body.VehicleId && x.TenantId == tenantId, ct);
            if (v is not null)
            {
                if (body.KilometersAtFueling > v.CurrentKilometers && body.Liters > 0)
                {
                    var deltaKm = body.KilometersAtFueling - v.CurrentKilometers;
                    body.CalculatedKmPerLiter = Math.Round((decimal)deltaKm / body.Liters, 2);
                    v.CurrentKilometers = body.KilometersAtFueling;
                }
            }

            db.VehicleFuelLogs.Add(body);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/fleet/fuel-logs/{body.Id}", body);
        });

        return endpoints;
    }
}
