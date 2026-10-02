using System.Globalization;
using LealControl.Modules.Sales.Domain.Invoices;

namespace LealControl.Modules.Sales.Infrastructure.Fiscal;

/// <summary>
/// Validación local, sin red ni reserva de numeración. La solicitud WSFE se construirá
/// solo a partir de este resultado y del número oficial reservado por separado.
/// Por ahora se admite únicamente Factura A, servicio, ARS y alícuota de IVA 21%.
/// </summary>
public static class WsfeInvoiceAServicePreparation
{
    public sealed record Data(
        string ReceiverCuit,
        int ReceiverDocumentType,
        int ReceiverVatCondition,
        int VoucherType,
        int Concept,
        string IssueDate,
        string ServiceFrom,
        string ServiceTo,
        string PaymentDue,
        decimal NetAmount,
        decimal VatAmount,
        decimal TotalAmount,
        int VatRateCode,
        string CurrencyCode,
        decimal ExchangeRate);

    public static bool TryBuild(Invoice invoice, out Data? data, out string error)
    {
        data = null;
        error = string.Empty;
        if (invoice.Status != "Draft" || invoice.Cae is not null)
            return Fail("Solo se puede preparar un borrador sin CAE.", out error);
        if (invoice.InvoiceType != "A" || invoice.FiscalConcept != 2)
            return Fail("Este flujo inicial admite únicamente Factura A por servicios.", out error);
        if (invoice.PointOfSale < 1 || invoice.PointOfSale > 99998)
            return Fail("El punto de venta no es válido.", out error);
        if (invoice.Currency != "ARS" || invoice.ExchangeRate != 1m)
            return Fail("Este flujo inicial admite únicamente pesos a cotización 1.", out error);
        if (invoice.CustomerTaxCondition != "ResponsableInscripto")
            return Fail("El receptor debe ser Responsable Inscripto para esta Factura A.", out error);

        var cuit = new string(invoice.CustomerDocument.Where(char.IsDigit).ToArray());
        if (!ValidCuit(cuit))
            return Fail("El CUIT del receptor no es válido.", out error);
        if (!invoice.ServiceFrom.HasValue || !invoice.ServiceTo.HasValue ||
            invoice.ServiceTo.Value.Date < invoice.ServiceFrom.Value.Date ||
            invoice.DueDate.Date < invoice.IssueDate.Date)
            return Fail("Revisá el período del servicio y el vencimiento de pago.", out error);
        if (invoice.Items.Count == 0 || invoice.Items.Any(i =>
                i.Quantity <= 0 || i.UnitPrice <= 0 || i.VatRate != 21m))
            return Fail("El borrador debe tener ítems positivos gravados al 21%.", out error);
        if (invoice.Iva105 != 0m || invoice.Iva27 != 0m || invoice.ExemptAmount != 0m ||
            invoice.IibbPerception != 0m || invoice.Subtotal <= 0m || invoice.Iva21 <= 0m ||
            invoice.Total <= 0m || invoice.Total != invoice.Subtotal + invoice.Iva21 ||
            invoice.Subtotal != invoice.Items.Sum(i => i.NetSubtotal) ||
            invoice.Iva21 != invoice.Items.Sum(i => i.VatAmount))
            return Fail("Los importes netos, IVA y total no concilian para Factura A al 21%.", out error);
        if (new[] { invoice.Subtotal, invoice.Iva21, invoice.Total }
            .Any(n => decimal.Round(n, 2) != n))
            return Fail("Los importes fiscales deben tener dos decimales.", out error);

        data = new Data(cuit, 80, 1, 1, 2,
            invoice.IssueDate.ToString("yyyyMMdd", CultureInfo.InvariantCulture),
            invoice.ServiceFrom.Value.ToString("yyyyMMdd", CultureInfo.InvariantCulture),
            invoice.ServiceTo.Value.ToString("yyyyMMdd", CultureInfo.InvariantCulture),
            invoice.DueDate.ToString("yyyyMMdd", CultureInfo.InvariantCulture),
            invoice.Subtotal, invoice.Iva21, invoice.Total, 5, "PES", 1m);
        return true;
    }

    private static bool Fail(string message, out string error)
    {
        error = message;
        return false;
    }

    private static bool ValidCuit(string cuit)
    {
        if (cuit.Length != 11 || !cuit.All(char.IsDigit)) return false;
        int[] weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
        var sum = 0;
        for (var i = 0; i < weights.Length; i++) sum += (cuit[i] - '0') * weights[i];
        var check = 11 - sum % 11;
        if (check == 11) check = 0;
        else if (check == 10) check = 9;
        return check == cuit[10] - '0';
    }
}
