using System.Globalization;
using LealControl.Modules.Crm.Contracts.Fiscal;
using LealControl.Modules.Sales.Domain.Invoices;
using LealControl.Modules.Sales.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Sales.Infrastructure.Fiscal;

/// <summary>Comprobante original de una nota de crédito o débito, tal como ARCA lo autorizó.</summary>
internal static class FiscalAssociation
{
    public static async Task<(bool Ok, WsfeAssociatedVoucher? Voucher)> LoadAsync(
        SalesDbContext db, Invoice note, CancellationToken ct)
    {
        if (note.AssociatedInvoiceId is not Guid originalId)
            return (true, null);
        var original = await db.Invoices.AsNoTracking()
            .FirstOrDefaultAsync(i => i.Id == originalId && i.TenantId == note.TenantId, ct);
        var attempt = await db.FiscalAuthorizationAttempts.AsNoTracking()
            .FirstOrDefaultAsync(a => a.TenantId == note.TenantId && a.InvoiceId == originalId &&
                                      a.Status == "Confirmed", ct);
        if (original is null || attempt is null || original.Status != "Authorized" ||
            FiscalVoucherCodes.For(original.InvoiceType) is not { } type ||
            attempt.VoucherType != type || attempt.VoucherNumber != original.InvoiceNumber ||
            attempt.PointOfSale != original.PointOfSale)
            return (false, null);
        return (true, new WsfeAssociatedVoucher(type, original.PointOfSale, original.InvoiceNumber,
            attempt.IssuerCuit, original.IssueDate.ToString("yyyyMMdd", CultureInfo.InvariantCulture)));
    }

    public const string Unavailable = "La factura original de esta nota no está autorizada en ARCA.";
}
