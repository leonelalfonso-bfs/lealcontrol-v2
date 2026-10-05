using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Contracts.Fiscal;
using LealControl.Modules.Sales.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Sales.Infrastructure.Fiscal;

public sealed record FiscalRecoveryResult(bool Confirmed, long? VoucherNumber, string Detail);

/// <summary>Consulta un envío incierto por su número reservado; nunca envía CAE.</summary>
public sealed class FiscalVoucherRecoveryService
{
    private readonly SalesDbContext _db;
    private readonly ITenantContext _tenant;
    private readonly IArcaFiscalGateway _gateway;

    public FiscalVoucherRecoveryService(SalesDbContext db, ITenantContext tenant, IArcaFiscalGateway gateway)
    {
        _db = db;
        _tenant = tenant;
        _gateway = gateway;
    }

    public async Task<FiscalRecoveryResult> RecoverAsync(Guid invoiceId, CancellationToken ct, WsfeCaeReply? submission = null)
    {
        var tenantId = _tenant.TenantId;
        if (tenantId.Value == Guid.Empty || invoiceId == Guid.Empty)
            return Fail("Empresa o borrador inválido.");
        var saved = await _db.FiscalAuthorizationAttempts.AsNoTracking()
            .FirstOrDefaultAsync(a => a.TenantId == tenantId && a.InvoiceId == invoiceId, ct);
        if (saved is null)
            return Fail("No hay reserva fiscal de este borrador en la empresa.");
        if (saved.Status == "Reserved")
            return Fail("La reserva aún no se envió a ARCA.");
        if (saved.Status == "Rejected")
            return Fail("La reserva fue rechazada y requiere revisión.");
        if (saved.Status == "Confirmed")
        {
            var authorized = await _db.Invoices.AsNoTracking().AnyAsync(i =>
                i.Id == invoiceId && i.TenantId == tenantId && i.Status == "Authorized" &&
                i.InvoiceNumber == saved.VoucherNumber && i.Cae == saved.Cae, ct);
            return authorized
                ? new(true, saved.VoucherNumber, "El comprobante ya está confirmado.")
                : Fail("La reserva y el comprobante requieren revisión.");
        }
        if (saved.Status is not ("Pending" or "Unknown"))
            return Fail("Estado fiscal desconocido; requiere revisión.");

        ArcaFiscalVoucherObservation observation;
        try
        {
            observation = await _gateway.GetVoucherAsync(saved.PointOfSale, saved.VoucherType,
                saved.VoucherNumber, saved.IssuerCuit, saved.Production, ct);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception)
        {
            observation = new(false, 0, string.Empty, 0m, string.Empty, default,
                "No se pudo comprobar el número reservado en ARCA.");
        }

        await using var tx = await _db.Database.BeginTransactionAsync(ct);
        await _db.Database.ExecuteSqlInterpolatedAsync(
            $@"SELECT 1 FROM sales.invoices WHERE ""Id"" = {invoiceId} AND ""TenantId"" = {tenantId.Value} FOR UPDATE", ct);
        await _db.Database.ExecuteSqlInterpolatedAsync(
            $@"SELECT 1 FROM sales.fiscal_authorization_attempts WHERE ""Id"" = {saved.Id} AND ""TenantId"" = {tenantId.Value} FOR UPDATE", ct);
        _db.ChangeTracker.Clear();
        var attempt = await _db.FiscalAuthorizationAttempts
            .FirstOrDefaultAsync(a => a.Id == saved.Id && a.TenantId == tenantId && a.InvoiceId == invoiceId, ct);
        var invoice = await _db.Invoices.Include(i => i.Items)
            .FirstOrDefaultAsync(i => i.Id == invoiceId && i.TenantId == tenantId, ct);
        if (attempt is null || invoice is null)
            return Fail("La reserva o el borrador ya no existen.");
        if (attempt.Status == "Confirmed" && invoice.Status == "Authorized" &&
            attempt.VoucherNumber == invoice.InvoiceNumber && attempt.Cae == invoice.Cae)
            return new(true, attempt.VoucherNumber, "El comprobante ya está confirmado.");
        if (attempt.Status is not ("Pending" or "Unknown") || invoice.Status != "Draft")
            return Fail("El estado fiscal cambió durante la consulta; requiere revisión.");

        if (observation.Confirmed && observation.FiscalData is not null)
        {
            try
            {
                var qr = ArcaFiscalQrBuilder.Build(observation.FiscalData, attempt.IssuerCuit,
                    attempt.PointOfSale, attempt.VoucherNumber, observation.Cae);
                var found = new WsfeVoucherReconciliation.Observation(observation.Confirmed,
                    observation.Number, observation.RecipientDocument, observation.Total,
                    observation.Cae, observation.CaeDueDate, observation.FiscalData);
                if (WsfeVoucherReconciliation.TryConfirm(invoice, attempt, attempt.IssuerCuit,
                    found, submission, qr, out _))
                {
                    await _db.SaveChangesAsync(ct);
                    await tx.CommitAsync(ct);
                    return new(true, attempt.VoucherNumber, "Comprobante confirmado contra ARCA.");
                }
            }
            catch (ArgumentException)
            {
                // Un QR inválido no habilita la confirmación ni un nuevo envío.
            }
        }

        if (attempt.Status == "Pending") attempt.MarkUnknown();
        await _db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Fail("ARCA no confirmó todos los datos del número reservado; requiere revisión.");
    }

    private static FiscalRecoveryResult Fail(string detail) => new(false, null, detail);
}
