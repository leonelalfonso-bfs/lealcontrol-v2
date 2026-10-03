using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Contracts.Fiscal;
using LealControl.Modules.Sales.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Sales.Infrastructure.Fiscal;

/// <summary>Persiste el inicio del envío antes de solicitar CAE; los reintentos solo consultan.</summary>
public sealed class FiscalAuthorizationService
{
    private readonly SalesDbContext _db;
    private readonly ITenantContext _tenant;
    private readonly IArcaFiscalGateway _gateway;
    private readonly FiscalReservationService _reservation;
    private readonly FiscalVoucherRecoveryService _recovery;
    private readonly TimeProvider _clock;

    public FiscalAuthorizationService(SalesDbContext db, ITenantContext tenant,
        IArcaFiscalGateway gateway, FiscalReservationService reservation,
        FiscalVoucherRecoveryService recovery, TimeProvider? clock = null)
    {
        _db = db;
        _tenant = tenant;
        _gateway = gateway;
        _reservation = reservation;
        _recovery = recovery;
        _clock = clock ?? TimeProvider.System;
    }

    public async Task<FiscalRecoveryResult> AuthorizeAsync(Guid invoiceId, CancellationToken ct)
    {
        var tenantId = _tenant.TenantId;
        if (tenantId.Value == Guid.Empty || invoiceId == Guid.Empty)
            return Fail("Empresa o borrador inválido.");
        var existing = await _db.FiscalAuthorizationAttempts.AsNoTracking()
            .FirstOrDefaultAsync(a => a.TenantId == tenantId && a.InvoiceId == invoiceId, ct);
        if (existing is null)
        {
            var reserved = await _reservation.ReserveAsync(invoiceId, ct);
            if (!reserved.Ok) return Fail(reserved.Detail);
        }
        else if (existing.Status != "Reserved")
        {
            return await _recovery.RecoverAsync(invoiceId, ct);
        }

        IWsfeInvoiceAServiceData data;
        int point;
        long number;
        string issuer;
        bool production;
        Guid attemptId;
        await using (var tx = await _db.Database.BeginTransactionAsync(ct))
        {
            await _db.Database.ExecuteSqlInterpolatedAsync(
                $@"SELECT 1 FROM sales.invoices WHERE ""Id"" = {invoiceId} AND ""TenantId"" = {tenantId.Value} FOR UPDATE", ct);
            _db.ChangeTracker.Clear();
            var attempt = await _db.FiscalAuthorizationAttempts
                .FirstOrDefaultAsync(a => a.TenantId == tenantId && a.InvoiceId == invoiceId, ct);
            var invoice = await _db.Invoices.Include(i => i.Items)
                .FirstOrDefaultAsync(i => i.TenantId == tenantId && i.Id == invoiceId, ct);
            if (attempt is null || invoice is null)
                return Fail("La reserva o el borrador ya no existen.");
            // Otro proceso pudo persistir el envío mientras esperábamos el bloqueo.
            if (attempt.Status != "Reserved")
                return Fail("El envío ya fue iniciado por otra operación; consultar su estado.");
            if (!WsfeInvoiceAServicePreparation.TryBuild(invoice, out var prepared, out var error)
                || prepared is null)
                return Fail(error);
            if (!FiscalEmissionDateRule.IsAllowed(prepared.IssueDate, _clock.GetUtcNow()))
                return Fail("La fecha de emisión quedó fuera de la ventana permitida; la reserva no se envió y requiere revisión.");
            if (invoice.PointOfSale != attempt.PointOfSale || prepared.VoucherType != attempt.VoucherType
                || prepared.ReceiverCuit != attempt.RecipientDocument || prepared.TotalAmount != attempt.Total
                || WsfeCaeRequestBuilder.Fingerprint(prepared, attempt.PointOfSale,
                    attempt.VoucherNumber, attempt.IssuerCuit) != attempt.RequestHash)
                return Fail("El borrador cambió después de reservar; requiere revisión.");
            data = prepared;
            point = attempt.PointOfSale;
            number = attempt.VoucherNumber;
            issuer = attempt.IssuerCuit;
            production = attempt.Production;
            attemptId = attempt.Id;
            attempt.MarkDispatching();
            await _db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }

        WsfeCaeReply reply;
        try
        {
            reply = await _gateway.SubmitCaeAsync(data, point, number, issuer, production, ct);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            // Pending ya quedó confirmado en base; un nuevo intento solo consultará.
            throw;
        }
        catch (Exception)
        {
            reply = new(WsfeCaeOutcome.Unknown, null, null,
                "No se pudo confirmar el envío; consultar el número reservado.");
        }

        if (reply.Outcome == WsfeCaeOutcome.Rejected)
        {
            await using var tx = await _db.Database.BeginTransactionAsync(ct);
            await _db.Database.ExecuteSqlInterpolatedAsync(
                $@"SELECT 1 FROM sales.invoices WHERE ""Id"" = {invoiceId} AND ""TenantId"" = {tenantId.Value} FOR UPDATE", ct);
            _db.ChangeTracker.Clear();
            var attempt = await _db.FiscalAuthorizationAttempts.FirstOrDefaultAsync(a =>
                a.Id == attemptId && a.TenantId == tenantId && a.InvoiceId == invoiceId, ct);
            if (attempt?.Status == "Pending") attempt.Reject();
            await _db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return Fail("ARCA rechazó la solicitud; revisar la reserva antes de continuar.");
        }
        return await _recovery.RecoverAsync(invoiceId, ct, reply);
    }

    private static FiscalRecoveryResult Fail(string detail) => new(false, null, detail);
}
