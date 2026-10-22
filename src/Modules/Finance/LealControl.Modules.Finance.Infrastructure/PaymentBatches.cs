using System.Globalization;
using System.Text;
using LealControl.BuildingBlocks.Security;
using LealControl.BuildingBlocks.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Finance.Infrastructure;

/// <summary>CBU donde se le transfiere a un proveedor.</summary>
public sealed class SupplierBankAccount
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid SupplierId { get; set; }
    public string Cbu { get; set; } = "";
    public string? Alias { get; set; }
    public DateTime UpdatedAtUtc { get; set; }
}

/// <summary>Lote de transferencias a proveedores exportado en un archivo para Interbanking (nota 69, F4).</summary>
public sealed class PaymentBatch
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public int Number { get; set; }
    public Guid AccountId { get; set; }
    public string AccountCbu { get; set; } = "";
    public DateTime RequestDate { get; set; }
    public bool Consolidated { get; set; }
    public decimal Total { get; set; }
    public string Status { get; set; } = "Generated";
    public string? CreatedBy { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public List<PaymentBatchItem> Items { get; set; } = [];
}

public sealed class PaymentBatchItem
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid BatchId { get; set; }
    public Guid MovementId { get; set; }
    public Guid PaymentOrderId { get; set; }
    public string PaymentOrderNumber { get; set; } = "";
    public string SupplierName { get; set; } = "";
    public string SupplierTaxId { get; set; } = "";
    public string Cbu { get; set; } = "";
    public decimal Amount { get; set; }
}

public sealed record SupplierBankAccountRequest(string Cbu, string? Alias);
public sealed record AccountCbuRequest(string? Cbu);
public sealed record CreatePaymentBatchRequest(Guid AccountId, List<Guid> MovementIds, DateTime RequestDate, bool Consolidated);

/// <summary>
/// Pagos por archivo (nota 69, F4): las transferencias de las órdenes de pago pendientes de banco se juntan en un lote y se
/// exportan con el diseño de Interbanking por número de CBU (registro U del lote y M de TEF a proveedores, 240 posiciones).
/// Cuando el extracto trae el débito del lote consolidado, la conciliación lo propone contra todas sus órdenes de pago.
/// </summary>
public static class PaymentBatches
{
    private const int RecordLength = 240;

    /// <summary>Valida los dígitos verificadores de los dos bloques del CBU (8 + 14 dígitos).</summary>
    public static bool IsValidCbu(string? cbu)
    {
        if (cbu is not { Length: 22 } || !cbu.All(char.IsAsciiDigit)) return false;
        static bool Block(string digits, int[] weights) =>
            (10 - digits.Take(weights.Length).Select((c, i) => (c - '0') * weights[i]).Sum() % 10) % 10 == digits[^1] - '0';
        return Block(cbu[..8], [7, 1, 3, 9, 7, 1, 3]) && Block(cbu[8..], [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3]);
    }

    private static string Digits(string? s) => new((s ?? "").Where(char.IsAsciiDigit).ToArray());
    private static string Text(string? s, int length)
    {
        var plain = new string((s ?? "").Normalize(NormalizationForm.FormD).Where(c => CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark).ToArray());
        return (plain.Length > length ? plain[..length] : plain).PadRight(length);
    }
    private static string Amount(decimal amount, int length) => ((long)Math.Round(amount * 100m, MidpointRounding.AwayFromZero)).ToString(CultureInfo.InvariantCulture).PadLeft(length, '0');

    /// <summary>Archivo Interbanking por CBU: un registro U con la cuenta a debitar y un M por transferencia a proveedor.</summary>
    public static string InterbankingFile(PaymentBatch batch)
    {
        var sb = new StringBuilder();
        void Line(string record)
        {
            if (record.Length != RecordLength) throw new InvalidOperationException($"Registro de {record.Length} posiciones.");
            sb.Append(record).Append("\r\n");
        }
        Line("*U*" + batch.AccountCbu + "D" + batch.RequestDate.ToString("yyyyMMdd", CultureInfo.InvariantCulture) + (batch.Consolidated ? "S" : "N")
            + Text($"Lote de pagos {batch.Number:0000}", 61) + "000" + "00" + batch.CreatedAtUtc.ToString("MM/dd/yy", CultureInfo.InvariantCulture)
            + Text(batch.Number.ToString("00000000", CultureInfo.InvariantCulture), 8) + new string(' ', 123));
        foreach (var item in batch.Items.OrderBy(i => i.PaymentOrderNumber))
            Line("*M*" + item.Cbu + Amount(item.Amount, 17) + Text($"{item.PaymentOrderNumber} {item.SupplierName}", 60)
                + "  " + new string(' ', 12) + "OP" + Text(item.PaymentOrderNumber, 12) + new string(' ', 12) + "  " + new string('0', 12)
                + new string(' ', 12) + new string('0', 10) + Text(Digits(item.SupplierTaxId), 11) + new string(' ', 51));
        return sb.ToString();
    }

    /// <summary>Transferencias de órdenes de pago de la cuenta que todavía no salieron del banco ni están en otro lote.</summary>
    private static async Task<List<Candidate>> CandidatesAsync(FinanceDbContext db, Guid tenantId, Guid accountId, CancellationToken ct)
    {
        var batched = db.PaymentBatchItems.Where(i => i.TenantId == tenantId && db.PaymentBatches.Any(b => b.Id == i.BatchId && b.Status == "Generated")).Select(i => i.MovementId);
        var rows = await (from m in db.Movements
                          join o in db.PaymentOrders on m.LinkedEntityId equals o.Id
                          where m.TenantId == tenantId && m.AccountId == accountId && m.Origin == FinancialMovementOrigin.System
                              && m.ReconciliationStatus == FinancialReconciliationStatus.PendingBank && m.Kind == FinancialMovementKind.Debit
                              && m.LinkedEntityType == "PaymentOrder" && o.Status != "Voided" && !batched.Contains(m.Id)
                          orderby m.OperationDateUtc, o.OrderNumber
                          select new { m.Id, m.Amount, m.OperationDateUtc, o.OrderNumber, o.SupplierId, o.SupplierName, o.SupplierTaxId, OrderId = o.Id }).ToListAsync(ct);
        var supplierIds = rows.Where(r => r.SupplierId.HasValue).Select(r => r.SupplierId!.Value).Distinct().ToList();
        var cbus = await db.SupplierBankAccounts.Where(a => a.TenantId == tenantId && supplierIds.Contains(a.SupplierId)).ToDictionaryAsync(a => a.SupplierId, a => a.Cbu, ct);
        return rows.Select(r => new Candidate(r.Id, r.OrderId, r.OrderNumber, r.SupplierId, r.SupplierName, Digits(r.SupplierTaxId), r.Amount, r.OperationDateUtc,
            r.SupplierId is { } s ? cbus.GetValueOrDefault(s) : null)).ToList();
    }

    private sealed record Candidate(Guid MovementId, Guid PaymentOrderId, string OrderNumber, Guid? SupplierId, string SupplierName, string SupplierTaxId,
        decimal Amount, DateTime Date, string? Cbu)
    {
        public string? Problem => SupplierId is null ? "La orden de pago no tiene proveedor."
            : Cbu is null ? "El proveedor no tiene CBU cargado."
            : SupplierTaxId.Length != 11 ? "El proveedor no tiene CUIT." : null;
    }

    private static object View(PaymentBatch b) => new
    {
        b.Id, b.Number, b.AccountId, b.RequestDate, b.Consolidated, b.Total, b.Status, b.CreatedBy, b.CreatedAtUtc,
        Items = b.Items.OrderBy(i => i.PaymentOrderNumber).Select(i => new { i.MovementId, i.PaymentOrderId, i.PaymentOrderNumber, i.SupplierName, i.SupplierTaxId, i.Cbu, i.Amount })
    };

    public static IEndpointRouteBuilder MapPaymentBatchEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/finance/payment-batches").WithTags("Finance").RequirePolicyOnWrites("RequireFinance");

        group.MapGet("/suppliers", async (FinanceDbContext db, ITenantContext tenant, CancellationToken ct) =>
            Results.Ok(await db.SupplierBankAccounts.AsNoTracking().Where(a => a.TenantId == tenant.TenantId.Value)
                .Select(a => new { a.SupplierId, a.Cbu, a.Alias }).ToListAsync(ct)));

        group.MapPut("/suppliers/{supplierId:guid}", async (Guid supplierId, SupplierBankAccountRequest req, FinanceDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var cbu = Digits(req.Cbu);
            if (!IsValidCbu(cbu)) return Results.BadRequest(new { message = "El CBU no es válido: tiene que tener 22 dígitos y sus dígitos verificadores." });
            var row = await db.SupplierBankAccounts.FirstOrDefaultAsync(a => a.TenantId == t && a.SupplierId == supplierId, ct)
                ?? db.SupplierBankAccounts.Add(new SupplierBankAccount { Id = Guid.NewGuid(), TenantId = t, SupplierId = supplierId }).Entity;
            row.Cbu = cbu;
            row.Alias = string.IsNullOrWhiteSpace(req.Alias) ? null : req.Alias.Trim();
            row.UpdatedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { row.SupplierId, row.Cbu, row.Alias });
        });

        group.MapPut("/accounts/{accountId:guid}", async (Guid accountId, AccountCbuRequest req, FinanceDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var account = await db.Accounts.FirstOrDefaultAsync(a => a.Id == accountId && a.TenantId == tenant.TenantId.Value, ct);
            if (account is null) return Results.NotFound();
            var cbu = Digits(req.Cbu);
            if (cbu.Length > 0 && !IsValidCbu(cbu)) return Results.BadRequest(new { message = "El CBU de la cuenta no es válido." });
            account.Cbu = cbu.Length > 0 ? cbu : null;
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { account.Id, account.Cbu });
        });

        group.MapGet("/candidates", async (Guid accountId, FinanceDbContext db, ITenantContext tenant, CancellationToken ct) =>
            Results.Ok((await CandidatesAsync(db, tenant.TenantId.Value, accountId, ct)).Select(c => new
            {
                c.MovementId, c.PaymentOrderId, c.OrderNumber, c.SupplierId, c.SupplierName, c.SupplierTaxId, c.Amount, c.Date, c.Cbu, c.Problem
            })));

        group.MapGet("", async (FinanceDbContext db, ITenantContext tenant, CancellationToken ct) =>
            Results.Ok((await db.PaymentBatches.AsNoTracking().Include(b => b.Items).Where(b => b.TenantId == tenant.TenantId.Value)
                .OrderByDescending(b => b.Number).Take(100).ToListAsync(ct)).Select(View)));

        group.MapPost("", async (CreatePaymentBatchRequest req, FinanceDbContext db, ITenantContext tenant, HttpContext http, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var account = await db.Accounts.AsNoTracking().FirstOrDefaultAsync(a => a.Id == req.AccountId && a.TenantId == t, ct);
            if (account is null) return Results.NotFound();
            if (account.Cbu is null) return Results.BadRequest(new { message = $"Cargá el CBU de la cuenta {account.Name} antes de generar el lote." });
            if (account.Currency != "ARS") return Results.BadRequest(new { message = "Por ahora los lotes son solo en pesos." });
            var wanted = req.MovementIds.ToHashSet();
            var chosen = (await CandidatesAsync(db, t, req.AccountId, ct)).Where(c => wanted.Contains(c.MovementId)).ToList();
            if (chosen.Count == 0 || chosen.Count != wanted.Count)
                return Results.BadRequest(new { message = "Alguna transferencia ya no está pendiente o ya está en otro lote. Actualizá la pantalla." });
            if (chosen.Where(c => c.Problem is not null).Select(c => $"{c.OrderNumber} ({c.SupplierName}): {c.Problem}").ToList() is { Count: > 0 } problems)
                return Results.BadRequest(new { message = string.Join(" ", problems) });

            var number = int.Parse(await FinanceDocumentSequences.NextNumberAsync(db, t, "PaymentBatch", "", ct), CultureInfo.InvariantCulture);
            var batch = new PaymentBatch
            {
                Id = Guid.NewGuid(), TenantId = t, Number = number, AccountId = account.Id, AccountCbu = account.Cbu, RequestDate = req.RequestDate.Date,
                Consolidated = req.Consolidated, Total = chosen.Sum(c => c.Amount), CreatedBy = http.User.Identity?.Name, CreatedAtUtc = DateTime.UtcNow
            };
            batch.Items = chosen.Select(c => new PaymentBatchItem
            {
                Id = Guid.NewGuid(), TenantId = t, BatchId = batch.Id, MovementId = c.MovementId, PaymentOrderId = c.PaymentOrderId, PaymentOrderNumber = c.OrderNumber,
                SupplierName = c.SupplierName, SupplierTaxId = c.SupplierTaxId, Cbu = c.Cbu!, Amount = c.Amount
            }).ToList();
            db.PaymentBatches.Add(batch);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/finance/payment-batches/{batch.Id}", View(batch));
        });

        group.MapGet("/{id:guid}/interbanking", async (Guid id, FinanceDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var batch = await db.PaymentBatches.AsNoTracking().Include(b => b.Items).FirstOrDefaultAsync(b => b.Id == id && b.TenantId == tenant.TenantId.Value, ct);
            if (batch is null) return Results.NotFound();
            if (batch.Status != "Generated") return Results.BadRequest(new { message = "El lote está anulado." });
            return Results.File(Encoding.ASCII.GetBytes(InterbankingFile(batch)), "text/plain", $"interbanking-lote-{batch.Number:0000}.txt");
        });

        group.MapPost("/{id:guid}/cancel", async (Guid id, FinanceDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var batch = await db.PaymentBatches.FirstOrDefaultAsync(b => b.Id == id && b.TenantId == tenant.TenantId.Value, ct);
            if (batch is null) return Results.NotFound();
            batch.Status = "Cancelled";
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { batch.Id, batch.Status });
        });

        return endpoints;
    }

    /// <summary>Lote consolidado cuyo total coincide con un débito del extracto y cuyas transferencias siguen pendientes de banco.</summary>
    internal static async Task<List<(PaymentBatch Batch, List<Guid> MovementIds)>> ConsolidatedPendingAsync(FinanceDbContext db, Guid tenantId, Guid accountId, CancellationToken ct)
    {
        var batches = await db.PaymentBatches.AsNoTracking().Include(b => b.Items)
            .Where(b => b.TenantId == tenantId && b.AccountId == accountId && b.Status == "Generated" && b.Consolidated).ToListAsync(ct);
        var ids = batches.SelectMany(b => b.Items.Select(i => i.MovementId)).ToList();
        var pending = (await db.Movements.AsNoTracking()
            .Where(m => ids.Contains(m.Id) && m.ReconciliationStatus == FinancialReconciliationStatus.PendingBank).Select(m => m.Id).ToListAsync(ct)).ToHashSet();
        return batches.Where(b => b.Items.Count > 1 && b.Items.All(i => pending.Contains(i.MovementId)))
            .Select(b => (b, b.Items.Select(i => i.MovementId).ToList())).ToList();
    }
}
