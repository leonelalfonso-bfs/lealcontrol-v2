using System.Text;
using LealControl.Modules.Crm.Contracts.Fiscal;
using Microsoft.Extensions.Logging;

namespace LealControl.Modules.Crm.Infrastructure.Arca;

/// <summary>Envía un solo FECAESolicitar. Toda respuesta no concluyente queda Unknown.</summary>
public sealed class WsfeCaeTransport
{
    private readonly IHttpClientFactory _clients;
    private readonly ILogger<WsfeCaeTransport> _logger;

    public WsfeCaeTransport(IHttpClientFactory clients, ILogger<WsfeCaeTransport> logger)
    {
        _clients = clients;
        _logger = logger;
    }

    public async Task<WsfeCaeReply> SubmitAsync(
        string token, string sign, string issuerCuit, bool production,
        IWsfeInvoiceAServiceData data, int pointOfSale, long reservedNumber,
        CancellationToken cancellationToken)
    {
        // Build valida el perfil fiscal antes de abrir la conexión HTTP.
        var envelope = WsfeCaeRequestBuilder.Build(
            data, pointOfSale, reservedNumber, issuerCuit, token, sign);
        var url = production
            ? "https://servicios1.afip.gov.ar/wsfev1/service.asmx"
            : "https://wswhomo.afip.gov.ar/wsfev1/service.asmx";
        try
        {
            var client = _clients.CreateClient("arca");
            using var request = new HttpRequestMessage(HttpMethod.Post, url);
            request.Content = new StringContent(envelope, Encoding.UTF8, "text/xml");
            request.Headers.TryAddWithoutValidation(
                "SOAPAction", "http://ar.gov.afip.dif.FEV1/FECAESolicitar");
            using var response = await client.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
                return Unknown("ARCA no confirmó el resultado HTTP; consultar el número reservado.");
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            return WsfeCaeResponseParser.Parse(body, pointOfSale, data.VoucherType,
                reservedNumber, data.Concept, data.ReceiverCuit, data.IssueDate);
        }
        catch (Exception)
        {
            // No registrar ni devolver token, firma, XML, receptor ni detalles de excepción.
            _logger.LogWarning("FECAESolicitar terminó sin resultado concluyente.");
            return Unknown("No se pudo confirmar la solicitud fiscal; consultar el número reservado.");
        }
    }

    private static WsfeCaeReply Unknown(string detail) =>
        new(WsfeCaeOutcome.Unknown, null, null, detail);
}
