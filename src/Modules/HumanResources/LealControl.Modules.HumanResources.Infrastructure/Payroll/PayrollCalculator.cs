namespace LealControl.Modules.HumanResources.Infrastructure.Payroll;

/// <summary>Lo del convenio que necesita el cálculo de un colaborador; null si está fuera de convenio.</summary>
public sealed record AgreementContext(
    CollectiveAgreement Agreement, AgreementCategory Category, IReadOnlyList<AgreementScale> Scales, IReadOnlyList<AgreementRule> Rules);

public sealed record PayrollCalculation(Payslip? Payslip, string? Error);

/// <summary>Un mes del semestre ya liquidado y cerrado en el sistema, para el aguinaldo.</summary>
public sealed record SacMonth(DateTime Month, decimal Remunerative, decimal UnpaidLeaveDays);

/// <summary>
/// Liquidación mensual de un colaborador (nota 68, S3):
/// 1) haberes del convenio (o el básico pactado), proporcionales a los días del mes si ingresó o egresó;
/// 2) novedades: inasistencias y licencias sin goce (descuentan 1/30 por día), horas extra al 50 % y 100 %
///    (valor hora = remunerativo mensual / divisor), otros conceptos;
/// 3) aportes 11 % + 3 % + 3 % sobre la base con los topes de ANSES del mes (proporcionales a los días);
/// 4) descuentos del convenio sobre el bruto final, adelantos, embargos y otros descuentos;
/// 5) contribuciones: SIPA y demás (18 % o 20,40 %, con la detracción) de las que una parte va al FAL desde
///    noviembre de 2026, obra social 6 %, ART, seguro de vida obligatorio y las del convenio.
/// Vacaciones (S4): el tramo se paga entero en el mes en que empieza (sueldo / 25 por día, art. 155, con el promedio
/// de los variables) y cada mes descuenta los días de vacaciones que caen en él (sueldo / 30).
/// </summary>
public static class PayrollCalculator
{
    public static PayrollCalculation Calculate(
        Employee employee, DateTime month, AgreementContext? agreement, IReadOnlyDictionary<string, decimal?> parameters,
        PayrollEmployerSettings employer, IReadOnlyList<PayrollNovelty> novelties,
        IReadOnlyList<VacationLeave>? vacations = null, decimal variableAverage = 0m)
    {
        var first = new DateTime(month.Year, month.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var last = first.AddMonths(1).AddDays(-1);
        var from = employee.HireDate.Date > first ? employee.HireDate.Date : first;
        var to = employee.TerminationDate is { } end && end.Date < last ? end.Date : last;
        if (to < from) return new(null, null); // no trabajó en el mes
        // Mes completo = 30 días (base del Libro de Sueldos); si ingresó o egresó en el mes, los días corridos trabajados.
        var days = from == first && to == last ? 30m : Math.Min(30m, (to - from).Days + 1);
        var share = days / 30m;

        decimal P(string key) => parameters.TryGetValue(key, out var v) && v is { } value ? value
            : throw new InvalidOperationException($"Falta el parámetro legal {PayrollParameterKeys.Names.GetValueOrDefault(key, key)} del mes.");

        var lines = new List<PayslipLine>();
        var warnings = new List<string>();
        void Add(string code, string name, string kind, decimal amount, decimal quantity = 0m, string? detail = null)
        {
            amount = Math.Round(amount, 2, MidpointRounding.AwayFromZero);
            if (amount != 0m) lines.Add(new PayslipLine { Code = code, Name = name, Kind = kind, Amount = amount, Quantity = quantity, Detail = detail });
        }
        decimal Sum(string kind) => lines.Where(l => l.Kind == kind).Sum(l => l.Amount);
        decimal Novelty(string kind, bool amount = false) =>
            novelties.Where(n => n.Kind == kind).Sum(n => amount ? n.Amount : n.Quantity);

        var absenceDays = Novelty(PayrollNoveltyKinds.Absence);
        var unpaidDays = Novelty(PayrollNoveltyKinds.UnpaidLeave);
        var perfectAttendance = absenceDays == 0m && unpaidDays == 0m && !novelties.Any(n => n.Kind == PayrollNoveltyKinds.NoPerfectAttendance);

        // 1. Haberes.
        decimal monthlyRemunerative;
        decimal hourDivisor;
        AgreementComputation? agreementResult = null;
        if (agreement is not null)
        {
            var flags = (employee.AgreementFlags ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();
            if (perfectAttendance) flags.Add("asistencia-perfecta");
            agreementResult = AgreementCalculator.Compute(agreement.Category, employee.AgreementZone ?? "", first,
                employee.SeniorityRecognitionDate ?? employee.HireDate, employee.IsUnionMember, flags, agreement.Scales, agreement.Rules);
            warnings.AddRange(agreementResult.Warnings.Where(w => !w.Contains("tope del 2 %")));
            if (agreementResult.Basic <= 0m) return new(null, $"{Name(employee)}: no hay escala de {agreement.Category.Name} para {first:MM/yyyy}.");
            foreach (var l in agreementResult.Lines.Where(l => l.Type == AgreementRuleTypes.Addition))
                Add(l.Code, l.Name, l.Remunerative ? PayslipLineKinds.Remunerative : PayslipLineKinds.NonRemunerative,
                    l.Amount * share, share < 1m ? days : 0m, share < 1m ? $"{l.Detail} · {days:0} días" : l.Detail);
            monthlyRemunerative = agreementResult.Remunerative;
            hourDivisor = agreement.Agreement.HourDivisor;
        }
        else
        {
            if (employee.BaseSalary <= 0m) return new(null, $"{Name(employee)}: fuera de convenio y sin sueldo básico cargado.");
            Add("BASICO", "Sueldo básico", PayslipLineKinds.Remunerative, employee.BaseSalary * share, share < 1m ? days : 0m,
                share < 1m ? $"{days:0} días" : null);
            monthlyRemunerative = employee.BaseSalary;
            hourDivisor = 200m;
        }

        // 2. Novedades.
        var perDay = monthlyRemunerative / 30m;
        Add("INASIST", "Inasistencias injustificadas", PayslipLineKinds.Remunerative, -perDay * absenceDays, absenceDays, $"{absenceDays:0.#} día(s)");
        Add("LICSG", "Licencia sin goce de haberes", PayslipLineKinds.Remunerative, -perDay * unpaidDays, unpaidDays, $"{unpaidDays:0.#} día(s)");
        var hourValue = agreement is null && employee.HourlyRate > 0m ? employee.HourlyRate : monthlyRemunerative / hourDivisor;
        var h50 = Novelty(PayrollNoveltyKinds.Overtime50);
        var h100 = Novelty(PayrollNoveltyKinds.Overtime100);
        Add("HE50", "Horas extra al 50 %", PayslipLineKinds.Remunerative, h50 * hourValue * 1.5m, h50, $"{h50:0.##} h × $ {hourValue:N2} × 1,5");
        Add("HE100", "Horas extra al 100 %", PayslipLineKinds.Remunerative, h100 * hourValue * 2m, h100, $"{h100:0.##} h × $ {hourValue:N2} × 2");
        foreach (var v in (vacations ?? []).Where(v => v.StartDate >= first && v.StartDate <= last).OrderBy(v => v.StartDate))
        {
            var vacationDay = (monthlyRemunerative + variableAverage) / 25m;
            Add("VACAC", "Vacaciones", PayslipLineKinds.Remunerative, vacationDay * v.Days, v.Days,
                $"{v.Days} días desde el {v.StartDate:dd/MM} × $ {vacationDay:N2} ($ {monthlyRemunerative:N2}" +
                (variableAverage > 0m ? $" + promedio de variables $ {variableAverage:N2}" : "") + " / 25)");
        }
        var vacationDays = Math.Min(days, (vacations ?? []).Sum(v => v.DaysWithin(from, to)));
        Add("DESCVAC", "Días de vacaciones (pagados como vacaciones)", PayslipLineKinds.Remunerative, -perDay * vacationDays, vacationDays, $"{vacationDays:0} día(s)");
        foreach (var n in novelties.Where(n => n.Kind == PayrollNoveltyKinds.OtherRemunerative))
            Add("OTROREM", string.IsNullOrWhiteSpace(n.Description) ? "Otros haberes remunerativos" : n.Description!, PayslipLineKinds.Remunerative, n.Amount);
        foreach (var n in novelties.Where(n => n.Kind == PayrollNoveltyKinds.OtherNonRemunerative))
            Add("OTRONR", string.IsNullOrWhiteSpace(n.Description) ? "Otros haberes no remunerativos" : n.Description!, PayslipLineKinds.NonRemunerative, n.Amount);

        var remunerative = Sum(PayslipLineKinds.Remunerative);
        var nonRemunerative = Sum(PayslipLineKinds.NonRemunerative);
        if (remunerative < 0m) return new(null, $"{Name(employee)}: los descuentos por ausencias superan el sueldo del mes.");

        // 3. Aportes: base con los topes del mes (proporcionales a los días); en jornada parcial, sin mínimo.
        var maxBase = P(PayrollParameterKeys.MaximumBase) * share;
        var minBase = P(PayrollParameterKeys.MinimumBase) * share;
        var employeeBase = Math.Min(remunerative, maxBase);
        if (!employee.PartTime && employeeBase < minBase)
        {
            warnings.Add($"{Name(employee)}: la remuneración está debajo de la base mínima de ANSES; los aportes y contribuciones se calculan sobre la mínima.");
            employeeBase = minBase;
        }
        if (remunerative > maxBase) warnings.Add($"{Name(employee)}: supera el tope de ANSES; los aportes se calculan sobre $ {maxBase:N2}.");
        employeeBase = Math.Round(employeeBase, 2, MidpointRounding.AwayFromZero);
        Add("JUBIL", "Jubilación (SIPA)", PayslipLineKinds.Deduction, employeeBase * P(PayrollParameterKeys.PensionContribution) / 100m, 0m, $"{P(PayrollParameterKeys.PensionContribution):0.##} %");
        Add("LEY19032", "Ley 19.032 (INSSJyP)", PayslipLineKinds.Deduction, employeeBase * P(PayrollParameterKeys.PamiContribution) / 100m, 0m, $"{P(PayrollParameterKeys.PamiContribution):0.##} %");
        Add("OBRASOC", "Obra social", PayslipLineKinds.Deduction, employeeBase * P(PayrollParameterKeys.HealthContribution) / 100m, 0m, $"{P(PayrollParameterKeys.HealthContribution):0.##} %");
        var socialSecurity = lines.Where(l => l.Code is "JUBIL" or "LEY19032" or "OBRASOC").Sum(l => l.Amount);

        // 4. Convenio (sobre el bruto final), adelantos, embargos y otros descuentos.
        decimal union = 0m, agreementContributions = 0m;
        if (agreement is not null)
        {
            var charges = AgreementCalculator.Compute(agreement.Category, employee.AgreementZone ?? "", first,
                employee.SeniorityRecognitionDate ?? employee.HireDate, employee.IsUnionMember,
                (employee.AgreementFlags ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries), agreement.Scales, agreement.Rules, remunerative);
            foreach (var l in charges.Lines.Where(l => l.Type == AgreementRuleTypes.EmployeeDeduction))
                Add(l.Code, l.Name, PayslipLineKinds.Deduction, l.Amount, 0m, l.Detail);
            foreach (var l in charges.Lines.Where(l => l.Type == AgreementRuleTypes.EmployerContribution))
                Add(l.Code, l.Name, PayslipLineKinds.Employer, l.Amount, 0m, l.Detail);
            union = charges.EmployeeDeductions;
            agreementContributions = charges.EmployerContributions;
            if (charges.Warnings.FirstOrDefault(w => w.Contains("tope del 2 %")) is { } cap && !employee.IsUnionMember) warnings.Add($"{Name(employee)}: {cap}");
        }
        var advances = Novelty(PayrollNoveltyKinds.Advance, amount: true);
        var garnishments = Novelty(PayrollNoveltyKinds.Garnishment, amount: true);
        var otherDeductions = Novelty(PayrollNoveltyKinds.OtherDeduction, amount: true);
        Add("ADELANTO", "Adelanto de haberes", PayslipLineKinds.Deduction, advances);
        Add("EMBARGO", "Embargo judicial", PayslipLineKinds.Deduction, garnishments);
        foreach (var n in novelties.Where(n => n.Kind == PayrollNoveltyKinds.OtherDeduction))
            Add("OTRODESC", string.IsNullOrWhiteSpace(n.Description) ? "Otros descuentos" : n.Description!, PayslipLineKinds.Deduction, n.Amount);
        if (garnishments > remunerative * 0.2m)
            warnings.Add($"{Name(employee)}: el embargo supera el 20 % de la remuneración; revisá el límite del Decreto 484/87.");

        // 5. Contribuciones del empleador (no van al recibo).
        var contributionsBase = Math.Round(Math.Max(remunerative, employee.PartTime ? 0m : minBase), 2, MidpointRounding.AwayFromZero);
        var deductionBase = Math.Max(0m, contributionsBase - P(PayrollParameterKeys.Deduction) * share);
        var rate = employer.IsMiPyme || !employer.IsCommerceOrServices ? P(PayrollParameterKeys.EmployerGeneral) : P(PayrollParameterKeys.EmployerCommerceLarge);
        var totalSs = Math.Round(deductionBase * rate / 100m, 2, MidpointRounding.AwayFromZero);
        var falRate = parameters.GetValueOrDefault(employer.IsMiPyme ? PayrollParameterKeys.FalMiPyme : PayrollParameterKeys.FalGeneral) ?? 0m;
        var fal = Math.Min(totalSs, Math.Round(deductionBase * falRate / 100m, 2, MidpointRounding.AwayFromZero));
        Add("CONTSS", "Contribuciones de la seguridad social", PayslipLineKinds.Employer, totalSs - fal, 0m,
            $"{rate:0.##} % sobre $ {deductionBase:N2} (con la detracción){(fal > 0m ? $"; {falRate:0.##} % va al Fondo de Asistencia Laboral" : "")}");
        Add("FAL", "Fondo de Asistencia Laboral", PayslipLineKinds.Employer, fal, 0m, $"{falRate:0.##} % (parte de las contribuciones)");
        var health = contributionsBase * P(PayrollParameterKeys.EmployerHealth) / 100m;
        Add("CONTOS", "Contribución obra social", PayslipLineKinds.Employer, health, 0m, $"{P(PayrollParameterKeys.EmployerHealth):0.##} %");
        var art = remunerative * employer.ArtVariablePercent / 100m + employer.ArtFixedAmount * share;
        Add("ART", "ART", PayslipLineKinds.Employer, art, 0m, $"{employer.ArtVariablePercent:0.####} % + $ {employer.ArtFixedAmount:N2}");
        Add("SCVO", "Seguro de vida obligatorio", PayslipLineKinds.Employer, employer.LifeInsurancePremium);
        if (employer.ArtVariablePercent == 0m && employer.ArtFixedAmount == 0m)
            warnings.Add("La ART no está cargada en Configuración de sueldos: la contribución de ART da cero.");

        var deductions = Sum(PayslipLineKinds.Deduction);
        var payslip = new Payslip
        {
            Id = Guid.NewGuid(), TenantId = employee.TenantId, EmployeeId = employee.Id, EmployeeName = Name(employee), Cuil = employee.Cuil,
            FileNumber = employee.FileNumber, Agreement = agreement is null ? "Fuera de convenio" : $"{agreement.Agreement.Union} {agreement.Agreement.Code}".Trim(),
            Category = agreement?.Category.Name ?? (string.IsNullOrWhiteSpace(employee.JobTitle) ? "Fuera de convenio" : employee.JobTitle),
            HireDate = employee.HireDate, AssignedSalary = agreementResult?.Basic ?? employee.BaseSalary, DaysWorked = days,
            Remunerative = remunerative, NonRemunerative = nonRemunerative, Deductions = deductions,
            Net = remunerative + nonRemunerative - deductions,
            ContributionsBase = contributionsBase, EmployeeContributionsBase = employeeBase,
            EmployeeSocialSecurity = socialSecurity, UnionDeductions = union, Advances = advances, Garnishments = garnishments,
            OtherDeductions = otherDeductions, EmployerSocialSecurity = totalSs - fal, Fal = fal,
            EmployerHealth = Math.Round(health, 2, MidpointRounding.AwayFromZero), Art = Math.Round(art, 2, MidpointRounding.AwayFromZero),
            LifeInsurance = employer.LifeInsurancePremium, AgreementContributions = agreementContributions,
            Warnings = warnings.Count == 0 ? null : string.Join("\n", warnings.Distinct()), CreatedAtUtc = DateTime.UtcNow
        };
        if (payslip.Net < 0m) return new(null, $"{Name(employee)}: los descuentos superan los haberes (neto negativo).");
        var order = 0;
        foreach (var l in lines)
        {
            l.Id = Guid.NewGuid();
            l.PayslipId = payslip.Id;
            l.Order = ++order;
            payslip.Lines.Add(l);
        }
        return new(payslip, null);
    }

    /// <summary>
    /// Aguinaldo (Ley 23.041): la mitad de la mejor remuneración mensual del semestre, proporcional a los días trabajados
    /// (meses de 30 días, tope 180), sin las licencias sin goce. Aportes con su propio tope (50 % de la base máxima,
    /// proporcional) y sin mínimo; contribuciones con el 50 % de la detracción, proporcional (Ley 27.541 art. 22);
    /// ART solo la alícuota; sin seguro de vida. Del convenio, solo los descuentos y contribuciones en % del bruto.
    /// </summary>
    public static PayrollCalculation CalculateSac(
        Employee employee, DateTime month, AgreementContext? agreement, IReadOnlyDictionary<string, decimal?> parameters,
        PayrollEmployerSettings employer, IReadOnlyList<PayrollNovelty> novelties, IReadOnlyList<SacMonth> history)
    {
        var semesterEnd = new DateTime(month.Year, month.Month, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(1).AddDays(-1);
        var semesterStart = new DateTime(month.Year, month.Month - 5, 1, 0, 0, 0, DateTimeKind.Utc);
        decimal P(string key) => parameters.TryGetValue(key, out var v) && v is { } value ? value
            : throw new InvalidOperationException($"Falta el parámetro legal {PayrollParameterKeys.Names.GetValueOrDefault(key, key)} del mes.");

        var days = 0m;
        var missing = new List<string>();
        for (var m = semesterStart; m <= semesterEnd; m = m.AddMonths(1))
        {
            var monthEnd = m.AddMonths(1).AddDays(-1);
            var from = employee.HireDate.Date > m ? employee.HireDate.Date : m;
            var to = employee.TerminationDate is { } end && end.Date < monthEnd ? end.Date : monthEnd;
            if (to < from) continue;
            var monthDays = from == m && to == monthEnd ? 30m : Math.Min(30m, (to - from).Days + 1);
            var record = history.FirstOrDefault(h => h.Month == m);
            if (record is null) missing.Add($"{m:MM/yyyy}");
            days += Math.Max(0m, monthDays - (record?.UnpaidLeaveDays ?? 0m));
        }
        days = Math.Min(180m, days);
        if (days == 0m) return new(null, null);

        var prior = novelties.Where(n => n.Kind == PayrollNoveltyKinds.SacPriorBest).Select(n => n.Amount).DefaultIfEmpty(0m).Max();
        var best = Math.Max(prior, history.Select(h => h.Remunerative).DefaultIfEmpty(0m).Max());
        if (best <= 0m) return new(null, $"{Name(employee)}: no hay remuneraciones del semestre; cargá la mejor remuneración liquidada fuera del sistema.");

        var lines = new List<PayslipLine>();
        var warnings = new List<string>();
        void Add(string code, string name, string kind, decimal amount, decimal quantity = 0m, string? detail = null)
        {
            amount = Math.Round(amount, 2, MidpointRounding.AwayFromZero);
            if (amount != 0m) lines.Add(new PayslipLine { Code = code, Name = name, Kind = kind, Amount = amount, Quantity = quantity, Detail = detail });
        }
        if (missing.Count > 0 && prior == 0m)
            warnings.Add($"{Name(employee)}: {string.Join(", ", missing)} no se liquidaron en el sistema; si cobró más en esos meses, cargá la mejor remuneración como novedad.");

        var sac = Math.Round(best / 2m * days / 180m, 2, MidpointRounding.AwayFromZero);
        Add("SAC", $"Sueldo anual complementario {(month.Month == 6 ? "1.er" : "2.º")} semestre {month.Year}", PayslipLineKinds.Remunerative, sac, days,
            $"$ {best:N2} / 2 × {days:0} / 180 días");

        var maxBase = Math.Round(P(PayrollParameterKeys.MaximumBase) / 2m * days / 180m, 2, MidpointRounding.AwayFromZero);
        var employeeBase = Math.Min(sac, maxBase);
        if (sac > maxBase) warnings.Add($"{Name(employee)}: supera el tope del aguinaldo; los aportes se calculan sobre $ {maxBase:N2}.");
        Add("JUBIL", "Jubilación (SIPA)", PayslipLineKinds.Deduction, employeeBase * P(PayrollParameterKeys.PensionContribution) / 100m, 0m, $"{P(PayrollParameterKeys.PensionContribution):0.##} %");
        Add("LEY19032", "Ley 19.032 (INSSJyP)", PayslipLineKinds.Deduction, employeeBase * P(PayrollParameterKeys.PamiContribution) / 100m, 0m, $"{P(PayrollParameterKeys.PamiContribution):0.##} %");
        Add("OBRASOC", "Obra social", PayslipLineKinds.Deduction, employeeBase * P(PayrollParameterKeys.HealthContribution) / 100m, 0m, $"{P(PayrollParameterKeys.HealthContribution):0.##} %");
        var socialSecurity = lines.Where(l => l.Code is "JUBIL" or "LEY19032" or "OBRASOC").Sum(l => l.Amount);

        decimal union = 0m, agreementContributions = 0m;
        if (agreement is not null)
        {
            var percentRules = agreement.Rules.Where(r => r.Type != AgreementRuleTypes.Addition && r.Basis == AgreementRuleBases.PercentOfGross).ToList();
            var charges = AgreementCalculator.Compute(agreement.Category, employee.AgreementZone ?? "", semesterEnd,
                employee.SeniorityRecognitionDate ?? employee.HireDate, employee.IsUnionMember,
                (employee.AgreementFlags ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries), agreement.Scales, percentRules, sac);
            foreach (var l in charges.Lines.Where(l => l.Type == AgreementRuleTypes.EmployeeDeduction))
                Add(l.Code, l.Name, PayslipLineKinds.Deduction, l.Amount, 0m, l.Detail);
            foreach (var l in charges.Lines.Where(l => l.Type == AgreementRuleTypes.EmployerContribution))
                Add(l.Code, l.Name, PayslipLineKinds.Employer, l.Amount, 0m, l.Detail);
            union = charges.EmployeeDeductions;
            agreementContributions = charges.EmployerContributions;
        }
        var garnishments = novelties.Where(n => n.Kind == PayrollNoveltyKinds.Garnishment).Sum(n => n.Amount);
        var otherDeductions = novelties.Where(n => n.Kind == PayrollNoveltyKinds.OtherDeduction).Sum(n => n.Amount);
        Add("EMBARGO", "Embargo judicial", PayslipLineKinds.Deduction, garnishments);
        foreach (var n in novelties.Where(n => n.Kind == PayrollNoveltyKinds.OtherDeduction))
            Add("OTRODESC", string.IsNullOrWhiteSpace(n.Description) ? "Otros descuentos" : n.Description!, PayslipLineKinds.Deduction, n.Amount);
        if (garnishments > sac * 0.2m)
            warnings.Add($"{Name(employee)}: el embargo supera el 20 % del aguinaldo; revisá el límite del Decreto 484/87.");

        var detraction = Math.Round(P(PayrollParameterKeys.Deduction) / 2m * days / 180m, 2, MidpointRounding.AwayFromZero);
        var deductionBase = Math.Max(0m, sac - detraction);
        var rate = employer.IsMiPyme || !employer.IsCommerceOrServices ? P(PayrollParameterKeys.EmployerGeneral) : P(PayrollParameterKeys.EmployerCommerceLarge);
        var totalSs = Math.Round(deductionBase * rate / 100m, 2, MidpointRounding.AwayFromZero);
        var falRate = parameters.GetValueOrDefault(employer.IsMiPyme ? PayrollParameterKeys.FalMiPyme : PayrollParameterKeys.FalGeneral) ?? 0m;
        var fal = Math.Min(totalSs, Math.Round(deductionBase * falRate / 100m, 2, MidpointRounding.AwayFromZero));
        Add("CONTSS", "Contribuciones de la seguridad social", PayslipLineKinds.Employer, totalSs - fal, 0m,
            $"{rate:0.##} % sobre $ {deductionBase:N2} (con el 50 % de la detracción){(fal > 0m ? $"; {falRate:0.##} % va al Fondo de Asistencia Laboral" : "")}");
        Add("FAL", "Fondo de Asistencia Laboral", PayslipLineKinds.Employer, fal, 0m, $"{falRate:0.##} % (parte de las contribuciones)");
        var health = sac * P(PayrollParameterKeys.EmployerHealth) / 100m;
        Add("CONTOS", "Contribución obra social", PayslipLineKinds.Employer, health, 0m, $"{P(PayrollParameterKeys.EmployerHealth):0.##} %");
        var art = sac * employer.ArtVariablePercent / 100m;
        Add("ART", "ART", PayslipLineKinds.Employer, art, 0m, $"{employer.ArtVariablePercent:0.####} %");

        var deductions = lines.Where(l => l.Kind == PayslipLineKinds.Deduction).Sum(l => l.Amount);
        var payslip = new Payslip
        {
            Id = Guid.NewGuid(), TenantId = employee.TenantId, EmployeeId = employee.Id, EmployeeName = Name(employee), Cuil = employee.Cuil,
            FileNumber = employee.FileNumber, Agreement = agreement is null ? "Fuera de convenio" : $"{agreement.Agreement.Union} {agreement.Agreement.Code}".Trim(),
            Category = agreement?.Category.Name ?? (string.IsNullOrWhiteSpace(employee.JobTitle) ? "Fuera de convenio" : employee.JobTitle),
            HireDate = employee.HireDate, AssignedSalary = best, DaysWorked = days,
            Remunerative = sac, NonRemunerative = 0m, Deductions = deductions, Net = sac - deductions,
            ContributionsBase = sac, EmployeeContributionsBase = employeeBase,
            EmployeeSocialSecurity = socialSecurity, UnionDeductions = union, Garnishments = garnishments, OtherDeductions = otherDeductions,
            EmployerSocialSecurity = totalSs - fal, Fal = fal,
            EmployerHealth = Math.Round(health, 2, MidpointRounding.AwayFromZero), Art = Math.Round(art, 2, MidpointRounding.AwayFromZero),
            AgreementContributions = agreementContributions,
            Warnings = warnings.Count == 0 ? null : string.Join("\n", warnings.Distinct()), CreatedAtUtc = DateTime.UtcNow
        };
        if (payslip.Net < 0m) return new(null, $"{Name(employee)}: los descuentos superan el aguinaldo (neto negativo).");
        var order = 0;
        foreach (var l in lines)
        {
            l.Id = Guid.NewGuid();
            l.PayslipId = payslip.Id;
            l.Order = ++order;
            payslip.Lines.Add(l);
        }
        return new(payslip, null);
    }

    private static string Name(Employee e) => $"{e.LastName}, {e.FirstName}".Trim(' ', ',');
}
