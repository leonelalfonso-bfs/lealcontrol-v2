using LealControl.BuildingBlocks.Tenancy;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Sales.Infrastructure.Persistence;

/// <summary>Cobrado, acreditado y pendiente de una factura, en la moneda de la factura.</summary>
public sealed record ReceivableBalance(decimal Collected, decimal Credited, decimal Pending);

/// <summary>
/// Saldo de cada comprobante de venta, calculado en el servidor: única fuente de verdad para
/// Facturas, Cobranzas, Cuenta corriente y el tablero. Reglas:
/// - Lo cobrado sale de las imputaciones activas de recibos no anulados, por id de factura.
///   En una factura en dólares cobrada en pesos cuentan los USD de la imputación.
/// - Recibos viejos sin imputaciones cuentan por su factura (InvoiceId).
/// - Las notas de crédito autorizadas descuentan el saldo de su factura, salvo las de
///   diferencia de cambio, que se cancelan con el cobro que las origina.
/// - Una nota de crédito, o una nota por diferencia de cambio, no es un saldo a cobrar.
/// </summary>
internal static class ReceivableBalances
{
    private sealed record InvoiceRow(Guid Id, string InvoiceType, string Status, string Currency,
        decimal ExchangeRate, decimal Total, Guid? AssociatedInvoiceId, Guid? ExchangeDifferenceImputationId);

    private sealed record ImputationRow(Guid ReceiptId, Guid InvoiceId, decimal AmountImputed, decimal? AmountUsd,
        string ReceiptCurrency, decimal? PaymentExchangeRate);

    private sealed record LegacyReceiptRow(Guid InvoiceId, decimal Amount, string Currency,
        decimal? PaymentExchangeRate, decimal? InvoiceAmount, string? InvoiceCurrency);

    public static async Task<IReadOnlyDictionary<Guid, ReceivableBalance>> ComputeAsync(
        SalesDbContext db, TenantId tenantId, CancellationToken ct)
    {
        var invoices = await db.Invoices.AsNoTracking()
            .Where(i => i.TenantId == tenantId && i.Status != "Cancelled")
            .Select(i => new InvoiceRow(i.Id, i.InvoiceType, i.Status, i.Currency, i.ExchangeRate, i.Total,
                i.AssociatedInvoiceId, i.ExchangeDifferenceImputationId))
            .ToListAsync(ct);

        var imputations = new List<ImputationRow>();
        var legacy = new List<LegacyReceiptRow>();
        // Cobranzas vive en el esquema finance; en una base sin ese módulo no hay cobros.
        var financeReady = await db.Database
            .SqlQuery<bool>($"""SELECT to_regclass('finance."CollectionReceiptImputations"') IS NOT NULL AS "Value" """)
            .SingleAsync(ct);
        if (financeReady)
        {
            imputations = await db.Database.SqlQuery<ImputationRow>($"""
                SELECT i."ReceiptId", i."InvoiceId", i."AmountImputed", i."AmountUsd",
                       r."Currency" AS "ReceiptCurrency", r."PaymentExchangeRate"
                FROM finance."CollectionReceiptImputations" i
                JOIN finance."CollectionReceipts" r ON r."Id" = i."ReceiptId" AND r."TenantId" = i."TenantId"
                WHERE i."TenantId" = {tenantId.Value} AND i."Status" = 'Active' AND r."Status" <> 'Voided'
                """).ToListAsync(ct);
            legacy = await db.Database.SqlQuery<LegacyReceiptRow>($"""
                SELECT r."InvoiceId" AS "InvoiceId", r."Amount", r."Currency", r."PaymentExchangeRate",
                       r."InvoiceAmount", r."InvoiceCurrency"
                FROM finance."CollectionReceipts" r
                WHERE r."TenantId" = {tenantId.Value} AND r."Status" <> 'Voided' AND r."InvoiceId" IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM finance."CollectionReceiptImputations" i
                                  WHERE i."ReceiptId" = r."Id" AND i."TenantId" = r."TenantId")
                """).ToListAsync(ct);
        }

        var byId = invoices.ToDictionary(i => i.Id);
        var collected = new Dictionary<Guid, decimal>();
        void Add(Guid invoiceId, decimal amount) =>
            collected[invoiceId] = collected.GetValueOrDefault(invoiceId) + amount;

        foreach (var imp in imputations)
        {
            if (!byId.TryGetValue(imp.InvoiceId, out var inv)) continue;
            if (inv.Currency != "USD" || imp.ReceiptCurrency == "USD")
                Add(inv.Id, imp.AmountImputed);
            else if (imp.AmountUsd is > 0m)
                Add(inv.Id, imp.AmountUsd.Value);
            else
                Add(inv.Id, imp.AmountImputed / Rate(imp.PaymentExchangeRate, inv.ExchangeRate));
        }
        foreach (var r in legacy)
        {
            if (!byId.TryGetValue(r.InvoiceId, out var inv)) continue;
            if (inv.Currency != "USD" || r.Currency == "USD")
                Add(inv.Id, r.Amount);
            else if (r.InvoiceAmount is > 0m && r.InvoiceCurrency == "USD")
                Add(inv.Id, r.InvoiceAmount.Value);
            else
                Add(inv.Id, r.Amount / Rate(r.PaymentExchangeRate, inv.ExchangeRate));
        }

        var credited = invoices
            .Where(n => n.InvoiceType.StartsWith("NC", StringComparison.Ordinal) && n.Status == "Authorized" &&
                        n.AssociatedInvoiceId.HasValue && n.ExchangeDifferenceImputationId is null)
            .GroupBy(n => n.AssociatedInvoiceId!.Value)
            .ToDictionary(g => g.Key, g => g.Sum(n => n.Total));

        return invoices.ToDictionary(i => i.Id, i =>
        {
            var paid = decimal.Round(collected.GetValueOrDefault(i.Id), 2);
            var settled = i.InvoiceType.StartsWith("NC", StringComparison.Ordinal) || i.ExchangeDifferenceImputationId.HasValue;
            var credit = settled ? 0m : credited.GetValueOrDefault(i.Id);
            var pending = settled ? 0m : Math.Max(0m, decimal.Round(i.Total - paid - credit, 2));
            return new ReceivableBalance(paid, credit, pending);
        });
    }

    private static decimal Rate(decimal? payment, decimal invoice) =>
        payment is > 0m ? payment.Value : invoice > 0m ? invoice : 1m;
}
