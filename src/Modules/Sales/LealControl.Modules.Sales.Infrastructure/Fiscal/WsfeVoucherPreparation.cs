using System.Globalization;
using LealControl.Modules.Crm.Contracts.Fiscal;
using LealControl.Modules.Sales.Domain.Invoices;

namespace LealControl.Modules.Sales.Infrastructure.Fiscal;

/// <summary>
/// Validación local, sin red ni reserva de numeración. La solicitud WSFE se construye
/// solo a partir de este resultado y del número oficial reservado por separado.
/// Admite comprobantes A y B en pesos, productos, servicios o ambos, con IVA 10,5%, 21%,
/// 27% y exento. Las notas de crédito y débito requieren el comprobante asociado.
/// </summary>
public static class WsfeVoucherPreparation
{
    /// <summary>
    /// Desde este total en pesos un consumidor final debe identificarse (RG 5866/2026).
    /// </summary>
    public const decimal ConsumerIdentificationThreshold = 10_000_000m;

    private sealed record Receiver(int VatCondition, bool ClassA, bool RequiresCuit);

    private static readonly Dictionary<string, Receiver> Receivers = new()
    {
        ["ResponsableInscripto"] = new(1, ClassA: true, RequiresCuit: true),
        ["Monotributo"] = new(6, ClassA: true, RequiresCuit: true),
        ["Exento"] = new(4, ClassA: false, RequiresCuit: true),
        ["NoResponsable"] = new(15, ClassA: false, RequiresCuit: true),
        ["ConsumidorFinal"] = new(5, ClassA: false, RequiresCuit: false)
    };

    private static readonly Dictionary<decimal, int> VatRateIds = new()
    {
        [10.5m] = 4,
        [21m] = 5,
        [27m] = 6
    };

    public static bool TryBuild(Invoice invoice, out WsfeVoucherData? data, out string error,
        WsfeAssociatedVoucher? associated = null)
    {
        data = null;
        error = string.Empty;
        if (invoice.Status != "Draft" || invoice.Cae is not null)
            return Fail("Solo se puede preparar un borrador sin CAE.", out error);
        if (FiscalVoucherCodes.For(invoice.InvoiceType) is not { } voucherType)
            return Fail("Este tipo de comprobante no se autoriza en ARCA.", out error);
        var classA = WsfeCaeRequestBuilder.IsClassA(voucherType);
        if (invoice.PointOfSale < 1 || invoice.PointOfSale > 99998)
            return Fail("El punto de venta no es válido.", out error);
        if (invoice.FiscalConcept is not (1 or 2 or 3))
            return Fail("Indicá si el comprobante es por productos, servicios o ambos.", out error);
        var currency = invoice.Currency switch { "ARS" => "PES", "USD" => "DOL", _ => null };
        // Un comprobante en dólares a cotización 1 es un error de carga, no una cotización.
        if (currency is null || (currency == "PES" && invoice.ExchangeRate != 1m) ||
            (currency == "DOL" && invoice.ExchangeRate <= 1m))
            return Fail("Se autorizan en ARCA comprobantes en pesos o en dólares con cotización válida.", out error);

        if (!Receivers.TryGetValue(invoice.CustomerTaxCondition, out var receiver))
            return Fail("Indicá la condición frente al IVA del cliente.", out error);
        if (receiver.ClassA != classA)
            return Fail(receiver.ClassA
                ? "A un cliente Responsable Inscripto o Monotributista le corresponde un comprobante A."
                : "A un cliente Consumidor Final, Exento o No Alcanzado le corresponde un comprobante B.", out error);

        var isFce = FiscalVoucherCodes.IsFce(invoice.InvoiceType);
        var document = FiscalVoucherCodes.ReceiverDocument(invoice.CustomerDocument);
        if (isFce && document.Length != 11)
            return Fail("La Factura de Crédito Electrónica requiere el CUIT del cliente.", out error);
        int documentType;
        if (document.Length == 11)
        {
            if (!ValidCuit(document))
                return Fail("El CUIT del cliente no es válido.", out error);
            documentType = 80;
        }
        else if (receiver.RequiresCuit)
        {
            return Fail("El cliente debe tener un CUIT válido para esta condición de IVA.", out error);
        }
        else if (document.Length is 7 or 8)
        {
            documentType = 96;
        }
        else if (document == "0")
        {
            if (invoice.Total * invoice.ExchangeRate >= ConsumerIdentificationThreshold)
                return Fail("Desde $10.000.000 el consumidor final debe identificarse con DNI o CUIT.", out error);
            documentType = 99;
        }
        else
        {
            return Fail("El documento del cliente no es un DNI ni un CUIT válido.", out error);
        }

        string? serviceFrom = null, serviceTo = null, paymentDue = null;
        if (invoice.FiscalConcept is 2 or 3)
        {
            if (!invoice.ServiceFrom.HasValue || !invoice.ServiceTo.HasValue ||
                invoice.ServiceTo.Value.Date < invoice.ServiceFrom.Value.Date)
                return Fail("Revisá el período del servicio.", out error);
            serviceFrom = Date(invoice.ServiceFrom.Value);
            serviceTo = Date(invoice.ServiceTo.Value);
        }
        // Vencimiento: servicios en comprobantes comunes; siempre en la FCE; en sus notas, solo de anulación.
        var fceInvoice = WsfeCaeRequestBuilder.IsFceInvoice(voucherType);
        var needsDue = fceInvoice || (!isFce && invoice.FiscalConcept is 2 or 3) ||
                       (isFce && !fceInvoice && invoice.FceCancellation == true);
        if (needsDue)
        {
            if (invoice.DueDate.Date < invoice.IssueDate.Date)
                return Fail("El vencimiento de pago no puede ser anterior a la emisión.", out error);
            paymentDue = Date(invoice.DueDate);
        }

        List<WsfeOptional>? optionals = null;
        if (fceInvoice)
        {
            if (invoice.FceCbu is not { Length: 22 })
                return Fail("Cargá el CBU de la empresa (22 dígitos) para la Factura de Crédito Electrónica.", out error);
            optionals = [new("2101", invoice.FceCbu)];
            if (!string.IsNullOrWhiteSpace(invoice.FceAlias)) optionals.Add(new("2102", invoice.FceAlias));
            optionals.Add(new("27", invoice.FceTransferMode ?? "SCA"));
        }
        else if (isFce)
        {
            if (invoice.FceCancellation is null)
                return Fail("Indicá si la nota anula la FCE (el cliente la rechazó) o no.", out error);
            optionals = [new("22", invoice.FceCancellation.Value ? "S" : "N")];
        }

        if (invoice.Items.Count == 0 || invoice.Items.Any(i => i.Quantity <= 0 || i.UnitPrice <= 0))
            return Fail("El borrador debe tener ítems con cantidad y precio positivos.", out error);
        if (invoice.Items.Any(i => i.VatRate != 0m && !VatRateIds.ContainsKey(i.VatRate)))
            return Fail("Las alícuotas admitidas son 21%, 10,5%, 27% o exento.", out error);
        if (invoice.IibbPerception != 0m)
            return Fail("Las percepciones todavía no se informan a ARCA.", out error);

        var exempt = invoice.Items.Where(i => i.VatRate == 0m).Sum(i => i.NetSubtotal);
        var vatLines = invoice.Items.Where(i => i.VatRate != 0m)
            .GroupBy(i => VatRateIds[i.VatRate])
            .Select(g => new WsfeVatLine(g.Key, g.Sum(i => i.NetSubtotal), g.Sum(i => i.VatAmount)))
            .OrderBy(v => v.Id).ToList();
        var net = vatLines.Sum(v => v.BaseAmount);
        var vat = vatLines.Sum(v => v.Amount);
        if (invoice.Subtotal != net + exempt || invoice.ExemptAmount != exempt ||
            invoice.Iva21 + invoice.Iva105 + invoice.Iva27 != vat ||
            invoice.Total != net + exempt + vat || invoice.Total <= 0m)
            return Fail("Los importes netos, IVA y total no concilian.", out error);
        if (new[] { invoice.Subtotal, invoice.Iva21, invoice.Iva105, invoice.Iva27, invoice.Total }
            .Any(n => decimal.Round(n, 2) != n))
            return Fail("Los importes fiscales deben tener dos decimales.", out error);

        var isNote = voucherType is 2 or 3 or 7 or 8 or 202 or 203 or 207 or 208;
        if (isNote && associated is null)
            return Fail("La nota de crédito o débito debe estar asociada a la factura original autorizada.", out error);
        if (!isNote && associated is not null)
            return Fail("Una factura no lleva comprobante asociado.", out error);

        var prepared = new WsfeVoucherData(voucherType, invoice.FiscalConcept, documentType, document,
            receiver.VatCondition, Date(invoice.IssueDate), serviceFrom, serviceTo, paymentDue,
            net, 0m, exempt, vat, 0m, invoice.Total, vatLines, currency, invoice.ExchangeRate,
            currency == "PES" ? null : invoice.PaidInForeignCurrency,
            associated is null ? WsfeVoucherData.NoAssociated : [associated], optionals);
        try
        {
            WsfeCaeRequestBuilder.Validate(prepared);
        }
        catch (ArgumentException ex)
        {
            return Fail(ex.Message.Split(" (Parameter")[0], out error);
        }
        data = prepared;
        return true;
    }

    private static string Date(DateTime value) => value.ToString("yyyyMMdd", CultureInfo.InvariantCulture);

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
