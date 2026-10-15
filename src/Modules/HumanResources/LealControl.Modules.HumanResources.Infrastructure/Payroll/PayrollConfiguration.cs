using System.Globalization;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.BuildingBlocks.Time;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.HumanResources.Infrastructure.Payroll;

/// <summary>Datos del empleador que definen sus contribuciones (nota 68, S1).</summary>
public sealed class PayrollEmployerSettings
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    /// <summary>MiPyME con certificado vigente: contribución del 18 % y FAL del 2,5 %.</summary>
    public bool IsMiPyme { get; set; } = true;
    /// <summary>Actividad principal de comercio o servicios: fuera de MiPyME, contribución del 20,40 %.</summary>
    public bool IsCommerceOrServices { get; set; } = true;
    /// <summary>Código de actividad de la seguridad social que se informa por defecto para cada trabajador.</summary>
    public int? ActivityCode { get; set; }
    public string? ArtInsurer { get; set; }
    public string? ArtContractNumber { get; set; }
    /// <summary>Alícuota variable de la ART, en % de la remuneración.</summary>
    public decimal ArtVariablePercent { get; set; }
    /// <summary>Suma fija mensual de la ART por trabajador.</summary>
    public decimal ArtFixedAmount { get; set; }
    /// <summary>Prima mensual del seguro colectivo de vida obligatorio (Dto. 1567/74) por trabajador.</summary>
    public decimal LifeInsurancePremium { get; set; }
    /// <summary>Identificador del Fondo de Asistencia Laboral validado en Simplificación Registral.</summary>
    public string? FalId { get; set; }
    public DateTime UpdatedAtUtc { get; set; }
}

/// <summary>
/// Un parámetro legal con vigencia desde un mes. Sin empresa (TenantId nulo) es el valor que trae el sistema;
/// con empresa, uno que cargó la empresa (por ejemplo, el tope de ANSES del mes antes de que lo traiga el sistema).
/// </summary>
public sealed class PayrollLegalParameter
{
    public Guid Id { get; set; }
    public Guid? TenantId { get; set; }
    public string Key { get; set; } = "";
    public DateTime ValidFrom { get; set; }
    public decimal Value { get; set; }
    public string Norm { get; set; } = "";
    public DateTime CreatedAtUtc { get; set; }
}

/// <summary>Claves de los parámetros legales de la liquidación.</summary>
public static class PayrollParameterKeys
{
    public const string PensionContribution = "aporte.jubilacion";          // % SIPA, Ley 24.241
    public const string PamiContribution = "aporte.ley19032";              // % INSSJyP
    public const string HealthContribution = "aporte.obraSocial";           // % Ley 23.660
    public const string EmployerGeneral = "contribucion.general";           // % Ley 27.541 art. 19
    public const string EmployerCommerceLarge = "contribucion.comercioServiciosGrande";
    public const string EmployerHealth = "contribucion.obraSocial";         // % Ley 23.660
    public const string Deduction = "contribucion.detraccion";              // $ por trabajador, Ley 27.541 art. 22
    public const string FalMiPyme = "fal.mipyme";                           // % Ley 27.802, RG 5907/2026
    public const string FalGeneral = "fal.general";
    public const string MinimumBase = "base.minima";                        // $ ANSES, mensual
    public const string MaximumBase = "base.maxima";

    /// <summary>Los topes de ANSES se fijan para cada mes: si falta el del mes, se avisa.</summary>
    public static readonly string[] Monthly = [MinimumBase, MaximumBase];

    public static readonly Dictionary<string, string> Names = new()
    {
        [PensionContribution] = "Aporte jubilatorio (SIPA) %",
        [PamiContribution] = "Aporte Ley 19.032 (INSSJyP) %",
        [HealthContribution] = "Aporte obra social %",
        [EmployerGeneral] = "Contribución patronal general %",
        [EmployerCommerceLarge] = "Contribución patronal comercio o servicios, no MiPyME %",
        [EmployerHealth] = "Contribución obra social %",
        [Deduction] = "Detracción por trabajador $",
        [FalMiPyme] = "Fondo de Asistencia Laboral MiPyME %",
        [FalGeneral] = "Fondo de Asistencia Laboral resto %",
        [MinimumBase] = "Base imponible mínima $",
        [MaximumBase] = "Base imponible máxima $"
    };
}

public static class PayrollLegalSeed
{
    private static DateTime M(int year, int month) => new(year, month, 1, 0, 0, 0, DateTimeKind.Utc);

    /// <summary>Valores que trae el sistema, con su norma. Se agregan en cada actualización; nunca se borran.</summary>
    public static readonly (string Key, DateTime From, decimal Value, string Norm)[] Values =
    [
        (PayrollParameterKeys.PensionContribution, M(2020, 1), 11m, "Ley 24.241 art. 11"),
        (PayrollParameterKeys.PamiContribution, M(2020, 1), 3m, "Ley 19.032 art. 8"),
        (PayrollParameterKeys.HealthContribution, M(2020, 1), 3m, "Ley 23.660 art. 16"),
        (PayrollParameterKeys.EmployerGeneral, M(2020, 1), 18m, "Ley 27.541 art. 19"),
        (PayrollParameterKeys.EmployerCommerceLarge, M(2020, 1), 20.40m, "Ley 27.541 art. 19"),
        (PayrollParameterKeys.EmployerHealth, M(2020, 1), 6m, "Ley 23.660 art. 16"),
        (PayrollParameterKeys.Deduction, M(2020, 1), 7003.68m, "Ley 27.541 art. 22"),
        (PayrollParameterKeys.FalMiPyme, M(2026, 11), 2.5m, "Ley 27.802 y RG ARCA 5907/2026"),
        (PayrollParameterKeys.FalGeneral, M(2026, 11), 1m, "Ley 27.802 y RG ARCA 5907/2026"),
        (PayrollParameterKeys.MinimumBase, M(2026, 6), 135837.40m, "Res. ANSES 139/2026"),
        (PayrollParameterKeys.MaximumBase, M(2026, 6), 4414652.38m, "Res. ANSES 139/2026"),
        (PayrollParameterKeys.MinimumBase, M(2026, 7), 138757.90m, "Res. ANSES 186/2026"),
        (PayrollParameterKeys.MaximumBase, M(2026, 7), 4509567.41m, "Res. ANSES 186/2026"),
        (PayrollParameterKeys.MinimumBase, M(2026, 8), 141380.42m, "Res. ANSES 232/2026"),
        (PayrollParameterKeys.MaximumBase, M(2026, 8), 4594798.23m, "Res. ANSES 232/2026"),
        (PayrollParameterKeys.MinimumBase, M(2026, 9), 144363.55m, "Res. ANSES 257/2026"),
        (PayrollParameterKeys.MaximumBase, M(2026, 9), 4691748.47m, "Res. ANSES 257/2026"),
        (PayrollParameterKeys.MinimumBase, M(2026, 10), 146759.98m, "Res. ANSES 284/2026"),
        (PayrollParameterKeys.MaximumBase, M(2026, 10), 4769631.49m, "Res. ANSES 284/2026")
    ];

    /// <summary>Inserta los valores del sistema que falten (idempotente).</summary>
    public static async Task EnsureAsync(HumanResourcesDbContext db, CancellationToken ct)
    {
        var existing = (await db.PayrollLegalParameters.AsNoTracking().Where(p => p.TenantId == null)
                .Select(p => new { p.Key, p.ValidFrom }).ToListAsync(ct))
            .Select(p => (p.Key, p.ValidFrom)).ToHashSet();
        var missing = Values.Where(v => !existing.Contains((v.Key, v.From))).ToList();
        if (missing.Count == 0) return;
        foreach (var v in missing)
            db.PayrollLegalParameters.Add(new PayrollLegalParameter
            {
                Id = Guid.NewGuid(), Key = v.Key, ValidFrom = v.From, Value = v.Value, Norm = v.Norm, CreatedAtUtc = DateTime.UtcNow
            });
        await db.SaveChangesAsync(ct);
    }
}

/// <summary>Parámetro vigente en un mes: valor, desde cuándo, norma y si lo cargó la empresa.</summary>
public sealed record ResolvedParameter(string Key, string Name, decimal? Value, DateTime? ValidFrom, string? Norm, bool FromCompany, string? Warning);

public static class PayrollParameters
{
    /// <summary>
    /// Para cada clave, el valor con la vigencia más reciente hasta el mes; a igual vigencia, el de la empresa.
    /// Los topes de ANSES son mensuales: si el del mes no está, se usa el último y se avisa.
    /// </summary>
    public static async Task<IReadOnlyList<ResolvedParameter>> ResolveAsync(HumanResourcesDbContext db, Guid tenantId, DateTime month, CancellationToken ct)
    {
        var first = new DateTime(month.Year, month.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var rows = await db.PayrollLegalParameters.AsNoTracking()
            .Where(p => (p.TenantId == null || p.TenantId == tenantId) && p.ValidFrom <= first)
            .ToListAsync(ct);
        return PayrollParameterKeys.Names.Select(k =>
        {
            var best = rows.Where(r => r.Key == k.Key)
                .OrderByDescending(r => r.ValidFrom).ThenByDescending(r => r.TenantId != null).FirstOrDefault();
            string? warning = null;
            if (best is null)
                warning = "Sin valor vigente para el mes.";
            else if (PayrollParameterKeys.Monthly.Contains(k.Key) && best.ValidFrom < first)
                warning = $"Falta el valor de {first:MM/yyyy}: se usa el de {best.ValidFrom:MM/yyyy}. Cargalo cuando ANSES lo publique.";
            return new ResolvedParameter(k.Key, k.Value, best?.Value, best?.ValidFrom, best?.Norm, best?.TenantId != null, warning);
        }).ToList();
    }

    public static async Task<PayrollEmployerSettings> GetOrCreateEmployerAsync(HumanResourcesDbContext db, Guid tenantId, CancellationToken ct)
    {
        var settings = await db.PayrollEmployerSettings.FirstOrDefaultAsync(s => s.TenantId == tenantId, ct);
        if (settings is not null) return settings;
        settings = new PayrollEmployerSettings { Id = Guid.NewGuid(), TenantId = tenantId, UpdatedAtUtc = DateTime.UtcNow };
        db.PayrollEmployerSettings.Add(settings);
        await db.SaveChangesAsync(ct);
        return settings;
    }
}

public sealed record PayrollEmployerRequest(
    bool IsMiPyme, bool IsCommerceOrServices, int? ActivityCode, string? ArtInsurer, string? ArtContractNumber,
    decimal ArtVariablePercent, decimal ArtFixedAmount, decimal LifeInsurancePremium, string? FalId);

public sealed record PayrollParameterRequest(string Key, string ValidFrom, decimal Value, string Norm);

public static class PayrollConfigurationEndpoints
{
    /// <summary>
    /// /payroll/settings… se administra (nivel Administrar); la consulta de parámetros la ve quien ve sueldos.
    /// </summary>
    public static RouteGroupBuilder MapPayrollConfigurationEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("/payroll/settings", async (HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            await db.EnsureHrTablesAsync(ct);
            return Results.Ok(await PayrollParameters.GetOrCreateEmployerAsync(db, tenant.TenantId.Value, ct));
        });

        group.MapPut("/payroll/settings", async (PayrollEmployerRequest req, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            await db.EnsureHrTablesAsync(ct);
            if (req.ArtVariablePercent is < 0m or > 30m) return Problem("La alícuota de la ART va de 0 a 30 %.");
            if (req.ArtFixedAmount < 0m || req.LifeInsurancePremium < 0m) return Problem("Los importes no pueden ser negativos.");
            if (req.ActivityCode is < 0 or > 999) return Problem("El código de actividad va de 0 a 999.");
            var settings = await PayrollParameters.GetOrCreateEmployerAsync(db, tenant.TenantId.Value, ct);
            settings.IsMiPyme = req.IsMiPyme;
            settings.IsCommerceOrServices = req.IsCommerceOrServices;
            settings.ActivityCode = req.ActivityCode;
            settings.ArtInsurer = Clean(req.ArtInsurer);
            settings.ArtContractNumber = Clean(req.ArtContractNumber);
            settings.ArtVariablePercent = req.ArtVariablePercent;
            settings.ArtFixedAmount = req.ArtFixedAmount;
            settings.LifeInsurancePremium = req.LifeInsurancePremium;
            settings.FalId = Clean(req.FalId);
            settings.UpdatedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return Results.Ok(settings);
        });

        group.MapGet("/payroll/parameters", async (string? month, HumanResourcesDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct) =>
        {
            await db.EnsureHrTablesAsync(ct);
            if (!TryMonth(month, out var first))
            {
                var today = ArgentinaTime.TodayAsUtcDate(clock.GetUtcNow());
                first = new DateTime(today.Year, today.Month, 1, 0, 0, 0, DateTimeKind.Utc);
            }
            var tenantId = tenant.TenantId.Value;
            var resolved = await PayrollParameters.ResolveAsync(db, tenantId, first, ct);
            var history = await db.PayrollLegalParameters.AsNoTracking()
                .Where(p => p.TenantId == null || p.TenantId == tenantId)
                .OrderBy(p => p.Key).ThenByDescending(p => p.ValidFrom)
                .Select(p => new { p.Id, p.Key, p.ValidFrom, p.Value, p.Norm, FromCompany = p.TenantId != null })
                .ToListAsync(ct);
            return Results.Ok(new { Month = first, Resolved = resolved, History = history });
        });

        group.MapPost("/payroll/settings/parameters", async (PayrollParameterRequest req, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            await db.EnsureHrTablesAsync(ct);
            if (!PayrollParameterKeys.Names.ContainsKey(req.Key)) return Problem("Parámetro desconocido.");
            if (!TryMonth(req.ValidFrom, out var from)) return Problem("Indicá el mes desde el que rige (aaaa-mm).");
            if (req.Value < 0m) return Problem("El valor no puede ser negativo.");
            if (string.IsNullOrWhiteSpace(req.Norm)) return Problem("Indicá la norma (por ejemplo, Res. ANSES 300/2026).");
            var tenantId = tenant.TenantId.Value;
            if (await db.PayrollLegalParameters.AnyAsync(p => p.TenantId == tenantId && p.Key == req.Key && p.ValidFrom == from, ct))
                return Problem("La empresa ya cargó ese parámetro para ese mes: borralo y volvé a cargarlo.");
            var row = new PayrollLegalParameter
            {
                Id = Guid.NewGuid(), TenantId = tenantId, Key = req.Key, ValidFrom = from, Value = req.Value,
                Norm = req.Norm.Trim(), CreatedAtUtc = DateTime.UtcNow
            };
            db.PayrollLegalParameters.Add(row);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/hr/payroll/parameters/{row.Id}", row);
        });

        // Solo se borran los valores que cargó la empresa; los del sistema quedan siempre.
        group.MapDelete("/payroll/settings/parameters/{id:guid}", async (Guid id, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var row = await db.PayrollLegalParameters.FirstOrDefaultAsync(p => p.Id == id && p.TenantId == tenant.TenantId.Value, ct);
            if (row is null) return Results.NotFound();
            db.PayrollLegalParameters.Remove(row);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        return group;
    }

    private static IResult Problem(string message) => Results.BadRequest(new { message });

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static bool TryMonth(string? text, out DateTime first)
    {
        first = default;
        if (string.IsNullOrWhiteSpace(text) ||
            !DateTime.TryParseExact(text.Trim(), "yyyy-MM", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
            return false;
        first = DateTime.SpecifyKind(parsed, DateTimeKind.Utc);
        return true;
    }
}
