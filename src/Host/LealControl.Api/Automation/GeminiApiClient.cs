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
                  ?? string.Empty;
        _model = configuration["Gemini:Model"] ?? "gemini-3.5-flash-lite";

        // La clave va en header y no en la URL, para que no quede en logs de requests ni proxies.
        if (!string.IsNullOrWhiteSpace(_apiKey))
        {
            _httpClient.DefaultRequestHeaders.Remove("x-goog-api-key");
            _httpClient.DefaultRequestHeaders.Add("x-goog-api-key", _apiKey);
        }
    }

    public async Task<(bool Success, string Message)> TestConnectionAsync(CancellationToken ct = default)
    {
        try
        {
            var prompt = "Responde únicamente en formato JSON: {\"status\":\"OK\",\"version\":\"2.0\"}";
            var url = $"https://generativelanguage.googleapis.com/v1beta/models/{_model}:generateContent";

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

    /// <summary>Lee el comprobante con Gemini; si no puede, devuelve el motivo para mostrarlo al usuario.</summary>
    public async Task<(InvoiceOcrResultDto? Result, string? Error)> ExtractInvoiceOcrAsync(
        string base64Document, 
        string mimeType, 
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(_apiKey))
            return (null, "Falta configurar la clave de Gemini (GEMINI_API_KEY) en el servidor.");
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

            var url = $"https://generativelanguage.googleapis.com/v1beta/models/{_model}:generateContent";
            var json = JsonSerializer.Serialize(requestBody);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var response = await _httpClient.PostAsync(url, content, ct);
            var responseString = await response.Content.ReadAsStringAsync(ct);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError("Gemini API error in Invoice OCR: {StatusCode} {Response}", response.StatusCode, responseString);
                return (null, OcrHttpError((int)response.StatusCode, responseString));
            }

            using var doc = JsonDocument.Parse(responseString);
            var root = doc.RootElement;
            var text = root.TryGetProperty("candidates", out var candidates) && candidates.GetArrayLength() > 0
                && candidates[0].TryGetProperty("content", out var c) && c.TryGetProperty("parts", out var p) && p.GetArrayLength() > 0
                && p[0].TryGetProperty("text", out var t) ? t.GetString() : null;
            if (string.IsNullOrWhiteSpace(text))
            {
                _logger.LogError("Gemini Invoice OCR without text: {Response}", responseString.Length > 2000 ? responseString[..2000] : responseString);
                return (null, "Gemini no devolvió datos del comprobante: el archivo puede estar ilegible, protegido o ser demasiado grande.");
            }

            try
            {
                var result = JsonSerializer.Deserialize<InvoiceOcrResultDto>(text, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                return result is null ? (null, "Gemini devolvió una respuesta vacía.") : (result, null);
            }
            catch (JsonException ex)
            {
                _logger.LogError(ex, "Gemini Invoice OCR returned invalid JSON: {Text}", text.Length > 2000 ? text[..2000] : text);
                return (null, "Gemini devolvió los datos en un formato que no se pudo leer. Probá de nuevo o cargá la factura a mano.");
            }
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        {
            _logger.LogError(ex, "Error processing Invoice OCR with Gemini");
            return (null, ex is TaskCanceledException && !ct.IsCancellationRequested
                ? "Gemini tardó demasiado en responder. Probá de nuevo."
                : "No se pudo conectar con Gemini. Probá de nuevo más tarde.");
        }
    }

    /// <summary>Motivo legible de un error HTTP de Gemini (sin la clave ni el documento).</summary>
    internal string OcrHttpError(int status, string body)
    {
        string? message = null;
        try
        {
            using var doc = JsonDocument.Parse(body);
            if (doc.RootElement.TryGetProperty("error", out var e) && e.TryGetProperty("message", out var m)) message = m.GetString();
        }
        catch (JsonException) { }
        var detail = message is { Length: > 0 } ? $": {(message.Length > 300 ? message[..300] : message)}" : "";
        return status switch
        {
            400 when message?.Contains("API key", StringComparison.OrdinalIgnoreCase) == true => "La clave de Gemini configurada en el servidor no es válida.",
            401 or 403 => $"Gemini rechazó la clave configurada en el servidor{detail}",
            404 => $"El modelo de Gemini \"{_model}\" no existe o no está disponible para esta clave (Gemini:Model){detail}",
            429 => "Se alcanzó el límite de uso de Gemini. Probá de nuevo en unos minutos.",
            _ => $"Gemini respondió con error {status}{detail}"
        };
    }
}
