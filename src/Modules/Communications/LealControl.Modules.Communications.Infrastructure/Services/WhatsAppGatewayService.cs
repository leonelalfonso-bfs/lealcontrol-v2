using System;
using System.Collections.Generic;
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
            ?? "http://evolution-api-evolution-api-1:8080";
        _apiKey = configuration["WhatsAppGateway:ApiKey"] 
            ?? Environment.GetEnvironmentVariable("WHATSAPP_GATEWAY_APIKEY") 
            ?? "c0cffb77a0e57afb8a2799b3008d9b032615825abe964eae";

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
                    await ConfigureInstanceWebhookAsync(instanceName, ct);
                    return new WhatsAppConnectResult(true, "connecting", qrcode, null);
                }
            }

            // Configure webhook for the instance to ensure it receives messages
            await ConfigureInstanceWebhookAsync(instanceName, ct);

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

    public async Task ConfigureInstanceWebhookAsync(string instanceName, CancellationToken ct = default)
    {
        try
        {
            var webhookPayload = new
            {
                webhook = new
                {
                    enabled = true,
                    url = "http://lealcontrol-staging-api:8080/api/communications/whatsapp/webhook",
                    byEvents = false,
                    base64 = false,
                    events = new[]
                    {
                        "MESSAGES_UPSERT",
                        "MESSAGES_UPDATE",
                        "CONNECTION_UPDATE"
                    }
                }
            };
            await _httpClient.PostAsJsonAsync($"webhook/set/{instanceName}", webhookPayload, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "No se pudo configurar webhook de instancia {Instance}", instanceName);
        }
    }

    public async Task<List<WhatsAppMessageItem>> FetchRecentMessagesAsync(string instanceName, CancellationToken ct = default)
    {
        var list = new List<WhatsAppMessageItem>();
        try
        {
            var payload = new { where = new { } };
            var res = await _httpClient.PostAsJsonAsync($"chat/findMessages/{instanceName}", payload, ct);
            if (!res.IsSuccessStatusCode)
            {
                // Fallback to GET /chat/findChats
                var chatsRes = await _httpClient.GetAsync($"chat/findChats/{instanceName}", ct);
                if (chatsRes.IsSuccessStatusCode)
                {
                    var chatsJson = await chatsRes.Content.ReadFromJsonAsync<JsonElement>(ct);
                    if (chatsJson.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var chat in chatsJson.EnumerateArray())
                        {
                            var remoteJid = chat.TryGetProperty("id", out var idProp) ? idProp.GetString() : "";
                            var pushName = chat.TryGetProperty("pushName", out var pnProp) ? pnProp.GetString() : (chat.TryGetProperty("name", out var nProp) ? nProp.GetString() : "");
                            var lastMsg = chat.TryGetProperty("lastMessage", out var lmProp) ? lmProp : default;
                            
                            if (!string.IsNullOrWhiteSpace(remoteJid) && !remoteJid.EndsWith("@g.us") && lastMsg.ValueKind == JsonValueKind.Object)
                            {
                                var key = lastMsg.TryGetProperty("key", out var kProp) ? kProp : default;
                                var msgId = key.TryGetProperty("id", out var midProp) ? midProp.GetString() : "";
                                var fromMe = key.TryGetProperty("fromMe", out var fmProp) && fmProp.GetBoolean();
                                var text = ExtractTextFromMessage(lastMsg.TryGetProperty("message", out var mProp) ? mProp : default);

                                if (!string.IsNullOrWhiteSpace(msgId) && !string.IsNullOrWhiteSpace(text))
                                {
                                    list.Add(new WhatsAppMessageItem(msgId, remoteJid, fromMe, pushName, text, DateTime.UtcNow));
                                }
                            }
                        }
                    }
                }
                return list;
            }

            var json = await res.Content.ReadFromJsonAsync<JsonElement>(ct);
            var records = json;
            if (json.TryGetProperty("records", out var rArray)) records = rArray;
            else if (json.TryGetProperty("messages", out var mArray)) records = mArray;

            if (records.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in records.EnumerateArray())
                {
                    var key = item.TryGetProperty("key", out var kProp) ? kProp : default;
                    var msgId = key.TryGetProperty("id", out var midProp) ? midProp.GetString() : "";
                    var remoteJid = key.TryGetProperty("remoteJid", out var rjProp) ? rjProp.GetString() : "";
                    var fromMe = key.TryGetProperty("fromMe", out var fmProp) && fmProp.GetBoolean();
                    var pushName = item.TryGetProperty("pushName", out var pnProp) ? pnProp.GetString() : "";
                    var text = ExtractTextFromMessage(item.TryGetProperty("message", out var mProp) ? mProp : default);

                    var timestamp = DateTime.UtcNow;
                    if (item.TryGetProperty("messageTimestamp", out var tsProp) && tsProp.TryGetInt64(out var tsVal))
                    {
                        timestamp = DateTimeOffset.FromUnixTimeSeconds(tsVal).UtcDateTime;
                    }

                    if (!string.IsNullOrWhiteSpace(msgId) && !string.IsNullOrWhiteSpace(remoteJid) && !remoteJid.EndsWith("@g.us"))
                    {
                        list.Add(new WhatsAppMessageItem(msgId, remoteJid, fromMe, pushName, string.IsNullOrWhiteSpace(text) ? "[Mensaje multimedia]" : text, timestamp));
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error sincronizando mensajes recientes de WhatsApp para {Instance}", instanceName);
        }
        return list;
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

    private static string ExtractTextFromMessage(JsonElement msgObj)
    {
        if (msgObj.ValueKind != JsonValueKind.Object) return "";
        if (msgObj.TryGetProperty("conversation", out var convProp)) return convProp.GetString() ?? "";
        if (msgObj.TryGetProperty("extendedTextMessage", out var extObj) && extObj.TryGetProperty("text", out var extText)) return extText.GetString() ?? "";
        if (msgObj.TryGetProperty("imageMessage", out var imgObj) && imgObj.TryGetProperty("caption", out var imgCap)) return imgCap.GetString() ?? "[Imagen de WhatsApp]";
        if (msgObj.TryGetProperty("documentMessage", out var docObj) && docObj.TryGetProperty("fileName", out var docFn)) return $"[Documento: {docFn.GetString()}]";
        return "";
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
public sealed record WhatsAppMessageItem(string MessageId, string RemoteJid, bool FromMe, string? PushName, string Text, DateTime TimestampUtc);
