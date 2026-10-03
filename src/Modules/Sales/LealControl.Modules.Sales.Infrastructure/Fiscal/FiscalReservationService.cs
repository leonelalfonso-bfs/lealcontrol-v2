using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Contracts.Fiscal;
using LealControl.Modules.Sales.Domain.Invoices;
using LealControl.Modules.Sales.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace LealControl.Modules.Sales.Infrastructure.Fiscal;

public sealed record FiscalReservationResult(
    bool Ok, Guid? AttemptId, long? VoucherNumber, string Detail);

/// <summary>Reserva y confirma en base el número antes de cualquier FECAESolicitar.</summary>
public sealed class FiscalReservationService
{
    private readonly SalesDbContext _db;
    private readonly ITenantContext _tenant;
    private readonly IArcaFiscalGateway _gateway;

    public FiscalReservationService(SalesDbContext db, ITenantContext tenant,
        IArcaFiscalGateway gateway)
    {
        _db = db;
        _tenant = tenant;
        _gateway = gateway;
    }

    public async Task<FiscalReservationResult> ReserveAsync(Guid invoiceId, CancellationToken ct)
    {
        var tenantId = _tenant.TenantId;
        if (tenantId.Value == Guid.Empty || invoiceId == Guid.Empty)
            return Fail("Empresa o borrador inválido.");
        var invoice = await _db.Invoices.Include(i => i.Items).AsNoTracking()
            .FirstOrDefaultAsync(i => i.Id == invoiceId && i.TenantId == tenantId, ct);
        if (invoice is null)
            return Fail("No se encontró el borrador en esta empresa.");
        if (!WsfeInvoiceAServicePreparation.TryBuild(invoice, out var data, out var error) || data is null)
            return Fail(error);
        if (await _db.FiscalAuthorizationAttempts.AnyAsync(a =>
                a.TenantId == tenantId && a.InvoiceId == invoiceId, ct))
            return Fail("El borrador ya tiene una reserva fiscal; consultar su estado antes de reintentar.");

        var numbering = await _gateway.GetLastAuthorizedAsync(
            invoice.PointOfSale, data.VoucherType, ct);
        if (!numbering.Ok || numbering.LastNumber < 0 || numbering.LastNumber >= 99_999_999)
            return Fail("No se pudo verificar el último número autorizado en ARCA.");
        var number = numbering.LastNumber + 1;
        string fingerprint;
        try
        {
            fingerprint = WsfeCaeRequestBuilder.Fingerprint(
                data, invoice.PointOfSale, number, numbering.IssuerCuit);
        }
        catch (ArgumentException)
        {
            return Fail("La numeración o el emisor no permiten reservar el comprobante.");
        }

        await using var transaction = await _db.Database.BeginTransactionAsync(ct);
        await _db.Database.ExecuteSqlInterpolatedAsync(
            $@"SELECT 1 FROM sales.invoices WHERE ""Id"" = {invoiceId} AND ""TenantId"" = {tenantId.Value} FOR UPDATE", ct);
        var current = await _db.Invoices.Include(i => i.Items)
            .FirstOrDefaultAsync(i => i.Id == invoiceId && i.TenantId == tenantId, ct);
        if (current is null ||
            !WsfeInvoiceAServicePreparation.TryBuild(current, out var currentData, out _) ||
            currentData is null || currentData != data ||
            await _db.FiscalAuthorizationAttempts.AnyAsync(a =>
                a.TenantId == tenantId && a.InvoiceId == invoiceId, ct) ||
            await _db.FiscalAuthorizationAttempts.AnyAsync(a =>
                a.TenantId == tenantId && a.PointOfSale == invoice.PointOfSale &&
                a.VoucherType == data.VoucherType &&
                (a.Status == "Reserved" || a.Status == "Pending" || a.Status == "Unknown"), ct))
            return Fail("El borrador cambió o hay una reserva pendiente; resolverla antes de continuar.");

        var attempt = FiscalAuthorizationAttempt.Reserve(tenantId, invoiceId,
            invoice.PointOfSale, data.VoucherType, number, numbering.IssuerCuit,
            numbering.Production, fingerprint, data.ReceiverCuit, data.TotalAmount);
        _db.FiscalAuthorizationAttempts.Add(attempt);
        try
        {
            await _db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException pg &&
                                            pg.SqlState == PostgresErrorCodes.UniqueViolation)
        {
            return Fail("El número fue reservado por otra operación; consultar ARCA antes de continuar.");
        }
        return new(true, attempt.Id, number, "Número fiscal reservado, aún sin envío a ARCA.");
    }

    private static FiscalReservationResult Fail(string detail) =>
        new(false, null, null, detail);
}
