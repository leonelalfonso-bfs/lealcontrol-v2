using System;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace LealControl.Modules.Communications.Infrastructure.Services;

public sealed class WhatsAppGatewayService
{
    private readonly HttpClient _httpClient;
    private readonly string _baseUrl;
    private readonly string _apiKey;
    private readonly ILogger<WhatsAppGatewayService> _logger;

    public WhatsAppGatewayService(HttpClient httpClient, IConfiguration configuration, ILogger<WhatsAppGatewayService> logger)
    {
        _httpClient = httpClient;
        _logger = logger;
        _baseUrl = configuration["WhatsAppGateway:Url"] 
            ?? Environment.GetEnvironmentVariable("WHATSAPP_GATEWAY_URL") 
            ?? "http://whatsapp-gateway:8080";
        _apiKey = configuration["WhatsAppGateway:ApiKey"] 
            ?? Environment.GetEnvironmentVariable("WHATSAPP_GATEWAY_APIKEY") 
            ?? "lealcontrol_wa_master_key_2026";

        if (!_baseUrl.EndsWith("/")) _baseUrl += "/";
        _httpClient.BaseAddress = new Uri(_baseUrl);
        _httpClient.DefaultRequestHeaders.TryAddWithoutValidation("apikey", _apiKey);
        _httpClient.Timeout = TimeSpan.FromSeconds(15);
    }

    public static string GetTenantInstanceName(Guid tenantId)
    {
        return $"tenant_{tenantId:N}";
    }

    public async Task<WhatsAppStatusResult> GetStatusAsync(string instanceName, CancellationToken ct = default)
    {
        try
        {
            var response = await _httpClient.GetAsync($"instance/connectionState/{instanceName}", ct);
            if (!response.IsSuccessStatusCode)
            {
                return new WhatsAppStatusResult(true, "disconnected", null, null);
            }

            var json = await response.Content.ReadFromJsonAsync<JsonElement>(ct);
            var state = "disconnected";
            string? phone = null;

            if (json.TryGetProperty("instance", out var instObj))
            {
                if (instObj.TryGetProperty("state", out var stateProp))
                {
                    state = stateProp.GetString() ?? "disconnected";
                }
                if (instObj.TryGetProperty("owner", out var ownerProp))
                {
                    phone = ownerProp.GetString();
                }
            }

            return new WhatsAppStatusResult(true, state, phone, null);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error consultando estado de WhatsApp para instancia {Instance}", instanceName);
            return new WhatsAppStatusResult(false, "offline_gateway", null, ex.Message);
        }
    }

    public async Task<WhatsAppConnectResult> ConnectQrAsync(string instanceName, CancellationToken ct = default)
    {
        try
        {
            // First check if instance exists
            var checkRes = await _httpClient.GetAsync($"instance/connectionState/{instanceName}", ct);
            if (!checkRes.IsSuccessStatusCode)
            {
                // Create instance
                var createPayload = new
                {
                    instanceName,
                    qrcode = true,
                    integration = "WHATSAPP-BAILEYS"
                };
                var createRes = await _httpClient.PostAsJsonAsync("instance/create", createPayload, ct);
                if (createRes.IsSuccessStatusCode)
                {
                    var createJson = await createRes.Content.ReadFromJsonAsync<JsonElement>(ct);
                    var qrcode = ExtractQrCode(createJson);
                    return new WhatsAppConnectResult(true, "connecting", qrcode, null);
                }
            }

            // Connect existing instance to get QR
            var connectRes = await _httpClient.GetAsync($"instance/connect/{instanceName}", ct);
            if (connectRes.IsSuccessStatusCode)
            {
                var connectJson = await connectRes.Content.ReadFromJsonAsync<JsonElement>(ct);
                var qrcode = ExtractQrCode(connectJson);
                var state = "connecting";
                if (connectJson.TryGetProperty("instance", out var instObj) && instObj.TryGetProperty("state", out var stateProp))
                {
                    state = stateProp.GetString() ?? "connecting";
                }
                return new WhatsAppConnectResult(true, state, qrcode, null);
            }

            return new WhatsAppConnectResult(false, "error", null, "No se pudo generar el código QR de conexión.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error conectando WhatsApp para {Instance}", instanceName);
            return new WhatsAppConnectResult(false, "gateway_unreachable", null, "El servicio de WhatsApp Gateway no está disponible actualmente. Verifique la conexión.");
        }
    }

    public async Task<bool> DisconnectAsync(string instanceName, CancellationToken ct = default)
    {
        try
        {
            var res = await _httpClient.DeleteAsync($"instance/logout/{instanceName}", ct);
            return res.IsSuccessStatusCode;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error desconectando instancia WhatsApp {Instance}", instanceName);
            return false;
        }
    }

    public async Task<WhatsAppSendResult> SendTextMessageAsync(string instanceName, string number, string text, CancellationToken ct = default)
    {
        try
        {
            var cleanNumber = CleanPhoneNumber(number);
            var payload = new
            {
                number = cleanNumber,
                text = text
            };

            var res = await _httpClient.PostAsJsonAsync($"message/sendText/{instanceName}", payload, ct);
            if (res.IsSuccessStatusCode)
            {
                var json = await res.Content.ReadFromJsonAsync<JsonElement>(ct);
                var msgId = "";
                if (json.TryGetProperty("key", out var keyObj) && keyObj.TryGetProperty("id", out var idProp))
                {
                    msgId = idProp.GetString() ?? "";
                }
                return new WhatsAppSendResult(true, msgId, null);
            }

            var errBody = await res.Content.ReadAsStringAsync(ct);
            return new WhatsAppSendResult(false, null, $"Error del gateway ({res.StatusCode}): {errBody}");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error enviando mensaje de WhatsApp a {Number}", number);
            return new WhatsAppSendResult(false, null, ex.Message);
        }
    }

    public async Task<WhatsAppSendResult> SendMediaMessageAsync(string instanceName, string number, string mediaUrl, string mediaType, string fileName, string caption, CancellationToken ct = default)
    {
        try
        {
            var cleanNumber = CleanPhoneNumber(number);
            var payload = new
            {
                number = cleanNumber,
                mediatype = mediaType, // document, image, audio
                mimetype = mediaType == "document" ? "application/pdf" : "image/png",
                caption = caption,
                media = mediaUrl,
                fileName = fileName
            };

            var res = await _httpClient.PostAsJsonAsync($"message/sendMedia/{instanceName}", payload, ct);
            if (res.IsSuccessStatusCode)
            {
                var json = await res.Content.ReadFromJsonAsync<JsonElement>(ct);
                var msgId = "";
                if (json.TryGetProperty("key", out var keyObj) && keyObj.TryGetProperty("id", out var idProp))
                {
                    msgId = idProp.GetString() ?? "";
                }
                return new WhatsAppSendResult(true, msgId, null);
            }

            var errBody = await res.Content.ReadAsStringAsync(ct);
            return new WhatsAppSendResult(false, null, $"Error del gateway ({res.StatusCode}): {errBody}");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error enviando archivo por WhatsApp a {Number}", number);
            return new WhatsAppSendResult(false, null, ex.Message);
        }
    }

    private static string? ExtractQrCode(JsonElement json)
    {
        if (json.TryGetProperty("qrcode", out var qrObj))
        {
            if (qrObj.ValueKind == JsonValueKind.String) return qrObj.GetString();
            if (qrObj.TryGetProperty("base64", out var b64Prop)) return b64Prop.GetString();
            if (qrObj.TryGetProperty("code", out var codeProp)) return codeProp.GetString();
        }
        if (json.TryGetProperty("base64", out var directB64)) return directB64.GetString();
        if (json.TryGetProperty("code", out var directCode)) return directCode.GetString();
        return null;
    }

    private static string CleanPhoneNumber(string number)
    {
        var digits = System.Text.RegularExpressions.Regex.Replace(number, @"[^\d]", "");
        return digits;
    }
}

public sealed record WhatsAppStatusResult(bool Available, string State, string? PhoneNumber, string? Error);
public sealed record WhatsAppConnectResult(bool Success, string State, string? QrCodeBase64, string? Error);
public sealed record WhatsAppSendResult(bool Success, string? MessageId, string? Error);
