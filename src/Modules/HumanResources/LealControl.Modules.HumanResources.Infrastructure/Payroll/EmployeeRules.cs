using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.HumanResources.Infrastructure.Payroll;

/// <summary>Controles del legajo que pide ARCA para el Libro de Sueldos Digital y el F.931.</summary>
public static class EmployeeRules
{
    /// <summary>CUIL de 11 dígitos con dígito verificador válido (mismo algoritmo que el CUIT).</summary>
    public static bool IsValidCuil(string? cuil)
    {
        var digits = new string((cuil ?? "").Where(char.IsDigit).ToArray());
        if (digits.Length != 11) return false;
        int[] weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
        var sum = weights.Select((w, i) => w * (digits[i] - '0')).Sum();
        var check = 11 - sum % 11;
        if (check == 11) check = 0;
        return check != 10 && check == digits[10] - '0';
    }

    public static string? Validate(Employee e)
    {
        if (!string.IsNullOrWhiteSpace(e.Cuil) && !IsValidCuil(e.Cuil))
            return "El CUIL no es válido: revisá los 11 dígitos (el último es el verificador).";
        if (e.SocialSecuritySituation is < 1 or > 999 || e.SocialSecurityCondition is < 0 or > 999 || e.ContractModalityCode is < 0 or > 999
            || e.CasualtyCode is < 0 or > 99 || e.SocialSecurityActivity is < 0 or > 999)
            return "Los códigos de la seguridad social son números de la tabla de ARCA (hasta 3 dígitos).";
        if (!string.IsNullOrWhiteSpace(e.HealthInsuranceCode) && !e.HealthInsuranceCode.Trim().All(char.IsDigit))
            return "El código de obra social (RNOS) son 6 dígitos.";
        if (e.HealthInsuranceAdherents is < 0 or > 99 || e.ChildrenCount is < 0 or > 30)
            return "Revisá la cantidad de adherentes e hijos.";
        if (e.PartTime && e.WeeklyHours is not (> 0m and < 48m))
            return "En jornada parcial, indicá las horas semanales (menos de 48).";
        return null;
    }

    public static string? CleanFlags(string? flags)
    {
        var list = (flags ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(f => f.ToLowerInvariant()).Distinct().ToList();
        return list.Count == 0 ? null : string.Join(",", list);
    }

    /// <summary>
    /// Convenio, categoría y zona tienen que ser coherentes. Además, el texto de convenio y categoría del legajo
    /// se completa con los del convenio asignado.
    /// </summary>
    public static async Task<string?> ValidateAgreementAsync(HumanResourcesDbContext db, Guid tenantId, Employee e, CancellationToken ct)
    {
        if (e.AgreementId is null)
        {
            e.AgreementCategoryId = null;
            e.AgreementZone = null;
            return null;
        }
        var agreement = await db.CollectiveAgreements.AsNoTracking().FirstOrDefaultAsync(a => a.Id == e.AgreementId && a.TenantId == tenantId, ct);
        if (agreement is null) return "El convenio elegido no existe.";
        var category = e.AgreementCategoryId is null ? null
            : await db.AgreementCategories.AsNoTracking().FirstOrDefaultAsync(c => c.Id == e.AgreementCategoryId && c.AgreementId == agreement.Id, ct);
        if (category is null) return "Elegí la categoría del convenio.";
        var zones = agreement.ZoneList();
        var zone = (e.AgreementZone ?? "").Trim();
        if (zones.Length > 0 && !zones.Contains(zone, StringComparer.OrdinalIgnoreCase)) return "Elegí la zona del convenio.";
        e.AgreementZone = zones.Length == 0 ? null : zones.First(z => string.Equals(z, zone, StringComparison.OrdinalIgnoreCase));
        e.UnionCct = $"{agreement.Union} {agreement.Code}".Trim();
        e.UnionCategory = category.Name;
        return null;
    }
}
