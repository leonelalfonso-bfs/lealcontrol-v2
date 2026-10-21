using System.Globalization;
using System.Text;
using LealControl.BuildingBlocks.Security;
using LealControl.BuildingBlocks.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Finance.Infrastructure;

/// <summary>Jurisdicción de IIBB elegida a mano para una percepción o retención sufrida (cuando no viene del comprobante).</summary>
public sealed class SufferedTaxJurisdiction
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public string SourceType { get; set; } = "";
    public Guid SourceId { get; set; }
    public string Jurisdiction { get; set; } = "";
}

public sealed record SufferedTaxRow(
    string Source, Guid SourceId, DateTime Date, string Tax, string Kind, string? Jurisdiction, string AgentName, string AgentTaxId,
    string Voucher, decimal Amount, string? VoucherType, string? VoucherLetter, int PointOfSale, string Number);

public sealed record SufferedJurisdictionRequest(string SourceType, Guid SourceId, string Jurisdiction);
public sealed record SufferedSettingsRequest(string? DefaultJurisdiction);

/// <summary>
/// Retenciones y percepciones sufridas (nota 69, F3), para Convenio Multilateral (SIFERE) y el control de IVA y Ganancias:
/// - retenciones que hacen los clientes, cargadas en los recibos (impuesto, jurisdicción si es IIBB, certificado);
/// - percepciones de IIBB e IVA de las facturas de compra (la jurisdicción de IIBB es la de la empresa, corregible);
/// - recaudaciones bancarias (SIRCREB) y percepciones de IVA del banco, del extracto, como control (SIFERE las toma de SIRCREB).
/// </summary>
public static class SufferedTaxes
{
    /// <summary>Códigos de jurisdicción del Convenio Multilateral.</summary>
    public static readonly IReadOnlyDictionary<string, string> Jurisdictions = new Dictionary<string, string>
    {
        ["901"] = "Ciudad de Buenos Aires", ["902"] = "Buenos Aires", ["903"] = "Catamarca", ["904"] = "Córdoba", ["905"] = "Corrientes",
        ["906"] = "Chaco", ["907"] = "Chubut", ["908"] = "Entre Ríos", ["909"] = "Formosa", ["910"] = "Jujuy", ["911"] = "La Pampa",
        ["912"] = "La Rioja", ["913"] = "Mendoza", ["914"] = "Misiones", ["915"] = "Neuquén", ["916"] = "Río Negro", ["917"] = "Salta",
        ["918"] = "San Juan", ["919"] = "San Luis", ["920"] = "Santa Cruz", ["921"] = "Santa Fe", ["922"] = "Santiago del Estero",
        ["923"] = "Tierra del Fuego", ["924"] = "Tucumán"
    };

    /// <summary>El tipo de retención del recibo era texto libre: se lleva a IIBB, GAN, IVA o SUSS.</summary>
    public static string TaxOf(string? retentionType)
    {
        var t = (retentionType ?? "").ToUpperInvariant();
        return t.Contains("IIBB") || t.Contains("BRUTOS") ? "IIBB" : t.Contains("GAN") ? "GAN" : t.Contains("IVA") ? "IVA" : t.Contains("SUSS") ? "SUSS" : "OTRO";
    }

    internal sealed record PurchaseRow(Guid Id, string InvoiceType, int PointOfSale, long InvoiceNumber, string SupplierName, string SupplierDocument,
        DateTime IssueDate, decimal IibbPerception, decimal IvaPerception, decimal ExchangeRate);
    internal sealed record PartyRow(Guid Id, string LegalName, string? TaxId);

    public static async Task<List<SufferedTaxRow>> ListAsync(FinanceDbContext db, Guid tenantId, DateTime from, DateTime to, CancellationToken ct)
    {
        var start = DateTime.SpecifyKind(from.Date, DateTimeKind.Utc);
        var end = DateTime.SpecifyKind(to.Date.AddDays(1), DateTimeKind.Utc);
        var settings = await db.WithholdingSettings.AsNoTracking().FirstOrDefaultAsync(s => s.TenantId == tenantId, ct);
        var overrides = await db.SufferedTaxJurisdictions.AsNoTracking().Where(o => o.TenantId == tenantId)
            .ToDictionaryAsync(o => (o.SourceType, o.SourceId), o => o.Jurisdiction, ct);
        var rows = new List<SufferedTaxRow>();

        // 1. Retenciones de los clientes (recibos vigentes).
        var receiptLines = await (from line in db.CollectionReceiptLines.AsNoTracking()
                                  join receipt in db.CollectionReceipts.AsNoTracking() on line.ReceiptId equals receipt.Id
                                  where receipt.TenantId == tenantId && receipt.Status != "Voided" && line.Method == "Retention"
                                        && receipt.ReceiptDateUtc >= start && receipt.ReceiptDateUtc < end
                                  select new { line, receipt }).ToListAsync(ct);
        var customers = await PartiesAsync(db, tenantId, receiptLines.Where(x => x.receipt.CustomerId.HasValue).Select(x => x.receipt.CustomerId!.Value), ct);
        foreach (var x in receiptLines)
        {
            var tax = TaxOf(x.line.RetentionType);
            var party = x.receipt.CustomerId is { } c ? customers.GetValueOrDefault(c) : null;
            var (pos, number) = SplitCertificate(x.line.RetentionCertificate);
            rows.Add(new("Receipt", x.line.Id, x.receipt.ReceiptDateUtc, tax, "Retención",
                tax == "IIBB" ? x.line.Jurisdiction ?? overrides.GetValueOrDefault(("Receipt", x.line.Id)) : null,
                party?.LegalName ?? "", Digits(party?.TaxId), x.line.RetentionCertificate ?? $"Recibo {x.receipt.ReceiptNumber}",
                x.line.Amount, "R", " ", pos, number));
        }

        // 2. Percepciones de las facturas de compra.
        List<PurchaseRow> purchases;
        try
        {
            purchases = await db.Database.SqlQuery<PurchaseRow>($@"
                SELECT ""Id"", ""InvoiceType"", ""PointOfSale"", ""InvoiceNumber"", ""SupplierName"", ""SupplierDocument"", ""IssueDate"",
                       ""IibbPerception"", ""IvaPerception"", ""ExchangeRate""
                FROM purchases.purchase_invoices
                WHERE ""TenantId"" = {tenantId} AND ""Status"" <> 'Cancelled' AND ""IssueDate"" >= {start} AND ""IssueDate"" < {end}
                  AND (""IibbPerception"" <> 0 OR ""IvaPerception"" <> 0)").ToListAsync(ct);
        }
        catch (Npgsql.PostgresException)
        {
            purchases = []; // sin el módulo de compras
        }
        foreach (var p in purchases)
        {
            var credit = p.InvoiceType.StartsWith("NC", StringComparison.OrdinalIgnoreCase);
            var sign = credit ? -1m : 1m;
            var type = credit ? "C" : p.InvoiceType.StartsWith("ND", StringComparison.OrdinalIgnoreCase) ? "D" : "F";
            var letter = p.InvoiceType[^1..];
            var voucher = $"{(credit ? "NC" : type == "D" ? "ND" : "FC")} {letter} {p.PointOfSale:D4}-{p.InvoiceNumber:D8}";
            var rate = p.ExchangeRate > 0 ? p.ExchangeRate : 1m;
            if (p.IibbPerception != 0)
                rows.Add(new("PurchaseInvoice", p.Id, p.IssueDate, "IIBB", "Percepción",
                    overrides.GetValueOrDefault(("PurchaseInvoice", p.Id)) ?? settings?.DefaultJurisdiction,
                    p.SupplierName, Digits(p.SupplierDocument), voucher, sign * Math.Round(p.IibbPerception * rate, 2), type, letter, p.PointOfSale, p.InvoiceNumber.ToString(CultureInfo.InvariantCulture)));
            if (p.IvaPerception != 0)
                rows.Add(new("PurchaseInvoice", p.Id, p.IssueDate, "IVA", "Percepción", null, p.SupplierName, Digits(p.SupplierDocument), voucher,
                    sign * Math.Round(p.IvaPerception * rate, 2), type, letter, p.PointOfSale, p.InvoiceNumber.ToString(CultureInfo.InvariantCulture)));
        }

        // 3. Del banco (control): SIRCREB y percepciones de IVA, clasificadas como impuesto.
        var taxConcept = await db.FinancialConcepts.AsNoTracking().Where(c => c.TenantId == tenantId && c.Code == "IMPUESTO_RETENCION").Select(c => (Guid?)c.Id).FirstOrDefaultAsync(ct);
        if (taxConcept is { } conceptId)
        {
            var bank = await (from m in db.Movements.AsNoTracking()
                              join a in db.Accounts.AsNoTracking() on m.AccountId equals a.Id
                              where m.TenantId == tenantId && m.Origin == FinancialMovementOrigin.Imported && m.ConceptId == conceptId
                                    && m.OperationDateUtc >= start && m.OperationDateUtc < end
                              select new { m, a.Name }).ToListAsync(ct);
            foreach (var x in bank)
            {
                var d = x.m.Description.ToUpperInvariant();
                var sign = x.m.Kind == FinancialMovementKind.Debit ? 1m : -1m;
                if (d.Contains("SIRCREB") || d.Contains("ING. BRUTOS") || d.Contains("INGRESOS BRUTOS"))
                    rows.Add(new("Bank", x.m.Id, x.m.OperationDateUtc, "IIBB", "Recaudación bancaria", null, x.Name, "", x.m.Description, sign * x.m.Amount, null, null, 0, ""));
                else if (d.Contains("PERCEP") && d.Contains("IVA") || d.Contains("2408"))
                    rows.Add(new("Bank", x.m.Id, x.m.OperationDateUtc, "IVA", "Percepción bancaria", null, x.Name, "", x.m.Description, sign * x.m.Amount, null, null, 0, ""));
            }
        }
        return rows.OrderBy(r => r.Date).ThenBy(r => r.Tax).ToList();
    }

    private static async Task<Dictionary<Guid, PartyRow>> PartiesAsync(FinanceDbContext db, Guid tenantId, IEnumerable<Guid> ids, CancellationToken ct)
    {
        var list = ids.Distinct().ToArray();
        if (list.Length == 0) return [];
        try
        {
            return (await db.Database.SqlQuery<PartyRow>(
                    $@"SELECT ""Id"", ""LegalName"", document_number AS ""TaxId"" FROM crm.customers WHERE ""TenantId"" = {tenantId} AND ""Id"" = ANY({list})").ToListAsync(ct))
                .ToDictionary(p => p.Id);
        }
        catch (Npgsql.PostgresException)
        {
            return [];
        }
    }

    /// <summary>"0001-00012345" → sucursal 1 y constancia 12345; sin guion, todo es la constancia.</summary>
    private static (int PointOfSale, string Number) SplitCertificate(string? certificate)
    {
        var parts = (certificate ?? "").Split('-', 2);
        return parts.Length == 2 && int.TryParse(Digits(parts[0]), out var pos)
            ? (pos, Digits(parts[1]))
            : (0, Digits(certificate));
    }

    private static string Digits(string? value) => new((value ?? "").Where(char.IsDigit).ToArray());
    private static string Cuit(string digits) => digits.Length == 11 ? $"{digits[..2]}-{digits[2..10]}-{digits[10]}" : digits.PadRight(13);
    private static string Zeros(string digits, int length) => digits.Length > length ? digits[^length..] : digits.PadLeft(length, '0');

    /// <summary>Importe de SIFERE: 11 posiciones con coma decimal, ceros a la izquierda; negativo con el signo adelante.</summary>
    private static string Amount(decimal value)
    {
        var text = Math.Abs(value).ToString("0.00", CultureInfo.InvariantCulture).Replace('.', ',');
        return value < 0 ? "-" + text.PadLeft(10, '0') : text.PadLeft(11, '0');
    }

    /// <summary>Retención (79): jurisdicción, CUIT del agente con guiones, fecha, sucursal, constancia, tipo y letra, número de comprobante, importe.</summary>
    public static string RetentionLine(SufferedTaxRow r) =>
        r.Jurisdiction + Cuit(r.AgentTaxId) + r.Date.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture) + Zeros(r.PointOfSale.ToString(CultureInfo.InvariantCulture), 4)
        + Zeros(r.Number, 16) + (r.VoucherType ?? "R") + (r.VoucherLetter ?? " ") + Zeros(r.Number, 20) + Amount(r.Amount);

    /// <summary>Percepción (51): jurisdicción, CUIT del agente con guiones, fecha, sucursal, número, tipo, letra, importe.</summary>
    public static string PerceptionLine(SufferedTaxRow r) =>
        r.Jurisdiction + Cuit(r.AgentTaxId) + r.Date.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture) + Zeros(r.PointOfSale.ToString(CultureInfo.InvariantCulture), 4)
        + Zeros(r.Number, 8) + (r.VoucherType ?? "F") + (r.VoucherLetter ?? "A") + Amount(r.Amount);

    public static IEndpointRouteBuilder MapSufferedTaxEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/finance/suffered").WithTags("Finance").RequirePolicyOnWrites("RequireFinance");

        group.MapGet("", async (DateTime from, DateTime to, FinanceDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var rows = await ListAsync(db, t, from, to, ct);
            var settings = await db.WithholdingSettings.AsNoTracking().FirstOrDefaultAsync(s => s.TenantId == t, ct);
            var totals = rows.GroupBy(r => new { r.Tax, r.Kind, r.Jurisdiction })
                .Select(g => new { g.Key.Tax, g.Key.Kind, g.Key.Jurisdiction, JurisdictionName = g.Key.Jurisdiction is { } j ? Jurisdictions.GetValueOrDefault(j) : null, Amount = g.Sum(r => r.Amount), Count = g.Count() })
                .OrderBy(x => x.Tax).ThenBy(x => x.Kind).ThenBy(x => x.Jurisdiction);
            return Results.Ok(new { settings?.DefaultJurisdiction, Jurisdictions, Rows = rows, Totals = totals, Problems = Problems(rows) });
        });

        group.MapPut("/settings", async (SufferedSettingsRequest req, FinanceDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            if (req.DefaultJurisdiction is { Length: > 0 } j && !Jurisdictions.ContainsKey(j)) return Results.BadRequest(new { message = "Jurisdicción inválida." });
            var settings = await db.WithholdingSettings.FirstOrDefaultAsync(s => s.TenantId == t, ct)
                ?? db.WithholdingSettings.Add(new WithholdingSettings { Id = Guid.NewGuid(), TenantId = t }).Entity;
            settings.DefaultJurisdiction = string.IsNullOrWhiteSpace(req.DefaultJurisdiction) ? null : req.DefaultJurisdiction;
            settings.UpdatedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { settings.DefaultJurisdiction });
        });

        group.MapPut("/jurisdiction", async (SufferedJurisdictionRequest req, FinanceDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            if (!Jurisdictions.ContainsKey(req.Jurisdiction) || req.SourceType is not ("Receipt" or "PurchaseInvoice"))
                return Results.BadRequest(new { message = "Jurisdicción u origen inválido." });
            var row = await db.SufferedTaxJurisdictions.FirstOrDefaultAsync(o => o.TenantId == t && o.SourceType == req.SourceType && o.SourceId == req.SourceId, ct)
                ?? db.SufferedTaxJurisdictions.Add(new SufferedTaxJurisdiction { Id = Guid.NewGuid(), TenantId = t, SourceType = req.SourceType, SourceId = req.SourceId }).Entity;
            row.Jurisdiction = req.Jurisdiction;
            if (req.SourceType == "Receipt" && await db.CollectionReceiptLines.FirstOrDefaultAsync(l => l.Id == req.SourceId && l.TenantId == t, ct) is { } line)
                line.Jurisdiction = req.Jurisdiction;
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { req.SourceId, req.Jurisdiction });
        });

        // Archivos para importar en SIFERE Web (Convenio Multilateral): retenciones y percepciones de IIBB del período.
        group.MapGet("/sifere/{kind}", async (string kind, DateTime from, DateTime to, FinanceDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var retentions = kind == "retenciones";
            if (!retentions && kind != "percepciones") return Results.NotFound();
            var rows = (await ListAsync(db, tenant.TenantId.Value, from, to, ct))
                .Where(r => r.Tax == "IIBB" && r.Kind == (retentions ? "Retención" : "Percepción")).ToList();
            var problems = Problems(rows);
            if (problems.Count > 0) return Results.BadRequest(new { message = string.Join(" ", problems) });
            var sb = new StringBuilder();
            foreach (var r in rows) sb.Append(retentions ? RetentionLine(r) : PerceptionLine(r)).Append("\r\n");
            return Results.File(Encoding.Latin1.GetBytes(sb.ToString()), "text/plain", $"sifere-{kind}-{from:yyyyMMdd}-{to:yyyyMMdd}.txt");
        });

        return endpoints;
    }

    private static List<string> Problems(IEnumerable<SufferedTaxRow> rows) =>
        rows.Where(r => r.Tax == "IIBB" && r.Kind is "Retención" or "Percepción")
            .SelectMany(r => new[]
            {
                r.Jurisdiction is null ? $"{r.Voucher} ({r.AgentName}): falta la jurisdicción." : null,
                r.AgentTaxId.Length != 11 ? $"{r.Voucher} ({r.AgentName}): falta el CUIT del agente." : null
            })
            .OfType<string>().Distinct().ToList();
}
