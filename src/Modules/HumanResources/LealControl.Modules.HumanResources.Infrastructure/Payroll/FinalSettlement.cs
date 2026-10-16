namespace LealControl.Modules.HumanResources.Infrastructure.Payroll;

/// <summary>Un mes cerrado del último año, con sus renglones, para la base del art. 245 y los promedios.</summary>
public sealed record HistoryMonth(DateTime Month, Payslip Payslip);

public sealed record FinalSettlementInput(
    PayrollRun Run, Employee Employee, AgreementContext? Agreement, IReadOnlyDictionary<string, decimal?> Parameters,
    PayrollEmployerSettings Employer, IReadOnlyList<PayrollNovelty> Novelties, IReadOnlyList<VacationLeave> Vacations,
    IReadOnlyList<HistoryMonth> History, IReadOnlyList<SacMonth> SemesterHistory, bool IncludeMonthDays, decimal? SeveranceCap, string? SeveranceCapSource);

/// <summary>
/// Liquidación final (nota 68, S6), con la LCT reformada por la Ley 27.802:
/// - días trabajados del mes (si la mensual del mes no lo incluyó) y SAC proporcional, con aportes;
/// - vacaciones no gozadas proporcionales (art. 156) y su SAC;
/// - según la causa: indemnización por antigüedad (art. 245: mejor remuneración mensual, normal y habitual del último año,
///   sin SAC, vacaciones ni premios no mensuales; variables habituales promediados; tope del convenio con piso del 67 %),
///   la mitad por fallecimiento (art. 248) o fin de plazo fijo de más de un año (art. 250); preaviso omitido (art. 231:
///   1 o 2 meses, nada en el período de prueba) e integración del mes (art. 233), con su SAC; gratificación del mutuo acuerdo.
/// Las indemnizaciones no son remunerativas (art. 7 Ley 24.241): no llevan aportes ni contribuciones.
/// </summary>
public static class FinalSettlementCalculator
{
    private static readonly string[] Variables = ["HE50", "HE100", "OTROREM"];
    private static readonly string[] NotMonthly = ["VACAC", "DESCVAC", "SAC", "SACPROP", "HE50", "HE100", "OTROREM"];
    public const int TrialMonths = 6;

    public static PayrollCalculation Calculate(FinalSettlementInput input)
    {
        var (run, employee, agreement) = (input.Run, input.Employee, input.Agreement);
        if (employee.TerminationDate is not { } end) return new(null, $"{Name(employee)}: cargá la fecha de egreso en el legajo.");
        var term = end.Date;
        var month = new DateTime(term.Year, term.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var daysInMonth = DateTime.DaysInMonth(term.Year, term.Month);
        var warnings = new List<string>();
        var extras = new List<PayslipLine>();
        void Extra(string code, string name, decimal amount, decimal quantity = 0m, string? detail = null)
        {
            amount = Math.Round(amount, 2, MidpointRounding.AwayFromZero);
            if (amount > 0m) extras.Add(new PayslipLine { Code = code, Name = name, Kind = PayslipLineKinds.NonRemunerative, Amount = amount, Quantity = quantity, Detail = detail });
        }

        // Días del mes del egreso.
        Payslip? days = null;
        if (input.IncludeMonthDays)
        {
            var variableForVacation = Average(input.History, 6, Variables);
            var result = PayrollCalculator.Calculate(employee, month, agreement, input.Parameters, input.Employer, input.Novelties, input.Vacations, variableForVacation);
            if (result.Error is not null) return result;
            days = result.Payslip;
        }

        // Remuneración mensual al egreso (para preaviso, integración y vacaciones) y mejor remuneración del último año.
        decimal currentRemunerative, currentNonRemunerative = 0m;
        if (agreement is not null)
        {
            var flags = (employee.AgreementFlags ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();
            flags.Add("asistencia-perfecta");
            var c = AgreementCalculator.Compute(agreement.Category, employee.AgreementZone ?? "", month, employee.SeniorityRecognitionDate ?? employee.HireDate,
                employee.IsUnionMember, flags, agreement.Scales, agreement.Rules);
            if (c.Basic <= 0m) return new(null, $"{Name(employee)}: no hay escala de {agreement.Category.Name} para {month:MM/yyyy}.");
            currentRemunerative = c.Remunerative;
            currentNonRemunerative = c.Lines.Where(l => l.Type == AgreementRuleTypes.Addition && !l.Remunerative).Sum(l => l.Amount);
        }
        else
        {
            if (employee.BaseSalary <= 0m) return new(null, $"{Name(employee)}: fuera de convenio y sin sueldo básico cargado.");
            currentRemunerative = employee.BaseSalary;
        }

        // Art. 245: habitual = devengado al menos 6 meses del último año; normal = promedio de 6 meses o del año, el mayor.
        var habitual = Variables.Where(code => input.History.Count(h => h.Payslip.Lines.Any(l => l.Code == code && l.Amount != 0m)) >= 6).ToArray();
        var variableNormal = Math.Max(Average(input.History, 6, habitual), Average(input.History, 12, habitual));
        var bestFixed = input.History.Select(h => h.Payslip.Lines
                .Where(l => (l.Kind == PayslipLineKinds.Remunerative || (l.Kind == PayslipLineKinds.NonRemunerative && l.Code != "OTRONR")) && !NotMonthly.Contains(l.Code))
                .Sum(l => l.Amount))
            .Append(currentRemunerative + currentNonRemunerative).Append(run.PriorBestSalary).Max();
        var base245 = Math.Round(bestFixed + variableNormal, 2, MidpointRounding.AwayFromZero);
        var monthly = Math.Round(currentRemunerative + currentNonRemunerative + variableNormal, 2, MidpointRounding.AwayFromZero);

        var since = (employee.SeniorityRecognitionDate ?? employee.HireDate).Date;
        var years = 0;
        while (since.AddYears(years + 1) <= term) years++;
        var seniority = years + (since.AddYears(years).AddMonths(3) < term ? 1 : 0);
        var inTrial = term < employee.HireDate.Date.AddMonths(TrialMonths);
        var cause = run.TerminationCause ?? "";

        // Indemnización por antigüedad.
        var share = cause switch
        {
            TerminationCauses.DismissalWithoutCause when !inTrial => 1m,
            TerminationCauses.Death => 0.5m,
            TerminationCauses.FixedTermEnd when term > employee.HireDate.Date.AddYears(1) => 0.5m,
            _ => 0m
        };
        if (cause == TerminationCauses.DismissalWithoutCause && inTrial)
            warnings.Add($"{Name(employee)}: egresa en el período de prueba ({TrialMonths} meses, art. 92 bis): sin indemnización ni preaviso.");
        if (share > 0m)
        {
            var capped = base245;
            var capDetail = "";
            if (input.SeveranceCap is { } cap && base245 > cap)
            {
                capped = Math.Max(cap, Math.Round(base245 * 0.67m, 2, MidpointRounding.AwayFromZero));
                capDetail = capped == cap ? $", tope del convenio $ {cap:N2}" : $", tope del convenio $ {cap:N2} con piso del 67 %";
            }
            else if (input.SeveranceCap is null)
                warnings.Add($"{Name(employee)}: no hay tope indemnizatorio cargado en el convenio; la base del art. 245 va sin tope.");
            var periods = Math.Max(1, seniority);
            Extra("INDANT", share < 1m ? "Indemnización por antigüedad (50 %)" : "Indemnización por antigüedad (art. 245)", capped * periods * share, periods,
                $"$ {capped:N2} × {periods} año(s){(share < 1m ? " × 50 %" : "")} (mejor remuneración $ {base245:N2}{capDetail})");
        }

        // Preaviso omitido e integración del mes (solo despido sin causa, fuera del período de prueba).
        if (cause == TerminationCauses.DismissalWithoutCause && !inTrial && !run.NoticeGiven)
        {
            var noticeMonths = since.AddYears(5) >= term ? 1 : 2;
            var notice = monthly * noticeMonths;
            Extra("PREAV", "Indemnización sustitutiva del preaviso", notice, noticeMonths, $"{noticeMonths} mes(es) × $ {monthly:N2}");
            Extra("SACPREAV", "SAC sobre el preaviso", notice / 12m);
            var remaining = daysInMonth - term.Day;
            if (remaining > 0)
            {
                var integration = monthly * remaining / daysInMonth;
                Extra("INTEG", "Integración del mes de despido", integration, remaining, $"{remaining} día(s) de {daysInMonth}");
                Extra("SACINTEG", "SAC sobre la integración del mes", integration / 12m);
            }
        }
        if (cause == TerminationCauses.MutualAgreement && run.AgreedAmount > 0m)
            Extra("GRATCESE", "Gratificación por cese (mutuo acuerdo)", run.AgreedAmount);

        // Vacaciones no gozadas (art. 156): proporcionales al año trabajado, menos lo ya gozado de ese año.
        var yearStart = new DateTime(term.Year, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var workedInYear = (term - (employee.HireDate.Date > yearStart ? employee.HireDate.Date : yearStart)).Days + 1;
        var yearDays = DateTime.IsLeapYear(term.Year) ? 366 : 365;
        var entitled = since.AddYears(5) >= new DateTime(term.Year, 12, 31) ? 14 : since.AddYears(10) >= new DateTime(term.Year, 12, 31) ? 21
            : since.AddYears(20) >= new DateTime(term.Year, 12, 31) ? 28 : 35;
        var taken = input.Vacations.Where(v => v.Year == term.Year).Sum(v => v.Days);
        var pending = Math.Round(Math.Max(0m, entitled * workedInYear / (decimal)yearDays - taken), 2, MidpointRounding.AwayFromZero);
        var previousTaken = input.Vacations.Where(v => v.Year == term.Year - 1).ToList();
        if (term <= new DateTime(term.Year, 4, 30) && previousTaken.Count > 0)
        {
            var previousEntitled = VacationRules.Entitlement(new Employee
            {
                HireDate = employee.HireDate, SeniorityRecognitionDate = employee.SeniorityRecognitionDate
            }, term.Year - 1).Days;
            pending += Math.Max(0, previousEntitled - previousTaken.Sum(v => v.Days));
        }
        else if (term <= new DateTime(term.Year, 4, 30))
            warnings.Add($"{Name(employee)}: no hay vacaciones {term.Year - 1} registradas; si quedaron días sin gozar, sumalos con un haber no remunerativo.");
        if (pending > 0m)
        {
            var dayValue = (currentRemunerative + currentNonRemunerative + Average(input.History, 6, Variables)) / 25m;
            var vacations = dayValue * pending;
            Extra("VACNG", "Vacaciones no gozadas", vacations, pending, $"{pending:0.##} días × $ {dayValue:N2} ({entitled} días × {workedInYear}/{yearDays}{(taken > 0 ? $" − {taken} gozados" : "")})");
            Extra("SACVACNG", "SAC sobre vacaciones no gozadas", vacations / 12m);
        }

        var semesterHistory = input.SemesterHistory.ToList();
        if (days is not null) semesterHistory.Add(new SacMonth(month, days.Remunerative, input.Novelties.Where(n => n.Kind == PayrollNoveltyKinds.UnpaidLeave).Sum(n => n.Quantity)));
        // Embargos y otros descuentos van una sola vez: con los días del mes si los hay, si no con el SAC.
        var sacNovelties = days is null ? input.Novelties : input.Novelties.Where(n => n.Kind == PayrollNoveltyKinds.SacPriorBest).ToList();
        var sac = PayrollCalculator.CalculateSac(employee, month, agreement, input.Parameters, input.Employer, sacNovelties, semesterHistory, proportional: true, extras);
        if (sac.Error is not null) return sac;
        var settlement = Merge(days, sac.Payslip);
        if (settlement is null) return new(null, $"{Name(employee)}: no hay nada para liquidar.");
        settlement.Warnings = string.Join("\n", new[] { days?.Warnings, sac.Payslip?.Warnings }.Where(w => w is not null).Concat(warnings).Distinct()) is { Length: > 0 } w ? w : null;
        return new(settlement, null);
    }

    private static decimal Average(IReadOnlyList<HistoryMonth> history, int months, string[] codes)
    {
        var recent = history.OrderByDescending(h => h.Month).Take(months).ToList();
        if (recent.Count == 0 || codes.Length == 0) return 0m;
        return Math.Round(recent.Sum(h => h.Payslip.Lines.Where(l => codes.Contains(l.Code)).Sum(l => l.Amount)) / recent.Count, 2, MidpointRounding.AwayFromZero);
    }

    /// <summary>Junta el recibo de los días del mes con el del SAC proporcional y las indemnizaciones: un solo recibo final.</summary>
    private static Payslip? Merge(Payslip? days, Payslip? sac)
    {
        if (days is null || sac is null) return days ?? sac;
        var lines = days.Lines.OrderBy(l => l.Order).ToList();
        foreach (var l in sac.Lines.OrderBy(l => l.Order))
        {
            var same = l.Kind is PayslipLineKinds.Deduction or PayslipLineKinds.Employer ? lines.FirstOrDefault(x => x.Code == l.Code && x.Kind == l.Kind) : null;
            if (same is null) lines.Add(l);
            else
            {
                same.Amount += l.Amount;
                same.Detail = $"{same.Detail} · incluye el SAC proporcional";
            }
        }
        var order = 0;
        foreach (var l in lines)
        {
            l.PayslipId = days.Id;
            l.Order = ++order;
        }
        days.Lines = lines;
        days.Remunerative += sac.Remunerative;
        days.NonRemunerative += sac.NonRemunerative;
        days.Deductions += sac.Deductions;
        days.Net += sac.Net;
        days.ContributionsBase += sac.ContributionsBase;
        days.EmployeeContributionsBase += sac.EmployeeContributionsBase;
        days.Detraction += sac.Detraction;
        days.EmployeeSocialSecurity += sac.EmployeeSocialSecurity;
        days.UnionDeductions += sac.UnionDeductions;
        days.Garnishments += sac.Garnishments;
        days.OtherDeductions += sac.OtherDeductions;
        days.EmployerSocialSecurity += sac.EmployerSocialSecurity;
        days.Fal += sac.Fal;
        days.EmployerHealth += sac.EmployerHealth;
        days.Art += sac.Art;
        days.AgreementContributions += sac.AgreementContributions;
        return days;
    }

    private static string Name(Employee e) => $"{e.LastName}, {e.FirstName}".Trim(' ', ',');
}
