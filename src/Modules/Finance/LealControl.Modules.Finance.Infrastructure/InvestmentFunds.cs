using System.Globalization;
using ExcelDataReader;
using LealControl.BuildingBlocks.Security;
using LealControl.BuildingBlocks.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Finance.Infrastructure;

/// <summary>Fondo común de inversión (por ejemplo "Fima Premium - Clase A"), con la tenencia inicial y el último valor de cuotaparte.</summary>
public sealed class InvestmentFund
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public string Name { get; set; } = "";
    public string Currency { get; set; } = "ARS";
    /// <summary>Cuenta bancaria de donde sale y adonde vuelve la plata.</summary>
    public Guid? AccountId { get; set; }
    /// <summary>Tenencia al inicio del control: cuotapartes y lo que costaron (las operaciones posteriores se suman).</summary>
    public decimal OpeningUnits { get; set; }
    public DateTime? OpeningDate { get; set; }
    public decimal OpeningCost { get; set; }
    public decimal? LastUnitValue { get; set; }
    public DateTime? LastUnitValueDate { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}

public sealed class InvestmentFundOperation
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid FundId { get; set; }
    public string ExternalId { get; set; } = "";
    /// <summary>Subscription (agregar) o Redemption (retirar).</summary>
    public string Kind { get; set; } = "";
    public DateTime RequestDate { get; set; }
    public DateTime SettlementDate { get; set; }
    public decimal Amount { get; set; }
    public decimal Units { get; set; }
    public decimal? UnitValue { get; set; }
    /// <summary>Settled (liquidada), Pending u otro estado tal como lo informa el banco.</summary>
    public string Status { get; set; } = "";
}

public sealed record FundImportRequest(string FileBase64, string? FileName);
public sealed record FundUpdateRequest(Guid? AccountId, decimal OpeningUnits, DateTime? OpeningDate, decimal OpeningCost, decimal? LastUnitValue, DateTime? LastUnitValueDate);
public sealed record FundOperationRow(string ExternalId, string FundName, string Currency, string Kind, DateTime RequestDate, DateTime SettlementDate,
    decimal Amount, decimal Units, decimal? UnitValue, string Status);

/// <summary>
/// Fondos comunes de inversión (nota 69, F5): se importan las operaciones que baja el home banking (Galicia, listado de FIMA),
/// se calcula la tenencia en cuotapartes, su valuación y el rendimiento, y se controla que cada suscripción o rescate figure
/// en el extracto de la cuenta.
/// </summary>
public static class InvestmentFunds
{
    private static readonly CultureInfo Ar = CultureInfo.GetCultureInfo("es-AR");
    private static readonly string[] GaliciaHeader = ["Id operación", "Fondo - Clase", "Fecha solicitud", "Fecha liquidación", "Tipo operación", "Monto", "Cuotapartes", "Valor cuotapartes"];

    static InvestmentFunds() => System.Text.Encoding.RegisterProvider(System.Text.CodePagesEncodingProvider.Instance);

    /// <summary>Listado de movimientos de FIMA de Galicia (.xlsx). Monto con miles con punto ("$3.000.000,00", "USD 5.000,00"); el valor de la cuotaparte con punto decimal ("$86.228437").</summary>
    public static List<FundOperationRow>? ParseGalicia(byte[] bytes)
    {
        using var stream = new MemoryStream(bytes);
        using var reader = ExcelReaderFactory.CreateReader(stream);
        var table = new List<object?[]>();
        while (reader.Read()) table.Add(Enumerable.Range(0, reader.FieldCount).Select(reader.GetValue).ToArray());
        var headerIndex = table.FindIndex(r => r.Length >= GaliciaHeader.Length && GaliciaHeader.Select((h, i) => Text(r[i]) == h).All(x => x));
        if (headerIndex < 0) return null;
        var rows = new List<FundOperationRow>();
        foreach (var r in table.Skip(headerIndex + 1))
        {
            if (r.All(c => string.IsNullOrWhiteSpace(Text(c)))) continue;
            var amountText = Text(r[5]);
            var currency = amountText.StartsWith("USD", StringComparison.OrdinalIgnoreCase) ? "USD" : "ARS";
            var amount = decimal.Parse(new string(amountText.Where(c => char.IsAsciiDigit(c) || c == ',').ToArray()), Ar);
            var unitValueText = new string(Text(r[7]).Where(c => char.IsAsciiDigit(c) || c == '.').ToArray());
            var status = Text(r[10]);
            rows.Add(new(Text(r[0]), Text(r[1]), currency, Text(r[4]).StartsWith("Agregar", StringComparison.OrdinalIgnoreCase) ? "Subscription" : "Redemption",
                Date(r[2]), Date(r[3]), amount, Number(r[6]), unitValueText.Length > 0 ? decimal.Parse(unitValueText, CultureInfo.InvariantCulture) : null,
                status.Equals("Liquidada", StringComparison.OrdinalIgnoreCase) ? "Settled" : status.Equals("Pendiente", StringComparison.OrdinalIgnoreCase) ? "Pending" : status));
        }
        return rows;
    }

    private static string Text(object? value) => Convert.ToString(value, CultureInfo.InvariantCulture)?.Trim() ?? "";
    private static DateTime Date(object? value) => value is DateTime d ? DateTime.SpecifyKind(d.Date, DateTimeKind.Utc)
        : DateTime.SpecifyKind(DateTime.ParseExact(Text(value), "dd/MM/yyyy", CultureInfo.InvariantCulture), DateTimeKind.Utc);
    private static decimal Number(object? value) => value switch
    {
        double d => Math.Round((decimal)d, 6),
        decimal m => m,
        _ => decimal.TryParse(Text(value), NumberStyles.Number, CultureInfo.InvariantCulture, out var n) ? n : 0m
    };

    /// <summary>Tenencia: inicial más las operaciones liquidadas posteriores; valuación al último valor de cuotaparte.</summary>
    public static (decimal Units, decimal Contributed, decimal? Valuation, decimal? Result) Position(InvestmentFund fund, IEnumerable<InvestmentFundOperation> operations)
    {
        var counted = operations.Where(o => o.Status == "Settled" && (fund.OpeningDate is not { } from || o.SettlementDate.Date > from.Date)).ToList();
        decimal Signed(Func<InvestmentFundOperation, decimal> value) => counted.Sum(o => o.Kind == "Subscription" ? value(o) : -value(o));
        var units = fund.OpeningUnits + Signed(o => o.Units);
        var contributed = fund.OpeningCost + Signed(o => o.Amount);
        var valuation = fund.LastUnitValue is { } v ? Math.Round(units * v, 2) : (decimal?)null;
        return (units, contributed, valuation, valuation - contributed);
    }

    public static IEndpointRouteBuilder MapInvestmentFundEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/finance/funds").WithTags("Finance").RequirePolicyOnWrites("RequireFinance");

        group.MapGet("", async (FinanceDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var funds = await db.InvestmentFunds.AsNoTracking().Where(f => f.TenantId == t).OrderBy(f => f.Currency).ThenBy(f => f.Name).ToListAsync(ct);
            var operations = await db.InvestmentFundOperations.AsNoTracking().Where(o => o.TenantId == t).OrderByDescending(o => o.SettlementDate).ThenByDescending(o => o.ExternalId).ToListAsync(ct);
            // Control contra el extracto: mismo importe y sentido, ±2 días, en la cuenta del fondo, con texto de suscripción o rescate.
            var accountIds = funds.Where(f => f.AccountId.HasValue).Select(f => f.AccountId!.Value).ToList();
            var since = operations.Count > 0 ? operations.Min(o => o.SettlementDate).AddDays(-2) : DateTime.UtcNow;
            var bank = await db.Movements.AsNoTracking()
                .Where(m => m.TenantId == t && accountIds.Contains(m.AccountId) && m.Origin == FinancialMovementOrigin.Imported && m.OperationDateUtc >= since)
                .Select(m => new { m.Id, m.AccountId, m.Kind, m.Amount, m.OperationDateUtc, m.Description }).ToListAsync(ct);
            var used = new HashSet<Guid>();
            return Results.Ok(funds.Select(f =>
            {
                var own = operations.Where(o => o.FundId == f.Id).ToList();
                var (units, contributed, valuation, result) = Position(f, own);
                return new
                {
                    f.Id, f.Name, f.Currency, f.AccountId, f.OpeningUnits, f.OpeningDate, f.OpeningCost, f.LastUnitValue, f.LastUnitValueDate,
                    Units = units, Contributed = contributed, Valuation = valuation, Result = result,
                    Operations = own.Select(o =>
                    {
                        var expected = o.Kind == "Subscription" ? "INVERSION_SUSCRIPCION" : "INVERSION_RESCATE";
                        var match = f.AccountId is null || o.Status != "Settled" ? null : bank.FirstOrDefault(m => !used.Contains(m.Id) && m.AccountId == f.AccountId
                            && m.Amount == o.Amount && m.Kind == (o.Kind == "Subscription" ? FinancialMovementKind.Debit : FinancialMovementKind.Credit)
                            && Math.Abs((m.OperationDateUtc.Date - o.SettlementDate.Date).TotalDays) <= 2 && BankChargeClassifier.Classify(m.Description) == expected);
                        if (match is not null) used.Add(match.Id);
                        return new { o.Id, o.ExternalId, o.Kind, o.RequestDate, o.SettlementDate, o.Amount, o.Units, o.UnitValue, o.Status, InBank = match is null ? (bool?)(f.AccountId is null || o.Status != "Settled" ? null : false) : true };
                    })
                };
            }));
        });

        group.MapPost("/import", async (FundImportRequest req, FinanceDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            byte[] bytes;
            try { bytes = Convert.FromBase64String(req.FileBase64); } catch (FormatException) { return Results.BadRequest(new { message = "Archivo inválido." }); }
            List<FundOperationRow>? rows;
            try { rows = ParseGalicia(bytes); } catch (Exception ex) when (ex is FormatException or ExcelDataReader.Exceptions.ExcelReaderException or InvalidOperationException) { rows = null; }
            if (rows is null) return Results.BadRequest(new { message = "No se reconoce el archivo: tiene que ser el Excel de movimientos de fondos que baja el home banking de Galicia." });

            var funds = await db.InvestmentFunds.Where(f => f.TenantId == t).ToListAsync(ct);
            var ids = rows.Select(r => r.ExternalId).ToList();
            var existing = await db.InvestmentFundOperations.Where(o => o.TenantId == t && ids.Contains(o.ExternalId)).ToDictionaryAsync(o => o.ExternalId, ct);
            int created = 0, updated = 0;
            foreach (var r in rows)
            {
                var fund = funds.FirstOrDefault(f => f.Name == r.FundName && f.Currency == r.Currency);
                if (fund is null)
                {
                    fund = new InvestmentFund { Id = Guid.NewGuid(), TenantId = t, Name = r.FundName, Currency = r.Currency, CreatedAtUtc = DateTime.UtcNow };
                    db.InvestmentFunds.Add(fund);
                    funds.Add(fund);
                }
                if (existing.TryGetValue(r.ExternalId, out var op))
                {
                    if (op.Status == r.Status && op.Units == r.Units) continue;
                    updated++;
                }
                else
                {
                    op = db.InvestmentFundOperations.Add(new InvestmentFundOperation { Id = Guid.NewGuid(), TenantId = t, FundId = fund.Id, ExternalId = r.ExternalId }).Entity;
                    existing[r.ExternalId] = op;
                    created++;
                }
                (op.Kind, op.RequestDate, op.SettlementDate, op.Amount, op.Units, op.UnitValue, op.Status) = (r.Kind, r.RequestDate, r.SettlementDate, r.Amount, r.Units, r.UnitValue, r.Status);
                if (r.Status == "Settled" && r.UnitValue is { } value && (fund.LastUnitValueDate is not { } last || r.SettlementDate >= last))
                    (fund.LastUnitValue, fund.LastUnitValueDate) = (value, r.SettlementDate);
            }
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { Rows = rows.Count, Created = created, Updated = updated, Unchanged = rows.Count - created - updated });
        });

        group.MapPut("/{id:guid}", async (Guid id, FundUpdateRequest req, FinanceDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var fund = await db.InvestmentFunds.FirstOrDefaultAsync(f => f.Id == id && f.TenantId == t, ct);
            if (fund is null) return Results.NotFound();
            if (req.AccountId is { } accountId && !await db.Accounts.AnyAsync(a => a.Id == accountId && a.TenantId == t && a.Currency == fund.Currency, ct))
                return Results.BadRequest(new { message = $"La cuenta tiene que ser en {fund.Currency}." });
            if (req.OpeningUnits < 0 || req.OpeningCost < 0 || req.LastUnitValue <= 0) return Results.BadRequest(new { message = "Revisá los importes." });
            (fund.AccountId, fund.OpeningUnits, fund.OpeningDate, fund.OpeningCost) = (req.AccountId, req.OpeningUnits, req.OpeningDate?.Date, req.OpeningCost);
            if (req.LastUnitValue is { } v) (fund.LastUnitValue, fund.LastUnitValueDate) = (v, (req.LastUnitValueDate ?? DateTime.UtcNow).Date);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { fund.Id });
        });

        return endpoints;
    }
}
