using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Contracts.Fiscal;
using LealControl.Modules.Sales.Domain.Invoices;
using LealControl.Modules.Sales.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace LealControl.Modules.Sales.Infrastructure.Fiscal;

public sealed record FiscalReservationResult(
    bool Ok, Guid? AttemptId, long? VoucherNumber, string Detail);

/// <summary>
/// Qué ambientes de ARCA puede usar este servidor para emitir. Por defecto solo homologación:
/// un staging con una empresa configurada en producción no puede generar facturas reales.
/// Se habilita con Arca:AllowProductionAuthorization=true únicamente en el servidor de producción.
/// </summary>
public sealed record FiscalEmissionPolicy(bool AllowProduction);

/// <summary>Reserva y confirma en base el número antes de cualquier FECAESolicitar.</summary>
public sealed class FiscalReservationService
{
    private readonly SalesDbContext _db;
    private readonly ITenantContext _tenant;
    private readonly IArcaFiscalGateway _gateway;
    private readonly TimeProvider _clock;
    private readonly FiscalEmissionPolicy _policy;

    public FiscalReservationService(SalesDbContext db, ITenantContext tenant,
        IArcaFiscalGateway gateway, TimeProvider? clock = null, FiscalEmissionPolicy? policy = null)
    {
        _db = db;
        _tenant = tenant;
        _gateway = gateway;
        _clock = clock ?? TimeProvider.System;
        _policy = policy ?? new FiscalEmissionPolicy(AllowProduction: false);
    }

    // Desde este total en pesos se consulta si el cliente debe recibir FCE (mínimo vigente: $5.549.862).
    public const decimal FceCheckThreshold = 1_000_000m;

    public async Task<FiscalReservationResult> ReserveAsync(Guid invoiceId, CancellationToken ct)
    {
        var tenantId = _tenant.TenantId;
        if (tenantId.Value == Guid.Empty || invoiceId == Guid.Empty)
            return Fail("Empresa o borrador inválido.");
        var invoice = await _db.Invoices.Include(i => i.Items).AsNoTracking()
            .FirstOrDefaultAsync(i => i.Id == invoiceId && i.TenantId == tenantId, ct);
        if (invoice is null)
            return Fail("No se encontró el borrador en esta empresa.");
        var (associationOk, associated) = await FiscalAssociation.LoadAsync(_db, invoice, ct);
        if (!associationOk)
            return Fail(FiscalAssociation.Unavailable);
        if (!WsfeVoucherPreparation.TryBuild(invoice, out var data, out var error, associated) || data is null)
            return Fail(error);
        if (!FiscalEmissionDateRule.IsAllowed(data.IssueDate, data.Concept, _clock.GetUtcNow(), data.VoucherType))
            return Fail(data.IsFce
                ? (WsfeCaeRequestBuilder.IsFceInvoice(data.VoucherType)
                    ? "La Factura de Crédito Electrónica debe tener fecha entre 5 días atrás y mañana (Argentina)."
                    : "Las notas de la Factura de Crédito Electrónica deben tener fecha de hoy o de hasta 5 días atrás (Argentina).")
                : data.Concept == 1
                ? "La fecha de emisión debe estar dentro de los cinco días anteriores o posteriores a la fecha actual de Argentina."
                : "La fecha de emisión debe estar dentro de los diez días anteriores o posteriores a la fecha actual de Argentina.");
        if (await _db.FiscalAuthorizationAttempts.AnyAsync(a =>
                a.TenantId == tenantId && a.InvoiceId == invoiceId, ct))
            return Fail("El borrador ya tiene una reserva fiscal; consultar su estado antes de reintentar.");

        // RG 5616: si se cancela en la misma moneda extranjera, la cotización debe ser
        // exactamente la oficial de ARCA. Se verifica antes de reservar el número.
        if (data.PaidInSameForeignCurrency == true)
        {
            var official = await _gateway.GetExchangeRateAsync(data.CurrencyCode,
                FiscalExchangeRateDate.For(data.IssueDate, _clock.GetUtcNow()), ct);
            if (!official.Ok)
                return Fail($"No se pudo verificar la cotización oficial en ARCA: {official.Detail}");
            if (official.Rate != data.ExchangeRate)
                return Fail($"La cotización del borrador ({data.ExchangeRate:0.######}) no coincide con la oficial de ARCA " +
                    $"({official.Rate:0.######}{RateDateText(official)}). Usá \"Cotización ARCA\" para actualizarla.");
        }

        // Factura común a un cliente obligado a recibir FCE por este importe: no se autoriza.
        // Debajo del umbral de consulta ningún cliente está obligado (el mínimo vigente es mayor).
        if (data.VoucherType is 1 or 6 && data.ReceiverDocumentType == 80 &&
            data.TotalAmount * data.ExchangeRate >= FceCheckThreshold)
        {
            var obligation = await _gateway.GetFceObligationAsync(data.ReceiverDocumentNumber,
                DateOnly.ParseExact(data.IssueDate, "yyyyMMdd"), ct);
            if (!obligation.Ok)
                return Fail($"No se pudo verificar en ARCA si corresponde Factura de Crédito Electrónica: {obligation.Detail}");
            if (obligation.Obligated && data.TotalAmount * data.ExchangeRate >= obligation.MinimumAmount)
                return Fail($"Este cliente está obligado a recibir Factura de Crédito Electrónica desde $ {obligation.MinimumAmount:N2}: emití una FCE en lugar de una factura común.");
        }

        // Y al revés: una FCE solo si el cliente está obligado y el importe llega al mínimo vigente.
        if (WsfeCaeRequestBuilder.IsFceInvoice(data.VoucherType))
        {
            var obligation = await _gateway.GetFceObligationAsync(data.ReceiverDocumentNumber,
                DateOnly.ParseExact(data.IssueDate, "yyyyMMdd"), ct);
            if (!obligation.Ok)
                return Fail($"No se pudo verificar en ARCA si corresponde Factura de Crédito Electrónica: {obligation.Detail}");
            if (!obligation.Obligated)
                return Fail("Este cliente no está obligado a recibir Factura de Crédito Electrónica: emití una factura común.");
            if (data.TotalAmount * data.ExchangeRate < obligation.MinimumAmount)
                return Fail($"Por este importe corresponde factura común: el cliente recibe Factura de Crédito Electrónica desde $ {obligation.MinimumAmount:N2}.");
        }

        var numbering = await _gateway.GetLastAuthorizedAsync(
            invoice.PointOfSale, data.VoucherType, ct);
        if (!numbering.Ok || numbering.LastNumber < 0 || numbering.LastNumber >= 99_999_999)
            return Fail(string.IsNullOrWhiteSpace(numbering.Detail)
                ? "No se pudo verificar el último número autorizado en ARCA." : numbering.Detail);
        // Antes de reservar: no se deja ninguna reserva colgada si el ambiente no está permitido.
        if (numbering.Production && !_policy.AllowProduction)
            return Fail("La emisión en ARCA producción está deshabilitada en este servidor. "
                + "Esta empresa tiene configurado el ambiente de producción: usá homologación para probar.");
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
            !WsfeVoucherPreparation.TryBuild(current, out var currentData, out _, associated) ||
            currentData is null || currentData.RequestKey() != data.RequestKey() ||
            await _db.FiscalAuthorizationAttempts.AnyAsync(a =>
                a.TenantId == tenantId && a.InvoiceId == invoiceId, ct) ||
            await _db.FiscalAuthorizationAttempts.AnyAsync(a =>
                a.TenantId == tenantId && a.PointOfSale == invoice.PointOfSale &&
                a.VoucherType == data.VoucherType &&
                (a.Status == "Reserved" || a.Status == "Pending" || a.Status == "Unknown"), ct))
            return Fail("El borrador cambió o hay una reserva pendiente; resolverla antes de continuar.");

        var attempt = FiscalAuthorizationAttempt.Reserve(tenantId, invoiceId,
            invoice.PointOfSale, data.VoucherType, number, numbering.IssuerCuit,
            numbering.Production, fingerprint, data.ReceiverDocumentNumber, data.TotalAmount);
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

    private static string RateDateText(ArcaExchangeRate rate) =>
        (rate.RateDate.Length == 8 ? $" del {rate.RateDate[6..8]}/{rate.RateDate[4..6]}/{rate.RateDate[..4]}" : "") +
        (rate.Production ? "" : ", ambiente de homologación");

    private static FiscalReservationResult Fail(string detail) =>
        new(false, null, null, detail);
}
