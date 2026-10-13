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

/// <summary>Empleado de RRHH (solo lo que Flota necesita mostrar).</summary>
public sealed record FleetEmployee(Guid Id, string FileNumber, string FirstName, string LastName, string DocumentNumber, string JobTitle, int Status)
{
    public string FullName => $"{LastName}, {FirstName}".Trim(' ', ',');
    public bool IsActive => Status == 0;
}

public sealed record SaveFleetMemberRequest(Guid EmployeeId, bool IsDriver, bool IsCargoDriver, bool IsForkliftOperator, bool IsTechnician, string? Notes = null);

public sealed record SavePersonCredentialRequest(
    CredentialType Type, string? ExpirationDate, string? Category = null, string? Number = null, string? Issuer = null,
    string? IssueDate = null, int AlertDaysBefore = 30);

public sealed record PersonCredentialView(
    Guid Id, Guid EmployeeId, CredentialType Type, string? Category, string Number, string? Issuer, string? IssueDate,
    string ExpirationDate, int AlertDaysBefore, bool IsActive, int DaysRemaining, ExpirationState State);

public sealed record FleetMemberView(
    Guid Id, Guid EmployeeId, string FullName, string FileNumber, string DocumentNumber, string JobTitle, bool EmployeeActive,
    bool IsDriver, bool IsCargoDriver, bool IsForkliftOperator, bool IsTechnician, string? Notes,
    int ExpiredCount, int DueSoonCount, int MissingCount, string? NextExpirationDate);

public sealed record PersonExpirationItem(
    Guid MemberId, Guid EmployeeId, string FullName, CredentialType Type, Guid? CredentialId, string? ExpirationDate, int? DaysRemaining,
    ExpirationState State);

/// <summary>Personas de la flota (choferes, autoelevadoristas, técnicos) y sus credenciales con vencimiento.</summary>
public static class FleetPeople
{
    /// <summary>Empleados de RRHH leídos de su tabla (Flota no los duplica). Vacío si la empresa no tiene RRHH.</summary>
    public static async Task<Dictionary<Guid, FleetEmployee>> EmployeesAsync(FleetDbContext db, Guid tenantId, CancellationToken ct)
    {
        var exists = await db.Database.SqlQuery<bool>($"""SELECT to_regclass('hr."Employees"') IS NOT NULL AS "Value" """).SingleAsync(ct);
        if (!exists) return [];
        var rows = await db.Database.SqlQuery<FleetEmployee>($"""
            SELECT "Id", COALESCE("FileNumber", '') AS "FileNumber", COALESCE("FirstName", '') AS "FirstName",
                   COALESCE("LastName", '') AS "LastName", COALESCE("DocumentNumber", '') AS "DocumentNumber",
                   COALESCE("JobTitle", '') AS "JobTitle", "Status"
            FROM hr."Employees" WHERE "TenantId" = {tenantId}
            """).ToListAsync(ct);
        return rows.ToDictionary(e => e.Id);
    }

    public static PersonCredentialView ToView(PersonCredential c, DateOnly today)
    {
        var expiration = FleetRules.FromStoredDate(c.ExpirationDateUtc);
        var (state, days) = FleetRules.Evaluate(expiration, c.AlertDaysBefore, today);
        return new PersonCredentialView(c.Id, c.EmployeeId, c.Type, c.Category, c.Number, c.Issuer,
            c.IssueDateUtc == default ? null : FleetRules.FromStoredDate(c.IssueDateUtc).ToString("yyyy-MM-dd"),
            expiration.ToString("yyyy-MM-dd"), c.AlertDaysBefore, c.IsActive, days, c.IsActive ? state : ExpirationState.Ok);
    }

    /// <summary>Vencidas, por vencer y faltantes de cada persona (solo empleados activos).</summary>
    public static List<PersonExpirationItem> Expirations(IEnumerable<FleetMember> members, IEnumerable<PersonCredential> active,
        IReadOnlyDictionary<Guid, FleetEmployee> employees, DateOnly today)
    {
        var byEmployee = active.GroupBy(c => c.EmployeeId).ToDictionary(g => g.Key, g => g.ToList());
        var items = new List<PersonExpirationItem>();
        foreach (var m in members)
        {
            if (!employees.TryGetValue(m.EmployeeId, out var employee) || !employee.IsActive) continue;
            var creds = byEmployee.TryGetValue(m.EmployeeId, out var list) ? list : [];
            foreach (var c in creds)
            {
                var view = ToView(c, today);
                if (view.State != ExpirationState.Ok)
                    items.Add(new PersonExpirationItem(m.Id, m.EmployeeId, employee.FullName, c.Type, c.Id, view.ExpirationDate, view.DaysRemaining, view.State));
            }
            foreach (var required in FleetRules.RequiredCredentials(m).Where(t => creds.All(c => c.Type != t)))
                items.Add(new PersonExpirationItem(m.Id, m.EmployeeId, employee.FullName, required, null, null, null, ExpirationState.Missing));
        }
        return items
            .OrderBy(i => i.State switch { ExpirationState.Expired => 0, ExpirationState.Missing => 1, _ => 2 })
            .ThenBy(i => i.DaysRemaining ?? int.MinValue)
            .ThenBy(i => i.FullName)
            .ToList();
    }

    private static FleetMemberView ToView(FleetMember m, FleetEmployee? e, List<PersonExpirationItem> problems, IEnumerable<PersonCredential> creds, DateOnly today)
    {
        var mine = problems.Where(p => p.MemberId == m.Id).ToList();
        var next = creds.Where(c => c.EmployeeId == m.EmployeeId)
            .Select(c => FleetRules.FromStoredDate(c.ExpirationDateUtc)).Where(d => d >= today).OrderBy(d => d)
            .Select(d => (DateOnly?)d).FirstOrDefault();
        return new FleetMemberView(m.Id, m.EmployeeId, e?.FullName ?? "(empleado no encontrado en RRHH)", e?.FileNumber ?? "",
            e?.DocumentNumber ?? "", e?.JobTitle ?? "", e?.IsActive ?? false, m.IsDriver, m.IsCargoDriver, m.IsForkliftOperator,
            m.IsTechnician, m.Notes, mine.Count(p => p.State == ExpirationState.Expired), mine.Count(p => p.State == ExpirationState.DueSoon),
            mine.Count(p => p.State == ExpirationState.Missing), next?.ToString("yyyy-MM-dd"));
    }

    private static IResult Problem(string message) => Results.BadRequest(new { detail = message });

    private static string? ValidateCredential(SavePersonCredentialRequest req, out DateOnly expiration, out DateOnly? issue)
    {
        issue = null;
        expiration = default;
        if (!Enum.IsDefined(req.Type)) return "Tipo de credencial inválido.";
        if (!FleetRules.TryParseDate(req.ExpirationDate, out expiration)) return "La fecha de vencimiento es obligatoria.";
        if (!string.IsNullOrWhiteSpace(req.IssueDate))
        {
            if (!FleetRules.TryParseDate(req.IssueDate, out var parsed)) return "Fecha de emisión inválida.";
            if (parsed > expiration) return "La emisión no puede ser posterior al vencimiento.";
            issue = parsed;
        }
        if (req.AlertDaysBefore is < 0 or > 365) return "Los días de aviso van de 0 a 365.";
        if ((req.Number ?? "").Trim().Length > 60 || (req.Issuer ?? "").Trim().Length > 120 || (req.Category ?? "").Trim().Length > 40)
            return "Número, emisor o categoría demasiado largos.";
        return null;
    }

    public static void MapFleetPeople(this RouteGroupBuilder group)
    {
        group.MapGet("/people", async (FleetDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var members = await db.Members.AsNoTracking().Where(m => m.TenantId == tenantId).ToListAsync(ct);
            var creds = await db.PersonCredentials.AsNoTracking().Where(c => c.TenantId == tenantId && c.IsActive).ToListAsync(ct);
            var employees = await EmployeesAsync(db, tenantId, ct);
            var today = FleetRules.TodayInArgentina(clock.GetUtcNow());
            var problems = Expirations(members, creds, employees, today);
            return Results.Ok(members
                .Select(m => ToView(m, employees.GetValueOrDefault(m.EmployeeId), problems, creds, today))
                .OrderBy(v => !v.EmployeeActive).ThenBy(v => v.FullName));
        });

        // Empleados activos de RRHH que todavía no están en la flota (para sumarlos).
        group.MapGet("/people/available", async (FleetDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var inFleet = await db.Members.AsNoTracking().Where(m => m.TenantId == tenantId).Select(m => m.EmployeeId).ToListAsync(ct);
            var employees = await EmployeesAsync(db, tenantId, ct);
            return Results.Ok(employees.Values.Where(e => e.IsActive && !inFleet.Contains(e.Id))
                .OrderBy(e => e.FullName).Select(e => new { e.Id, e.FullName, e.FileNumber, e.DocumentNumber, e.JobTitle }));
        });

        group.MapGet("/people/{id:guid}", async (Guid id, FleetDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var m = await db.Members.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            if (m is null) return Results.NotFound(new { detail = "Persona no encontrada en la flota." });
            var creds = await db.PersonCredentials.AsNoTracking().Where(c => c.TenantId == tenantId && c.EmployeeId == m.EmployeeId && c.IsActive).ToListAsync(ct);
            var employees = await EmployeesAsync(db, tenantId, ct);
            var today = FleetRules.TodayInArgentina(clock.GetUtcNow());
            return Results.Ok(ToView(m, employees.GetValueOrDefault(m.EmployeeId), Expirations([m], creds, employees, today), creds, today));
        });

        group.MapPost("/people", async (SaveFleetMemberRequest req, FleetDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            if (!(req.IsDriver || req.IsCargoDriver || req.IsForkliftOperator || req.IsTechnician))
                return Problem("Elegí al menos un rol: chofer, chofer de cargas, autoelevadorista o técnico.");
            var employees = await EmployeesAsync(db, tenantId, ct);
            if (!employees.TryGetValue(req.EmployeeId, out var employee)) return Problem("El empleado no existe en RRHH.");
            if (!employee.IsActive) return Problem("El empleado no está activo en RRHH.");
            if (await db.Members.AnyAsync(m => m.TenantId == tenantId && m.EmployeeId == req.EmployeeId, ct))
                return Problem($"{employee.FullName} ya está en la flota.");
            var member = new FleetMember
            {
                Id = Guid.NewGuid(), TenantId = tenantId, EmployeeId = req.EmployeeId, IsDriver = req.IsDriver || req.IsCargoDriver,
                IsCargoDriver = req.IsCargoDriver, IsForkliftOperator = req.IsForkliftOperator, IsTechnician = req.IsTechnician,
                Notes = string.IsNullOrWhiteSpace(req.Notes) ? null : req.Notes.Trim(), CreatedAtUtc = clock.GetUtcNow().UtcDateTime
            };
            db.Members.Add(member);
            await db.SaveChangesAsync(ct);
            var today = FleetRules.TodayInArgentina(clock.GetUtcNow());
            return Results.Created($"/api/v1/fleet/people/{member.Id}", ToView(member, employee, Expirations([member], [], employees, today), [], today));
        });

        group.MapPut("/people/{id:guid}", async (Guid id, SaveFleetMemberRequest req, FleetDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var m = await db.Members.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            if (m is null) return Results.NotFound(new { detail = "Persona no encontrada en la flota." });
            if (!(req.IsDriver || req.IsCargoDriver || req.IsForkliftOperator || req.IsTechnician))
                return Problem("Elegí al menos un rol: chofer, chofer de cargas, autoelevadorista o técnico.");
            m.IsDriver = req.IsDriver || req.IsCargoDriver;
            m.IsCargoDriver = req.IsCargoDriver;
            m.IsForkliftOperator = req.IsForkliftOperator;
            m.IsTechnician = req.IsTechnician;
            m.Notes = string.IsNullOrWhiteSpace(req.Notes) ? null : req.Notes.Trim();
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        // Sacarla de la flota: sus credenciales quedan (si vuelve, reaparecen).
        group.MapDelete("/people/{id:guid}", async (Guid id, FleetDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var m = await db.Members.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            if (m is null) return Results.NoContent();
            db.Members.Remove(m);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        group.MapGet("/people/{id:guid}/credentials", async (Guid id, bool? history, FleetDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var m = await db.Members.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            if (m is null) return Results.NotFound(new { detail = "Persona no encontrada en la flota." });
            var q = db.PersonCredentials.AsNoTracking().Where(c => c.TenantId == tenantId && c.EmployeeId == m.EmployeeId);
            if (history != true) q = q.Where(c => c.IsActive);
            var list = await q.OrderBy(c => c.Type).ThenByDescending(c => c.ExpirationDateUtc).ToListAsync(ct);
            var today = FleetRules.TodayInArgentina(clock.GetUtcNow());
            return Results.Ok(list.Select(c => ToView(c, today)));
        });

        group.MapPost("/people/{id:guid}/credentials", async (Guid id, SavePersonCredentialRequest req, FleetDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var now = clock.GetUtcNow();
            var m = await db.Members.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            if (m is null) return Results.NotFound(new { detail = "Persona no encontrada en la flota." });
            if (ValidateCredential(req, out var expiration, out var issue) is { } error) return Problem(error);
            if (req.Type != CredentialType.Other)
            {
                var previous = await db.PersonCredentials
                    .Where(c => c.TenantId == tenantId && c.EmployeeId == m.EmployeeId && c.Type == req.Type && c.IsActive).ToListAsync(ct);
                foreach (var p in previous) p.IsActive = false;
            }
            var credential = new PersonCredential
            {
                Id = Guid.NewGuid(), TenantId = tenantId, EmployeeId = m.EmployeeId, Type = req.Type,
                Category = string.IsNullOrWhiteSpace(req.Category) ? null : req.Category.Trim().ToUpperInvariant(),
                Number = (req.Number ?? "").Trim(), Issuer = string.IsNullOrWhiteSpace(req.Issuer) ? null : req.Issuer.Trim(),
                IssueDateUtc = issue is { } i ? FleetRules.ToStoredDate(i) : default, ExpirationDateUtc = FleetRules.ToStoredDate(expiration),
                AlertDaysBefore = req.AlertDaysBefore, IsActive = true, CreatedAtUtc = now.UtcDateTime
            };
            db.PersonCredentials.Add(credential);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/fleet/credentials/{credential.Id}", ToView(credential, FleetRules.TodayInArgentina(now)));
        });

        group.MapPut("/credentials/{id:guid}", async (Guid id, SavePersonCredentialRequest req, FleetDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var c = await db.PersonCredentials.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            if (c is null) return Results.NotFound(new { detail = "Credencial no encontrada." });
            if (req.Type != c.Type) return Problem("El tipo no se cambia: borrá esta y cargá una nueva.");
            if (ValidateCredential(req, out var expiration, out var issue) is { } error) return Problem(error);
            c.Category = string.IsNullOrWhiteSpace(req.Category) ? null : req.Category.Trim().ToUpperInvariant();
            c.Number = (req.Number ?? "").Trim();
            c.Issuer = string.IsNullOrWhiteSpace(req.Issuer) ? null : req.Issuer.Trim();
            c.IssueDateUtc = issue is { } i ? FleetRules.ToStoredDate(i) : default;
            c.ExpirationDateUtc = FleetRules.ToStoredDate(expiration);
            c.AlertDaysBefore = req.AlertDaysBefore;
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToView(c, FleetRules.TodayInArgentina(clock.GetUtcNow())));
        });

        group.MapDelete("/credentials/{id:guid}", async (Guid id, FleetDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var c = await db.PersonCredentials.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            if (c is null) return Results.NoContent();
            db.PersonCredentials.Remove(c);
            // Si se borra la vigente (carga equivocada), vuelve a regir la anterior del mismo tipo.
            if (c.IsActive && c.Type != CredentialType.Other)
            {
                var previous = await db.PersonCredentials
                    .Where(x => x.TenantId == tenantId && x.EmployeeId == c.EmployeeId && x.Type == c.Type && x.Id != id)
                    .OrderByDescending(x => x.ExpirationDateUtc).ThenByDescending(x => x.CreatedAtUtc).FirstOrDefaultAsync(ct);
                if (previous is not null) previous.IsActive = true;
            }
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        group.MapGet("/people/expirations", async (FleetDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var members = await db.Members.AsNoTracking().Where(m => m.TenantId == tenantId).ToListAsync(ct);
            var creds = await db.PersonCredentials.AsNoTracking().Where(c => c.TenantId == tenantId && c.IsActive).ToListAsync(ct);
            var items = Expirations(members, creds, await EmployeesAsync(db, tenantId, ct), FleetRules.TodayInArgentina(clock.GetUtcNow()));
            return Results.Ok(new
            {
                expired = items.Count(i => i.State == ExpirationState.Expired),
                dueSoon = items.Count(i => i.State == ExpirationState.DueSoon),
                missing = items.Count(i => i.State == ExpirationState.Missing),
                items
            });
        });
    }
}
