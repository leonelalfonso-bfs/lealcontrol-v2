using LealControl.BuildingBlocks.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.HumanResources.Infrastructure;

/// <summary>Área de la empresa (la define cada empresa): agrupa los puestos del organigrama y los manuales de procedimientos.</summary>
public sealed class HrArea
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public string Name { get; set; } = "";
    public int SortOrder { get; set; }
}

public sealed record HrAreaRequest(string Name, int SortOrder);

public static class HrAreas
{
    /// <summary>
    /// La primera vez se arman con las áreas que ya usan los puestos y los manuales; si no hay ninguna, con una base que
    /// cada empresa ajusta.
    /// </summary>
    private static async Task<List<HrArea>> EnsureAsync(HumanResourcesDbContext db, Guid tenantId, CancellationToken ct)
    {
        var areas = await db.Areas.Where(a => a.TenantId == tenantId).OrderBy(a => a.SortOrder).ThenBy(a => a.Name).ToListAsync(ct);
        if (areas.Count > 0) return areas;
        var used = (await db.Positions.Where(p => p.TenantId == tenantId).Select(p => p.Department).ToListAsync(ct))
            .Concat(await db.ProcedureManuals.Where(m => m.TenantId == tenantId).Select(m => m.Area).ToListAsync(ct))
            .Where(n => !string.IsNullOrWhiteSpace(n)).Select(n => n.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        var names = used.Count > 0 ? used : ["Dirección", "Administración", "Comercial", "Operaciones", "Recursos Humanos"];
        areas = names.Select((n, i) => new HrArea { Id = Guid.NewGuid(), TenantId = tenantId, Name = n, SortOrder = i }).ToList();
        db.Areas.AddRange(areas);
        await db.SaveChangesAsync(ct);
        return areas;
    }

    public static void MapHrAreas(this RouteGroupBuilder group)
    {
        group.MapGet("/areas", async (HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var areas = await EnsureAsync(db, t, ct);
            var positions = await db.Positions.AsNoTracking().Where(p => p.TenantId == t).GroupBy(p => p.Department).Select(g => new { g.Key, Count = g.Count() }).ToListAsync(ct);
            var manuals = await db.ProcedureManuals.AsNoTracking().Where(m => m.TenantId == t).GroupBy(m => m.Area).Select(g => new { g.Key, Count = g.Count() }).ToListAsync(ct);
            return Results.Ok(areas.Select(a => new
            {
                a.Id, a.Name, a.SortOrder,
                Positions = positions.FirstOrDefault(p => p.Key == a.Name)?.Count ?? 0,
                Manuals = manuals.FirstOrDefault(m => m.Key == a.Name)?.Count ?? 0
            }));
        });

        group.MapPost("/areas", async (HrAreaRequest req, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var name = (req.Name ?? "").Trim();
            if (name.Length is 0 or > 80) return Results.BadRequest(new { message = "El nombre del área es obligatorio (hasta 80 caracteres)." });
            var areas = await EnsureAsync(db, t, ct);
            if (areas.Any(a => string.Equals(a.Name, name, StringComparison.OrdinalIgnoreCase))) return Results.Conflict(new { message = $"Ya existe el área {name}." });
            var area = new HrArea { Id = Guid.NewGuid(), TenantId = t, Name = name, SortOrder = req.SortOrder };
            db.Areas.Add(area);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/hr/areas/{area.Id}", area);
        });

        // Renombrar actualiza los puestos y manuales que la usan.
        group.MapPut("/areas/{id:guid}", async (Guid id, HrAreaRequest req, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var area = await db.Areas.FirstOrDefaultAsync(a => a.Id == id && a.TenantId == t, ct);
            if (area is null) return Results.NotFound();
            var name = (req.Name ?? "").Trim();
            if (name.Length is 0 or > 80) return Results.BadRequest(new { message = "El nombre del área es obligatorio (hasta 80 caracteres)." });
            if (await db.Areas.AnyAsync(a => a.TenantId == t && a.Id != id && a.Name.ToLower() == name.ToLower(), ct)) return Results.Conflict(new { message = $"Ya existe el área {name}." });
            if (area.Name != name)
            {
                foreach (var p in await db.Positions.Where(p => p.TenantId == t && p.Department == area.Name).ToListAsync(ct)) p.Department = name;
                foreach (var m in await db.ProcedureManuals.Where(m => m.TenantId == t && m.Area == area.Name).ToListAsync(ct)) m.Area = name;
            }
            (area.Name, area.SortOrder) = (name, req.SortOrder);
            await db.SaveChangesAsync(ct);
            return Results.Ok(area);
        });

        group.MapDelete("/areas/{id:guid}", async (Guid id, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var area = await db.Areas.FirstOrDefaultAsync(a => a.Id == id && a.TenantId == t, ct);
            if (area is null) return Results.NotFound();
            var inUse = await db.Positions.CountAsync(p => p.TenantId == t && p.Department == area.Name, ct)
                + await db.ProcedureManuals.CountAsync(m => m.TenantId == t && m.Area == area.Name, ct);
            if (inUse > 0) return Results.Conflict(new { message = $"El área {area.Name} tiene {inUse} puesto(s) o manual(es): pasalos a otra área antes de borrarla." });
            db.Areas.Remove(area);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });
    }
}
