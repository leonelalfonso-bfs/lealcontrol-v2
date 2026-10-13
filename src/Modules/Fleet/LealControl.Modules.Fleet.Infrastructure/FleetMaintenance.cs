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
using Microsoft.Extensions.DependencyInjection;

namespace LealControl.Modules.Fleet.Infrastructure;

public sealed record SavePlanRequest(
    string? Title,
    int? IntervalKm,
    decimal? IntervalHours,
    int? IntervalDays,
    int AlertKm = 1000,
    decimal AlertHours = 25,
    int AlertDays = 15,
    /// <summary>Cuándo se hizo por última vez (punto de partida). Por defecto: hoy y la lectura actual.</summary>
    string? LastDoneDate = null,
    int? LastDoneKm = null,
    decimal? LastDoneHours = null,
    string? Notes = null);

public sealed record PlanView(
    Guid Id, Guid VehicleId, string Title, int? IntervalKm, decimal? IntervalHours, int? IntervalDays,
    int AlertKm, decimal AlertHours, int AlertDays, string LastDoneDate, int? LastDoneKm, decimal? LastDoneHours,
    bool LastDoneFromBaseline, string? Notes, int? NextKm, int? KmLeft, decimal? NextHours, decimal? HoursLeft,
    string? NextDate, int? DaysLeft, ExpirationState State, string DueText);

public sealed record ServiceDueItem(
    Guid VehicleId, string VehicleLabel, string VehicleName, VehicleStatus VehicleStatus, Guid PlanId, string Title,
    int? KmLeft, decimal? HoursLeft, string? NextDate, int? DaysLeft, ExpirationState State, string DueText);

public sealed record SaveMaintenanceRequest(
    MaintenanceType Type,
    MaintenanceStatus Status,
    string? Title,
    string? Date,
    int? Km = null,
    decimal? Hours = null,
    string? Workshop = null,
    string? InvoiceReference = null,
    decimal TotalCost = 0,
    string? Description = null,
    Guid[]? PlanIds = null);

public sealed record MaintenanceView(
    Guid Id, Guid VehicleId, string? VehicleLabel, MaintenanceType Type, MaintenanceStatus Status, string Title,
    string Description, string Date, int? Km, decimal? Hours, string Workshop, string? InvoiceReference,
    decimal TotalCost, Guid[] PlanIds, string[] PlanTitles, string? CreatedBy);

/// <summary>Flota 2b: plan de mantenimiento por km, horas o fecha, y trabajos de taller con costo.</summary>
public static class FleetMaintenance
{
    private sealed record LastDone(DateOnly Date, int? Km, decimal? Hours);

    /// <summary>Último trabajo completado de cada ítem del plan (el más reciente por fecha).</summary>
    private static async Task<Dictionary<Guid, LastDone>> LastDoneAsync(FleetDbContext db, Guid tenantId, ICollection<Guid> vehicleIds, CancellationToken ct)
    {
        var done = await db.VehicleMaintenances.AsNoTracking()
            .Where(m => m.TenantId == tenantId && m.Status == MaintenanceStatus.Completed && vehicleIds.Contains(m.VehicleId) && m.PlanIds.Length > 0)
            .Select(m => new { m.PlanIds, m.ServiceDateUtc, m.KmAtService, m.HoursAtService })
            .ToListAsync(ct);
        var result = new Dictionary<Guid, LastDone>();
        foreach (var m in done.OrderBy(m => m.ServiceDateUtc).ThenBy(m => m.KmAtService))
            foreach (var planId in m.PlanIds)
                result[planId] = new LastDone(FleetRules.FromStoredDate(m.ServiceDateUtc), m.KmAtService > 0 ? m.KmAtService : null, m.HoursAtService);
        return result;
    }

    private static (LastDone Last, bool FromBaseline) Resolve(MaintenancePlan p, Dictionary<Guid, LastDone> lastDone)
    {
        var baseline = new LastDone(FleetRules.FromStoredDate(p.BaselineDateUtc), p.BaselineKm, p.BaselineHours);
        // Un trabajo anterior al punto de partida no lo reemplaza.
        return lastDone.TryGetValue(p.Id, out var done) && done.Date >= baseline.Date ? (done, false) : (baseline, true);
    }

    private static PlanView ToView(MaintenancePlan p, Vehicle v, Dictionary<Guid, LastDone> lastDone, DateOnly today)
    {
        var (last, fromBaseline) = Resolve(p, lastDone);
        var due = FleetRules.EvaluatePlan(p, v, last.Date, last.Km, last.Hours, today);
        return new PlanView(p.Id, p.VehicleId, p.Title, p.IntervalKm, p.IntervalHours, p.IntervalDays, p.AlertKm, p.AlertHours, p.AlertDays,
            last.Date.ToString("yyyy-MM-dd"), last.Km, last.Hours, fromBaseline, p.Notes, due.NextKm, due.KmLeft, due.NextHours, due.HoursLeft,
            due.NextDate?.ToString("yyyy-MM-dd"), due.DaysLeft, due.State, FleetRules.DueText(due));
    }

    /// <summary>Services vencidos o por vencer de toda la flota (sin unidades dadas de baja).</summary>
    public static async Task<List<ServiceDueItem>> ServicesDueAsync(FleetDbContext db, Guid tenantId, DateOnly today, CancellationToken ct)
    {
        var vehicles = await db.Vehicles.AsNoTracking()
            .Where(v => v.TenantId == tenantId && v.Status != VehicleStatus.Sold).ToDictionaryAsync(v => v.Id, ct);
        if (vehicles.Count == 0) return [];
        var ids = vehicles.Keys.ToList();
        var plans = await db.MaintenancePlans.AsNoTracking()
            .Where(p => p.TenantId == tenantId && p.IsActive && ids.Contains(p.VehicleId)).ToListAsync(ct);
        if (plans.Count == 0) return [];
        var lastDone = await LastDoneAsync(db, tenantId, ids, ct);
        return plans
            .Select(p => (Plan: p, Vehicle: vehicles[p.VehicleId], View: ToView(p, vehicles[p.VehicleId], lastDone, today)))
            .Where(x => x.View.State != ExpirationState.Ok)
            .Select(x => new ServiceDueItem(x.Vehicle.Id, FleetModule.Label(x.Vehicle), $"{x.Vehicle.Brand} {x.Vehicle.Model}".Trim(),
                x.Vehicle.Status, x.Plan.Id, x.Plan.Title, x.View.KmLeft, x.View.HoursLeft, x.View.NextDate, x.View.DaysLeft, x.View.State, x.View.DueText))
            .OrderBy(i => i.State == ExpirationState.Expired ? 0 : 1)
            .ThenBy(i => i.VehicleLabel)
            .ThenBy(i => i.Title)
            .ToList();
    }

    private static MaintenanceView ToView(VehicleMaintenance m, string? vehicleLabel, IReadOnlyDictionary<Guid, string> planTitles) =>
        new(m.Id, m.VehicleId, vehicleLabel, m.Type, m.Status, m.Title, m.Description, FleetRules.FromStoredDate(m.ServiceDateUtc).ToString("yyyy-MM-dd"),
            m.KmAtService > 0 ? m.KmAtService : null, m.HoursAtService, m.WorkshopName, m.InvoiceReference, m.TotalCost, m.PlanIds,
            m.PlanIds.Select(id => planTitles.TryGetValue(id, out var t) ? t : null).OfType<string>().ToArray(), m.CreatedBy);

    private static IResult Problem(string message) => Results.BadRequest(new { detail = message });

    private static string? ValidateMaintenance(SaveMaintenanceRequest req, Vehicle v, DateOnly today, IReadOnlyCollection<MaintenancePlan> plans, out DateOnly date)
    {
        date = default;
        if (!Enum.IsDefined(req.Type)) return "Tipo de trabajo inválido.";
        if (!Enum.IsDefined(req.Status)) return "Estado inválido.";
        if (!FleetRules.TryParseDate(req.Date, out date)) return "La fecha es obligatoria.";
        if (req.Status != MaintenanceStatus.Scheduled && date > today) return "Un trabajo hecho o en curso no puede tener fecha futura. Si es para más adelante, cargalo como programado.";
        if (string.IsNullOrWhiteSpace(req.Title) && plans.Count == 0) return "Poné qué se hizo.";
        if ((req.Title ?? "").Trim().Length > 160) return "La descripción corta admite hasta 160 caracteres.";
        if ((req.Workshop ?? "").Trim().Length > 120 || (req.InvoiceReference ?? "").Trim().Length > 60) return "Taller o comprobante demasiado largos.";
        if (req.TotalCost < 0) return "El costo no puede ser negativo.";
        if (req.Km is not null && !FleetRules.UsesKm(v.MeterType)) return "Esta unidad no se mide por kilómetros.";
        if (req.Hours is not null && !FleetRules.UsesHours(v.MeterType)) return "Esta unidad no se mide por horas.";
        if (req.Km is < 0 or > 5_000_000) return "Kilómetros fuera de rango.";
        if (req.Hours is < 0 or > 500_000) return "Horas fuera de rango.";
        if (req.Status == MaintenanceStatus.Completed && plans.Count > 0)
        {
            // El próximo service se cuenta desde acá: hace falta la lectura del momento.
            if (FleetRules.UsesKm(v.MeterType) && plans.Any(p => p.IntervalKm is not null) && req.Km is null) return "Cargá los kilómetros al momento del service.";
            if (FleetRules.UsesHours(v.MeterType) && plans.Any(p => p.IntervalHours is not null) && req.Hours is null) return "Cargá las horas al momento del service.";
        }
        return null;
    }

    private static async Task<(List<MaintenancePlan> Plans, string? Error)> PlansAsync(FleetDbContext db, Guid tenantId, Guid vehicleId, Guid[]? ids, CancellationToken ct)
    {
        var wanted = (ids ?? []).Distinct().ToList();
        if (wanted.Count == 0) return ([], null);
        var plans = await db.MaintenancePlans.AsNoTracking()
            .Where(p => p.TenantId == tenantId && p.VehicleId == vehicleId && wanted.Contains(p.Id)).ToListAsync(ct);
        return plans.Count == wanted.Count ? (plans, null) : (plans, "Hay ítems del plan que no son de esta unidad.");
    }

    /// <summary>Un trabajo hecho actualiza la lectura de la unidad si es mayor que la actual.</summary>
    private static void ApplyReading(FleetDbContext db, Vehicle v, VehicleMaintenance m, string user, DateTimeOffset now)
    {
        int? km = FleetRules.UsesKm(v.MeterType) && m.KmAtService > v.CurrentKilometers ? m.KmAtService : null;
        decimal? hours = FleetRules.UsesHours(v.MeterType) && m.HoursAtService > v.CurrentEngineHours ? m.HoursAtService : null;
        if (km is null && hours is null) return;
        db.VehicleMeterReadings.Add(new VehicleMeterReading
        {
            Id = Guid.NewGuid(), TenantId = v.TenantId, VehicleId = v.Id, ReadAtUtc = m.ServiceDateUtc, Kilometers = km, Hours = hours,
            Note = $"Taller: {m.Title}".Length > 300 ? $"Taller: {m.Title}"[..300] : $"Taller: {m.Title}", CreatedBy = user, CreatedAtUtc = now.UtcDateTime
        });
        if (km is { } k) v.CurrentKilometers = k;
        if (hours is { } h) v.CurrentEngineHours = h;
    }

    /// <summary>Con un trabajo en curso la unidad queda "en taller"; al terminar el último, vuelve a estar disponible.</summary>
    private static async Task SyncShopStatusAsync(FleetDbContext db, Vehicle v, CancellationToken ct)
    {
        var inShop = await db.VehicleMaintenances.AnyAsync(m => m.TenantId == v.TenantId && m.VehicleId == v.Id && m.Status == MaintenanceStatus.InProgress, ct)
            || db.ChangeTracker.Entries<VehicleMaintenance>().Any(e => e.State == EntityState.Added && e.Entity.VehicleId == v.Id && e.Entity.Status == MaintenanceStatus.InProgress);
        if (inShop && v.Status == VehicleStatus.Active) v.Status = VehicleStatus.InMaintenance;
        else if (!inShop && v.Status == VehicleStatus.InMaintenance) v.Status = VehicleStatus.Active;
    }

    private static void Fill(VehicleMaintenance m, SaveMaintenanceRequest req, DateOnly date, List<MaintenancePlan> plans)
    {
        m.Type = req.Type;
        m.Status = req.Status;
        m.Title = string.IsNullOrWhiteSpace(req.Title) ? string.Join(" + ", plans.Select(p => p.Title)) : req.Title.Trim();
        if (m.Title.Length > 160) m.Title = m.Title[..160];
        m.Description = (req.Description ?? "").Trim();
        m.ServiceDateUtc = FleetRules.ToStoredDate(date);
        m.KmAtService = req.Km ?? 0;
        m.HoursAtService = req.Hours;
        m.WorkshopName = string.IsNullOrWhiteSpace(req.Workshop) ? "Taller propio" : req.Workshop.Trim();
        m.InvoiceReference = string.IsNullOrWhiteSpace(req.InvoiceReference) ? null : req.InvoiceReference.Trim();
        m.TotalCost = req.TotalCost;
        m.PlanIds = plans.Select(p => p.Id).ToArray();
    }

    private static async Task<Dictionary<Guid, string>> PlanTitlesAsync(FleetDbContext db, Guid tenantId, CancellationToken ct) =>
        await db.MaintenancePlans.AsNoTracking().Where(p => p.TenantId == tenantId).ToDictionaryAsync(p => p.Id, p => p.Title, ct);

    public static void MapFleetMaintenance(this RouteGroupBuilder group)
    {
        // -------------------------------------------------------------
        // PLAN DE MANTENIMIENTO
        // -------------------------------------------------------------
        group.MapGet("/vehicles/{id:guid}/plans", async (Guid id, FleetDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var v = await db.Vehicles.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            if (v is null) return Results.NotFound(new { detail = "Unidad no encontrada." });
            var plans = await db.MaintenancePlans.AsNoTracking()
                .Where(p => p.TenantId == tenantId && p.VehicleId == id && p.IsActive).OrderBy(p => p.Title).ToListAsync(ct);
            var lastDone = await LastDoneAsync(db, tenantId, [id], ct);
            var today = FleetRules.TodayInArgentina(clock.GetUtcNow());
            return Results.Ok(plans.Select(p => ToView(p, v, lastDone, today)));
        });

        static string? ValidatePlan(SavePlanRequest req, Vehicle v, DateOnly today, out DateOnly lastDate)
        {
            lastDate = today;
            var error = FleetRules.ValidatePlan(v.MeterType, req.Title, req.IntervalKm, req.IntervalHours, req.IntervalDays, req.AlertKm, req.AlertHours, req.AlertDays);
            if (error is not null) return error;
            if (!string.IsNullOrWhiteSpace(req.LastDoneDate))
            {
                if (!FleetRules.TryParseDate(req.LastDoneDate, out lastDate)) return "Fecha del último service inválida.";
                if (lastDate > today) return "El último service no puede tener fecha futura.";
            }
            if (req.LastDoneKm is < 0 || req.LastDoneHours is < 0) return "La lectura del último service no puede ser negativa.";
            if ((req.Notes ?? "").Trim().Length > 500) return "Las notas admiten hasta 500 caracteres.";
            return null;
        }

        static void FillPlan(MaintenancePlan p, SavePlanRequest req, Vehicle v, DateOnly lastDate)
        {
            p.Title = req.Title!.Trim();
            p.IntervalKm = req.IntervalKm;
            p.IntervalHours = req.IntervalHours;
            p.IntervalDays = req.IntervalDays;
            p.AlertKm = req.AlertKm;
            p.AlertHours = req.AlertHours;
            p.AlertDays = req.AlertDays;
            p.BaselineDateUtc = FleetRules.ToStoredDate(lastDate);
            p.BaselineKm = FleetRules.UsesKm(v.MeterType) ? req.LastDoneKm ?? v.CurrentKilometers : null;
            p.BaselineHours = FleetRules.UsesHours(v.MeterType) ? req.LastDoneHours ?? v.CurrentEngineHours : null;
            p.Notes = string.IsNullOrWhiteSpace(req.Notes) ? null : req.Notes.Trim();
        }

        group.MapPost("/vehicles/{id:guid}/plans", async (Guid id, SavePlanRequest req, FleetDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var now = clock.GetUtcNow();
            var today = FleetRules.TodayInArgentina(now);
            var v = await db.Vehicles.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            if (v is null) return Results.NotFound(new { detail = "Unidad no encontrada." });
            if (ValidatePlan(req, v, today, out var lastDate) is { } error) return Problem(error);

            var plan = new MaintenancePlan { Id = Guid.NewGuid(), TenantId = tenantId, VehicleId = id, IsActive = true, CreatedAtUtc = now.UtcDateTime };
            FillPlan(plan, req, v, lastDate);
            db.MaintenancePlans.Add(plan);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/fleet/plans/{plan.Id}", ToView(plan, v, [], today));
        });

        group.MapPut("/plans/{id:guid}", async (Guid id, SavePlanRequest req, FleetDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var today = FleetRules.TodayInArgentina(clock.GetUtcNow());
            var plan = await db.MaintenancePlans.FirstOrDefaultAsync(p => p.Id == id && p.TenantId == tenantId && p.IsActive, ct);
            if (plan is null) return Results.NotFound(new { detail = "Ítem del plan no encontrado." });
            var v = await db.Vehicles.AsNoTracking().FirstAsync(x => x.Id == plan.VehicleId, ct);
            if (ValidatePlan(req, v, today, out var lastDate) is { } error) return Problem(error);
            FillPlan(plan, req, v, lastDate);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToView(plan, v, await LastDoneAsync(db, tenantId, [v.Id], ct), today));
        });

        // Se da de baja (no se borra): los trabajos que lo cumplieron lo siguen nombrando.
        group.MapDelete("/plans/{id:guid}", async (Guid id, FleetDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var plan = await db.MaintenancePlans.FirstOrDefaultAsync(p => p.Id == id && p.TenantId == tenantId, ct);
            if (plan is null) return Results.NotFound(new { detail = "Ítem del plan no encontrado." });
            plan.IsActive = false;
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        // -------------------------------------------------------------
        // TRABAJOS DE TALLER (service, reparación, inspección)
        // -------------------------------------------------------------
        group.MapGet("/vehicles/{id:guid}/maintenances", async (Guid id, FleetDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var items = await db.VehicleMaintenances.AsNoTracking()
                .Where(m => m.TenantId == tenantId && m.VehicleId == id)
                .OrderByDescending(m => m.ServiceDateUtc).ThenByDescending(m => m.CreatedAtUtc)
                .Take(300).ToListAsync(ct);
            var titles = await PlanTitlesAsync(db, tenantId, ct);
            return Results.Ok(items.Select(m => ToView(m, null, titles)));
        });

        group.MapPost("/vehicles/{id:guid}/maintenances", async (Guid id, SaveMaintenanceRequest req, HttpContext http, FleetDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var now = clock.GetUtcNow();
            var v = await db.Vehicles.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            if (v is null) return Results.NotFound(new { detail = "Unidad no encontrada." });
            if (v.Status == VehicleStatus.Sold) return Problem("La unidad está dada de baja.");
            if (req.Status == MaintenanceStatus.Cancelled) return Problem("Un trabajo nuevo no puede estar cancelado.");
            var (plans, planError) = await PlansAsync(db, tenantId, id, req.PlanIds, ct);
            if (planError is not null) return Problem(planError);
            if (ValidateMaintenance(req, v, FleetRules.TodayInArgentina(now), plans, out var date) is { } error) return Problem(error);

            var m = new VehicleMaintenance { Id = Guid.NewGuid(), TenantId = tenantId, VehicleId = id, CreatedBy = FleetModule.UserName(http), CreatedAtUtc = now.UtcDateTime };
            Fill(m, req, date, plans);
            db.VehicleMaintenances.Add(m);
            if (m.Status == MaintenanceStatus.Completed) ApplyReading(db, v, m, m.CreatedBy, now);
            await SyncShopStatusAsync(db, v, ct);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/fleet/maintenances/{m.Id}", ToView(m, FleetModule.Label(v), plans.ToDictionary(p => p.Id, p => p.Title)));
        });

        group.MapPut("/maintenances/{id:guid}", async (Guid id, SaveMaintenanceRequest req, HttpContext http, FleetDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var now = clock.GetUtcNow();
            var m = await db.VehicleMaintenances.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            if (m is null) return Results.NotFound(new { detail = "Trabajo no encontrado." });
            var v = await db.Vehicles.FirstAsync(x => x.Id == m.VehicleId, ct);
            var (plans, planError) = await PlansAsync(db, tenantId, v.Id, req.PlanIds, ct);
            if (planError is not null) return Problem(planError);
            if (ValidateMaintenance(req, v, FleetRules.TodayInArgentina(now), plans, out var date) is { } error) return Problem(error);

            var previousCost = m.TotalCost;
            Fill(m, req, date, plans);
            // Quien no ve costos no los recibe: al guardar no puede pisar el que ya estaba.
            if (http.RequestServices.GetService<LealControl.BuildingBlocks.Security.ISensitiveDataAccess>()?.CanSeeCosts == false)
                m.TotalCost = previousCost;
            if (m.Status == MaintenanceStatus.Completed) ApplyReading(db, v, m, FleetModule.UserName(http), now);
            await db.SaveChangesAsync(ct);
            await SyncShopStatusAsync(db, v, ct);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToView(m, FleetModule.Label(v), await PlanTitlesAsync(db, tenantId, ct)));
        });

        group.MapDelete("/maintenances/{id:guid}", async (Guid id, FleetDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var m = await db.VehicleMaintenances.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            if (m is null) return Results.NotFound(new { detail = "Trabajo no encontrado." });
            db.VehicleMaintenances.Remove(m);
            await db.SaveChangesAsync(ct);
            var v = await db.Vehicles.FirstAsync(x => x.Id == m.VehicleId, ct);
            await SyncShopStatusAsync(db, v, ct);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        // Panel: services vencidos o por vencer, unidades en taller, programados y últimos trabajos.
        group.MapGet("/maintenance", async (FleetDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var today = FleetRules.TodayInArgentina(clock.GetUtcNow());
            var services = await ServicesDueAsync(db, tenantId, today, ct);
            var labels = await db.Vehicles.AsNoTracking().Where(v => v.TenantId == tenantId)
                .Select(v => new { v.Id, v.Plate, v.InternalCode }).ToDictionaryAsync(v => v.Id, v => v.Plate.Length > 0 ? v.Plate : v.InternalCode ?? "", ct);
            var titles = await PlanTitlesAsync(db, tenantId, ct);
            var open = await db.VehicleMaintenances.AsNoTracking()
                .Where(m => m.TenantId == tenantId && (m.Status == MaintenanceStatus.InProgress || m.Status == MaintenanceStatus.Scheduled))
                .OrderBy(m => m.ServiceDateUtc).ToListAsync(ct);
            var recent = await db.VehicleMaintenances.AsNoTracking()
                .Where(m => m.TenantId == tenantId && m.Status == MaintenanceStatus.Completed)
                .OrderByDescending(m => m.ServiceDateUtc).ThenByDescending(m => m.CreatedAtUtc).Take(20).ToListAsync(ct);
            MaintenanceView View(VehicleMaintenance m) => ToView(m, labels.GetValueOrDefault(m.VehicleId), titles);
            return Results.Ok(new
            {
                expired = services.Count(s => s.State == ExpirationState.Expired),
                dueSoon = services.Count(s => s.State == ExpirationState.DueSoon),
                services,
                inShop = open.Where(m => m.Status == MaintenanceStatus.InProgress).Select(View),
                scheduled = open.Where(m => m.Status == MaintenanceStatus.Scheduled).Select(View),
                recent = recent.Select(View)
            });
        });
    }
}
