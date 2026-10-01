using System.Globalization;
using System.Text;
using System.Xml.Linq;
using LealControl.BuildingBlocks.Results;
using LealControl.Modules.Crm.Application.Customers;
using Microsoft.Extensions.Logging;

[assembly: System.Runtime.CompilerServices.InternalsVisibleTo("LealControl.Modules.Crm.IntegrationTests")]

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
            ? "https://aws.arca.gob.ar/sr-padron/webservices/personaServiceA5"
            : "https://awshomo.arca.gob.ar/sr-padron/webservices/personaServiceA5";

        var envelope = $"""
            <?xml version="1.0" encoding="utf-8"?>
            <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:a5="http://a5.soap.ws.server.puc.sr/">
              <soapenv:Header/>
              <soapenv:Body>
                <a5:getPersona_v2>
                  <token>{Escape(token)}</token>
                  <sign>{Escape(sign)}</sign>
                  <cuitRepresentada>{Escape(cuitRepresentada)}</cuitRepresentada>
                  <idPersona>{Escape(idPersona)}</idPersona>
                </a5:getPersona_v2>
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
                    Error.Failure("Crm.Arca.PadronHttp", $"Constancia de inscripción HTTP {(int)response.StatusCode}."));
            }

            if (body.Contains("faultstring", StringComparison.OrdinalIgnoreCase))
            {
                var fault = Extract(body, "faultstring") ?? "Error SOAP padrón";
                return Result<ArcaCuitLookupResult>.Failure(
                    Error.Failure("Crm.Arca.PadronFault", fault));
            }

            var razonSocial = Extract(body, "razonSocial") ?? Extract(body, "denominacion");
            var apellido = Extract(body, "apellido");
            var nombre = Extract(body, "nombre");
            var legalName = !string.IsNullOrWhiteSpace(razonSocial)
                ? razonSocial
                : string.Join(" ", new[] { apellido, nombre }.Where(x => !string.IsNullOrWhiteSpace(x)));

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

    internal static string? MapProvince(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var n = raw.Trim();
        if (int.TryParse(n, NumberStyles.Integer, CultureInfo.InvariantCulture, out var code))
        {
            return code switch
            {
                0 => "CapitalFederal", 1 => "BuenosAires", 2 => "Catamarca",
                3 => "Cordoba", 4 => "Corrientes", 5 => "EntreRios",
                6 => "Jujuy", 7 => "Mendoza", 8 => "LaRioja",
                9 => "Salta", 10 => "SanJuan", 11 => "SanLuis",
                12 => "SantaFe", 13 => "SantiagoDelEstero", 14 => "Tucuman",
                16 => "Chaco", 17 => "Chubut", 18 => "Formosa",
                19 => "Misiones", 20 => "Neuquen", 21 => "LaPampa",
                22 => "RioNegro", 23 => "SantaCruz", 24 => "TierraDelFuego",
                _ => null
            };
        }

        var key = new string(n.Normalize(NormalizationForm.FormD)
            .Where(c => CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark && char.IsLetterOrDigit(c))
            .Select(char.ToUpperInvariant).ToArray());
        if (key.StartsWith("PROVINCIADE", StringComparison.Ordinal)) key = key[11..];
        if (key.StartsWith("TIERRADELFUEGO", StringComparison.Ordinal)) return "TierraDelFuego";
        return key switch
        {
            "CAPITALFEDERAL" or "CABA" or "CIUDADAUTONOMADEBUENOSAIRES" => "CapitalFederal",
            "BUENOSAIRES" => "BuenosAires",
            "CATAMARCA" => "Catamarca",
            "CHACO" => "Chaco",
            "CHUBUT" => "Chubut",
            "CORDOBA" => "Cordoba",
            "CORRIENTES" => "Corrientes",
            "ENTRERIOS" => "EntreRios",
            "FORMOSA" => "Formosa",
            "JUJUY" => "Jujuy",
            "LAPAMPA" => "LaPampa",
            "LARIOJA" => "LaRioja",
            "MENDOZA" => "Mendoza",
            "MISIONES" => "Misiones",
            "NEUQUEN" => "Neuquen",
            "RIONEGRO" => "RioNegro",
            "SALTA" => "Salta",
            "SANJUAN" => "SanJuan",
            "SANLUIS" => "SanLuis",
            "SANTACRUZ" => "SantaCruz",
            "SANTAFE" => "SantaFe",
            "SANTIAGODELESTERO" => "SantiagoDelEstero",
            "TUCUMAN" => "Tucuman",
            _ => null
        };
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
