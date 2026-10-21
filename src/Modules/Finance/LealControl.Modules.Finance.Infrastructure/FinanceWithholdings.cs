using System.Globalization;
using System.Text;
using LealControl.BuildingBlocks.Security;
using LealControl.BuildingBlocks.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Finance.Infrastructure;

// ─── Retenciones practicadas de Ganancias, RG 830 (nota 69, F2) ───────────────────────────────────────────────

/// <summary>La empresa como agente de retención: desde cuándo retiene.</summary>
public sealed class WithholdingSettings
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public bool IsAgent { get; set; }
    public DateTime? AgentSince { get; set; }
    /// <summary>Jurisdicción de IIBB por defecto para las percepciones sufridas (sede de la empresa).</summary>
    public string? DefaultJurisdiction { get; set; }
    public DateTime UpdatedAtUtc { get; set; }
}

/// <summary>Régimen de la RG 830 (Anexo VIII): código SICORE, mínimo no sujeto mensual, alícuotas y retención mínima.</summary>
public sealed class WithholdingRegime
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public decimal NonTaxableAmount { get; set; }
    public decimal RateRegistered { get; set; }
    public decimal RateUnregistered { get; set; }
    public decimal MinimumWithholding { get; set; }
    public string Source { get; set; } = "";
    public bool IsActive { get; set; } = true;
}

/// <summary>Situación de un proveedor frente a Ganancias y el régimen que le corresponde.</summary>
public sealed class SupplierWithholdingProfile
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid SupplierId { get; set; }
    public string Condition { get; set; } = WithholdingConditions.Registered;
    public string RegimeCode { get; set; } = "078";
    /// <summary>Certificado de exclusión de ARCA: hasta esta fecha no se retiene.</summary>
    public DateTime? ExcludedUntil { get; set; }
    public DateTime UpdatedAtUtc { get; set; }
}

public static class WithholdingConditions
{
    public const string Registered = "Inscripto";
    public const string Unregistered = "NoInscripto";
    public const string Monotributo = "Monotributo";
    public const string Exempt = "Exento";
    public static readonly string[] All = [Registered, Unregistered, Monotributo, Exempt];
}

/// <summary>
/// Retención (o pago sin retención) de una orden de pago. Se guarda también cuando da cero, porque los pagos del mes
/// se acumulan para el mínimo no sujeto. Lleva número de certificado solo si hubo retención.
/// </summary>
public sealed class Withholding
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid PaymentOrderId { get; set; }
    public string PaymentOrderNumber { get; set; } = "";
    public Guid SupplierId { get; set; }
    public string SupplierName { get; set; } = "";
    public string SupplierTaxId { get; set; } = "";
    public string Condition { get; set; } = "";
    public string RegimeCode { get; set; } = "";
    public string RegimeName { get; set; } = "";
    public DateTime Date { get; set; }
    public decimal PaymentAmount { get; set; }
    public decimal Base { get; set; }
    public decimal PriorBase { get; set; }
    public decimal PriorWithheld { get; set; }
    public decimal NonTaxableAmount { get; set; }
    public decimal Rate { get; set; }
    public decimal Amount { get; set; }
    public string? CertificateNumber { get; set; }
    public string Status { get; set; } = "Active";
    public DateTime CreatedAtUtc { get; set; }
}

public sealed record WithholdingResult(decimal Base, decimal PriorBase, decimal PriorWithheld, decimal NonTaxable, decimal Rate, decimal Amount, string Detail);

/// <summary>
/// Cálculo de la RG 830: inscripto = (pagos del mes al mismo proveedor y régimen + este pago − mínimo no sujeto) × alícuota
/// − lo ya retenido en el mes; no inscripto = este pago × alícuota (sin mínimo ni acumulado). Si da menos que la retención
/// mínima, no se retiene (y el pago igual acumula). Monotributistas, exentos y excluidos con certificado vigente: no.
/// </summary>
public static class WithholdingCalculator
{
    private static readonly CultureInfo Ar = CultureInfo.GetCultureInfo("es-AR");
    internal static string M(decimal value) => value.ToString("N2", Ar);

    public static WithholdingResult Calculate(WithholdingRegime regime, SupplierWithholdingProfile profile, DateTime date,
        decimal @base, decimal priorBase, decimal priorWithheld)
    {
        @base = Math.Round(@base, 2, MidpointRounding.AwayFromZero);
        if (profile.Condition is WithholdingConditions.Monotributo or WithholdingConditions.Exempt)
            return new(@base, priorBase, priorWithheld, 0, 0, 0, profile.Condition == WithholdingConditions.Monotributo ? "Monotributista: no corresponde retener." : "Exento: no corresponde retener.");
        if (profile.ExcludedUntil is { } until && date.Date <= until.Date)
            return new(@base, priorBase, priorWithheld, 0, 0, 0, $"Certificado de exclusión vigente hasta el {until.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture)}.");
        if (profile.Condition == WithholdingConditions.Unregistered)
        {
            var direct = Math.Round(@base * regime.RateUnregistered / 100m, 2, MidpointRounding.AwayFromZero);
            return direct < regime.MinimumWithholding
                ? new(@base, 0, 0, 0, regime.RateUnregistered, 0, $"No inscripto: {regime.RateUnregistered:0.##} % de $ {M(@base)} = $ {M(direct)}, menos que la retención mínima.")
                : new(@base, 0, 0, 0, regime.RateUnregistered, direct, $"No inscripto: {regime.RateUnregistered:0.##} % de $ {M(@base)}.");
        }
        var taxable = priorBase + @base - regime.NonTaxableAmount;
        if (taxable <= 0m)
            return new(@base, priorBase, priorWithheld, regime.NonTaxableAmount, regime.RateRegistered, 0,
                $"Pagos del mes $ {M(priorBase + @base)}: no superan el mínimo no sujeto de $ {M(regime.NonTaxableAmount)}.");
        var amount = Math.Round(taxable * regime.RateRegistered / 100m - priorWithheld, 2, MidpointRounding.AwayFromZero);
        var detail = $"({(priorBase > 0 ? $"$ {M(priorBase)} del mes + " : "")}$ {M(@base)} − mínimo $ {M(regime.NonTaxableAmount)}) × {regime.RateRegistered:0.##} %"
            + (priorWithheld > 0 ? $" − $ {M(priorWithheld)} ya retenidos" : "");
        return amount < regime.MinimumWithholding
            ? new(@base, priorBase, priorWithheld, regime.NonTaxableAmount, regime.RateRegistered, 0, $"{detail} = $ {M(Math.Max(0, amount))}, menos que la retención mínima de $ {M(regime.MinimumWithholding)}.")
            : new(@base, priorBase, priorWithheld, regime.NonTaxableAmount, regime.RateRegistered, amount, detail);
    }
}

public sealed record WithholdingSettingsRequest(bool IsAgent, DateTime? AgentSince);
public sealed record WithholdingRegimeRequest(string Code, string Name, decimal NonTaxableAmount, decimal RateRegistered, decimal RateUnregistered, decimal MinimumWithholding, string? Source, bool IsActive = true);
public sealed record SupplierProfileRequest(string Condition, string RegimeCode, DateTime? ExcludedUntil);
public sealed record WithholdingImputation(Guid PurchaseInvoiceId, decimal AmountImputed);
public sealed record WithholdingPreviewRequest(Guid SupplierId, DateTime Date, decimal Amount, List<WithholdingImputation>? Imputations);

public static class FinanceWithholdings
{
    public const string RetentionType = "GAN";

    /// <summary>
    /// Valores iniciales de la RG 830 Anexo VIII para lo que más se paga (bienes y servicios). Son editables: se confirman con
    /// el estudio contra el anexo vigente antes de empezar a retener.
    /// </summary>
    private static readonly (string Code, string Name, decimal NonTaxable, decimal Registered, decimal Unregistered)[] Defaults =
    [
        ("078", "Enajenación de bienes muebles y bienes de cambio", 224000m, 2m, 10m),
        ("094", "Locaciones de obra y/o servicios no ejecutados en relación de dependencia", 67170m, 2m, 28m)
    ];

    public static async Task<List<WithholdingRegime>> RegimesAsync(FinanceDbContext db, Guid tenantId, CancellationToken ct)
    {
        var list = await db.WithholdingRegimes.Where(r => r.TenantId == tenantId).OrderBy(r => r.Code).ToListAsync(ct);
        if (list.Count > 0) return list;
        list = Defaults.Select(d => new WithholdingRegime
        {
            Id = Guid.NewGuid(), TenantId = tenantId, Code = d.Code, Name = d.Name, NonTaxableAmount = d.NonTaxable,
            RateRegistered = d.Registered, RateUnregistered = d.Unregistered, MinimumWithholding = 240m,
            Source = "RG 830 Anexo VIII · valores iniciales a confirmar con el estudio"
        }).ToList();
        db.WithholdingRegimes.AddRange(list);
        await db.SaveChangesAsync(ct);
        return list;
    }

    /// <summary>Base = lo pagado sin IVA ni percepciones: cada imputación por el neto/total de su factura; sin facturas, el importe.</summary>
    internal static async Task<decimal> BaseAsync(FinanceDbContext db, Guid tenantId, decimal amount, IReadOnlyCollection<WithholdingImputation> imputations, CancellationToken ct)
    {
        if (imputations.Count == 0) return amount;
        var ids = imputations.Select(i => i.PurchaseInvoiceId).Distinct().ToArray();
        List<InvoiceNetRow> invoices;
        try
        {
            invoices = await db.Database.SqlQuery<InvoiceNetRow>(
                $@"SELECT ""Id"", ""Subtotal"", ""Total"" FROM purchases.purchase_invoices WHERE ""TenantId"" = {tenantId} AND ""Id"" = ANY({ids})").ToListAsync(ct);
        }
        catch (Npgsql.PostgresException)
        {
            invoices = []; // sin el módulo de compras: la base es lo imputado
        }
        return imputations.Sum(i => invoices.FirstOrDefault(x => x.Id == i.PurchaseInvoiceId) is { Total: > 0 } inv
            ? i.AmountImputed * inv.Subtotal / inv.Total : i.AmountImputed);
    }

    internal sealed record InvoiceNetRow(Guid Id, decimal Subtotal, decimal Total);

    /// <summary>Cálculo de la retención de un pago (sin guardar). Null si la empresa no es agente o el proveedor no tiene perfil.</summary>
    public static async Task<(WithholdingResult Result, WithholdingRegime Regime, SupplierWithholdingProfile Profile)?> ComputeAsync(
        FinanceDbContext db, Guid tenantId, Guid supplierId, DateTime date, decimal amount, IReadOnlyCollection<WithholdingImputation> imputations, Guid? exceptOrderId, CancellationToken ct)
    {
        var settings = await db.WithholdingSettings.AsNoTracking().FirstOrDefaultAsync(s => s.TenantId == tenantId, ct);
        if (settings is not { IsAgent: true } || (settings.AgentSince is { } since && date.Date < since.Date)) return null;
        var profile = await db.SupplierWithholdingProfiles.AsNoTracking().FirstOrDefaultAsync(p => p.TenantId == tenantId && p.SupplierId == supplierId, ct);
        if (profile is null) return null;
        var regime = (await RegimesAsync(db, tenantId, ct)).FirstOrDefault(r => r.Code == profile.RegimeCode && r.IsActive);
        if (regime is null) return null;
        var monthStart = new DateTime(date.Year, date.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var monthEnd = monthStart.AddMonths(1);
        var prior = await db.Withholdings.AsNoTracking()
            .Where(w => w.TenantId == tenantId && w.SupplierId == supplierId && w.RegimeCode == regime.Code && w.Status == "Active"
                && w.Date >= monthStart && w.Date < monthEnd && w.PaymentOrderId != exceptOrderId)
            .ToListAsync(ct);
        var @base = await BaseAsync(db, tenantId, amount, imputations, ct);
        return (WithholdingCalculator.Calculate(regime, profile, date, @base, prior.Sum(w => w.Base), prior.Sum(w => w.Amount)), regime, profile);
    }

    public static IEndpointRouteBuilder MapWithholdingEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/finance/withholdings").WithTags("Finance").RequirePolicyOnWrites("RequireFinance");

        group.MapGet("/settings", async (FinanceDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var settings = await db.WithholdingSettings.AsNoTracking().FirstOrDefaultAsync(s => s.TenantId == t, ct);
            var regimes = await RegimesAsync(db, t, ct);
            var profiles = await db.SupplierWithholdingProfiles.AsNoTracking().Where(p => p.TenantId == t).ToListAsync(ct);
            return Results.Ok(new { IsAgent = settings?.IsAgent ?? false, settings?.AgentSince, Regimes = regimes, Profiles = profiles });
        });

        group.MapPut("/settings", async (WithholdingSettingsRequest req, FinanceDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            if (req.IsAgent && req.AgentSince is null) return Results.BadRequest(new { message = "Indicá desde qué fecha la empresa es agente de retención." });
            var settings = await db.WithholdingSettings.FirstOrDefaultAsync(s => s.TenantId == t, ct)
                ?? db.WithholdingSettings.Add(new WithholdingSettings { Id = Guid.NewGuid(), TenantId = t }).Entity;
            settings.IsAgent = req.IsAgent;
            settings.AgentSince = req.AgentSince is { } d ? DateTime.SpecifyKind(d.Date, DateTimeKind.Utc) : null;
            settings.UpdatedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { settings.IsAgent, settings.AgentSince });
        });

        group.MapPut("/regimes", async (WithholdingRegimeRequest req, FinanceDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var code = (req.Code ?? "").Trim();
            if (code.Length != 3 || !code.All(char.IsDigit)) return Results.BadRequest(new { message = "El código de régimen de SICORE tiene 3 dígitos (por ejemplo 078)." });
            if (string.IsNullOrWhiteSpace(req.Name) || req.NonTaxableAmount < 0 || req.RateRegistered is < 0 or > 100 || req.RateUnregistered is < 0 or > 100 || req.MinimumWithholding < 0)
                return Results.BadRequest(new { message = "Revisá el nombre, los importes y las alícuotas del régimen." });
            await RegimesAsync(db, t, ct);
            var regime = await db.WithholdingRegimes.FirstOrDefaultAsync(r => r.TenantId == t && r.Code == code, ct)
                ?? db.WithholdingRegimes.Add(new WithholdingRegime { Id = Guid.NewGuid(), TenantId = t, Code = code }).Entity;
            regime.Name = req.Name.Trim();
            regime.NonTaxableAmount = req.NonTaxableAmount;
            regime.RateRegistered = req.RateRegistered;
            regime.RateUnregistered = req.RateUnregistered;
            regime.MinimumWithholding = req.MinimumWithholding;
            regime.Source = req.Source?.Trim() ?? "";
            regime.IsActive = req.IsActive;
            await db.SaveChangesAsync(ct);
            return Results.Ok(regime);
        });

        group.MapPut("/suppliers/{supplierId:guid}", async (Guid supplierId, SupplierProfileRequest req, FinanceDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            if (!WithholdingConditions.All.Contains(req.Condition)) return Results.BadRequest(new { message = "Condición inválida." });
            if (!(await RegimesAsync(db, t, ct)).Any(r => r.Code == req.RegimeCode)) return Results.BadRequest(new { message = "Ese régimen no está cargado." });
            var profile = await db.SupplierWithholdingProfiles.FirstOrDefaultAsync(p => p.TenantId == t && p.SupplierId == supplierId, ct)
                ?? db.SupplierWithholdingProfiles.Add(new SupplierWithholdingProfile { Id = Guid.NewGuid(), TenantId = t, SupplierId = supplierId }).Entity;
            profile.Condition = req.Condition;
            profile.RegimeCode = req.RegimeCode;
            profile.ExcludedUntil = req.ExcludedUntil is { } d ? DateTime.SpecifyKind(d.Date, DateTimeKind.Utc) : null;
            profile.UpdatedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return Results.Ok(profile);
        });

        // La orden de pago calcula la retención antes de guardar (y el servidor la vuelve a calcular al guardar).
        group.MapPost("/preview", async (WithholdingPreviewRequest req, FinanceDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var computed = await ComputeAsync(db, tenant.TenantId.Value, req.SupplierId, req.Date, req.Amount, req.Imputations ?? [], null, ct);
            return computed is not { } c
                ? Results.Ok(new { Applies = false })
                : Results.Ok(new { Applies = true, c.Regime.Code, RegimeName = c.Regime.Name, c.Profile.Condition, c.Result.Base, c.Result.PriorBase, c.Result.PriorWithheld, c.Result.Rate, c.Result.Amount, c.Result.Detail });
        });

        group.MapGet("", async (DateTime? from, DateTime? to, FinanceDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var start = from?.Date ?? new DateTime(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1);
            var end = (to?.Date ?? start.AddMonths(1).AddDays(-1)).AddDays(1);
            var rows = await db.Withholdings.AsNoTracking()
                .Where(w => w.TenantId == t && w.Date >= DateTime.SpecifyKind(start, DateTimeKind.Utc) && w.Date < DateTime.SpecifyKind(end, DateTimeKind.Utc))
                .OrderBy(w => w.Date).ThenBy(w => w.CertificateNumber).ToListAsync(ct);
            return Results.Ok(rows);
        });

        group.MapGet("/{id:guid}", async (Guid id, FinanceDbContext db, ITenantContext tenant, CancellationToken ct) =>
            await db.Withholdings.AsNoTracking().FirstOrDefaultAsync(w => w.Id == id && w.TenantId == tenant.TenantId.Value, ct) is { } w
                ? Results.Ok(w) : Results.NotFound());

        // Archivo para importar en SICORE (formato estándar del aplicativo): una retención por renglón.
        group.MapGet("/sicore", async (DateTime from, DateTime to, FinanceDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var start = DateTime.SpecifyKind(from.Date, DateTimeKind.Utc);
            var end = DateTime.SpecifyKind(to.Date.AddDays(1), DateTimeKind.Utc);
            var rows = await db.Withholdings.AsNoTracking()
                .Where(w => w.TenantId == t && w.Status == "Active" && w.Amount > 0 && w.Date >= start && w.Date < end)
                .OrderBy(w => w.Date).ThenBy(w => w.CertificateNumber).ToListAsync(ct);
            var bad = rows.Where(w => new string(w.SupplierTaxId.Where(char.IsDigit).ToArray()).Length != 11).Select(w => $"{w.SupplierName} (OP {w.PaymentOrderNumber})").ToList();
            if (bad.Count > 0) return Results.BadRequest(new { message = $"Falta el CUIT de: {string.Join(", ", bad)}." });
            var sb = new StringBuilder();
            foreach (var w in rows) sb.Append(SicoreLine(w)).Append("\r\n");
            return Results.File(Encoding.Latin1.GetBytes(sb.ToString()), "text/plain", $"sicore-retenciones-{from:yyyyMMdd}-{to:yyyyMMdd}.txt");
        });

        return endpoints;
    }

    /// <summary>
    /// Formato estándar de importación de SICORE (instructivo del aplicativo): comprobante 06 (orden de pago), fecha y número,
    /// importe, impuesto 217, régimen, operación 1 (retención), base, fecha de la retención, condición (01 inscripto,
    /// 02 no inscripto), sujeto suspendido 0, importe retenido, % de exclusión, fecha de boletín, tipo de documento 80 (CUIT),
    /// CUIT y número de certificado original (ceros). Importes con coma decimal, alineados a la derecha.
    /// </summary>
    public static string SicoreLine(Withholding w)
    {
        static string Money(decimal v, int len) => v.ToString("0.00", CultureInfo.InvariantCulture).Replace('.', ',').PadLeft(len);
        static string Text(string v, int len) => v.Length >= len ? v[..len] : v.PadRight(len);
        var orderDigits = new string(w.PaymentOrderNumber.Where(char.IsDigit).ToArray());
        var date = w.Date.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
        return "06" + date + Text(orderDigits, 16) + Money(w.PaymentAmount, 16) + "217" + Text(w.RegimeCode, 3) + "1"
            + Money(w.Base + w.PriorBase, 14) + date + (w.Condition == WithholdingConditions.Unregistered ? "02" : "01") + "0"
            + Money(w.Amount, 14) + Money(0m, 6) + new string(' ', 10) + "80"
            + Text(new string(w.SupplierTaxId.Where(char.IsDigit).ToArray()), 20) + new string('0', 14);
    }
}
