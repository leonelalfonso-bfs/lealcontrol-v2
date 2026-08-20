using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace LealControl.Api.Automation;

public record CctCategoryProposalDto(
    [property: JsonPropertyName("category")] string Category,
    [property: JsonPropertyName("basicSalary")] decimal BasicSalary,
    [property: JsonPropertyName("nonRemunerativeAmount")] decimal NonRemunerativeAmount,
    [property: JsonPropertyName("hourlyRate")] decimal HourlyRate
);

public record CctAnalysisResultDto(
    [property: JsonPropertyName("cctNumber")] string CctNumber,
    [property: JsonPropertyName("unionName")] string UnionName,
    [property: JsonPropertyName("effectivePeriod")] string EffectivePeriod,
    [property: JsonPropertyName("percentageIncrease")] decimal PercentageIncrease,
    [property: JsonPropertyName("summary")] string Summary,
    [property: JsonPropertyName("salaryScales")] List<CctCategoryProposalDto> SalaryScales
);

public record InvoiceOcrItemDto(
    [property: JsonPropertyName("code")] string Code,
    [property: JsonPropertyName("description")] string Description,
    [property: JsonPropertyName("quantity")] decimal Quantity,
    [property: JsonPropertyName("unitPrice")] decimal UnitPrice,
    [property: JsonPropertyName("vatRate")] decimal VatRate,
    [property: JsonPropertyName("subtotal")] decimal Subtotal
);

public record InvoiceOcrResultDto(
    [property: JsonPropertyName("supplierName")] string SupplierName,
    [property: JsonPropertyName("supplierCuit")] string SupplierCuit,
    [property: JsonPropertyName("supplierTaxCondition")] string SupplierTaxCondition,
    [property: JsonPropertyName("invoiceType")] string InvoiceType,
    [property: JsonPropertyName("pointOfSale")] int PointOfSale,
    [property: JsonPropertyName("invoiceNumber")] int InvoiceNumber,
    [property: JsonPropertyName("issueDate")] string IssueDate,
    [property: JsonPropertyName("dueDate")] string? DueDate,
    [property: JsonPropertyName("cae")] string? Cae,
    [property: JsonPropertyName("caeDueDate")] string? CaeDueDate,
    [property: JsonPropertyName("currency")] string Currency,
    [property: JsonPropertyName("exchangeRate")] decimal ExchangeRate,
    [property: JsonPropertyName("items")] List<InvoiceOcrItemDto> Items,
    [property: JsonPropertyName("subtotal")] decimal Subtotal,
    [property: JsonPropertyName("vat21")] decimal Vat21,
    [property: JsonPropertyName("vat105")] decimal Vat105,
    [property: JsonPropertyName("vat27")] decimal Vat27,
    [property: JsonPropertyName("iibbPerception")] decimal IibbPerception,
    [property: JsonPropertyName("total")] decimal Total
);

public sealed class GeminiApiClient
{
    private readonly HttpClient _httpClient;
    private readonly string _apiKey;
    private readonly string _model;
    private readonly ILogger<GeminiApiClient> _logger;

    public GeminiApiClient(HttpClient httpClient, IConfiguration configuration, ILogger<GeminiApiClient> logger)
    {
        _httpClient = httpClient;
        _logger = logger;
        _apiKey = Environment.GetEnvironmentVariable("GEMINI_API_KEY") 
                  ?? configuration["Gemini:ApiKey"] 
                  ?? "AQ.Ab8RN6KSIzI37ur4u4gVfU3fDY1d-0rO9Dsw41J0FJs0oBmQIA";
        _model = configuration["Gemini:Model"] ?? "gemini-3.5-flash-lite";
    }

    public async Task<(bool Success, string Message)> TestConnectionAsync(CancellationToken ct = default)
    {
        try
        {
            var prompt = "Responde únicamente en formato JSON: {\"status\":\"OK\",\"version\":\"2.0\"}";
            var url = $"https://generativelanguage.googleapis.com/v1beta/models/{_model}:generateContent?key={_apiKey}";

            var requestBody = new
            {
                contents = new[]
                {
                    new
                    {
                        parts = new object[]
                        {
                            new { text = prompt }
                        }
                    }
                },
                generationConfig = new
                {
                    responseMimeType = "application/json"
                }
            };

            var json = JsonSerializer.Serialize(requestBody);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var response = await _httpClient.PostAsync(url, content, ct);
            var responseString = await response.Content.ReadAsStringAsync(ct);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Gemini API error: {StatusCode} {Response}", response.StatusCode, responseString);
                return (false, $"Error {response.StatusCode}: {responseString}");
            }

            return (true, "Conectado correctamente a Google Gemini API.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Exception calling Gemini API");
            return (false, ex.Message);
        }
    }

    public async Task<CctAnalysisResultDto?> AnalyzeCctAgreementAsync(
        string cctNumber, 
        string? base64Document = null, 
        string? mimeType = null, 
        CancellationToken ct = default)
    {
        try
        {
            var prompt = $@"
Actúa como un experto liquidador de sueldos y asesor laboral en Argentina.
Analiza la información provista para el Convenio Colectivo de Trabajo (CCT): '{cctNumber}'.
Si se adjunta un documento PDF o imagen de acuerdo/resolución paritaria:
- Extrae el número de CCT real si se menciona en el documento (ej: CCT 660/13, CCT 130/75, etc.).
- Extrae el sindicato o federación firmante (ej: UECARA, UOCRA, FAECYS).
- Extrae el período de vigencia o mes de aplicación (ej: Junio 2026, Julio 2026, Agosto 2026).
- Extrae el porcentaje de aumento paritario acordado.
- Extrae todas las categorías salariales representativas con sus sueldos básicos y sumas no remunerativas (SNR). Si el documento tiene varias zonas geográficas (ej: Zona I vs Patagonia), extrae prioritariamente la Zona I (General / Centro).
- Asegúrate de devolver los campos numéricos estrictamente como números decimales sin signos '$', sin comas ni puntos de miles (ej: 1673438.00). Si el valor horario no figura, calcula basicSalary / 200.

Si no se adjunta PDF, investiga y aplica OBLIGATORIAMENTE la escala salarial y paritaria homologada más reciente vigente en Argentina (año 2026).

Devuelve OBLIGATORIAMENTE un único objeto JSON con esta estructura exacta:
{{
  ""cctNumber"": ""660/13"",
  ""unionName"": ""Nombre oficial del sindicato"",
  ""effectivePeriod"": ""Mes y Año de vigencia"",
  ""percentageIncrease"": 2.1,
  ""summary"": ""Resumen ejecutivo del acuerdo"",
  ""salaryScales"": [
    {{
      ""category"": ""Capataz de Obra 1ra"",
      ""basicSalary"": 1673438.00,
      ""nonRemunerativeAmount"": 63300.00,
      ""hourlyRate"": 8367.19
    }}
  ]
}}";

            var parts = new List<object>();

            if (!string.IsNullOrWhiteSpace(base64Document))
            {
                parts.Add(new
                {
                    inlineData = new
                    {
                        mimeType = string.IsNullOrWhiteSpace(mimeType) ? "application/pdf" : mimeType,
                        data = base64Document
                    }
                });
            }

            parts.Add(new { text = prompt });

            var requestBody = new
            {
                contents = new[]
                {
                    new { parts = parts.ToArray() }
                },
                generationConfig = new
                {
                    responseMimeType = "application/json",
                    temperature = 0.2
                }
            };

            var url = $"https://generativelanguage.googleapis.com/v1beta/models/{_model}:generateContent?key={_apiKey}";
            var json = JsonSerializer.Serialize(requestBody);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var response = await _httpClient.PostAsync(url, content, ct);
            var responseString = await response.Content.ReadAsStringAsync(ct);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError("Gemini API error analyzing CCT: {StatusCode} {Response}", response.StatusCode, responseString);
                return null;
            }

            using var doc = JsonDocument.Parse(responseString);
            var root = doc.RootElement;
            var text = root.GetProperty("candidates")[0]
                           .GetProperty("content")
                           .GetProperty("parts")[0]
                           .GetProperty("text")
                           .GetString();

            if (string.IsNullOrWhiteSpace(text)) return null;

            // Clean code fences if present
            var cleanText = text.Trim();
            if (cleanText.StartsWith("```json", StringComparison.OrdinalIgnoreCase))
            {
                cleanText = cleanText.Substring(7);
            }
            else if (cleanText.StartsWith("```"))
            {
                cleanText = cleanText.Substring(3);
            }
            if (cleanText.EndsWith("```"))
            {
                cleanText = cleanText.Substring(0, cleanText.Length - 3);
            }
            cleanText = cleanText.Trim();

            var serializerOptions = new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true,
                NumberHandling = JsonNumberHandling.AllowReadingFromString
            };

            return JsonSerializer.Deserialize<CctAnalysisResultDto>(cleanText, serializerOptions);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error analyzing CCT with Gemini");
            return null;
        }
    }

    public async Task<InvoiceOcrResultDto?> ExtractInvoiceOcrAsync(
        string base64Document, 
        string mimeType, 
        CancellationToken ct = default)
    {
        try
        {
            var prompt = @"
Actúa como un sistema OCR fiscal experto para comprobantes fiscales de Argentina (AFIP / ARCA según RG 1415 Anexo II).
Analiza detalladamente esta imagen o documento PDF de factura de compra / gasto.

Extrae con absoluta exactitud los siguientes campos y devuelve UNICAMENTE un objeto JSON con este esquema exacto:
{
  ""supplierName"": ""Razón Social o Nombre del Proveedor"",
  ""supplierCuit"": ""30-12345678-9"",
  ""supplierTaxCondition"": ""IVA Responsable Inscripto"",
  ""invoiceType"": ""A"",
  ""pointOfSale"": 1,
  ""invoiceNumber"": 4821,
  ""issueDate"": ""2026-08-19"",
  ""dueDate"": ""2026-09-18"",
  ""cae"": ""74928192847291"",
  ""caeDueDate"": ""2026-08-29"",
  ""currency"": ""ARS"",
  ""exchangeRate"": 1.0,
  ""items"": [
    {
      ""code"": ""P001"",
      ""description"": ""Descripción del producto o servicio"",
      ""quantity"": 2,
      ""unitPrice"": 15000.00,
      ""vatRate"": 21.0,
      ""subtotal"": 30000.00
    }
  ],
  ""subtotal"": 30000.00,
  ""vat21"": 6300.00,
  ""vat105"": 0.00,
  ""vat27"": 0.00,
  ""iibbPerception"": 0.00,
  ""total"": 36300.00
}

Si algún dato no es legible o no está presente, usa valores razonables o vacíos (ej. punto de venta 1, exchangeRate 1.0, moneda ARS).";

            var parts = new List<object>
            {
                new
                {
                    inlineData = new
                    {
                        mimeType = mimeType,
                        data = base64Document
                    }
                },
                new { text = prompt }
            };

            var requestBody = new
            {
                contents = new[]
                {
                    new { parts = parts.ToArray() }
                },
                generationConfig = new
                {
                    responseMimeType = "application/json",
                    temperature = 0.1
                }
            };

            var url = $"https://generativelanguage.googleapis.com/v1beta/models/{_model}:generateContent?key={_apiKey}";
            var json = JsonSerializer.Serialize(requestBody);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var response = await _httpClient.PostAsync(url, content, ct);
            var responseString = await response.Content.ReadAsStringAsync(ct);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError("Gemini API error in Invoice OCR: {StatusCode} {Response}", response.StatusCode, responseString);
                return null;
            }

            using var doc = JsonDocument.Parse(responseString);
            var root = doc.RootElement;
            var text = root.GetProperty("candidates")[0]
                           .GetProperty("content")
                           .GetProperty("parts")[0]
                           .GetProperty("text")
                           .GetString();

            if (string.IsNullOrWhiteSpace(text)) return null;

            return JsonSerializer.Deserialize<InvoiceOcrResultDto>(text, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing Invoice OCR with Gemini");
            return null;
        }
    }
}
