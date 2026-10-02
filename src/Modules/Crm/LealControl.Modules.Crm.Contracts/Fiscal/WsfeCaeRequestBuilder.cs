using System.Globalization;
using System.Security;
using System.Security.Cryptography;
using System.Text;

namespace LealControl.Modules.Crm.Contracts.Fiscal;

/// <summary>Construye un SOAP FECAESolicitar de un comprobante; no lo envía.</summary>
public static class WsfeCaeRequestBuilder
{
    public static string Build(
        IWsfeInvoiceAServiceData data, int pointOfSale,
        long reservedNumber, string issuerCuit, string token, string sign)
    {
        if (data.VoucherType != 1 || data.Concept != 2 || data.CurrencyCode != "PES" ||
            data.ReceiverDocumentType != 80 || data.ReceiverVatCondition != 1 ||
            data.VatRateCode != 5 || data.ExchangeRate != 1m ||
            data.TotalAmount != data.NetAmount + data.VatAmount ||
            data.NetAmount <= 0m || data.VatAmount <= 0m ||
            data.ReceiverCuit.Length != 11 || !data.ReceiverCuit.All(char.IsDigit) ||
            !ValidDate(data.IssueDate, out var issue) ||
            !ValidDate(data.ServiceFrom, out var serviceFrom) ||
            !ValidDate(data.ServiceTo, out var serviceTo) ||
            !ValidDate(data.PaymentDue, out var due) ||
            serviceTo < serviceFrom || due < issue ||
            new[] { data.NetAmount, data.VatAmount, data.TotalAmount }.Any(n => decimal.Round(n, 2) != n))
            throw new ArgumentException("El comprobante no cumple el perfil inicial Factura A servicio.", nameof(data));
        if (pointOfSale < 1 || pointOfSale > 99998 || reservedNumber < 1 ||
            issuerCuit.Length != 11 || !issuerCuit.All(char.IsDigit) ||
            string.IsNullOrWhiteSpace(token) || string.IsNullOrWhiteSpace(sign))
            throw new ArgumentException("Punto de venta, número reservado o autenticación inválidos.");

        static string E(string value) => SecurityElement.Escape(value) ?? string.Empty;
        static string Money(decimal value) => value.ToString("0.00", CultureInfo.InvariantCulture);
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
                      <ar:CbteTipo>1</ar:CbteTipo>
                    </ar:FeCabReq>
                    <ar:FeDetReq>
                      <ar:FECAEDetRequest>
                        <ar:Concepto>2</ar:Concepto>
                        <ar:DocTipo>80</ar:DocTipo>
                        <ar:DocNro>{data.ReceiverCuit}</ar:DocNro>
                        <ar:CbteDesde>{reservedNumber}</ar:CbteDesde>
                        <ar:CbteHasta>{reservedNumber}</ar:CbteHasta>
                        <ar:CbteFch>{data.IssueDate}</ar:CbteFch>
                        <ar:ImpTotal>{Money(data.TotalAmount)}</ar:ImpTotal>
                        <ar:ImpTotConc>0</ar:ImpTotConc>
                        <ar:ImpNeto>{Money(data.NetAmount)}</ar:ImpNeto>
                        <ar:ImpOpEx>0</ar:ImpOpEx>
                        <ar:ImpTrib>0</ar:ImpTrib>
                        <ar:ImpIVA>{Money(data.VatAmount)}</ar:ImpIVA>
                        <ar:FchServDesde>{data.ServiceFrom}</ar:FchServDesde>
                        <ar:FchServHasta>{data.ServiceTo}</ar:FchServHasta>
                        <ar:FchVtoPago>{data.PaymentDue}</ar:FchVtoPago>
                        <ar:MonId>PES</ar:MonId>
                        <ar:MonCotiz>1</ar:MonCotiz>
                        <ar:CondicionIVAReceptorId>1</ar:CondicionIVAReceptorId>
                        <ar:Iva>
                          <ar:AlicIva>
                            <ar:Id>5</ar:Id>
                            <ar:BaseImp>{Money(data.NetAmount)}</ar:BaseImp>
                            <ar:Importe>{Money(data.VatAmount)}</ar:Importe>
                          </ar:AlicIva>
                        </ar:Iva>
                      </ar:FECAEDetRequest>
                    </ar:FeDetReq>
                  </ar:FeCAEReq>
                </ar:FECAESolicitar>
              </soapenv:Body>
            </soapenv:Envelope>
            """;
    }

    // Hash de la solicitud sin token ni firma; detecta cambios tras reservar el número.
    public static string Fingerprint(
        IWsfeInvoiceAServiceData data, int pointOfSale,
        long reservedNumber, string issuerCuit)
    {
        _ = Build(data, pointOfSale, reservedNumber, issuerCuit, "validation", "validation");
        var canonical = string.Join("|", issuerCuit, pointOfSale, reservedNumber,
            data.ReceiverCuit, data.ReceiverDocumentType, data.ReceiverVatCondition,
            data.VoucherType, data.Concept, data.IssueDate, data.ServiceFrom,
            data.ServiceTo, data.PaymentDue,
            data.NetAmount.ToString("0.00", CultureInfo.InvariantCulture),
            data.VatAmount.ToString("0.00", CultureInfo.InvariantCulture),
            data.TotalAmount.ToString("0.00", CultureInfo.InvariantCulture),
            data.VatRateCode, data.CurrencyCode,
            data.ExchangeRate.ToString("0.00", CultureInfo.InvariantCulture));
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(canonical))).ToLowerInvariant();
    }

    private static bool ValidDate(string date, out DateTime parsed) =>
        DateTime.TryParseExact(date, "yyyyMMdd", CultureInfo.InvariantCulture,
            DateTimeStyles.None, out parsed);
}
