using LealControl.BuildingBlocks.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.HumanResources.Infrastructure.Payroll;

/// <summary>
/// Un tramo de vacaciones de un colaborador (nota 68, S4). Year es el año de las vacaciones (la antigüedad se mide al
/// 31 de diciembre de ese año); el tramo se goza entre octubre de ese año y abril del siguiente, o fuera de ese período
/// por acuerdo (Ley 27.802). Se paga por adelantado en la liquidación del mes en que empieza.
/// </summary>
public sealed class VacationLeave
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid EmployeeId { get; set; }
    public int Year { get; set; }
    public DateTime StartDate { get; set; }
    /// <summary>Días corridos.</summary>
    public int Days { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAtUtc { get; set; }

    public DateTime EndDate => StartDate.AddDays(Days - 1);

    /// <summary>Días del tramo que caen entre from y to (inclusive).</summary>
    public int DaysWithin(DateTime from, DateTime to)
    {
        var start = StartDate > from ? StartDate : from;
        var end = EndDate < to ? EndDate : to;
        return end < start ? 0 : (end - start).Days + 1;
    }
}

public sealed record VacationEntitlement(int Days, string Detail);

/// <summary>Días de vacaciones según la LCT (arts. 150 y 151).</summary>
public static class VacationRules
{
    public const int MinimumBlock = 7;

    public static VacationEntitlement Entitlement(Employee employee, int year)
    {
        var yearEnd = new DateTime(year, 12, 31, 0, 0, 0, DateTimeKind.Utc);
        var yearStart = new DateTime(year, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var hire = employee.HireDate.Date;
        if (hire > yearEnd) return new(0, "Ingresó después de ese año.");
        if (employee.TerminationDate is { } end && end.Date < yearEnd)
            return new(0, "Egresó en el año: las vacaciones no gozadas van en la liquidación final.");

        // Art. 150: antigüedad al 31 de diciembre del año de las vacaciones.
        var since = (employee.SeniorityRecognitionDate ?? employee.HireDate).Date;
        var (days, band) = since.AddYears(5) >= yearEnd ? (14, "hasta 5 años")
            : since.AddYears(10) >= yearEnd ? (21, "más de 5 y hasta 10 años")
            : since.AddYears(20) >= yearEnd ? (28, "más de 10 y hasta 20 años")
            : (35, "más de 20 años");

        // Art. 151: si no trabajó la mitad de los días hábiles del año, un día cada 20 trabajados.
        var worked = BusinessDays(hire > yearStart ? hire : yearStart, yearEnd);
        var total = BusinessDays(yearStart, yearEnd);
        if (worked * 2 < total)
        {
            var proportional = worked / 20;
            return new(proportional, $"Ingresó el {hire:dd/MM/yyyy}: trabajó {worked} de {total} días hábiles (menos de la mitad), un día cada 20 trabajados (art. 151).");
        }
        return new(days, $"Antigüedad {band} al 31/12/{year}: {days} días corridos (art. 150).");
    }

    /// <summary>Lunes a viernes; los feriados no se descuentan (aproximación del art. 151).</summary>
    private static int BusinessDays(DateTime from, DateTime to)
    {
        var count = 0;
        for (var d = from; d <= to; d = d.AddDays(1))
            if (d.DayOfWeek is not (DayOfWeek.Saturday or DayOfWeek.Sunday)) count++;
        return count;
    }
}

public sealed record VacationRequest(Guid EmployeeId, int Year, DateTime StartDate, int Days, string? Notes);

/// <summary>Registro de vacaciones: lo que corresponde, lo tomado y lo que queda (no muestra importes).</summary>
public static class VacationEndpoints
{
    public static RouteGroupBuilder MapVacationEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("/vacations", async (int year, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            await db.EnsureHrTablesAsync(ct);
            var t = tenant.TenantId.Value;
            var yearEnd = new DateTime(year, 12, 31, 0, 0, 0, DateTimeKind.Utc);
            var yearStart = new DateTime(year, 1, 1, 0, 0, 0, DateTimeKind.Utc);
            var employees = await db.Employees.AsNoTracking()
                .Where(e => e.TenantId == t && e.HireDate <= yearEnd && (e.TerminationDate == null || e.TerminationDate >= yearStart))
                .OrderBy(e => e.LastName).ThenBy(e => e.FirstName).ToListAsync(ct);
            var leaves = await db.VacationLeaves.AsNoTracking().Where(v => v.TenantId == t && v.Year == year).OrderBy(v => v.StartDate).ToListAsync(ct);
            return Results.Ok(employees.Select(e =>
            {
                var entitlement = VacationRules.Entitlement(e, year);
                var mine = leaves.Where(v => v.EmployeeId == e.Id).ToList();
                var taken = mine.Sum(v => v.Days);
                return new
                {
                    EmployeeId = e.Id, EmployeeName = $"{e.LastName}, {e.FirstName}".Trim(' ', ','), e.FileNumber,
                    Entitled = entitlement.Days, entitlement.Detail, Taken = taken, Remaining = Math.Max(0, entitlement.Days - taken),
                    Leaves = mine.Select(v => new { v.Id, v.StartDate, v.EndDate, v.Days, v.Notes })
                };
            }));
        });

        group.MapPost("/vacations", async (VacationRequest req, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            await db.EnsureHrTablesAsync(ct);
            var t = tenant.TenantId.Value;
            var employee = await db.Employees.AsNoTracking().FirstOrDefaultAsync(e => e.Id == req.EmployeeId && e.TenantId == t, ct);
            if (employee is null) return Problem("El colaborador no existe.");
            if (req.Days <= 0 || req.StartDate == default) return Problem("Indicá la fecha de inicio y los días.");
            var start = DateTime.SpecifyKind(req.StartDate.Date, DateTimeKind.Utc);
            var entitlement = VacationRules.Entitlement(employee, req.Year);
            var taken = await db.VacationLeaves.Where(v => v.TenantId == t && v.EmployeeId == employee.Id && v.Year == req.Year).SumAsync(v => v.Days, ct);
            var remaining = entitlement.Days - taken;
            if (req.Days > remaining)
                return Problem($"Le quedan {Math.Max(0, remaining)} día(s) de las vacaciones {req.Year} ({entitlement.Detail}).");
            // Ley 27.802: se pueden fraccionar en tramos de al menos 7 días corridos; el último puede ser el saldo.
            if (req.Days < VacationRules.MinimumBlock && req.Days != remaining)
                return Problem($"Cada tramo tiene que ser de al menos {VacationRules.MinimumBlock} días corridos (Ley 27.802), salvo que sea el saldo ({remaining} días).");
            if (start < employee.HireDate.Date || (employee.TerminationDate is { } end && start.AddDays(req.Days - 1) > end.Date))
                return Problem("El tramo cae fuera de la relación laboral.");
            var leave = new VacationLeave
            {
                Id = Guid.NewGuid(), TenantId = t, EmployeeId = employee.Id, Year = req.Year, StartDate = start, Days = req.Days,
                Notes = string.IsNullOrWhiteSpace(req.Notes) ? null : req.Notes.Trim(), CreatedAtUtc = DateTime.UtcNow
            };
            var overlaps = await db.VacationLeaves.AsNoTracking().Where(v => v.TenantId == t && v.EmployeeId == employee.Id).ToListAsync(ct);
            if (overlaps.Any(v => v.DaysWithin(leave.StartDate, leave.EndDate) > 0)) return Problem("Se superpone con otro tramo de vacaciones.");
            if (await ClosedMonthAsync(db, t, leave, ct) is { } closed) return Problem($"La liquidación de {closed} está cerrada: reabrila para cargar estas vacaciones.");
            db.VacationLeaves.Add(leave);
            await InvalidateDraftsAsync(db, t, leave, ct);
            await db.SaveChangesAsync(ct);

            var warnings = new List<string>();
            var periodStart = new DateTime(req.Year, 10, 1, 0, 0, 0, DateTimeKind.Utc);
            var periodEnd = new DateTime(req.Year + 1, 4, 30, 0, 0, 0, DateTimeKind.Utc);
            if (leave.StartDate < periodStart || leave.EndDate > periodEnd)
                warnings.Add("Fuera del período del 1/10 al 30/4: requiere acuerdo con el trabajador (Ley 27.802).");
            return Results.Ok(new { leave.Id, Warnings = warnings });
        });

        group.MapDelete("/vacations/{id:guid}", async (Guid id, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var leave = await db.VacationLeaves.FirstOrDefaultAsync(v => v.Id == id && v.TenantId == t, ct);
            if (leave is null) return Results.NotFound();
            if (await ClosedMonthAsync(db, t, leave, ct) is { } closed) return Problem($"La liquidación de {closed} está cerrada: reabrila para borrar estas vacaciones.");
            db.VacationLeaves.Remove(leave);
            await InvalidateDraftsAsync(db, t, leave, ct);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        return group;
    }

    private static IEnumerable<(int Year, int Month)> Months(VacationLeave leave)
    {
        for (var m = new DateTime(leave.StartDate.Year, leave.StartDate.Month, 1); m <= leave.EndDate; m = m.AddMonths(1))
            yield return (m.Year, m.Month);
    }

    /// <summary>Un tramo toca las liquidaciones mensuales de los meses que abarca: si alguna está cerrada, no se cambia.</summary>
    private static async Task<string?> ClosedMonthAsync(HumanResourcesDbContext db, Guid t, VacationLeave leave, CancellationToken ct)
    {
        foreach (var (year, month) in Months(leave))
            if (await db.PayrollRuns.AnyAsync(r => r.TenantId == t && r.Year == year && r.Month == month && r.Kind == PayrollRunKinds.Monthly && r.Status == PayrollRunStatuses.Closed, ct))
                return $"{month:D2}/{year}";
        return null;
    }

    private static async Task InvalidateDraftsAsync(HumanResourcesDbContext db, Guid t, VacationLeave leave, CancellationToken ct)
    {
        foreach (var (year, month) in Months(leave))
            await db.PayrollRuns.Where(r => r.TenantId == t && r.Year == year && r.Month == month && r.Kind == PayrollRunKinds.Monthly && r.Status == PayrollRunStatuses.Draft)
                .ExecuteUpdateAsync(s => s.SetProperty(r => r.CalculatedAtUtc, (DateTime?)null), ct);
    }

    private static IResult Problem(string message) => Results.BadRequest(new { message });
}
