using System.Globalization;
using LealControl.BuildingBlocks.Tenancy;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Sales.Infrastructure.Persistence;

public sealed record CurrentAccountSummary(
    Guid EntityId,
    int SalesDocuments, decimal BilledSalesArs, decimal BilledSalesUsd, decimal CollectedSalesArs,
    decimal CollectedSalesUsd, decimal ReceivableBalance, decimal ReceivableBalanceUsd,
    decimal PendingDifferencesArs,
    int PurchaseDocuments, decimal BilledPurchasesArs, decimal BilledPurchasesUsd, decimal PaidPurchasesArs,
    decimal PaidPurchasesUsd, decimal PayableBalance, decimal PayableBalanceUsd, decimal NetBalance);

/// <summary>Diferencia de cambio de una imputación todavía sin su ND/NC.</summary>
public sealed record PendingDifferenceDto(
    Guid ImputationId, Guid InvoiceId, string ReceiptNumber, DateTime Date,
    decimal AmountUsd, decimal InvoiceRate, decimal PaymentRate, decimal DifferenceArs);

public sealed record CurrentAccountMovement(
    DateTime Date, string Type, string Number, string Description, string? OriginalAmount,
    decimal Debit, decimal Credit, decimal Balance, string? DocumentBalance, string Source, bool Muted,
    PendingDifferenceDto? Pending);

/// <summary>
/// Cuenta corriente de clientes y proveedores en pesos, calculada en el servidor.
/// Facturas en dólares se valúan a su cotización de emisión; los recibos, a su cotización
/// de cobro; las diferencias de cambio sin documentar suman al saldo hasta emitir su nota.
/// </summary>
internal static class CurrentAccounts
{
    internal sealed record SaleRow(Guid Id, Guid CustomerId, string InvoiceType, string Status, int PointOfSale,
        int InvoiceNumber, string FormattedNumber, DateTime IssueDate, DateTime CreatedAtUtc, string Currency,
        decimal ExchangeRate, decimal Total, string? Notes, Guid? ExchangeDifferenceImputationId);

    internal sealed record PurchaseRow(Guid Id, Guid SupplierId, string InvoiceType, string Status, int PointOfSale,
        long InvoiceNumber, DateTime IssueDate, DateTime CreatedAtUtc, string Currency, decimal ExchangeRate,
        decimal Total, string? Notes);

    internal sealed record ReceiptRow(Guid Id, Guid? CustomerId, string ReceiptNumber, decimal Amount, string Currency,
        decimal? InvoiceAmount, string? InvoiceCurrency, decimal? InvoiceExchangeRate, decimal? PaymentExchangeRate,
        decimal? SuggestedAdjustmentArs, DateTime ReceiptDateUtc, string Description, string Status,
        string? VoidReason, DateTime? VoidedAtUtc, DateTime CreatedAtUtc);

    internal sealed record ImputationRow(Guid Id, Guid ReceiptId, Guid InvoiceId, decimal? AmountUsd,
        decimal? InvoiceExchangeRate, decimal? PaymentExchangeRate, decimal? ExchangeDifferenceArs);

    internal sealed record PaymentRow(Guid Id, Guid? SupplierId, string OrderNumber, decimal Amount, string Currency,
        DateTime PaymentDateUtc, string? Notes, string Status, string? VoidReason, DateTime? VoidedAtUtc,
        DateTime CreatedAtUtc);

    internal sealed class Snapshot
    {
        public List<SaleRow> Sales { get; init; } = [];
        public List<PurchaseRow> Purchases { get; init; } = [];
        public List<ReceiptRow> Receipts { get; init; } = [];
        public List<ImputationRow> Imputations { get; init; } = [];
        public List<PaymentRow> Payments { get; init; } = [];
        public IReadOnlyDictionary<Guid, ReceivableBalance> Balances { get; init; } = new Dictionary<Guid, ReceivableBalance>();
    }

    public static async Task<Snapshot> LoadAsync(SalesDbContext db, TenantId tenantId, CancellationToken ct)
    {
        var sales = await db.Invoices.AsNoTracking()
            .Where(i => i.TenantId == tenantId && i.Status != "Cancelled" && i.Status != "Rejected" && i.InvoiceType != "Proforma")
            .Select(i => new SaleRow(i.Id, i.CustomerId, i.InvoiceType, i.Status, i.PointOfSale, i.InvoiceNumber,
                i.FormattedNumber, i.IssueDate, i.CreatedAtUtc, i.Currency, i.ExchangeRate, i.Total, i.Notes,
                i.ExchangeDifferenceImputationId))
            .ToListAsync(ct);
        var purchases = await db.PurchaseInvoices.AsNoTracking()
            .Where(p => p.TenantId == tenantId && p.Status != "Cancelled")
            .Select(p => new PurchaseRow(p.Id, p.SupplierId, p.InvoiceType, p.Status, p.PointOfSale, p.InvoiceNumber,
                p.IssueDate, p.CreatedAtUtc, p.Currency, p.ExchangeRate, p.Total, p.Notes))
            .ToListAsync(ct);

        var receipts = new List<ReceiptRow>();
        var imputations = new List<ImputationRow>();
        var payments = new List<PaymentRow>();
        var financeReady = await db.Database
            .SqlQuery<bool>($"""SELECT to_regclass('finance."CollectionReceiptImputations"') IS NOT NULL AS "Value" """)
            .SingleAsync(ct);
        if (financeReady)
        {
            receipts = await db.Database.SqlQuery<ReceiptRow>($"""
                SELECT "Id", "CustomerId", "ReceiptNumber", "Amount", "Currency", "InvoiceAmount", "InvoiceCurrency",
                       "InvoiceExchangeRate", "PaymentExchangeRate", "SuggestedAdjustmentArs", "ReceiptDateUtc",
                       "Description", "Status", "VoidReason", "VoidedAtUtc", "CreatedAtUtc"
                FROM finance."CollectionReceipts" WHERE "TenantId" = {tenantId.Value}
                """).ToListAsync(ct);
            imputations = await db.Database.SqlQuery<ImputationRow>($"""
                SELECT "Id", "ReceiptId", "InvoiceId", "AmountUsd", "InvoiceExchangeRate", "PaymentExchangeRate",
                       "ExchangeDifferenceArs"
                FROM finance."CollectionReceiptImputations" WHERE "TenantId" = {tenantId.Value} AND "Status" = 'Active'
                """).ToListAsync(ct);
            payments = await db.Database.SqlQuery<PaymentRow>($"""
                SELECT "Id", "SupplierId", "OrderNumber", "Amount", "Currency", "PaymentDateUtc", "Notes", "Status",
                       "VoidReason", "VoidedAtUtc", "CreatedAtUtc"
                FROM finance."PaymentOrders" WHERE "TenantId" = {tenantId.Value}
                """).ToListAsync(ct);
        }

        return new Snapshot
        {
            Sales = sales, Purchases = purchases, Receipts = receipts, Imputations = imputations, Payments = payments,
            Balances = await ReceivableBalances.ComputeAsync(db, tenantId, ct)
        };
    }

    private static bool Voided(string status) => string.Equals(status, "Voided", StringComparison.OrdinalIgnoreCase);
    private static bool IsCredit(string type) => type.StartsWith("NC", StringComparison.Ordinal);
    private static bool IsDebit(string type) => type.StartsWith("ND", StringComparison.Ordinal);
    private static decimal Signed(string type, decimal total) => IsCredit(type) ? -Math.Abs(total) : Math.Abs(total);
    private static decimal Rate(decimal rate) => rate > 0m ? rate : 1m;

    private static decimal ReceiptArs(ReceiptRow r) =>
        r.Currency == "USD" ? r.Amount * (r.InvoiceExchangeRate ?? r.PaymentExchangeRate ?? 1m) : r.Amount;

    private static IEnumerable<PendingDifferenceDto> PendingDifferences(Snapshot s, Guid customerId)
    {
        var documented = s.Sales.Where(i => i.ExchangeDifferenceImputationId.HasValue)
            .Select(i => i.ExchangeDifferenceImputationId!.Value).ToHashSet();
        var receipts = s.Receipts.Where(r => r.CustomerId == customerId && !Voided(r.Status)).ToDictionary(r => r.Id);
        foreach (var imp in s.Imputations)
        {
            if (!receipts.TryGetValue(imp.ReceiptId, out var r)) continue;
            var diff = imp.ExchangeDifferenceArs ?? 0m;
            if (Math.Abs(diff) < 0.01m || documented.Contains(imp.Id)) continue;
            yield return new PendingDifferenceDto(imp.Id, imp.InvoiceId, r.ReceiptNumber, r.ReceiptDateUtc,
                imp.AmountUsd ?? 0m, imp.InvoiceExchangeRate ?? 0m, imp.PaymentExchangeRate ?? 0m, diff);
        }
    }

    // Recibos viejos (sin diferencia por imputación) conservan su ajuste sugerido a nivel recibo.
    private static decimal LegacyAdjustment(Snapshot s, ReceiptRow r) =>
        s.Imputations.Any(i => i.ReceiptId == r.Id && i.AmountUsd.HasValue) ? 0m : r.SuggestedAdjustmentArs ?? 0m;

    public static CurrentAccountSummary Summary(Snapshot s, Guid entityId)
    {
        var sales = s.Sales.Where(i => i.CustomerId == entityId).ToList();
        var receipts = s.Receipts.Where(r => r.CustomerId == entityId && !Voided(r.Status)).ToList();
        var billedSalesArs = sales.Sum(i => Signed(i.InvoiceType, i.Total) * (i.Currency == "USD" ? Rate(i.ExchangeRate) : 1m));
        var billedSalesUsd = sales.Where(i => i.Currency == "USD").Sum(i => Signed(i.InvoiceType, i.Total));
        var collectedSalesArs = receipts.Sum(ReceiptArs);
        var collectedSalesUsd = receipts.Sum(r =>
        {
            var usd = s.Imputations.Where(i => i.ReceiptId == r.Id).Sum(i => i.AmountUsd ?? 0m);
            if (usd > 0m) return usd;
            if (r.InvoiceAmount is > 0m && r.InvoiceCurrency == "USD") return r.InvoiceAmount.Value;
            if (r.Currency == "USD") return r.Amount;
            return r.PaymentExchangeRate is > 0m ? r.Amount / r.PaymentExchangeRate.Value : 0m;
        });
        var pendingDiff = PendingDifferences(s, entityId).Sum(d => d.DifferenceArs);
        var receivableArs = billedSalesArs - collectedSalesArs + pendingDiff + receipts.Sum(r => LegacyAdjustment(s, r));

        var purchases = s.Purchases.Where(p => p.SupplierId == entityId).ToList();
        var payments = s.Payments.Where(p => p.SupplierId == entityId && !Voided(p.Status)).ToList();
        var billedPurchasesArs = purchases.Sum(p => Signed(p.InvoiceType, p.Total) * (p.Currency == "USD" ? Rate(p.ExchangeRate) : 1m));
        var billedPurchasesUsd = purchases.Where(p => p.Currency == "USD").Sum(p => Signed(p.InvoiceType, p.Total));
        var paidPurchasesArs = payments.Sum(p => p.Amount);
        var paidPurchasesUsd = payments.Where(p => p.Currency == "USD").Sum(p => p.Amount);
        var payableArs = billedPurchasesArs - paidPurchasesArs;

        static decimal R(decimal v) => decimal.Round(v, 2);
        return new CurrentAccountSummary(entityId,
            sales.Count, R(billedSalesArs), R(billedSalesUsd), R(collectedSalesArs), R(collectedSalesUsd),
            R(receivableArs), R(Math.Max(0m, billedSalesUsd - collectedSalesUsd)), R(pendingDiff),
            purchases.Count, R(billedPurchasesArs), R(billedPurchasesUsd), R(paidPurchasesArs), R(paidPurchasesUsd),
            R(payableArs), R(Math.Max(0m, billedPurchasesUsd - paidPurchasesUsd)), R(receivableArs - payableArs));
    }

    public static IEnumerable<Guid> Entities(Snapshot s) =>
        s.Sales.Select(i => i.CustomerId)
            .Concat(s.Purchases.Select(p => p.SupplierId))
            .Concat(s.Receipts.Where(r => r.CustomerId.HasValue).Select(r => r.CustomerId!.Value))
            .Concat(s.Payments.Where(p => p.SupplierId.HasValue).Select(p => p.SupplierId!.Value))
            .Distinct();

    private static string Money(decimal value, string currency) =>
        (currency == "USD" ? "US$ " : "$ ") + value.ToString("#,0.00", AR);

    private static readonly CultureInfo AR = CreateArgentine();
    private static CultureInfo CreateArgentine()
    {
        var c = (CultureInfo)CultureInfo.InvariantCulture.Clone();
        c.NumberFormat.NumberDecimalSeparator = ",";
        c.NumberFormat.NumberGroupSeparator = ".";
        return c;
    }

    private static string Label(string type, bool usd, bool purchase)
    {
        var letter = type.Length > 0 ? type[^1..] : "";
        var fce = type.Contains("FCE_", StringComparison.Ordinal);
        var kind = IsCredit(type) ? "Nota de Crédito" : IsDebit(type) ? "Nota de Débito" : "Factura";
        var name = purchase ? $"{kind} de compra {letter}"
            : fce ? (kind == "Factura" ? $"Factura de Crédito Electrónica {letter}" : $"{kind} FCE {letter}")
            : $"{kind} {letter}";
        return usd ? $"{name} (USD)" : name;
    }

    public static IReadOnlyList<CurrentAccountMovement> Ledger(Snapshot s, Guid entityId)
    {
        var rows = new List<(string SortKey, CurrentAccountMovement Item)>();
        string Key(DateTime date, DateTime? created, string suffix = "") =>
            $"{date:yyyy-MM-dd}|{(created ?? date):yyyy-MM-ddTHH:mm:ss.fffffff}{suffix}";
        void Push(string key, DateTime date, string type, string number, string description, string? original,
            decimal debit, decimal credit, string source, bool muted = false, string? documentBalance = null,
            PendingDifferenceDto? pending = null) =>
            rows.Add((key, new CurrentAccountMovement(date, type, number, description, original,
                decimal.Round(debit, 2), decimal.Round(credit, 2), 0m, documentBalance, source, muted, pending)));

        foreach (var i in s.Sales.Where(i => i.CustomerId == entityId))
        {
            var usd = i.Currency == "USD";
            var ars = i.Total * (usd ? Rate(i.ExchangeRate) : 1m);
            var nc = IsCredit(i.InvoiceType);
            s.Balances.TryGetValue(i.Id, out var balance);
            var documentBalance = nc || balance is null ? null
                : balance.Pending <= 0.01m ? "Cancelado" : Money(balance.Pending, usd ? "USD" : "ARS");
            Push(Key(i.IssueDate, i.CreatedAtUtc), i.IssueDate, Label(i.InvoiceType, usd, false),
                $"{i.PointOfSale:D4}-{i.InvoiceNumber:D8}",
                usd ? $"{(nc ? "NC" : "Factura")} en USD @ TC $ {Rate(i.ExchangeRate).ToString("#,0.######", AR)}"
                    : i.Notes ?? (nc ? "Nota de crédito de venta" : "Facturación de venta"),
                usd ? Money(i.Total, "USD") : null, nc ? 0m : ars, nc ? ars : 0m, "sale", false, documentBalance);
        }

        foreach (var r in s.Receipts.Where(r => r.CustomerId == entityId))
        {
            var usd = r.Currency == "USD";
            var ars = ReceiptArs(r);
            var voided = Voided(r.Status);
            Push(Key(r.ReceiptDateUtc, r.CreatedAtUtc), r.ReceiptDateUtc,
                voided ? $"Recibo de Cobro ANULADO ({r.Currency})" : $"Recibo de Cobro ({r.Currency})", r.ReceiptNumber,
                voided ? $"Anulado{(r.VoidReason is null ? "" : $": {r.VoidReason}")}" : string.IsNullOrWhiteSpace(r.Description) ? "Cobranza recibida" : r.Description,
                usd ? Money(r.Amount, "USD") : null, 0m, ars, "collection", voided);
            if (voided)
            {
                var at = r.VoidedAtUtc ?? r.ReceiptDateUtc;
                Push(Key(at, r.VoidedAtUtc), at, "Anulación de cobro", r.ReceiptNumber,
                    r.VoidReason ?? "Reversa por anulación del recibo", usd ? Money(r.Amount, "USD") : null,
                    ars, 0m, "void", true);
            }
            else if (LegacyAdjustment(s, r) > 0.01m)
            {
                Push(Key(r.ReceiptDateUtc, r.CreatedAtUtc, "~"), r.ReceiptDateUtc, "Diferencia de Cambio (ND)",
                    $"Ajuste TC {r.ReceiptNumber}",
                    $"Diferencia de cambio al cobro: TC $ {r.PaymentExchangeRate} vs TC $ {r.InvoiceExchangeRate}",
                    null, LegacyAdjustment(s, r), 0m, "adjustment");
            }
        }

        foreach (var p in s.Purchases.Where(p => p.SupplierId == entityId))
        {
            var usd = p.Currency == "USD";
            var ars = p.Total * (usd ? Rate(p.ExchangeRate) : 1m);
            var nc = IsCredit(p.InvoiceType);
            Push(Key(p.IssueDate, p.CreatedAtUtc), p.IssueDate, Label(p.InvoiceType, usd, true),
                $"{p.PointOfSale:D4}-{p.InvoiceNumber:D8}",
                usd ? $"{(nc ? "NC" : "Factura")} Proveedor USD @ TC $ {Rate(p.ExchangeRate).ToString("#,0.######", AR)}"
                    : p.Notes ?? (nc ? "Nota de crédito de proveedor" : "Factura de proveedor"),
                usd ? Money(p.Total, "USD") : null, nc ? ars : 0m, nc ? 0m : ars, "purchase");
        }

        foreach (var po in s.Payments.Where(p => p.SupplierId == entityId))
        {
            var voided = Voided(po.Status);
            Push(Key(po.PaymentDateUtc, po.CreatedAtUtc), po.PaymentDateUtc,
                voided ? $"Orden de Pago ANULADA ({po.Currency})" : $"Orden de Pago ({po.Currency})", po.OrderNumber,
                voided ? $"Anulada{(po.VoidReason is null ? "" : $": {po.VoidReason}")}" : po.Notes ?? "Pago emitido a proveedor",
                po.Currency == "USD" ? Money(po.Amount, "USD") : null, po.Amount, 0m, "payment", voided);
            if (voided)
            {
                var at = po.VoidedAtUtc ?? po.PaymentDateUtc;
                Push(Key(at, po.VoidedAtUtc), at, "Anulación de pago", po.OrderNumber,
                    po.VoidReason ?? "Reversa por anulación de la OP", null, 0m, po.Amount, "void", true);
            }
        }

        foreach (var d in PendingDifferences(s, entityId))
        {
            var invoice = s.Sales.FirstOrDefault(i => i.Id == d.InvoiceId);
            Push(Key(d.Date, null, "~"), d.Date,
                d.DifferenceArs > 0 ? "Diferencia de cambio a documentar (ND)" : "Diferencia de cambio a documentar (NC)",
                $"{d.ReceiptNumber} → {invoice?.FormattedNumber ?? "factura"}",
                $"USD {d.AmountUsd.ToString("#,0.00", AR)} cobrados a TC $ {d.PaymentRate.ToString("#,0.######", AR)} vs TC $ {d.InvoiceRate.ToString("#,0.######", AR)} de la factura",
                null, Math.Max(0m, d.DifferenceArs), Math.Max(0m, -d.DifferenceArs), "adjustment", false, null, d);
        }

        // Saldo de la cuenta: clientes suman lo que deben; proveedores restan lo que les debemos.
        var running = 0m;
        return rows.OrderBy(r => r.SortKey, StringComparer.Ordinal).Select(r =>
        {
            var item = r.Item;
            running += item.Source switch
            {
                "sale" or "adjustment" => item.Debit - item.Credit,
                "collection" => -item.Credit,
                "purchase" => item.Debit - item.Credit,
                "payment" => item.Debit,
                "void" => item.Debit - item.Credit,
                _ => 0m
            };
            return item with { Balance = decimal.Round(running, 2) };
        }).ToList();
    }
}
