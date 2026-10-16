using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Accounting.Contracts.Posting;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.HumanResources.Infrastructure.Payroll;

public sealed record PayrollRunRequest(int Year, int Month, DateTime PaymentDate, string? Kind = null);
public sealed record NoveltyRequest(Guid EmployeeId, string Kind, decimal Quantity, decimal Amount, string? Description);
public sealed record CloseRunRequest(string? LastDepositPeriod, DateTime? LastDepositDate, string? LastDepositBank);
public sealed record SignedRequest(DateTime? SignedAt);

/// <summary>Liquidaciones mensuales (S3) y de aguinaldo (S4): período, novedades, cálculo, cierre, recibos y firma (nota 68).</summary>
public static class PayrollRunEndpoints
{
    public static RouteGroupBuilder MapPayrollRunEndpoints(this RouteGroupBuilder group)
    {
        const string root = "/payroll/runs";

        group.MapGet(root, async (HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            await db.EnsureHrTablesAsync(ct);
            var t = tenant.TenantId.Value;
            var runs = await db.PayrollRuns.AsNoTracking().Where(r => r.TenantId == t).OrderByDescending(r => r.Year).ThenByDescending(r => r.Month).ToListAsync(ct);
            var totals = await db.Payslips.AsNoTracking().Where(p => p.TenantId == t)
                .GroupBy(p => p.RunId).Select(g => new { g.Key, Count = g.Count(), Net = g.Sum(p => p.Net), Gross = g.Sum(p => p.Remunerative + p.NonRemunerative) })
                .ToDictionaryAsync(x => x.Key, ct);
            return Results.Ok(runs.Select(r => new
            {
                r.Id, r.Year, r.Month, r.Number, r.Kind, r.PaymentDate, r.Status, r.ClosedAtUtc,
                Payslips = totals.GetValueOrDefault(r.Id)?.Count ?? 0, Net = totals.GetValueOrDefault(r.Id)?.Net ?? 0m, Gross = totals.GetValueOrDefault(r.Id)?.Gross ?? 0m
            }));
        });

        group.MapPost(root, async (PayrollRunRequest req, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            await db.EnsureHrTablesAsync(ct);
            var t = tenant.TenantId.Value;
            if (req.Month is < 1 or > 12 || req.Year is < 2020 or > 2100) return Problem("Elegí un mes válido.");
            if (req.PaymentDate == default) return Problem("Indicá la fecha de pago.");
            var kind = string.IsNullOrWhiteSpace(req.Kind) ? PayrollRunKinds.Monthly : req.Kind;
            if (!PayrollRunKinds.All.Contains(kind)) return Problem("Tipo de liquidación desconocido.");
            if (kind == PayrollRunKinds.Sac && req.Month is not (6 or 12)) return Problem("El aguinaldo se liquida en junio (1.er semestre) o en diciembre (2.º semestre).");
            if (await db.PayrollRuns.AnyAsync(r => r.TenantId == t && r.Year == req.Year && r.Month == req.Month && r.Kind == kind, ct))
                return Problem($"Ya existe la liquidación {(kind == PayrollRunKinds.Sac ? "de aguinaldo" : "mensual")} de {req.Month:D2}/{req.Year}.");
            // El Libro de Sueldos Digital numera las liquidaciones del período en orden.
            var number = (await db.PayrollRuns.Where(r => r.TenantId == t && r.Year == req.Year && r.Month == req.Month).MaxAsync(r => (int?)r.Number, ct) ?? 0) + 1;
            var run = new PayrollRun
            {
                Id = Guid.NewGuid(), TenantId = t, Year = req.Year, Month = req.Month, Number = number, Kind = kind,
                PaymentDate = DateTime.SpecifyKind(req.PaymentDate.Date, DateTimeKind.Utc), Status = PayrollRunStatuses.Draft, CreatedAtUtc = DateTime.UtcNow
            };
            db.PayrollRuns.Add(run);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/hr{root}/{run.Id}", run);
        });

        group.MapGet(root + "/{id:guid}", async (Guid id, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var run = await db.PayrollRuns.AsNoTracking().FirstOrDefaultAsync(r => r.Id == id && r.TenantId == t, ct);
            if (run is null) return Results.NotFound();
            var payslips = await db.Payslips.AsNoTracking().Where(p => p.RunId == id).OrderBy(p => p.EmployeeName).ToListAsync(ct);
            var novelties = await db.PayrollNovelties.AsNoTracking().Where(n => n.RunId == id).ToListAsync(ct);
            return Results.Ok(new
            {
                Run = run, Novelties = novelties,
                Payslips = payslips.Select(p => new
                {
                    p.Id, p.EmployeeId, p.EmployeeName, p.Category, p.DaysWorked, p.Remunerative, p.NonRemunerative, p.Deductions, p.Net,
                    p.EmployerCost, p.Warnings, p.SignedAtUtc
                }),
                Totals = new
                {
                    Remunerative = payslips.Sum(p => p.Remunerative), NonRemunerative = payslips.Sum(p => p.NonRemunerative),
                    Deductions = payslips.Sum(p => p.Deductions), Net = payslips.Sum(p => p.Net), EmployerCost = payslips.Sum(p => p.EmployerCost),
                    F931 = payslips.Sum(p => p.EmployeeSocialSecurity + p.EmployerSocialSecurity + p.Fal + p.EmployerHealth + p.Art + p.LifeInsurance)
                }
            });
        });

        group.MapDelete(root + "/{id:guid}", async (Guid id, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var run = await db.PayrollRuns.FirstOrDefaultAsync(r => r.Id == id && r.TenantId == tenant.TenantId.Value, ct);
            if (run is null) return Results.NotFound();
            if (run.Status != PayrollRunStatuses.Draft) return Problem("Una liquidación cerrada no se borra: reabrila primero.");
            db.PayrollRuns.Remove(run);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        group.MapPost(root + "/{id:guid}/novelties", async (Guid id, NoveltyRequest req, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var run = await db.PayrollRuns.FirstOrDefaultAsync(r => r.Id == id && r.TenantId == t, ct);
            if (run is null) return Results.NotFound();
            if (run.Status != PayrollRunStatuses.Draft) return Problem("La liquidación está cerrada.");
            if (!PayrollNoveltyKinds.All.Contains(req.Kind)) return Problem("Tipo de novedad desconocido.");
            var allowed = run.Kind == PayrollRunKinds.Sac ? PayrollNoveltyKinds.ForSac.Contains(req.Kind) : req.Kind != PayrollNoveltyKinds.SacPriorBest;
            if (!allowed)
                return Problem(run.Kind == PayrollRunKinds.Sac ? "En el aguinaldo solo van la mejor remuneración liquidada afuera, embargos y otros descuentos." : "Esa novedad es del aguinaldo.");
            if (!await db.Employees.AnyAsync(e => e.Id == req.EmployeeId && e.TenantId == t, ct)) return Problem("El colaborador no existe.");
            if (PayrollNoveltyKinds.Hours.Contains(req.Kind) && req.Quantity is not (> 0m and <= 200m)) return Problem("Indicá las horas (más de 0 y hasta 200).");
            if (PayrollNoveltyKinds.Days.Contains(req.Kind) && req.Quantity is not (> 0m and <= 30m)) return Problem("Indicá los días (más de 0 y hasta 30).");
            if (PayrollNoveltyKinds.Amounts.Contains(req.Kind) && req.Amount <= 0m) return Problem("Indicá el importe.");
            var novelty = new PayrollNovelty
            {
                Id = Guid.NewGuid(), TenantId = t, RunId = id, EmployeeId = req.EmployeeId, Kind = req.Kind,
                Quantity = PayrollNoveltyKinds.Amounts.Contains(req.Kind) ? 0m : req.Quantity,
                Amount = PayrollNoveltyKinds.Amounts.Contains(req.Kind) ? req.Amount : 0m,
                Description = string.IsNullOrWhiteSpace(req.Description) ? null : req.Description.Trim()
            };
            db.PayrollNovelties.Add(novelty);
            run.CalculatedAtUtc = null; // hay que recalcular antes de cerrar
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/hr{root}/{id}/novelties/{novelty.Id}", novelty);
        });

        group.MapDelete(root + "/{id:guid}/novelties/{noveltyId:guid}", async (Guid id, Guid noveltyId, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var run = await db.PayrollRuns.FirstOrDefaultAsync(r => r.Id == id && r.TenantId == t, ct);
            if (run is null) return Results.NotFound();
            if (run.Status != PayrollRunStatuses.Draft) return Problem("La liquidación está cerrada.");
            var novelty = await db.PayrollNovelties.FirstOrDefaultAsync(n => n.Id == noveltyId && n.RunId == id, ct);
            if (novelty is null) return Results.NotFound();
            db.PayrollNovelties.Remove(novelty);
            run.CalculatedAtUtc = null;
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        // Calcula (o recalcula) todos los recibos del borrador.
        group.MapPost(root + "/{id:guid}/calculate", async (Guid id, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var run = await db.PayrollRuns.FirstOrDefaultAsync(r => r.Id == id && r.TenantId == t, ct);
            if (run is null) return Results.NotFound();
            if (run.Status != PayrollRunStatuses.Draft) return Problem("La liquidación está cerrada: reabrila para recalcular.");
            var month = new DateTime(run.Year, run.Month, 1, 0, 0, 0, DateTimeKind.Utc);
            var resolved = (await PayrollParameters.ResolveAsync(db, t, month, ct)).ToDictionary(p => p.Key, p => p.Value);
            var missing = PayrollParameterKeys.Names.Keys.Where(k => !k.StartsWith("fal.") && resolved.GetValueOrDefault(k) is null).ToList();
            if (missing.Count > 0) return Problem($"Faltan parámetros legales del mes: {string.Join(", ", missing.Select(k => PayrollParameterKeys.Names[k]))}.");
            var employer = await PayrollParameters.GetOrCreateEmployerAsync(db, t, ct);
            var monthEnd = month.AddMonths(1).AddDays(-1);
            var sac = run.Kind == PayrollRunKinds.Sac;
            if (sac && !await db.PayrollRuns.AnyAsync(r => r.TenantId == t && r.Year == run.Year && r.Month == run.Month && r.Kind == PayrollRunKinds.Monthly && r.Status == PayrollRunStatuses.Closed, ct))
                return Problem($"Cerrá primero la liquidación mensual de {run.Month:D2}/{run.Year}: el aguinaldo toma la mejor remuneración del semestre.");
            // Meses cerrados de referencia: el semestre para el aguinaldo, los 6 anteriores para el promedio de variables de las vacaciones.
            var historyFrom = sac ? month.AddMonths(-5) : month.AddMonths(-6);
            var historyTo = sac ? month : month.AddMonths(-1);
            var closedRuns = (await db.PayrollRuns.AsNoTracking()
                .Where(r => r.TenantId == t && r.Kind == PayrollRunKinds.Monthly && r.Status == PayrollRunStatuses.Closed)
                .ToListAsync(ct))
                .Where(r => new DateTime(r.Year, r.Month, 1, 0, 0, 0, DateTimeKind.Utc) is var m && m >= historyFrom && m <= historyTo)
                .ToDictionary(r => r.Id, r => new DateTime(r.Year, r.Month, 1, 0, 0, 0, DateTimeKind.Utc));
            var closedIds = closedRuns.Keys.ToList();
            var history = await db.Payslips.AsNoTracking().Include(p => p.Lines).Where(p => closedIds.Contains(p.RunId)).ToListAsync(ct);
            var historyUnpaid = await db.PayrollNovelties.AsNoTracking()
                .Where(n => closedIds.Contains(n.RunId) && n.Kind == PayrollNoveltyKinds.UnpaidLeave).ToListAsync(ct);
            var vacations = sac ? [] : await db.VacationLeaves.AsNoTracking()
                .Where(v => v.TenantId == t && v.StartDate <= monthEnd && v.StartDate.AddDays(v.Days - 1) >= month).ToListAsync(ct);
            var employees = await db.Employees.AsNoTracking().Where(e => e.TenantId == t).ToListAsync(ct);
            var novelties = await db.PayrollNovelties.AsNoTracking().Where(n => n.RunId == id).ToListAsync(ct);
            var agreementIds = employees.Where(e => e.AgreementId != null).Select(e => e.AgreementId!.Value).Distinct().ToList();
            var agreements = await db.CollectiveAgreements.AsNoTracking().Where(a => agreementIds.Contains(a.Id)).ToDictionaryAsync(a => a.Id, ct);
            var categories = await db.AgreementCategories.AsNoTracking().Where(c => agreementIds.Contains(c.AgreementId)).ToDictionaryAsync(c => c.Id, ct);
            var scales = await db.AgreementScales.AsNoTracking().Where(s => agreementIds.Contains(s.AgreementId)).ToListAsync(ct);
            var rules = await db.AgreementRules.AsNoTracking().Where(r => agreementIds.Contains(r.AgreementId)).ToListAsync(ct);

            var errors = new List<string>();
            var payslips = new List<Payslip>();
            foreach (var e in employees.OrderBy(e => e.LastName))
            {
                AgreementContext? context = null;
                if (e.AgreementId is { } aid && agreements.TryGetValue(aid, out var agreement) && e.AgreementCategoryId is { } cid && categories.TryGetValue(cid, out var category))
                    context = new AgreementContext(agreement, category, scales.Where(s => s.AgreementId == aid).ToList(), rules.Where(r => r.AgreementId == aid).ToList());
                PayrollCalculation result;
                try
                {
                    var mine = novelties.Where(n => n.EmployeeId == e.Id).ToList();
                    var past = history.Where(p => p.EmployeeId == e.Id).ToList();
                    if (sac)
                    {
                        var months = past.Select(p => new SacMonth(closedRuns[p.RunId], p.Remunerative,
                            historyUnpaid.Where(n => n.RunId == p.RunId && n.EmployeeId == e.Id).Sum(n => n.Quantity))).ToList();
                        result = PayrollCalculator.CalculateSac(e, month, context, resolved, employer, mine, months);
                    }
                    else
                    {
                        // Art. 155: los variables (horas extra, otros remunerativos) se promedian sobre los meses liquidados del último semestre.
                        var variableAverage = past.Count == 0 ? 0m : Math.Round(past.Sum(p => p.Lines.Where(l => l.Code is "HE50" or "HE100" or "OTROREM").Sum(l => l.Amount)) / past.Count, 2, MidpointRounding.AwayFromZero);
                        result = PayrollCalculator.Calculate(e, month, context, resolved, employer, mine, vacations.Where(v => v.EmployeeId == e.Id).ToList(), variableAverage);
                    }
                }
                catch (InvalidOperationException ex)
                {
                    return Problem(ex.Message);
                }
                if (result.Error is not null) errors.Add(result.Error);
                if (result.Payslip is { } p)
                {
                    p.RunId = id;
                    payslips.Add(p);
                }
            }

            db.Payslips.RemoveRange(db.Payslips.Where(p => p.RunId == id));
            await db.SaveChangesAsync(ct);
            db.Payslips.AddRange(payslips);
            // Con errores quedan los recibos para revisar, pero no se puede cerrar: nadie queda afuera sin querer.
            run.CalculatedAtUtc = errors.Count == 0 ? DateTime.UtcNow : null;
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { Calculated = payslips.Count, Errors = errors, Warnings = payslips.Where(p => p.Warnings != null).SelectMany(p => p.Warnings!.Split('\n')).Distinct() });
        });

        group.MapPost(root + "/{id:guid}/close", async (Guid id, CloseRunRequest req, HttpContext http, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var run = await db.PayrollRuns.FirstOrDefaultAsync(r => r.Id == id && r.TenantId == t, ct);
            if (run is null) return Results.NotFound();
            if (run.Status != PayrollRunStatuses.Draft) return Problem("La liquidación ya está cerrada.");
            if (run.CalculatedAtUtc is null) return Problem("Calculá la liquidación sin errores antes de cerrarla (cambiaron las novedades, todavía no se calculó o hubo colaboradores con error).");
            var payslips = await db.Payslips.Include(p => p.Lines).Where(p => p.RunId == id).ToListAsync(ct);
            if (payslips.Count == 0) return Problem("La liquidación no tiene recibos.");
            if (string.IsNullOrWhiteSpace(req.LastDepositPeriod) || req.LastDepositDate is null || string.IsNullOrWhiteSpace(req.LastDepositBank))
                return Problem("El recibo tiene que informar el último depósito de aportes: período, fecha y banco (art. 140 LCT).");
            run.LastDepositPeriod = req.LastDepositPeriod.Trim();
            run.LastDepositDate = DateTime.SpecifyKind(req.LastDepositDate.Value.Date, DateTimeKind.Utc);
            run.LastDepositBank = req.LastDepositBank.Trim();
            run.Status = PayrollRunStatuses.Closed;
            run.ClosedAtUtc = DateTime.UtcNow;
            run.ClosedBy = http.User.FindFirst("name")?.Value ?? http.User.FindFirst("email")?.Value ?? "Usuario";
            foreach (var p in payslips) p.ContentHash = Hash(run, p);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { run.Status, Payslips = payslips.Count });
        });

        // Reabrir: vuelve a borrador; si ya se había contabilizado, se revierte en Contabilidad.
        group.MapPost(root + "/{id:guid}/reopen", async (Guid id, HumanResourcesDbContext db, ITenantContext tenant, IAccountingPostingGateway accounting, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var run = await db.PayrollRuns.FirstOrDefaultAsync(r => r.Id == id && r.TenantId == t, ct);
            if (run is null) return Results.NotFound();
            if (run.Status != PayrollRunStatuses.Closed) return Problem("La liquidación no está cerrada.");
            if (run.Kind == PayrollRunKinds.Monthly && run.Month is 6 or 12 && await db.PayrollRuns.AnyAsync(r => r.TenantId == t && r.Year == run.Year && r.Month == run.Month && r.Kind == PayrollRunKinds.Sac && r.Status == PayrollRunStatuses.Closed, ct))
                return Problem("El aguinaldo de este mes está cerrado y se calculó con esta liquidación: reabrí primero el aguinaldo.");
            await accounting.ReverseAsync(AccountingSourceModules.Payroll, run.Id.ToString(), $"Liquidación {run.Month:D2}/{run.Year} reabierta", ct);
            run.Status = PayrollRunStatuses.Draft;
            run.ClosedAtUtc = null;
            run.ClosedBy = null;
            foreach (var p in await db.Payslips.Where(p => p.RunId == id).ToListAsync(ct))
            {
                p.ContentHash = null;
                p.SignedAtUtc = null;
            }
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { run.Status });
        });

        group.MapGet(root + "/{id:guid}/payslips/{payslipId:guid}", async (Guid id, Guid payslipId, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var run = await db.PayrollRuns.AsNoTracking().FirstOrDefaultAsync(r => r.Id == id && r.TenantId == t, ct);
            var payslip = await db.Payslips.AsNoTracking().Include(p => p.Lines).FirstOrDefaultAsync(p => p.Id == payslipId && p.RunId == id, ct);
            if (run is null || payslip is null) return Results.NotFound();
            payslip.Lines = payslip.Lines.OrderBy(l => l.Order).ToList();
            var intact = payslip.ContentHash is null || payslip.ContentHash == Hash(run, payslip);
            return Results.Ok(new { Run = run, Payslip = payslip, Intact = intact });
        });

        group.MapPost(root + "/{id:guid}/payslips/{payslipId:guid}/signed", async (Guid id, Guid payslipId, SignedRequest req, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var run = await db.PayrollRuns.AsNoTracking().FirstOrDefaultAsync(r => r.Id == id && r.TenantId == t, ct);
            if (run is null) return Results.NotFound();
            if (run.Status != PayrollRunStatuses.Closed) return Problem("Solo se firman recibos de una liquidación cerrada.");
            var payslip = await db.Payslips.FirstOrDefaultAsync(p => p.Id == payslipId && p.RunId == id, ct);
            if (payslip is null) return Results.NotFound();
            payslip.SignedAtUtc = req.SignedAt is { } at ? DateTime.SpecifyKind(at, DateTimeKind.Utc) : DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { payslip.SignedAtUtc });
        });

        return group;
    }

    /// <summary>Huella del recibo cerrado: período, colaborador, importes y cada línea.</summary>
    internal static string Hash(PayrollRun run, Payslip p)
    {
        var content = JsonSerializer.Serialize(new
        {
            run.Year, run.Month, run.Number, run.PaymentDate, p.EmployeeId, p.Cuil, p.Remunerative, p.NonRemunerative, p.Deductions, p.Net,
            Lines = p.Lines.OrderBy(l => l.Order).Select(l => new { l.Code, l.Name, l.Kind, l.Quantity, l.Amount })
        });
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(content))).ToLowerInvariant();
    }

    private static IResult Problem(string message) => Results.BadRequest(new { message });
}
