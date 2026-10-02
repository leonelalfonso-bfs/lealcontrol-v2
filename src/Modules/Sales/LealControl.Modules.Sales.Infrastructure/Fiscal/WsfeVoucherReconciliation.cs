using LealControl.Modules.Crm.Contracts.Fiscal;
using LealControl.Modules.Sales.Domain.Invoices;

namespace LealControl.Modules.Sales.Infrastructure.Fiscal;

/// <summary>Concilia una consulta FECompConsultar; no realiza llamadas de red ni guarda datos.</summary>
public static class WsfeVoucherReconciliation
{
    public sealed record Observation(
        bool Confirmed, long Number, string RecipientDocument, decimal Total,
        string Cae, DateTime CaeDueDate);

    public static bool TryConfirm(
        Invoice invoice, FiscalAuthorizationAttempt attempt,
        string issuerCuit, Observation observation, WsfeCaeReply? submission,
        string qrUrl, out string reason)
    {
        reason = "La consulta oficial no coincide íntegramente con la reserva y el borrador.";
        if (!WsfeInvoiceAServicePreparation.TryBuild(invoice, out var data, out _) || data is null ||
            attempt.Status is not ("Pending" or "Unknown") ||
            attempt.InvoiceId != invoice.Id || attempt.TenantId.Value != invoice.TenantId.Value ||
            attempt.PointOfSale != invoice.PointOfSale || attempt.VoucherType != data.VoucherType ||
            !observation.Confirmed || observation.Number != attempt.VoucherNumber ||
            observation.RecipientDocument != data.ReceiverCuit ||
            observation.RecipientDocument != attempt.RecipientDocument ||
            observation.Total != data.TotalAmount || observation.Total != attempt.Total ||
            observation.Cae.Length != 14 || !observation.Cae.All(char.IsDigit) ||
            observation.CaeDueDate == default ||
            submission?.Outcome == WsfeCaeOutcome.Rejected ||
            (submission?.Outcome == WsfeCaeOutcome.ApprovedPendingConsultation &&
                (submission.Cae != observation.Cae ||
                 submission.CaeDueDate?.Date != observation.CaeDueDate.Date)) ||
            !Uri.TryCreate(qrUrl, UriKind.Absolute, out var qr) || qr.Scheme != Uri.UriSchemeHttps ||
            (qr.Host != "www.afip.gob.ar" && qr.Host != "www.arca.gob.ar") ||
            qr.AbsolutePath != "/fe/qr/")
            return false;

        string fingerprint;
        try
        {
            fingerprint = WsfeCaeRequestBuilder.Fingerprint(
                data, attempt.PointOfSale, attempt.VoucherNumber, issuerCuit);
        }
        catch (ArgumentException)
        {
            return false;
        }
        if (!string.Equals(fingerprint, attempt.RequestHash, StringComparison.OrdinalIgnoreCase))
            return false;

        attempt.Confirm(observation.Cae, observation.CaeDueDate);
        invoice.ConfirmFiscalAuthorization(attempt, fingerprint, qrUrl);
        reason = string.Empty;
        return true;
    }
}
