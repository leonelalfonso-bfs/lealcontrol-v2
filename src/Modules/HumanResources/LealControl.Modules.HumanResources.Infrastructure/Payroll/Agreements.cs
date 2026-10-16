using System.Globalization;
using LealControl.BuildingBlocks.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.HumanResources.Infrastructure.Payroll;

/// <summary>
/// Convenio colectivo configurable (nota 68, S2): categorías por grupo, zonas, escalas por mes y reglas con
/// vigencia. Nada de un convenio en particular está escrito en el código: UECARA es una plantilla de datos.
/// </summary>
public sealed class CollectiveAgreement
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public string Code { get; set; } = "";          // 660/13
    public string Name { get; set; } = "";
    public string Union { get; set; } = "";         // UECARA
    /// <summary>Divisor para el valor hora de los mensualizados (horas extra).</summary>
    public decimal HourDivisor { get; set; } = 200m;
    /// <summary>Zonas del convenio separadas por coma ("I,II,III,IV,V"); vacío si no tiene.</summary>
    public string Zones { get; set; } = "";
    public string? Notes { get; set; }
    public DateTime CreatedAtUtc { get; set; }

    public string[] ZoneList() => Zones.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
}

public sealed class AgreementCategory
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid AgreementId { get; set; }
    public string Group { get; set; } = "";
    public string Name { get; set; } = "";
    public int SortOrder { get; set; }
}

/// <summary>Básico (y suma no remunerativa del acuerdo, si la hay) de una categoría y zona desde un mes.</summary>
public sealed class AgreementScale
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid AgreementId { get; set; }
    public Guid CategoryId { get; set; }
    public string Zone { get; set; } = "";
    public DateTime ValidFrom { get; set; }
    public decimal Basic { get; set; }
    public decimal NonRemunerative { get; set; }
    public string Source { get; set; } = "";
}

public static class AgreementRuleTypes
{
    public const string Addition = "Addition";                       // adicional a favor del trabajador
    public const string EmployeeDeduction = "EmployeeDeduction";     // descuento al trabajador (cuota, solidario)
    public const string EmployerContribution = "EmployerContribution"; // a cargo del empleador (fondos del convenio)
    public static readonly string[] All = [Addition, EmployeeDeduction, EmployerContribution];
}

public static class AgreementRuleBases
{
    public const string PercentOfBasic = "PercentOfBasic";
    public const string PercentOfGross = "PercentOfGross";           // % de la remuneración bruta (remunerativa)
    public const string Fixed = "Fixed";
    public const string FixedPerSeniorityYear = "FixedPerSeniorityYear";
    public const string PercentOfBasicPerSeniorityYear = "PercentOfBasicPerSeniorityYear";
    public static readonly string[] All = [PercentOfBasic, PercentOfGross, Fixed, FixedPerSeniorityYear, PercentOfBasicPerSeniorityYear];
}

/// <summary>
/// Regla del convenio con vigencia: un adicional, un descuento sindical o una contribución del empleador.
/// Se aplica solo si coinciden la zona, el grupo, la afiliación y, si pide una marca, el empleado la tiene.
/// </summary>
public sealed class AgreementRule
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid AgreementId { get; set; }
    public string Type { get; set; } = AgreementRuleTypes.Addition;
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string Basis { get; set; } = AgreementRuleBases.Fixed;
    public decimal Value { get; set; }
    /// <summary>Solo para adicionales: remunerativo (lleva aportes) o no remunerativo.</summary>
    public bool Remunerative { get; set; } = true;
    /// <summary>All, UnionMembers o NonMembers.</summary>
    public string AppliesTo { get; set; } = "All";
    /// <summary>Zonas en las que aplica, separadas por coma; vacío = todas.</summary>
    public string Zones { get; set; } = "";
    /// <summary>Grupos de categorías en los que aplica, separados por coma; vacío = todos.</summary>
    public string Groups { get; set; } = "";
    /// <summary>Marca que tiene que tener el empleado (título, fallo de caja) o la novedad del mes (asistencia).</summary>
    public string? RequiresFlag { get; set; }
    /// <summary>Antigüedad: el año que se cumple en el mes se cobra desde el mes siguiente.</summary>
    public bool SeniorityFromNextMonth { get; set; }
    public DateTime ValidFrom { get; set; }
    public DateTime? ValidTo { get; set; }
}

public sealed record AgreementLine(string Code, string Name, string Type, bool Remunerative, decimal Amount, string Detail);

public sealed record AgreementComputation(
    decimal Basic, int SeniorityYears, IReadOnlyList<AgreementLine> Lines,
    decimal Remunerative, decimal NonRemunerative, decimal EmployeeDeductions, decimal EmployerContributions,
    IReadOnlyList<string> Warnings);

/// <summary>
/// Lo que el convenio fija para una categoría en un mes: básico, adicionales, suma no remunerativa,
/// descuentos sindicales y contribuciones del empleador. Los aportes de ley, las novedades y los
/// proporcionales se suman en la liquidación (S3).
/// </summary>
public static class AgreementCalculator
{
    public static int SeniorityYears(DateTime since, DateTime month, bool fromNextMonth)
    {
        // Sin la regla, cuentan los años cumplidos al último día del mes; con ella, los cumplidos al primero.
        var at = fromNextMonth ? new DateTime(month.Year, month.Month, 1) : new DateTime(month.Year, month.Month, DateTime.DaysInMonth(month.Year, month.Month));
        var years = at.Year - since.Year;
        if (since.Date.AddYears(years) > at) years--;
        return Math.Max(0, years);
    }

    public static AgreementComputation Compute(
        AgreementCategory category, string zone, DateTime month, DateTime seniorityFrom, bool unionMember,
        IReadOnlyCollection<string> flags, IReadOnlyList<AgreementScale> scales, IReadOnlyList<AgreementRule> rules,
        decimal? chargeBase = null)
    {
        var first = new DateTime(month.Year, month.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var warnings = new List<string>();
        var scale = scales.Where(s => s.CategoryId == category.Id && s.Zone == zone && s.ValidFrom <= first)
            .OrderByDescending(s => s.ValidFrom).FirstOrDefault();
        if (scale is null)
            warnings.Add($"No hay escala de {category.Name}{(zone == "" ? "" : $" zona {zone}")} vigente en {first:MM/yyyy}.");
        else if (scale.ValidFrom < first)
            warnings.Add($"La escala más reciente es de {scale.ValidFrom:MM/yyyy}: cargá la de {first:MM/yyyy} si hubo aumento.");
        var basic = scale?.Basic ?? 0m;

        var lines = new List<AgreementLine> { new("BASICO", $"Sueldo básico {category.Name}", AgreementRuleTypes.Addition, true, basic, zone == "" ? "" : $"Zona {zone}") };
        if (scale is { NonRemunerative: > 0m })
            lines.Add(new("NOREM", "Suma no remunerativa del acuerdo", AgreementRuleTypes.Addition, false, scale.NonRemunerative, scale.Source));

        var active = rules.Where(r => r.ValidFrom <= first && (r.ValidTo is null || r.ValidTo >= first)
            && Matches(r.Zones, zone) && Matches(r.Groups, category.Group)
            && (r.AppliesTo == "All" || (r.AppliesTo == "UnionMembers") == unionMember)
            && (string.IsNullOrWhiteSpace(r.RequiresFlag) || flags.Contains(r.RequiresFlag.Trim(), StringComparer.OrdinalIgnoreCase)))
            .ToList();
        var years = 0;

        // Primero los adicionales; los descuentos y contribuciones van sobre el bruto remunerativo resultante.
        foreach (var r in active.Where(r => r.Type == AgreementRuleTypes.Addition).OrderBy(r => r.Code))
        {
            decimal amount;
            string detail;
            switch (r.Basis)
            {
                case AgreementRuleBases.PercentOfBasic:
                    amount = basic * r.Value / 100m; detail = $"{r.Value:0.##} % del básico"; break;
                case AgreementRuleBases.FixedPerSeniorityYear:
                    years = SeniorityYears(seniorityFrom, first, r.SeniorityFromNextMonth);
                    amount = r.Value * years; detail = $"{years} año(s) × $ {r.Value:N2}"; break;
                case AgreementRuleBases.PercentOfBasicPerSeniorityYear:
                    years = SeniorityYears(seniorityFrom, first, r.SeniorityFromNextMonth);
                    amount = basic * r.Value / 100m * years; detail = $"{years} año(s) × {r.Value:0.##} % del básico"; break;
                case AgreementRuleBases.Fixed:
                    amount = r.Value; detail = "Monto fijo"; break;
                default:
                    warnings.Add($"{r.Name}: un adicional no puede calcularse sobre el bruto."); continue;
            }
            amount = Math.Round(amount, 2, MidpointRounding.AwayFromZero);
            if (amount != 0m) lines.Add(new(r.Code, r.Name, r.Type, r.Remunerative, amount, detail));
        }

        // En la liquidación, los descuentos y contribuciones se calculan sobre el bruto final del mes
        // (con horas extra, ausencias y proporcionales), que llega como chargeBase.
        var remunerative = lines.Where(l => l.Remunerative).Sum(l => l.Amount);
        var gross = chargeBase ?? remunerative;
        foreach (var r in active.Where(r => r.Type != AgreementRuleTypes.Addition).OrderBy(r => r.Type).ThenBy(r => r.Code))
        {
            var (amount, detail) = r.Basis switch
            {
                AgreementRuleBases.PercentOfGross => (gross * r.Value / 100m, $"{r.Value:0.##} % de la remuneración"),
                AgreementRuleBases.PercentOfBasic => (basic * r.Value / 100m, $"{r.Value:0.##} % del básico"),
                AgreementRuleBases.Fixed => (r.Value, "Monto fijo"),
                _ => (0m, "")
            };
            amount = Math.Round(amount, 2, MidpointRounding.AwayFromZero);
            if (amount != 0m) lines.Add(new(r.Code, r.Name, r.Type, false, amount, detail));
        }

        // Ley 27.802: el aporte solidario de los no afiliados tiene un tope del 2 % del salario.
        var solidarity = active.Where(r => r.Type == AgreementRuleTypes.EmployeeDeduction && r.AppliesTo == "NonMembers" && r.Basis == AgreementRuleBases.PercentOfGross).Sum(r => r.Value);
        if (!unionMember && solidarity > 2m)
            warnings.Add($"Los aportes solidarios suman {solidarity:0.##} % y la Ley 27.802 fija un tope del 2 %: confirmalo con el estudio.");

        return new AgreementComputation(basic, years, lines,
            remunerative,
            lines.Where(l => l.Type == AgreementRuleTypes.Addition && !l.Remunerative).Sum(l => l.Amount),
            lines.Where(l => l.Type == AgreementRuleTypes.EmployeeDeduction).Sum(l => l.Amount),
            lines.Where(l => l.Type == AgreementRuleTypes.EmployerContribution).Sum(l => l.Amount),
            warnings);
    }

    private static bool Matches(string list, string value) =>
        string.IsNullOrWhiteSpace(list) || list.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Contains(value, StringComparer.OrdinalIgnoreCase);
}
