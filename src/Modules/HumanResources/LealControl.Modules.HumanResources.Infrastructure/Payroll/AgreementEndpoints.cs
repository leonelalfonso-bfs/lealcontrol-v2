using System.Globalization;
using LealControl.BuildingBlocks.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.HumanResources.Infrastructure.Payroll;

public sealed record AgreementRequest(string Code, string Name, string Union, decimal HourDivisor, string? Zones, string? Notes);
public sealed record CategoryRequest(string Group, string Name, int SortOrder);
public sealed record ScalePasteRequest(string Month, string Source, string Text);
public sealed record ScaleIncreaseRequest(string Month, decimal Percent, string Source, bool RoundToPesos);
public sealed record RuleRequest(
    string Type, string Code, string Name, string Basis, decimal Value, bool Remunerative, string AppliesTo,
    string? Zones, string? Groups, string? RequiresFlag, bool SeniorityFromNextMonth, string ValidFrom, string? ValidTo);
public sealed record SimulationRequest(Guid CategoryId, string? Zone, string Month, DateTime SeniorityFrom, bool UnionMember, List<string>? Flags);

/// <summary>Convenios colectivos: alta, categorías, escalas, reglas y simulador (nota 68, S2).</summary>
public static class AgreementEndpoints
{
    public static RouteGroupBuilder MapAgreementEndpoints(this RouteGroupBuilder group)
    {
        const string root = "/payroll/agreements";

        group.MapGet(root, async (HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            await db.EnsureHrTablesAsync(ct);
            var t = tenant.TenantId.Value;
            var list = await db.CollectiveAgreements.AsNoTracking().Where(a => a.TenantId == t).OrderBy(a => a.Name).ToListAsync(ct);
            var employees = await db.Employees.AsNoTracking().Where(e => e.TenantId == t && e.AgreementId != null)
                .GroupBy(e => e.AgreementId).Select(g => new { g.Key, Count = g.Count() }).ToDictionaryAsync(x => x.Key!.Value, x => x.Count, ct);
            return Results.Ok(list.Select(a => new { a.Id, a.Code, a.Name, a.Union, a.HourDivisor, a.Zones, a.Notes, Employees = employees.GetValueOrDefault(a.Id) }));
        });

        group.MapPost(root, async (AgreementRequest req, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            await db.EnsureHrTablesAsync(ct);
            if (Validate(req) is { } error) return Problem(error);
            var a = new CollectiveAgreement { Id = Guid.NewGuid(), TenantId = tenant.TenantId.Value, CreatedAtUtc = DateTime.UtcNow };
            Apply(a, req);
            if (await db.CollectiveAgreements.AnyAsync(x => x.TenantId == a.TenantId && x.Code == a.Code, ct)) return Problem($"Ya existe el convenio {a.Code}.");
            db.CollectiveAgreements.Add(a);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/hr{root}/{a.Id}", a);
        });

        group.MapPost(root + "/templates/uecara", async (HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            await db.EnsureHrTablesAsync(ct);
            var t = tenant.TenantId.Value;
            if (await db.CollectiveAgreements.AnyAsync(a => a.TenantId == t && a.Code == UecaraTemplate.Code, ct))
                return Problem("El convenio UECARA 660/13 ya está cargado.");
            var agreement = UecaraTemplate.Install(db, t);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/hr{root}/{agreement.Id}", agreement);
        });

        group.MapGet(root + "/{id:guid}", async (Guid id, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var a = await db.CollectiveAgreements.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.TenantId == t, ct);
            if (a is null) return Results.NotFound();
            var categories = await db.AgreementCategories.AsNoTracking().Where(c => c.AgreementId == id && c.TenantId == t)
                .OrderBy(c => c.SortOrder).ThenBy(c => c.Name).ToListAsync(ct);
            var rules = await db.AgreementRules.AsNoTracking().Where(r => r.AgreementId == id && r.TenantId == t)
                .OrderBy(r => r.Type).ThenBy(r => r.Code).ThenByDescending(r => r.ValidFrom).ToListAsync(ct);
            var months = await db.AgreementScales.AsNoTracking().Where(s => s.AgreementId == id && s.TenantId == t)
                .Select(s => s.ValidFrom).Distinct().OrderByDescending(m => m).ToListAsync(ct);
            return Results.Ok(new { Agreement = a, Categories = categories, Rules = rules, ScaleMonths = months });
        });

        group.MapPut(root + "/{id:guid}", async (Guid id, AgreementRequest req, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var a = await db.CollectiveAgreements.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenant.TenantId.Value, ct);
            if (a is null) return Results.NotFound();
            if (Validate(req) is { } error) return Problem(error);
            Apply(a, req);
            await db.SaveChangesAsync(ct);
            return Results.Ok(a);
        });

        group.MapDelete(root + "/{id:guid}", async (Guid id, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var a = await db.CollectiveAgreements.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == t, ct);
            if (a is null) return Results.NotFound();
            if (await db.Employees.AnyAsync(e => e.TenantId == t && e.AgreementId == id, ct))
                return Problem("Hay colaboradores en este convenio: cambiales el convenio antes de borrarlo.");
            db.AgreementScales.RemoveRange(db.AgreementScales.Where(s => s.AgreementId == id && s.TenantId == t));
            db.AgreementRules.RemoveRange(db.AgreementRules.Where(r => r.AgreementId == id && r.TenantId == t));
            db.AgreementCategories.RemoveRange(db.AgreementCategories.Where(c => c.AgreementId == id && c.TenantId == t));
            db.CollectiveAgreements.Remove(a);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        // ---------------- Categorías ----------------
        group.MapPost(root + "/{id:guid}/categories", async (Guid id, CategoryRequest req, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            if (!await db.CollectiveAgreements.AnyAsync(a => a.Id == id && a.TenantId == t, ct)) return Results.NotFound();
            if (string.IsNullOrWhiteSpace(req.Name)) return Problem("Indicá el nombre de la categoría.");
            if (await db.AgreementCategories.AnyAsync(c => c.AgreementId == id && c.Name == req.Name.Trim(), ct)) return Problem("Esa categoría ya existe.");
            var c = new AgreementCategory { Id = Guid.NewGuid(), TenantId = t, AgreementId = id, Group = (req.Group ?? "").Trim(), Name = req.Name.Trim(), SortOrder = req.SortOrder };
            db.AgreementCategories.Add(c);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/hr{root}/{id}/categories/{c.Id}", c);
        });

        group.MapPut(root + "/{id:guid}/categories/{categoryId:guid}", async (Guid id, Guid categoryId, CategoryRequest req, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var c = await db.AgreementCategories.FirstOrDefaultAsync(x => x.Id == categoryId && x.AgreementId == id && x.TenantId == tenant.TenantId.Value, ct);
            if (c is null) return Results.NotFound();
            if (string.IsNullOrWhiteSpace(req.Name)) return Problem("Indicá el nombre de la categoría.");
            c.Group = (req.Group ?? "").Trim();
            c.Name = req.Name.Trim();
            c.SortOrder = req.SortOrder;
            await db.SaveChangesAsync(ct);
            return Results.Ok(c);
        });

        group.MapDelete(root + "/{id:guid}/categories/{categoryId:guid}", async (Guid id, Guid categoryId, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var c = await db.AgreementCategories.FirstOrDefaultAsync(x => x.Id == categoryId && x.AgreementId == id && x.TenantId == t, ct);
            if (c is null) return Results.NotFound();
            if (await db.Employees.AnyAsync(e => e.TenantId == t && e.AgreementCategoryId == categoryId, ct))
                return Problem("Hay colaboradores en esta categoría.");
            db.AgreementScales.RemoveRange(db.AgreementScales.Where(s => s.CategoryId == categoryId && s.TenantId == t));
            db.AgreementCategories.Remove(c);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        // ---------------- Escalas ----------------
        group.MapGet(root + "/{id:guid}/scales", async (Guid id, string? month, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            if (!TryMonth(month, out var first)) return Problem("Indicá el mes (aaaa-mm).");
            var rows = await db.AgreementScales.AsNoTracking().Where(s => s.AgreementId == id && s.TenantId == t && s.ValidFrom <= first).ToListAsync(ct);
            var current = rows.GroupBy(s => (s.CategoryId, s.Zone)).Select(g => g.OrderByDescending(s => s.ValidFrom).First()).ToList();
            return Results.Ok(current.Select(s => new { s.CategoryId, s.Zone, s.Basic, s.NonRemunerative, s.ValidFrom, s.Source, IsCurrentMonth = s.ValidFrom == first }));
        });

        // Pegado desde planilla: una fila por categoría y zona: "Categoría | Zona | Básico | No remunerativo (opcional)".
        group.MapPost(root + "/{id:guid}/scales/paste", async (Guid id, ScalePasteRequest req, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var a = await db.CollectiveAgreements.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.TenantId == t, ct);
            if (a is null) return Results.NotFound();
            if (!TryMonth(req.Month, out var first)) return Problem("Indicá el mes desde el que rige (aaaa-mm).");
            if (string.IsNullOrWhiteSpace(req.Source)) return Problem("Indicá la fuente (por ejemplo, el acuerdo y su fecha).");
            var categories = await db.AgreementCategories.Where(c => c.AgreementId == id && c.TenantId == t).ToListAsync(ct);
            var zones = a.ZoneList();
            var parsed = new List<AgreementScale>();
            var errors = new List<string>();
            foreach (var (line, n) in (req.Text ?? "").Split('\n').Select((l, i) => (l.Trim(), i + 1)).Where(x => x.Item1.Length > 0))
            {
                var parts = line.Split(['\t', ';', '|']).Select(p => p.Trim()).ToArray();
                var category = parts.Length > 0 ? categories.FirstOrDefault(c => string.Equals(c.Name, parts[0], StringComparison.OrdinalIgnoreCase)) : null;
                var zone = parts.Length > 1 ? parts[1] : "";
                if (category is null) { errors.Add($"Fila {n}: la categoría \"{parts.ElementAtOrDefault(0)}\" no existe en el convenio."); continue; }
                if (zones.Length > 0 ? !zones.Contains(zone, StringComparer.OrdinalIgnoreCase) : zone != "") { errors.Add($"Fila {n}: la zona \"{zone}\" no es del convenio."); continue; }
                if (parts.Length < 3 || !TryAmount(parts[2], out var basic) || basic <= 0m) { errors.Add($"Fila {n}: el básico no es un importe válido."); continue; }
                var nonRem = 0m;
                if (parts.Length > 3 && parts[3] != "" && (!TryAmount(parts[3], out nonRem) || nonRem < 0m)) { errors.Add($"Fila {n}: la suma no remunerativa no es válida."); continue; }
                parsed.Add(new AgreementScale
                {
                    Id = Guid.NewGuid(), TenantId = t, AgreementId = id, CategoryId = category.Id,
                    Zone = zones.FirstOrDefault(z => string.Equals(z, zone, StringComparison.OrdinalIgnoreCase)) ?? "",
                    ValidFrom = first, Basic = basic, NonRemunerative = nonRem, Source = req.Source.Trim()
                });
            }
            if (errors.Count > 0) return Results.BadRequest(new { message = "No se cargó nada: corregí las filas marcadas.", errors });
            if (parsed.Count == 0) return Problem("Pegá al menos una fila.");
            await ReplaceMonthAsync(db, t, id, first, parsed, ct);
            return Results.Ok(new { Saved = parsed.Count });
        });

        // Aumento porcentual sobre la escala vigente el mes anterior (los acuerdos suelen pactarse así).
        group.MapPost(root + "/{id:guid}/scales/increase", async (Guid id, ScaleIncreaseRequest req, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            if (!await db.CollectiveAgreements.AnyAsync(x => x.Id == id && x.TenantId == t, ct)) return Results.NotFound();
            if (!TryMonth(req.Month, out var first)) return Problem("Indicá el mes del aumento (aaaa-mm).");
            if (req.Percent is <= -50m or > 200m) return Problem("El porcentaje no es razonable.");
            if (string.IsNullOrWhiteSpace(req.Source)) return Problem("Indicá la fuente del aumento (acuerdo y fecha).");
            var previous = (await db.AgreementScales.AsNoTracking().Where(s => s.AgreementId == id && s.TenantId == t && s.ValidFrom < first).ToListAsync(ct))
                .GroupBy(s => (s.CategoryId, s.Zone)).Select(g => g.OrderByDescending(s => s.ValidFrom).First()).ToList();
            if (previous.Count == 0) return Problem("No hay una escala anterior sobre la cual aplicar el aumento.");
            var rows = previous.Select(p =>
            {
                var basic = p.Basic * (1m + req.Percent / 100m);
                return new AgreementScale
                {
                    Id = Guid.NewGuid(), TenantId = t, AgreementId = id, CategoryId = p.CategoryId, Zone = p.Zone, ValidFrom = first,
                    Basic = req.RoundToPesos ? Math.Round(basic, 0, MidpointRounding.AwayFromZero) : Math.Round(basic, 2, MidpointRounding.AwayFromZero),
                    // Las sumas no remunerativas de un acuerdo son por meses puntuales: no se arrastran.
                    NonRemunerative = 0m, Source = $"{req.Source.Trim()} (+{req.Percent:0.##} %)"
                };
            }).ToList();
            await ReplaceMonthAsync(db, t, id, first, rows, ct);
            return Results.Ok(new { Saved = rows.Count });
        });

        // ---------------- Reglas ----------------
        group.MapPost(root + "/{id:guid}/rules", async (Guid id, RuleRequest req, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            if (!await db.CollectiveAgreements.AnyAsync(x => x.Id == id && x.TenantId == t, ct)) return Results.NotFound();
            var rule = new AgreementRule { Id = Guid.NewGuid(), TenantId = t, AgreementId = id };
            if (ApplyRule(rule, req) is { } error) return Problem(error);
            db.AgreementRules.Add(rule);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/hr{root}/{id}/rules/{rule.Id}", rule);
        });

        group.MapPut(root + "/{id:guid}/rules/{ruleId:guid}", async (Guid id, Guid ruleId, RuleRequest req, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var rule = await db.AgreementRules.FirstOrDefaultAsync(r => r.Id == ruleId && r.AgreementId == id && r.TenantId == tenant.TenantId.Value, ct);
            if (rule is null) return Results.NotFound();
            if (ApplyRule(rule, req) is { } error) return Problem(error);
            await db.SaveChangesAsync(ct);
            return Results.Ok(rule);
        });

        group.MapDelete(root + "/{id:guid}/rules/{ruleId:guid}", async (Guid id, Guid ruleId, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var rule = await db.AgreementRules.FirstOrDefaultAsync(r => r.Id == ruleId && r.AgreementId == id && r.TenantId == tenant.TenantId.Value, ct);
            if (rule is null) return Results.NotFound();
            db.AgreementRules.Remove(rule);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        // ---------------- Simulador ----------------
        group.MapPost(root + "/{id:guid}/simulate", async (Guid id, SimulationRequest req, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var category = await db.AgreementCategories.AsNoTracking().FirstOrDefaultAsync(c => c.Id == req.CategoryId && c.AgreementId == id && c.TenantId == t, ct);
            if (category is null) return Problem("Elegí una categoría del convenio.");
            if (!TryMonth(req.Month, out var first)) return Problem("Indicá el mes (aaaa-mm).");
            var scales = await db.AgreementScales.AsNoTracking().Where(s => s.AgreementId == id && s.TenantId == t).ToListAsync(ct);
            var rules = await db.AgreementRules.AsNoTracking().Where(r => r.AgreementId == id && r.TenantId == t).ToListAsync(ct);
            return Results.Ok(AgreementCalculator.Compute(category, (req.Zone ?? "").Trim(), first, req.SeniorityFrom, req.UnionMember,
                req.Flags ?? [], scales, rules));
        });

        return group;
    }

    private static async Task ReplaceMonthAsync(HumanResourcesDbContext db, Guid tenantId, Guid agreementId, DateTime month, List<AgreementScale> rows, CancellationToken ct)
    {
        var keys = rows.Select(r => (r.CategoryId, r.Zone)).ToHashSet();
        var existing = (await db.AgreementScales.Where(s => s.AgreementId == agreementId && s.TenantId == tenantId && s.ValidFrom == month).ToListAsync(ct))
            .Where(s => keys.Contains((s.CategoryId, s.Zone))).ToList();
        db.AgreementScales.RemoveRange(existing);
        db.AgreementScales.AddRange(rows);
        await db.SaveChangesAsync(ct);
    }

    private static string? Validate(AgreementRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Code) || string.IsNullOrWhiteSpace(req.Name)) return "Indicá el número y el nombre del convenio.";
        if (req.HourDivisor is <= 0m or > 400m) return "El divisor de la hora va de 1 a 400.";
        return null;
    }

    private static void Apply(CollectiveAgreement a, AgreementRequest req)
    {
        a.Code = req.Code.Trim();
        a.Name = req.Name.Trim();
        a.Union = (req.Union ?? "").Trim();
        a.HourDivisor = req.HourDivisor;
        a.Zones = string.Join(",", (req.Zones ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
        a.Notes = string.IsNullOrWhiteSpace(req.Notes) ? null : req.Notes.Trim();
    }

    private static string? ApplyRule(AgreementRule rule, RuleRequest req)
    {
        if (!AgreementRuleTypes.All.Contains(req.Type)) return "Tipo de regla desconocido.";
        if (!AgreementRuleBases.All.Contains(req.Basis)) return "Base de cálculo desconocida.";
        if (req.Type == AgreementRuleTypes.Addition && req.Basis == AgreementRuleBases.PercentOfGross) return "Un adicional no se calcula sobre el bruto.";
        if (req.Type != AgreementRuleTypes.Addition && req.Basis is AgreementRuleBases.FixedPerSeniorityYear or AgreementRuleBases.PercentOfBasicPerSeniorityYear)
            return "Solo los adicionales dependen de la antigüedad.";
        if (string.IsNullOrWhiteSpace(req.Code) || string.IsNullOrWhiteSpace(req.Name)) return "Indicá el código y el nombre de la regla.";
        if (req.Code.Trim().Length > 10) return "El código de la regla es de hasta 10 caracteres (es el código de concepto del Libro de Sueldos Digital).";
        if (req.Value < 0m) return "El valor no puede ser negativo.";
        if (req.AppliesTo is not ("All" or "UnionMembers" or "NonMembers")) return "Indicá a quién aplica.";
        if (!TryMonth(req.ValidFrom, out var from)) return "Indicá el mes desde el que rige (aaaa-mm).";
        DateTime? to = null;
        if (!string.IsNullOrWhiteSpace(req.ValidTo))
        {
            if (!TryMonth(req.ValidTo, out var parsedTo) || parsedTo < from) return "El mes hasta no puede ser anterior al mes desde.";
            to = parsedTo;
        }
        // Tope legal del aporte solidario: 2 % (Ley 27.802).
        if (req.Type == AgreementRuleTypes.EmployeeDeduction && req.AppliesTo == "NonMembers" && req.Basis == AgreementRuleBases.PercentOfGross && req.Value > 2m)
            return "El aporte solidario de los no afiliados tiene un tope legal del 2 % (Ley 27.802).";
        rule.Type = req.Type;
        rule.Code = req.Code.Trim().ToUpperInvariant();
        rule.Name = req.Name.Trim();
        rule.Basis = req.Basis;
        rule.Value = req.Value;
        rule.Remunerative = req.Type == AgreementRuleTypes.Addition && req.Remunerative;
        rule.AppliesTo = req.AppliesTo;
        rule.Zones = string.Join(",", (req.Zones ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
        rule.Groups = string.Join(",", (req.Groups ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
        rule.RequiresFlag = string.IsNullOrWhiteSpace(req.RequiresFlag) ? null : req.RequiresFlag.Trim().ToLowerInvariant();
        rule.SeniorityFromNextMonth = req.SeniorityFromNextMonth;
        rule.ValidFrom = from;
        rule.ValidTo = to;
        return null;
    }

    private static IResult Problem(string message) => Results.BadRequest(new { message });

    private static bool TryAmount(string text, out decimal value)
    {
        var t = text.Replace("$", "").Replace(" ", "");
        if (t.Contains(',')) t = t.Replace(".", "").Replace(",", ".");
        return decimal.TryParse(t, NumberStyles.Number, CultureInfo.InvariantCulture, out value);
    }

    internal static bool TryMonth(string? text, out DateTime first)
    {
        first = default;
        if (string.IsNullOrWhiteSpace(text) ||
            !DateTime.TryParseExact(text.Trim(), "yyyy-MM", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
            return false;
        first = DateTime.SpecifyKind(parsed, DateTimeKind.Utc);
        return true;
    }
}
