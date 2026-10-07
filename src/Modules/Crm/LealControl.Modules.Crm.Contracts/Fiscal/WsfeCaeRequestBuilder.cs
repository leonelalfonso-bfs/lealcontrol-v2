using System.Globalization;
using System.Security;
using System.Security.Cryptography;
using System.Text;

namespace LealControl.Modules.Crm.Contracts.Fiscal;

/// <summary>Construye un SOAP FECAESolicitar de un comprobante; no lo envía.</summary>
public static class WsfeCaeRequestBuilder
{
    // Clases A y B con sus notas de débito y crédito (FEParamGetTiposCbte).
    public static readonly IReadOnlySet<int> SupportedVoucherTypes = new HashSet<int> { 1, 2, 3, 6, 7, 8 };

    // Condición frente al IVA del receptor admitida por clase (FEParamGetCondicionIvaReceptor).
    private static readonly HashSet<int> ClassAReceiverConditions = [1, 6, 13, 16];
    private static readonly HashSet<int> ClassBReceiverConditions = [4, 5, 7, 8, 9, 10, 15];
    private static readonly HashSet<int> VatRateIds = [3, 4, 5, 6, 8, 9];
    private static readonly HashSet<int> DocumentTypes = [80, 86, 96, 99];

    public static bool IsClassA(int voucherType) => voucherType is 1 or 2 or 3;

    public static string Build(
        WsfeVoucherData data, int pointOfSale,
        long reservedNumber, string issuerCuit, string token, string sign)
    {
        Validate(data);
        if (pointOfSale < 1 || pointOfSale > 99998 || reservedNumber is < 1 or > 99_999_999 ||
            issuerCuit.Length != 11 || !issuerCuit.All(char.IsDigit) ||
            data.ReceiverDocumentNumber == issuerCuit ||
            string.IsNullOrWhiteSpace(token) || string.IsNullOrWhiteSpace(sign))
            throw new ArgumentException("Punto de venta, número reservado o autenticación inválidos.");

        static string E(string value) => SecurityElement.Escape(value) ?? string.Empty;
        var detail = new StringBuilder();
        void Add(string name, string value) => detail.Append($"<ar:{name}>{value}</ar:{name}>");

        Add("Concepto", data.Concept.ToString(CultureInfo.InvariantCulture));
        Add("DocTipo", data.ReceiverDocumentType.ToString(CultureInfo.InvariantCulture));
        Add("DocNro", data.ReceiverDocumentNumber);
        Add("CbteDesde", reservedNumber.ToString(CultureInfo.InvariantCulture));
        Add("CbteHasta", reservedNumber.ToString(CultureInfo.InvariantCulture));
        Add("CbteFch", data.IssueDate);
        Add("ImpTotal", Money(data.TotalAmount));
        Add("ImpTotConc", Money(data.NonTaxedAmount));
        Add("ImpNeto", Money(data.NetAmount));
        Add("ImpOpEx", Money(data.ExemptAmount));
        Add("ImpTrib", Money(data.OtherTaxesAmount));
        Add("ImpIVA", Money(data.VatAmount));
        if (data.Concept is 2 or 3)
        {
            Add("FchServDesde", data.ServiceFrom!);
            Add("FchServHasta", data.ServiceTo!);
            Add("FchVtoPago", data.PaymentDue!);
        }
        Add("MonId", data.CurrencyCode);
        Add("MonCotiz", data.ExchangeRate.ToString("0.######", CultureInfo.InvariantCulture));
        if (data.CurrencyCode != "PES")
            Add("CanMisMonExt", data.PaidInSameForeignCurrency == true ? "S" : "N");
        Add("CondicionIVAReceptorId", data.ReceiverVatCondition.ToString(CultureInfo.InvariantCulture));
        if (data.AssociatedVouchers.Count > 0)
        {
            detail.Append("<ar:CbtesAsoc>");
            foreach (var a in data.AssociatedVouchers)
                detail.Append(
                    $"<ar:CbteAsoc><ar:Tipo>{a.Type}</ar:Tipo><ar:PtoVta>{a.PointOfSale}</ar:PtoVta>" +
                    $"<ar:Nro>{a.Number}</ar:Nro><ar:Cuit>{a.IssuerCuit}</ar:Cuit>" +
                    $"<ar:CbteFch>{a.IssueDate}</ar:CbteFch></ar:CbteAsoc>");
            detail.Append("</ar:CbtesAsoc>");
        }
        if (data.VatLines.Count > 0)
        {
            detail.Append("<ar:Iva>");
            foreach (var v in data.VatLines.OrderBy(v => v.Id))
                detail.Append(
                    $"<ar:AlicIva><ar:Id>{v.Id}</ar:Id><ar:BaseImp>{Money(v.BaseAmount)}</ar:BaseImp>" +
                    $"<ar:Importe>{Money(v.Amount)}</ar:Importe></ar:AlicIva>");
            detail.Append("</ar:Iva>");
        }

        return $"""
            <?xml version="1.0" encoding="utf-8"?>
            <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
              <soapenv:Header/>
              <soapenv:Body>
                <ar:FECAESolicitar>
                  <ar:Auth>
                    <ar:Token>{E(token)}</ar:Token>
                    <ar:Sign>{E(sign)}</ar:Sign>
                    <ar:Cuit>{issuerCuit}</ar:Cuit>
                  </ar:Auth>
                  <ar:FeCAEReq>
                    <ar:FeCabReq>
                      <ar:CantReg>1</ar:CantReg>
                      <ar:PtoVta>{pointOfSale}</ar:PtoVta>
                      <ar:CbteTipo>{data.VoucherType}</ar:CbteTipo>
                    </ar:FeCabReq>
                    <ar:FeDetReq>
                      <ar:FECAEDetRequest>{detail}</ar:FECAEDetRequest>
                    </ar:FeDetReq>
                  </ar:FeCAEReq>
                </ar:FECAESolicitar>
              </soapenv:Body>
            </soapenv:Envelope>
            """;
    }

    // Hash de la solicitud sin token ni firma; detecta cambios tras reservar el número.
    public static string Fingerprint(
        WsfeVoucherData data, int pointOfSale,
        long reservedNumber, string issuerCuit)
    {
        _ = Build(data, pointOfSale, reservedNumber, issuerCuit, "validation", "validation");
        var canonical = string.Join("|", "v2", issuerCuit, pointOfSale, reservedNumber, data.RequestKey());
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(canonical))).ToLowerInvariant();
    }

    /// <summary>Reglas de ARCA que se pueden verificar sin consultar padrones.</summary>
    public static void Validate(WsfeVoucherData data)
    {
        ArgumentNullException.ThrowIfNull(data);
        static void Require(bool condition, string message)
        {
            if (!condition) throw new ArgumentException(message, nameof(data));
        }

        Require(SupportedVoucherTypes.Contains(data.VoucherType), "Tipo de comprobante no admitido.");
        Require(data.Concept is 1 or 2 or 3, "Concepto fiscal inválido.");
        Require(DocumentTypes.Contains(data.ReceiverDocumentType), "Tipo de documento del receptor no admitido.");
        Require(data.ReceiverDocumentNumber.Length is >= 1 and <= 11 &&
                data.ReceiverDocumentNumber.All(char.IsDigit), "Documento del receptor inválido.");
        Require(data.ReceiverDocumentType == 99
                ? data.ReceiverDocumentNumber == "0"
                : data.ReceiverDocumentNumber != "0" &&
                  (data.ReceiverDocumentType != 80 || data.ReceiverDocumentNumber.Length == 11),
            "Documento del receptor inválido para su tipo.");
        if (IsClassA(data.VoucherType))
            Require(data.ReceiverDocumentType == 80 &&
                    ClassAReceiverConditions.Contains(data.ReceiverVatCondition),
                "Un comprobante A requiere CUIT y un receptor inscripto o monotributista.");
        else
            Require(ClassBReceiverConditions.Contains(data.ReceiverVatCondition),
                "La condición de IVA del receptor no corresponde a un comprobante B.");

        Require(ValidDate(data.IssueDate, out var issue), "Fecha de emisión inválida.");
        if (data.Concept is 2 or 3)
        {
            Require(ValidDate(data.ServiceFrom, out var from) && ValidDate(data.ServiceTo, out var to) &&
                    ValidDate(data.PaymentDue, out var due) && to >= from && due >= issue,
                "Servicios requieren período y vencimiento de pago válidos.");
        }
        else
        {
            Require(data.ServiceFrom is null && data.ServiceTo is null && data.PaymentDue is null,
                "Las fechas de servicio solo corresponden a servicios.");
        }

        decimal[] amounts = [data.NetAmount, data.NonTaxedAmount, data.ExemptAmount,
            data.VatAmount, data.OtherTaxesAmount, data.TotalAmount];
        Require(amounts.All(n => n >= 0m && decimal.Round(n, 2) == n), "Importes inválidos.");
        Require(data.TotalAmount > 0m && data.TotalAmount == data.NetAmount + data.NonTaxedAmount +
                data.ExemptAmount + data.VatAmount + data.OtherTaxesAmount, "El total no concilia.");
        // Percepciones y otros tributos aún no se informan.
        Require(data.OtherTaxesAmount == 0m, "Otros tributos no admitidos todavía.");
        Require(data.VatLines.All(v => VatRateIds.Contains(v.Id) && v.BaseAmount > 0m && v.Amount >= 0m &&
                decimal.Round(v.BaseAmount, 2) == v.BaseAmount && decimal.Round(v.Amount, 2) == v.Amount) &&
                data.VatLines.Select(v => v.Id).Distinct().Count() == data.VatLines.Count,
            "Alícuotas de IVA inválidas o repetidas.");
        Require(data.NetAmount == 0m ? data.VatLines.Count == 0 && data.VatAmount == 0m
                : data.VatLines.Sum(v => v.BaseAmount) == data.NetAmount &&
                  data.VatLines.Sum(v => v.Amount) == data.VatAmount,
            "El neto gravado y el IVA no concilian con las alícuotas.");

        Require(data.CurrencyCode switch
        {
            "PES" => data.ExchangeRate == 1m && data.PaidInSameForeignCurrency is null or false,
            "DOL" => data.ExchangeRate > 0m && data.PaidInSameForeignCurrency is not null,
            _ => false
        }, "Moneda o cotización inválidas.");
        Require(decimal.Round(data.ExchangeRate, 6) == data.ExchangeRate, "Cotización con demasiados decimales.");

        if (data.IsCreditOrDebitNote)
        {
            int[] allowed = IsClassA(data.VoucherType) ? [1, 2, 3] : [6, 7, 8];
            Require(data.AssociatedVouchers.Count > 0 && data.AssociatedVouchers.All(a =>
                    allowed.Contains(a.Type) && a.PointOfSale is >= 1 and <= 99998 &&
                    a.Number is >= 1 and <= 99_999_999 && a.IssuerCuit.Length == 11 &&
                    a.IssuerCuit.All(char.IsDigit) && ValidDate(a.IssueDate, out var associated) &&
                    associated <= issue) &&
                    data.AssociatedVouchers.Select(a => (a.Type, a.PointOfSale, a.Number)).Distinct().Count()
                    == data.AssociatedVouchers.Count,
                "Una nota de crédito o débito requiere el comprobante asociado de su misma clase.");
        }
        else
        {
            Require(data.AssociatedVouchers.Count == 0, "Una factura no lleva comprobantes asociados.");
        }
    }

    private static string Money(decimal value) => value.ToString("0.00", CultureInfo.InvariantCulture);

    private static bool ValidDate(string? date, out DateTime parsed) =>
        DateTime.TryParseExact(date, "yyyyMMdd", CultureInfo.InvariantCulture,
            DateTimeStyles.None, out parsed);
}
