using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Fleet.Infrastructure;

public sealed record SaveFuelLogRequest(
    Guid VehicleId,
    string? Date,
    decimal Liters,
    decimal? PricePerLiter = null,
    decimal? TotalCost = null,
    int? Km = null,
    decimal? Hours = null,
    /// <summary>Empleado de RRHH (persona de la flota) que cargó.</summary>
    Guid? EmployeeId = null,
    string? Station = null,
    string? PaymentMethod = null,
    string? Notes = null);

public sealed record FuelLogView(
    Guid Id, Guid VehicleId, string VehicleLabel, string Date, Guid? EmployeeId, string? PersonName, int? Km, decimal? Hours,
    decimal Liters, decimal PricePerLiter, decimal TotalCost, string Station, string PaymentMethod,
    decimal? KmPerLiter, decimal? LitersPerHour, string? Notes, string? CreatedBy);

public sealed record VehicleCostRow(
    Guid VehicleId, string VehicleLabel, string VehicleName, VehicleType VehicleType, int Km, decimal Hours, decimal Liters,
    decimal FuelCost, decimal MaintenanceCost, decimal DocumentsCost, decimal TotalCost,
    decimal? CostPerKm, decimal? CostPerHour, decimal? KmPerLiter, decimal? LitersPerHour);

/// <summary>Flota 2b: cargas de combustible con consumo, y costos por unidad.</summary>
public static class FleetFuel
{
    private static IResult Problem(string message) => Results.BadRequest(new { detail = message });

    /// <summary>
    /// Recalcula el consumo de las cargas de una unidad, en orden: km recorridos desde la carga
    /// anterior / litros de esta carga (y litros por hora en las que miden horas).
    /// </summary>
    private static async Task RecalculateAsync(FleetDbContext db, Guid tenantId, Guid vehicleId, CancellationToken ct)
    {
        var logs = await db.VehicleFuelLogs.Where(f => f.TenantId == tenantId && f.VehicleId == vehicleId).ToListAsync(ct);
        logs.AddRange(db.ChangeTracker.Entries<VehicleFuelLog>()
            .Where(e => e.State == EntityState.Added && e.Entity.VehicleId == vehicleId).Select(e => e.Entity));
        int? lastKm = null;
        decimal? lastHours = null;
        foreach (var f in logs.Where(f => db.Entry(f).State != EntityState.Deleted)
                     .OrderBy(f => f.LogDateUtc).ThenBy(f => f.KilometersAtFueling ?? 0).ThenBy(f => f.HoursAtFueling ?? 0).ThenBy(f => f.CreatedAtUtc))
        {
            f.CalculatedKmPerLiter = f.KilometersAtFueling is { } km && lastKm is { } pk && km > pk && f.Liters > 0
                ? Math.Round((km - pk) / f.Liters, 2) : null;
            f.CalculatedLitersPerHour = f.HoursAtFueling is { } h && lastHours is { } ph && h > ph
                ? Math.Round(f.Liters / (h - ph), 2) : null;
            if (f.KilometersAtFueling is { } k) lastKm = k;
            if (f.HoursAtFueling is { } hh) lastHours = hh;
        }
    }

    private static bool TryRange(string? from, string? to, DateOnly today, out DateOnly start, out DateOnly end)
    {
        end = today;
        start = new DateOnly(today.Year, today.Month, 1);
        if (!string.IsNullOrWhiteSpace(from) && !FleetRules.TryParseDate(from, out start)) return false;
        if (!string.IsNullOrWhiteSpace(to) && !FleetRules.TryParseDate(to, out end)) return false;
        return start <= end;
    }

    public static void MapFleetFuel(this RouteGroupBuilder group)
    {
        group.MapGet("/fuel-logs", async (Guid? vehicleId, string? from, string? to, FleetDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var q = db.VehicleFuelLogs.AsNoTracking().Where(f => f.TenantId == tenantId);
            if (vehicleId is { } vid) q = q.Where(f => f.VehicleId == vid);
            if (!string.IsNullOrWhiteSpace(from) || !string.IsNullOrWhiteSpace(to))
            {
                if (!TryRange(from, to, FleetRules.TodayInArgentina(clock.GetUtcNow()), out var start, out var end)) return Problem("Período inválido.");
                var s = FleetRules.ToStoredDate(start).Date;
                var e = FleetRules.ToStoredDate(end).Date.AddDays(1);
                q = q.Where(f => f.LogDateUtc >= s && f.LogDateUtc < e);
            }
            var logs = await q.OrderByDescending(f => f.LogDateUtc).ThenByDescending(f => f.CreatedAtUtc).Take(500).ToListAsync(ct);
            var labels = await db.Vehicles.AsNoTracking().Where(v => v.TenantId == tenantId)
                .Select(v => new { v.Id, v.Plate, v.InternalCode }).ToDictionaryAsync(v => v.Id, v => v.Plate.Length > 0 ? v.Plate : v.InternalCode ?? "", ct);
            var employees = await FleetPeople.EmployeesAsync(db, tenantId, ct);
            return Results.Ok(logs.Select(f => new FuelLogView(f.Id, f.VehicleId, labels.GetValueOrDefault(f.VehicleId) ?? "",
                FleetRules.FromStoredDate(f.LogDateUtc).ToString("yyyy-MM-dd"), f.EmployeeId,
                f.EmployeeId is { } eid && employees.TryGetValue(eid, out var emp) ? emp.FullName : null,
                f.KilometersAtFueling is > 0 ? f.KilometersAtFueling : null, f.HoursAtFueling, f.Liters, f.PricePerLiter, f.TotalCost,
                f.GasStation, f.PaymentMethod, f.CalculatedKmPerLiter, f.CalculatedLitersPerHour, f.Notes, f.CreatedBy)));
        });

        group.MapPost("/fuel-logs", async (SaveFuelLogRequest req, HttpContext http, FleetDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var now = clock.GetUtcNow();
            var today = FleetRules.TodayInArgentina(now);
            var v = await db.Vehicles.FirstOrDefaultAsync(x => x.Id == req.VehicleId && x.TenantId == tenantId, ct);
            if (v is null) return Problem("Elegí la unidad.");
            if (v.Status == VehicleStatus.Sold) return Problem("La unidad está dada de baja.");

            var date = today;
            if (!string.IsNullOrWhiteSpace(req.Date) && !FleetRules.TryParseDate(req.Date, out date)) return Problem("Fecha inválida.");
            if (date > today) return Problem("La carga no puede tener fecha futura.");
            if (req.Liters is <= 0 or > 5000) return Problem("Los litros tienen que ser mayores a cero.");
            if (req.PricePerLiter is < 0 || req.TotalCost is < 0) return Problem("El precio no puede ser negativo.");
            if (FleetRules.UsesKm(v.MeterType) && req.Km is null) return Problem("Cargá los kilómetros del tablero: con eso se calcula el consumo.");
            if (FleetRules.UsesHours(v.MeterType) && !FleetRules.UsesKm(v.MeterType) && req.Hours is null) return Problem("Cargá las horas del horómetro: con eso se calcula el consumo.");
            if (req.Km is not null && !FleetRules.UsesKm(v.MeterType)) return Problem("Esta unidad no se mide por kilómetros.");
            if (req.Hours is not null && !FleetRules.UsesHours(v.MeterType)) return Problem("Esta unidad no se mide por horas.");
            if (req.Km is < 0 or > 5_000_000 || req.Hours is < 0 or > 500_000) return Problem("Lectura fuera de rango.");
            if ((req.Station ?? "").Trim().Length > 80 || (req.PaymentMethod ?? "").Trim().Length > 80) return Problem("Estación o medio de pago demasiado largos.");

            // La lectura no puede ser menor que la de una carga anterior (sería un error de tipeo).
            var stored = FleetRules.ToStoredDate(date);
            var previous = await db.VehicleFuelLogs.AsNoTracking()
                .Where(f => f.TenantId == tenantId && f.VehicleId == v.Id && f.LogDateUtc <= stored)
                .Select(f => new { f.KilometersAtFueling, f.HoursAtFueling }).ToListAsync(ct);
            if (req.Km is { } km && previous.Max(p => p.KilometersAtFueling) is { } maxKm && km < maxKm)
                return Problem(string.Create(FleetRules.Ar, $"Los kilómetros no pueden ser menores que los de una carga anterior ({maxKm:N0} km)."));
            if (req.Hours is { } hours && previous.Max(p => p.HoursAtFueling) is { } maxHours && hours < maxHours)
                return Problem(string.Create(FleetRules.Ar, $"Las horas no pueden ser menores que las de una carga anterior ({maxHours:N1} h)."));

            if (req.EmployeeId is { } employeeId && !await db.Members.AnyAsync(m => m.TenantId == tenantId && m.EmployeeId == employeeId, ct))
                return Problem("La persona que cargó tiene que estar en Flota → Personas.");

            var total = req.TotalCost is > 0 ? req.TotalCost.Value : Math.Round(req.Liters * (req.PricePerLiter ?? 0), 2);
            var price = req.PricePerLiter is > 0 ? req.PricePerLiter.Value : Math.Round(total / req.Liters, 2);
            var user = FleetModule.UserName(http);
            var log = new VehicleFuelLog
            {
                Id = Guid.NewGuid(), TenantId = tenantId, VehicleId = v.Id, EmployeeId = req.EmployeeId, LogDateUtc = stored,
                KilometersAtFueling = req.Km, HoursAtFueling = req.Hours, Liters = req.Liters, PricePerLiter = price, TotalCost = total,
                GasStation = (req.Station ?? "").Trim(), PaymentMethod = (req.PaymentMethod ?? "").Trim(),
                Notes = string.IsNullOrWhiteSpace(req.Notes) ? null : req.Notes.Trim(), CreatedBy = user, CreatedAtUtc = now.UtcDateTime
            };
            db.VehicleFuelLogs.Add(log);

            // La carga también es una lectura de la unidad.
            int? newKm = req.Km > v.CurrentKilometers ? req.Km : null;
            decimal? newHours = req.Hours > v.CurrentEngineHours ? req.Hours : null;
            if (newKm is not null || newHours is not null)
            {
                db.VehicleMeterReadings.Add(new VehicleMeterReading
                {
                    Id = Guid.NewGuid(), TenantId = tenantId, VehicleId = v.Id, ReadAtUtc = stored, Kilometers = newKm, Hours = newHours,
                    Note = "Carga de combustible", CreatedBy = user, CreatedAtUtc = now.UtcDateTime
                });
                if (newKm is { } k) v.CurrentKilometers = k;
                if (newHours is { } h) v.CurrentEngineHours = h;
            }
            await RecalculateAsync(db, tenantId, v.Id, ct);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/fleet/fuel-logs/{log.Id}", new { log.Id, kmPerLiter = log.CalculatedKmPerLiter, litersPerHour = log.CalculatedLitersPerHour });
        });

        group.MapDelete("/fuel-logs/{id:guid}", async (Guid id, FleetDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var log = await db.VehicleFuelLogs.FirstOrDefaultAsync(f => f.Id == id && f.TenantId == tenantId, ct);
            if (log is null) return Results.NotFound(new { detail = "Carga no encontrada." });
            db.VehicleFuelLogs.Remove(log);
            await RecalculateAsync(db, tenantId, log.VehicleId, ct);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        // Costos por unidad en un período: combustible, taller y vencimientos (por fecha de emisión).
        group.MapGet("/costs", async (string? from, string? to, FleetDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            if (!TryRange(from, to, FleetRules.TodayInArgentina(clock.GetUtcNow()), out var start, out var end)) return Problem("Período inválido.");
            var s = FleetRules.ToStoredDate(start).Date;
            var e = FleetRules.ToStoredDate(end).Date.AddDays(1);

            var vehicles = await db.Vehicles.AsNoTracking().Where(v => v.TenantId == tenantId).ToListAsync(ct);
            var fuel = await db.VehicleFuelLogs.AsNoTracking().Where(f => f.TenantId == tenantId && f.LogDateUtc >= s && f.LogDateUtc < e)
                .GroupBy(f => f.VehicleId).Select(g => new { VehicleId = g.Key, Liters = g.Sum(f => f.Liters), Cost = g.Sum(f => f.TotalCost) })
                .ToDictionaryAsync(x => x.VehicleId, ct);
            var shop = await db.VehicleMaintenances.AsNoTracking()
                .Where(m => m.TenantId == tenantId && m.Status == MaintenanceStatus.Completed && m.ServiceDateUtc >= s && m.ServiceDateUtc < e)
                .GroupBy(m => m.VehicleId).Select(g => new { VehicleId = g.Key, Cost = g.Sum(m => m.TotalCost) })
                .ToDictionaryAsync(x => x.VehicleId, x => x.Cost, ct);
            var docs = await db.VehicleDocuments.AsNoTracking()
                .Where(d => d.TenantId == tenantId && d.Cost > 0 && d.IssueDateUtc >= s && d.IssueDateUtc < e)
                .GroupBy(d => d.VehicleId).Select(g => new { VehicleId = g.Key, Cost = g.Sum(d => d.Cost) })
                .ToDictionaryAsync(x => x.VehicleId, x => x.Cost, ct);
            // Uso del período: última lectura del período menos la última anterior (o la primera del período).
            var readings = await db.VehicleMeterReadings.AsNoTracking()
                .Where(r => r.TenantId == tenantId && r.ReadAtUtc < e)
                .Select(r => new { r.VehicleId, r.ReadAtUtc, r.Kilometers, r.Hours }).ToListAsync(ct);
            var byVehicle = readings.GroupBy(r => r.VehicleId).ToDictionary(g => g.Key, g => g.ToList());

            var rows = new List<VehicleCostRow>();
            foreach (var v in vehicles)
            {
                var f = fuel.GetValueOrDefault(v.Id);
                var liters = f?.Liters ?? 0;
                var fuelCost = f?.Cost ?? 0;
                var shopCost = shop.GetValueOrDefault(v.Id);
                var docCost = docs.GetValueOrDefault(v.Id);
                var km = 0;
                decimal hours = 0;
                if (byVehicle.TryGetValue(v.Id, out var list))
                {
                    var before = list.Where(r => r.ReadAtUtc < s).ToList();
                    var during = list.Where(r => r.ReadAtUtc >= s).ToList();
                    var kmEnd = during.Max(r => r.Kilometers);
                    var kmStart = before.Max(r => r.Kilometers) ?? during.Min(r => r.Kilometers);
                    if (kmEnd is { } ke && kmStart is { } ks && ke > ks) km = ke - ks;
                    var hEnd = during.Max(r => r.Hours);
                    var hStart = before.Max(r => r.Hours) ?? during.Min(r => r.Hours);
                    if (hEnd is { } he && hStart is { } hs && he > hs) hours = he - hs;
                }
                var total = fuelCost + shopCost + docCost;
                if (total == 0 && km == 0 && hours == 0 && v.Status == VehicleStatus.Sold) continue;
                rows.Add(new VehicleCostRow(v.Id, FleetModule.Label(v), $"{v.Brand} {v.Model}".Trim(), v.Type, km, hours, liters,
                    fuelCost, shopCost, docCost, total,
                    km > 0 ? Math.Round(total / km, 2) : null,
                    hours > 0 ? Math.Round(total / hours, 2) : null,
                    km > 0 && liters > 0 ? Math.Round(km / liters, 2) : null,
                    hours > 0 && liters > 0 ? Math.Round(liters / hours, 2) : null));
            }
            return Results.Ok(new
            {
                from = start.ToString("yyyy-MM-dd"),
                to = end.ToString("yyyy-MM-dd"),
                totals = new
                {
                    liters = rows.Sum(r => r.Liters),
                    fuelCost = rows.Sum(r => r.FuelCost),
                    maintenanceCost = rows.Sum(r => r.MaintenanceCost),
                    documentsCost = rows.Sum(r => r.DocumentsCost),
                    totalCost = rows.Sum(r => r.TotalCost)
                },
                rows = rows.OrderByDescending(r => r.TotalCost).ThenBy(r => r.VehicleLabel)
            });
        });
    }
}
