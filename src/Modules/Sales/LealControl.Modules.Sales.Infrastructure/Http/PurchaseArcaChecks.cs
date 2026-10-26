using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Contracts.Fiscal;
using LealControl.Modules.Sales.Domain.Invoices;
using LealControl.Modules.Sales.Domain.Purchases;
using LealControl.Modules.Sales.Infrastructure.Persistence;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Sales.Infrastructure.Http;

/// <summary>
/// Constatación de facturas de compra contra ARCA (wscdc): confirma que el comprobante del proveedor existe con ese CAE,
/// tipo, punto de venta, número, fecha, total y receptor. Guarda el último resultado de cada factura.
/// </summary>
public static class PurchaseArcaChecks
{
    public sealed record CheckRow(Guid PurchaseInvoiceId, string Outcome, string Detail, DateTime CheckedAt);
    public sealed record PeriodRequest(DateTime From, DateTime To);

    /// <summary>Lo que se le manda a ARCA, o por qué no se puede constatar.</summary>
    public static (ArcaReceivedVoucher? Voucher, string? Problem) ToVoucher(PurchaseInvoice invoice)
    {
        var type = FiscalVoucherCodes.Any(invoice.InvoiceType);
        if (type is null) return (null, $"El tipo {invoice.InvoiceType} no se puede constatar.");
        var cae = new string((invoice.Cae ?? "").Where(char.IsAsciiDigit).ToArray());
        if (cae.Length != 14) return (null, "La factura no tiene el CAE cargado (14 dígitos).");
        var cuit = new string(invoice.SupplierDocument.Where(char.IsAsciiDigit).ToArray());
        if (cuit.Length != 11) return (null, "El proveedor no tiene CUIT.");
        return (new ArcaReceivedVoucher(cuit, invoice.PointOfSale, type.Value, invoice.InvoiceNumber, DateOnly.FromDateTime(invoice.IssueDate), invoice.Total, cae), null);
    }

    private static async Task<CheckRow> CheckAsync(PurchaseInvoice invoice, IArcaFiscalGateway arca, SalesDbContext db, CancellationToken ct)
    {
        var (voucher, problem) = ToVoucher(invoice);
        var (outcome, detail) = voucher is null
            ? ("NotCheckable", problem!)
            : await arca.VerifyReceivedVoucherAsync(voucher, ct) is var r ? (r.Outcome.ToString(), r.Detail) : default;
        var row = new CheckRow(invoice.Id, outcome, detail.Length > 500 ? detail[..500] : detail, DateTime.UtcNow);
        await db.Database.ExecuteSqlRawAsync(
            @"INSERT INTO purchases.purchase_invoice_arca_checks (purchase_invoice_id, tenant_id, outcome, detail, checked_at) VALUES ({0}, {1}, {2}, {3}, {4})
              ON CONFLICT (purchase_invoice_id) DO UPDATE SET outcome = EXCLUDED.outcome, detail = EXCLUDED.detail, checked_at = EXCLUDED.checked_at",
            [row.PurchaseInvoiceId, invoice.TenantId.Value, row.Outcome, row.Detail, row.CheckedAt], ct);
        return row;
    }

    public static void MapPurchaseArcaChecks(this RouteGroupBuilder purchases)
    {
        purchases.MapGet("/invoices/arca-checks", async (SalesDbContext db, ITenantContext tenant, CancellationToken ct) =>
            Results.Ok(await db.Database.SqlQueryRaw<CheckRow>(
                @"SELECT purchase_invoice_id AS ""PurchaseInvoiceId"", outcome AS ""Outcome"", detail AS ""Detail"", checked_at AS ""CheckedAt""
                  FROM purchases.purchase_invoice_arca_checks WHERE tenant_id = {0}", tenant.TenantId.Value).ToListAsync(ct)));

        purchases.MapPost("/invoices/{id:guid}/arca-check", async (Guid id, SalesDbContext db, ITenantContext tenant, IArcaFiscalGateway arca, CancellationToken ct) =>
        {
            var invoice = await db.Set<PurchaseInvoice>().AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenant.TenantId, ct);
            return invoice is null ? Results.NotFound(new { detail = "Factura de compra no encontrada." }) : Results.Ok(await CheckAsync(invoice, arca, db, ct));
        });

        // Las del período que todavía no quedaron constatadas (de a una: ARCA no tiene consulta masiva).
        purchases.MapPost("/invoices/arca-check", async (PeriodRequest req, SalesDbContext db, ITenantContext tenant, IArcaFiscalGateway arca, CancellationToken ct) =>
        {
            var approved = await db.Database.SqlQueryRaw<Guid>(
                @"SELECT purchase_invoice_id AS ""Value"" FROM purchases.purchase_invoice_arca_checks WHERE tenant_id = {0} AND outcome = 'Approved'",
                tenant.TenantId.Value).ToListAsync(ct);
            var invoices = await db.Set<PurchaseInvoice>().AsNoTracking()
                .Where(x => x.TenantId == tenant.TenantId && x.Status != "Cancelled" && x.IssueDate >= req.From && x.IssueDate <= req.To && !approved.Contains(x.Id))
                .OrderBy(x => x.IssueDate).Take(200).ToListAsync(ct);
            var rows = new List<CheckRow>();
            foreach (var invoice in invoices)
            {
                var row = await CheckAsync(invoice, arca, db, ct);
                rows.Add(row);
                // Si ARCA no responde o el certificado no tiene el servicio, no tiene sentido seguir.
                if (row.Outcome == nameof(ArcaVoucherCheckOutcome.Unavailable)) break;
            }
            return Results.Ok(new
            {
                Checked = rows.Count,
                Approved = rows.Count(r => r.Outcome == nameof(ArcaVoucherCheckOutcome.Approved)),
                Rejected = rows.Count(r => r.Outcome == nameof(ArcaVoucherCheckOutcome.Rejected)),
                NotCheckable = rows.Count(r => r.Outcome == "NotCheckable"),
                Unavailable = rows.FirstOrDefault(r => r.Outcome == nameof(ArcaVoucherCheckOutcome.Unavailable))?.Detail,
                Rows = rows
            });
        });
    }
}
