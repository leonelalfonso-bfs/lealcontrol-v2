using System.Globalization;
using System.Text;
using System.Xml.Linq;
using LealControl.BuildingBlocks.Results;
using LealControl.Modules.Crm.Application.Customers;
using Microsoft.Extensions.Logging;

namespace LealControl.Modules.Crm.Infrastructure.Arca;

internal sealed class ArcaPadronClient
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<ArcaPadronClient> _logger;

    public ArcaPadronClient(IHttpClientFactory httpClientFactory, ILogger<ArcaPadronClient> logger)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public async Task<Result<ArcaCuitLookupResult>> GetPersonaAsync(
        string token,
        string sign,
        string cuitRepresentada,
        string idPersona,
        bool production,
        CancellationToken cancellationToken)
    {
        var url = production
            ? "https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5"
            : "https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5";

        var envelope = $"""
            <?xml version="1.0" encoding="utf-8"?>
            <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:a5="http://a5.soap.ws.server.puc.sr.gov.ar/">
              <soapenv:Header/>
              <soapenv:Body>
                <a5:getPersona>
                  <token>{Escape(token)}</token>
                  <sign>{Escape(sign)}</sign>
                  <cuitRepresentada>{Escape(cuitRepresentada)}</cuitRepresentada>
                  <idPersona>{Escape(idPersona)}</idPersona>
                </a5:getPersona>
              </soapenv:Body>
            </soapenv:Envelope>
            """;

        try
        {
            var client = _httpClientFactory.CreateClient("arca");
            using var request = new HttpRequestMessage(HttpMethod.Post, url);
            request.Content = new StringContent(envelope, Encoding.UTF8, "text/xml");
            request.Headers.TryAddWithoutValidation("SOAPAction", "");

            using var response = await client.SendAsync(request, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                return Result<ArcaCuitLookupResult>.Failure(
                    Error.Failure("Crm.Arca.PadronHttp", $"Padrón A5 HTTP {(int)response.StatusCode}."));
            }

            if (body.Contains("faultstring", StringComparison.OrdinalIgnoreCase))
            {
                var fault = Extract(body, "faultstring") ?? "Error SOAP padrón";
                return Result<ArcaCuitLookupResult>.Failure(
                    Error.Failure("Crm.Arca.PadronFault", fault));
            }

            var legalName =
                Extract(body, "razonSocial")
                ?? Extract(body, "nombre")
                ?? Extract(body, "denominacion");

            if (string.IsNullOrWhiteSpace(legalName))
            {
                return Result<ArcaCuitLookupResult>.Failure(
                    Error.NotFound(
                        "Crm.Arca.NotFound",
                        $"ARCA respondió sin razón social para el CUIT {idPersona}."));
            }

            var taxCondition = MapTaxCondition(body);
            var street = JoinAddress(
                Extract(body, "direccion") ?? Extract(body, "calle"),
                Extract(body, "numero"));
            var city = Extract(body, "localidad") ?? Extract(body, "descripcionProvincia");
            var province = MapProvince(Extract(body, "descripcionProvincia") ?? Extract(body, "idProvincia"));
            var postal = Extract(body, "codPostal");
            var estado = Extract(body, "estadoClave") ?? Extract(body, "estado");

            return Result<ArcaCuitLookupResult>.Success(new ArcaCuitLookupResult(
                idPersona,
                legalName.Trim().ToUpperInvariant(),
                null,
                taxCondition,
                street,
                city,
                province,
                postal,
                !string.Equals(estado, "INACTIVO", StringComparison.OrdinalIgnoreCase)
                && !string.Equals(estado, "BAJA", StringComparison.OrdinalIgnoreCase)));
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Fallo consulta padrón A5 cuit={Cuit}", idPersona);
            return Result<ArcaCuitLookupResult>.Failure(
                Error.Failure("Crm.Arca.PadronError", "No se pudo consultar el padrón ARCA: " + ex.Message));
        }
    }

    private static string MapTaxCondition(string body)
    {
        var iva = (Extract(body, "descripcionRegimen")
                   ?? Extract(body, "impuesto")
                   ?? Extract(body, "estado")
                   ?? string.Empty).ToUpperInvariant();

        if (iva.Contains("MONOTRIBUTO", StringComparison.Ordinal)) return "Monotributo";
        if (iva.Contains("EXENT", StringComparison.Ordinal)) return "Exento";
        if (iva.Contains("NO RESPONSABLE", StringComparison.Ordinal)) return "NoResponsable";
        if (iva.Contains("CONSUMIDOR FINAL", StringComparison.Ordinal)) return "ConsumidorFinal";
        return "ResponsableInscripto";
    }

    private static string? MapProvince(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var n = raw.Trim();
        if (int.TryParse(n, NumberStyles.Integer, CultureInfo.InvariantCulture, out var code))
        {
            return code switch
            {
                0 => "CapitalFederal",
                1 => "BuenosAires",
                2 => "Catamarca",
                3 => "Cordoba",
                4 => "Corrientes",
                5 => "EntreRios",
                6 => "Jujuy",
                7 => "Mendoza",
                8 => "LaRioja",
                9 => "Salta",
                10 => "SanJuan",
                11 => "SanLuis",
                12 => "SantaFe",
                13 => "SantiagoDelEstero",
                14 => "Tucuman",
                16 => "Chaco",
                17 => "Chubut",
                18 => "Formosa",
                19 => "Misiones",
                20 => "Neuquen",
                21 => "LaPampa",
                22 => "RioNegro",
                23 => "SantaCruz",
                24 => "TierraDelFuego",
                _ => null
            };
        }

        var u = n.ToUpperInvariant()
            .Replace("Á", "A").Replace("É", "E").Replace("Í", "I").Replace("Ó", "O").Replace("Ú", "U");
        if (u.Contains("SANTA FE")) return "SantaFe";
        if (u.Contains("CAPITAL") || u.Contains("CABA")) return "CapitalFederal";
        if (u.Contains("BUENOS AIRES")) return "BuenosAires";
        return null;
    }

    private static string? JoinAddress(string? street, string? number)
    {
        var s = string.Join(" ", new[] { street, number }.Where(x => !string.IsNullOrWhiteSpace(x)));
        return string.IsNullOrWhiteSpace(s) ? null : s;
    }

    private static string Escape(string value) => System.Security.SecurityElement.Escape(value) ?? value;

    private static string? Extract(string xml, string localName)
    {
        try
        {
            var doc = XDocument.Parse(xml);
            return doc.Descendants().FirstOrDefault(e => e.Name.LocalName.Equals(localName, StringComparison.OrdinalIgnoreCase))?.Value;
        }
        catch
        {
            return null;
        }
    }
}
