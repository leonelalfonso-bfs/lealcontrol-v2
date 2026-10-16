using System.Globalization;
using System.Text;
using LealControl.BuildingBlocks.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.HumanResources.Infrastructure.Payroll;

/// <summary>Concepto ARCA elegido para un concepto propio, cuando no se usa el que el sistema propone.</summary>
public sealed class PayrollConceptMapping
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public string Code { get; set; } = "";
    public string ArcaCode { get; set; } = "";
    public DateTime UpdatedAtUtc { get; set; }
}

public sealed record LsdConcept(string Code, string Name, string Kind, string ArcaCode, string DefaultArcaCode, bool Repeats);

/// <summary>
/// Conceptos de sueldo para el Libro de Sueldos Digital (nota 68, S5): cada concepto propio se asocia a un concepto ARCA
/// (Anexo I de la guía). Los del sistema y los de los convenios traen una propuesta; el usuario la puede cambiar.
/// </summary>
public static class LsdConcepts
{
    private static readonly (string Code, string Name, string Kind, string Arca, bool Repeats)[] Builtins =
    [
        ("BASICO", "Sueldo básico", PayslipLineKinds.Remunerative, "110000", false),
        ("INASIST", "Inasistencias injustificadas", PayslipLineKinds.Remunerative, "110000", false),
        ("LICSG", "Licencia sin goce de haberes", PayslipLineKinds.Remunerative, "110000", false),
        ("DESCVAC", "Días de vacaciones (pagados como vacaciones)", PayslipLineKinds.Remunerative, "110000", false),
        ("VACAC", "Vacaciones", PayslipLineKinds.Remunerative, "150000", false),
        ("HE50", "Horas extra al 50 %", PayslipLineKinds.Remunerative, "130001", false),
        ("HE100", "Horas extra al 100 %", PayslipLineKinds.Remunerative, "130002", false),
        ("OTROREM", "Otros haberes remunerativos", PayslipLineKinds.Remunerative, "170000", true),
        ("SAC", "Sueldo anual complementario", PayslipLineKinds.Remunerative, "120000", false),
        ("OTRONR", "Otros haberes no remunerativos", PayslipLineKinds.NonRemunerative, "550000", true),
        ("JUBIL", "Jubilación (SIPA)", PayslipLineKinds.Deduction, "810000", false),
        ("LEY19032", "Ley 19.032 (INSSJyP)", PayslipLineKinds.Deduction, "810001", false),
        ("OBRASOC", "Obra social", PayslipLineKinds.Deduction, "810002", false),
        ("ADELANTO", "Adelanto de haberes", PayslipLineKinds.Deduction, "820000", false),
        ("EMBARGO", "Embargo judicial", PayslipLineKinds.Deduction, "820000", false),
        ("OTRODESC", "Otros descuentos", PayslipLineKinds.Deduction, "820000", true)
    ];

    /// <summary>Propuesta para una regla de convenio según su código y tipo.</summary>
    private static string RuleDefault(AgreementRule r) => r.Type switch
    {
        AgreementRuleTypes.EmployeeDeduction => r.Code == "CUOTA" ? "810004" : "820000",
        _ when !r.Remunerative => "550000",
        _ when r.Code == "ANTIG" => "160001",
        _ when r.Code.StartsWith("TIT", StringComparison.Ordinal) => "160002",
        _ when r.Code.StartsWith("ZONA", StringComparison.Ordinal) => "140000",
        _ when r.Code == "ASIST" => "170001",
        _ => "160000"
    };

    public static async Task<List<LsdConcept>> ListAsync(HumanResourcesDbContext db, Guid tenantId, CancellationToken ct)
    {
        var saved = await db.PayrollConceptMappings.AsNoTracking().Where(m => m.TenantId == tenantId).ToDictionaryAsync(m => m.Code, m => m.ArcaCode, ct);
        var rules = await db.AgreementRules.AsNoTracking()
            .Where(r => r.TenantId == tenantId && r.Type != AgreementRuleTypes.EmployerContribution).OrderBy(r => r.Code).ToListAsync(ct);
        var list = Builtins.Select(b => new LsdConcept(b.Code, b.Name, b.Kind, saved.GetValueOrDefault(b.Code, b.Arca), b.Arca, b.Repeats)).ToList();
        foreach (var r in rules.GroupBy(r => r.Code).Select(g => g.First()).Where(r => list.All(c => c.Code != r.Code)))
        {
            var kind = r.Type == AgreementRuleTypes.EmployeeDeduction ? PayslipLineKinds.Deduction
                : r.Remunerative ? PayslipLineKinds.Remunerative : PayslipLineKinds.NonRemunerative;
            list.Add(new LsdConcept(r.Code, r.Name, kind, saved.GetValueOrDefault(r.Code, RuleDefault(r)), RuleDefault(r), false));
        }
        return list;
    }

    /// <summary>Rangos del Anexo I: remunerativos 1xxxxx-4xxxxx, no remunerativos 5xxxxx-7xxxxx, descuentos 8xxxxx-9xxxxx.</summary>
    public static string? Validate(string kind, string? arcaCode)
    {
        if (arcaCode is not { Length: 6 } || !arcaCode.All(char.IsDigit)) return "El concepto ARCA tiene 6 dígitos.";
        var n = int.Parse(arcaCode, CultureInfo.InvariantCulture);
        return kind switch
        {
            PayslipLineKinds.Remunerative when n is < 100000 or > 499999 => "Un haber remunerativo va con un concepto ARCA del 100000 al 499999.",
            PayslipLineKinds.NonRemunerative when n is < 500000 or > 799999 => "Un haber no remunerativo va con un concepto ARCA del 500000 al 799999.",
            PayslipLineKinds.Deduction when n < 800000 => "Un descuento va con un concepto ARCA del 800000 en adelante.",
            _ => null
        };
    }

    /// <summary>Archivo de conceptos (diseño "Interfaz - Conceptos", 195 posiciones) para el módulo Conceptos del LSD.</summary>
    public static string ConceptsFile(IEnumerable<LsdConcept> concepts)
    {
        var sb = new StringBuilder();
        foreach (var c in concepts)
        {
            // 168-186: SIPA, INSSJyP, obra social y FSR (aporte y contribución), RENATEA, AAFF, FNE, LRT, diferenciales, especiales.
            var r = c.Kind == PayslipLineKinds.Remunerative ? '1' : '0';
            var flags = new string(r, 8) + "00" + " " + r + " " + r + " " + r + "0" + " " + "0";
            sb.Append(Lsd.Text(c.ArcaCode, 6)).Append(Lsd.Text(c.Code, 10)).Append(Lsd.Text(c.Name, 150))
              .Append(c.Repeats ? '1' : '0').Append(flags).Append(new string(' ', 9)).Append("\r\n");
        }
        return sb.ToString();
    }
}

public sealed record LsdResult(string FileName, string? Content, List<string> Errors, List<string> Warnings, object Summary);

/// <summary>
/// Archivo de liquidación del Libro de Sueldos Digital ("Interfaz Usuario / Liquidación de SyJ - DJ F931", ARCA 10/2026):
/// registro 01 (envío), y por trabajador 02 (datos de la liquidación), 03 (un concepto por renglón del recibo) y 04
/// (datos para la DJ F931, con las bases acumuladas de las liquidaciones del período hasta esta, como pide ARCA).
/// </summary>
public static class Lsd
{
    private static readonly Encoding Ansi = Encoding.Latin1;

    public static string Text(string? value, int length)
    {
        var v = (value ?? "").Replace('\r', ' ').Replace('\n', ' ');
        return v.Length >= length ? v[..length] : v.PadRight(length);
    }

    private static string Digits(string? value) => new((value ?? "").Where(char.IsDigit).ToArray());
    private static string Number(long value, int length) => value.ToString(CultureInfo.InvariantCulture).PadLeft(length, '0');
    private static string Amount(decimal value, int length = 15) => Number((long)Math.Round(Math.Abs(value) * 100m, MidpointRounding.AwayFromZero), length);
    private static string Date(DateTime d) => d.ToString("yyyyMMdd", CultureInfo.InvariantCulture);

    public static async Task<LsdResult> BuildAsync(HumanResourcesDbContext db, Guid t, PayrollRun run, CancellationToken ct)
    {
        var errors = new List<string>();
        var warnings = new List<string>();
        var fileName = $"lsd-{run.Year:D4}{run.Month:D2}-liq{run.Number}.txt";
        if (run.Status != PayrollRunStatuses.Closed) errors.Add("Cerrá la liquidación antes de generar el archivo.");

        var cuit = await CompanyCuitAsync(db, t, ct);
        if (!EmployeeRules.IsValidCuil(cuit)) errors.Add("Cargá el CUIT de la empresa en Configuración → Empresa.");
        var employer = await PayrollParameters.GetOrCreateEmployerAsync(db, t, ct);

        // Las bases del registro 04 se acumulan con las liquidaciones anteriores del mismo período.
        var periodRuns = await db.PayrollRuns.AsNoTracking()
            .Where(r => r.TenantId == t && r.Year == run.Year && r.Month == run.Month && r.Number <= run.Number).OrderBy(r => r.Number).ToListAsync(ct);
        foreach (var open in periodRuns.Where(r => r.Id != run.Id && r.Status != PayrollRunStatuses.Closed))
            errors.Add($"La liquidación {open.Number} del período no está cerrada: el registro 04 acumula todas las anteriores.");
        var runIds = periodRuns.Select(r => r.Id).ToList();
        var payslips = await db.Payslips.AsNoTracking().Include(p => p.Lines).Where(p => runIds.Contains(p.RunId)).ToListAsync(ct);
        var current = payslips.Where(p => p.RunId == run.Id).OrderBy(p => p.EmployeeName).ToList();
        if (current.Count == 0) errors.Add("La liquidación no tiene recibos.");
        var employeeIds = payslips.Select(p => p.EmployeeId).Distinct().ToList();
        var employees = await db.Employees.AsNoTracking().Where(e => employeeIds.Contains(e.Id)).ToDictionaryAsync(e => e.Id, ct);
        var concepts = (await LsdConcepts.ListAsync(db, t, ct)).ToDictionary(c => c.Code);
        var monthlyIds = periodRuns.Where(r => r.Kind == PayrollRunKinds.Monthly).Select(r => r.Id).ToHashSet();

        var sb = new StringBuilder();
        var line = (string s, int length) =>
        {
            if (s.Length != length) throw new InvalidOperationException($"Registro de {s.Length} posiciones, se esperaban {length}.");
            sb.Append(s).Append("\r\n");
        };
        var workers = payslips.GroupBy(p => p.EmployeeId).ToList();
        line("01" + Text(cuit, 11) + "SJ" + $"{run.Year:D4}{run.Month:D2}" + "M" + Number(run.Number, 5) + "30" + Number(workers.Count, 6), 35);

        foreach (var p in current)
        {
            if (!employees.TryGetValue(p.EmployeeId, out var e)) continue;
            var cbu = Digits(e.Cbu);
            var payment = cbu.Length == 22 ? '3' : '1';
            if (payment == '1') warnings.Add($"{p.EmployeeName}: sin CBU de 22 dígitos en el legajo, se informa pago en efectivo.");
            var topDays = run.Kind == PayrollRunKinds.Monthly && p.DaysWorked < 30m ? (int)p.DaysWorked : 0;
            line("02" + Text(Digits(p.Cuil), 11) + Text(p.FileNumber, 10) + Text("", 50) + Text(payment == '3' ? cbu : "", 22) + Number(topDays, 3)
                + Date(run.PaymentDate) + Text("", 8) + payment, 115);
            foreach (var l in p.Lines.Where(l => l.Kind != PayslipLineKinds.Employer).OrderBy(l => l.Order))
            {
                if (!concepts.TryGetValue(l.Code, out var concept))
                {
                    errors.Add($"{p.EmployeeName}: el concepto {l.Code} no tiene concepto ARCA asociado (Conceptos ARCA).");
                    continue;
                }
                if (LsdConcepts.Validate(concept.Kind, concept.ArcaCode) is { } bad) errors.Add($"Concepto {l.Code}: {bad}");
                if (concept.ArcaCode.StartsWith("12", StringComparison.Ordinal) && concept.ArcaCode != "120003" && run.Month is not (6 or 12))
                    errors.Add($"Concepto {l.Code}: los conceptos ARCA de aguinaldo solo se informan en junio y diciembre.");
                if (l.Quantity > 999.99m) errors.Add($"{p.EmployeeName}: la cantidad de {l.Code} no entra en el registro 03.");
                var unit = l.Code is "HE50" or "HE100" ? 'H' : l.Quantity > 0m ? 'D' : ' ';
                var debit = l.Kind == PayslipLineKinds.Deduction || l.Amount < 0m;
                line("03" + Text(Digits(p.Cuil), 11) + Text(l.Code, 10) + Amount(Math.Min(l.Quantity, 999.99m), 5) + unit + Amount(l.Amount)
                    + (debit ? 'D' : 'C') + Text("", 6), 51);
            }
        }

        foreach (var g in workers.OrderBy(g => g.First().EmployeeName))
        {
            if (!employees.TryGetValue(g.Key, out var e)) continue;
            var name = g.First().EmployeeName;
            if (!EmployeeRules.IsValidCuil(e.Cuil)) errors.Add($"{name}: el CUIL del legajo no es válido.");
            var activity = e.SocialSecurityActivity ?? employer.ActivityCode;
            if (activity is null) errors.Add($"{name}: falta el código de actividad (legajo o Configuración de sueldos).");
            if (string.IsNullOrWhiteSpace(e.LocalityCode)) errors.Add($"{name}: falta el código de localidad en el legajo.");
            if (string.IsNullOrWhiteSpace(e.HealthInsuranceCode)) errors.Add($"{name}: falta el código de obra social (6 dígitos) en el legajo.");
            var monthly = g.Where(p => monthlyIds.Contains(p.RunId)).ToList();
            var days = monthly.Count == 0 ? 0 : (int)Math.Min(30m, monthly.Max(p => p.DaysWorked));
            var first = new DateTime(run.Year, run.Month, 1, 0, 0, 0, DateTimeKind.Utc);
            var startDay = e.HireDate.Date > first ? e.HireDate.Day : 1;
            var hours = e.PartTime && e.WeeklyHours is { } wh ? (int)Math.Round(wh * 30m / 7m) : 0;
            decimal Sum(Func<Payslip, decimal> f) => g.Sum(f);
            var employeeBase = Sum(p => p.EmployeeContributionsBase);
            var contributionsBase = Sum(p => p.ContributionsBase);
            var detraction = Sum(p => p.Detraction);
            var rate18 = employer.IsMiPyme || !employer.IsCommerceOrServices;
            var record = "04" + Text(Digits(e.Cuil), 11) + (e.HasSpouse ? '1' : '0') + Number(Math.Min(e.ChildrenCount, 99), 2)
                + (e.AgreementId is null ? '0' : '1') + (employer.LifeInsurancePremium > 0m ? '1' : '0') + '0' + (rate18 ? '1' : '4') + '0'
                + Number(e.SocialSecuritySituation, 2) + Number(e.SocialSecurityCondition, 2) + Number(activity ?? 0, 3)
                + Number(e.ContractModalityCode, 3) + Number(e.CasualtyCode, 2) + Text(e.LocalityCode, 2)
                + Number(e.SocialSecuritySituation, 2) + Number(startDay, 2) + "00" + "00" + "00" + "00"
                + Number(days, 2) + Number(Math.Min(hours, 999), 3) + Amount(0m, 5) + Amount(0m, 5)
                + Text(e.HealthInsuranceCode, 6) + Number(Math.Min(e.HealthInsuranceAdherents, 99), 2)
                + Amount(0m) + Amount(0m) + Amount(0m) + Amount(0m) + Amount(0m) + Amount(0m)
                + Amount(Sum(p => p.Remunerative + p.NonRemunerative))
                + Amount(employeeBase) + Amount(contributionsBase) + Amount(contributionsBase) + Amount(employeeBase) + Amount(employeeBase)
                + Amount(0m) + Amount(0m) + Amount(contributionsBase) + Amount(contributionsBase)
                + Amount(0m) + Amount(0m) + Amount(contributionsBase - detraction) + Amount(detraction);
            line(record, 370);
        }

        var all = payslips.SelectMany(p => p.Lines).ToList();
        decimal L(string code) => all.Where(l => l.Code == code).Sum(l => l.Amount);
        var summary = new
        {
            Workers = workers.Count,
            Liquidations = periodRuns.Select(r => r.Number),
            Remunerative = payslips.Sum(p => p.Remunerative),
            PensionContributions = L("JUBIL"), PamiContributions = L("LEY19032"), HealthContributions = L("OBRASOC"),
            EmployerSocialSecurity = payslips.Sum(p => p.EmployerSocialSecurity), Fal = payslips.Sum(p => p.Fal),
            EmployerHealth = payslips.Sum(p => p.EmployerHealth), Art = payslips.Sum(p => p.Art), LifeInsurance = payslips.Sum(p => p.LifeInsurance),
            Total = L("JUBIL") + L("LEY19032") + L("OBRASOC") + payslips.Sum(p => p.EmployerSocialSecurity + p.EmployerHealth + p.Art + p.LifeInsurance),
            Detraction = payslips.Sum(p => p.Detraction)
        };
        if (summary.Fal > 0m) warnings.Add("El Fondo de Asistencia Laboral no va en el F.931: se ingresa aparte (RG ARCA 5907/2026).");
        return new(fileName, errors.Count == 0 ? sb.ToString() : null, errors.Distinct().ToList(), warnings.Distinct().ToList(), summary);
    }

    public static byte[] Encode(string content) => Ansi.GetBytes(content);

    private static async Task<string?> CompanyCuitAsync(HumanResourcesDbContext db, Guid t, CancellationToken ct)
    {
        try
        {
            var value = await db.Database.SqlQuery<string>($@"SELECT ""DocumentNumber"" AS ""Value"" FROM public.tenant_settings WHERE ""TenantId"" = {t}")
                .FirstOrDefaultAsync(ct);
            return value is null ? null : Digits(value);
        }
        catch (Exception)
        {
            return null;
        }
    }
}

public sealed record ConceptMappingRequest(string? ArcaCode);

public static class LsdEndpoints
{
    public static RouteGroupBuilder MapLsdEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("/payroll/lsd/concepts", async (HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            await db.EnsureHrTablesAsync(ct);
            return Results.Ok(await LsdConcepts.ListAsync(db, tenant.TenantId.Value, ct));
        });

        // Vacío vuelve a la propuesta del sistema.
        group.MapPut("/payroll/lsd/concepts/{code}", async (string code, ConceptMappingRequest req, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var concept = (await LsdConcepts.ListAsync(db, t, ct)).FirstOrDefault(c => c.Code == code);
            if (concept is null) return Results.NotFound();
            var existing = await db.PayrollConceptMappings.FirstOrDefaultAsync(m => m.TenantId == t && m.Code == code, ct);
            var arca = req.ArcaCode?.Trim();
            if (string.IsNullOrEmpty(arca) || arca == concept.DefaultArcaCode)
            {
                if (existing is not null) db.PayrollConceptMappings.Remove(existing);
            }
            else
            {
                if (LsdConcepts.Validate(concept.Kind, arca) is { } error) return Results.BadRequest(new { message = error });
                existing ??= db.PayrollConceptMappings.Add(new PayrollConceptMapping { Id = Guid.NewGuid(), TenantId = t, Code = code }).Entity;
                existing.ArcaCode = arca;
                existing.UpdatedAtUtc = DateTime.UtcNow;
            }
            await db.SaveChangesAsync(ct);
            return Results.Ok((await LsdConcepts.ListAsync(db, t, ct)).First(c => c.Code == code));
        });

        group.MapGet("/payroll/lsd/concepts/file", async (HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var concepts = await LsdConcepts.ListAsync(db, tenant.TenantId.Value, ct);
            var invalid = concepts.Select(c => LsdConcepts.Validate(c.Kind, c.ArcaCode) is { } e ? $"{c.Code}: {e}" : null).OfType<string>().ToList();
            if (invalid.Count > 0) return Results.BadRequest(new { message = string.Join(" ", invalid) });
            return Results.File(Lsd.Encode(LsdConcepts.ConceptsFile(concepts)), "text/plain", "conceptos-lsd.txt");
        });

        group.MapGet("/payroll/runs/{id:guid}/lsd/check", async (Guid id, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var run = await db.PayrollRuns.AsNoTracking().FirstOrDefaultAsync(r => r.Id == id && r.TenantId == t, ct);
            if (run is null) return Results.NotFound();
            var result = await Lsd.BuildAsync(db, t, run, ct);
            return Results.Ok(new { result.FileName, result.Errors, result.Warnings, result.Summary });
        });

        group.MapGet("/payroll/runs/{id:guid}/lsd/file", async (Guid id, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var run = await db.PayrollRuns.AsNoTracking().FirstOrDefaultAsync(r => r.Id == id && r.TenantId == t, ct);
            if (run is null) return Results.NotFound();
            var result = await Lsd.BuildAsync(db, t, run, ct);
            if (result.Content is null) return Results.BadRequest(new { message = string.Join(" ", result.Errors) });
            return Results.File(Lsd.Encode(result.Content), "text/plain", result.FileName);
        });

        return group;
    }
}
