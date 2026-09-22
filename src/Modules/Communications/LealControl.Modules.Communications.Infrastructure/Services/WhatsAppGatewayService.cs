using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
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
    private readonly string _webhookUrl;
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
        _webhookUrl = configuration["WhatsAppGateway:WebhookUrl"]
            ?? Environment.GetEnvironmentVariable("WHATSAPP_GATEWAY_WEBHOOK_URL")
            ?? "https://v2.lealcontrol.com/api/communications/whatsapp/webhook";

        if (!_baseUrl.EndsWith("/")) _baseUrl += "/";
        _httpClient.BaseAddress = new Uri(_baseUrl);
        _httpClient.DefaultRequestHeaders.TryAddWithoutValidation("apikey", _apiKey);
        _httpClient.Timeout = TimeSpan.FromSeconds(15);
    }

    public static string GetTenantInstanceName(Guid tenantId)
    {
        return $"tenant_{tenantId:N}";
    }

    public static string GetUserInstanceName(Guid tenantId, Guid userId)
    {
        return $"tenant_{tenantId:N}_user_{userId:N}";
    }

    public static string GetInstanceName(Guid tenantId, Guid? userId)
    {
        return userId.HasValue && userId.Value != Guid.Empty
            ? GetUserInstanceName(tenantId, userId.Value)
            : GetTenantInstanceName(tenantId);
    }

    public static bool TryParseInstance(string instance, out Guid tenantId, out Guid? userId)
    {
        tenantId = Guid.Empty;
        userId = null;

        if (string.IsNullOrWhiteSpace(instance) || !instance.StartsWith("tenant_"))
            return false;

        var remainder = instance["tenant_".Length..];
        var userIndex = remainder.IndexOf("_user_", StringComparison.OrdinalIgnoreCase);

        if (userIndex >= 0)
        {
            var tenantHex = remainder[..userIndex];
            var userHex = remainder[(userIndex + "_user_".Length)..];

            if (Guid.TryParseExact(tenantHex, "N", out tenantId))
            {
                if (Guid.TryParseExact(userHex, "N", out var parsedUser))
                {
                    userId = parsedUser;
                }
                return true;
            }
            return false;
        }

        return Guid.TryParseExact(remainder, "N", out tenantId);
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
            var checkRes = await _httpClient.GetAsync($"instance/connectionState/{instanceName}", ct);
            if (!checkRes.IsSuccessStatusCode)
            {
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

            await ConfigureInstanceWebhookAsync(instanceName, ct);

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
                enabled = true,
                url = _webhookUrl,
                webhook_by_events = false,
                events = new[]
                {
                    "MESSAGES_UPSERT",
                    "MESSAGES_UPDATE",
                    "CONNECTION_UPDATE",
                    "QRCODE_UPDATED"
                }
            };
            await _httpClient.PostAsJsonAsync($"webhook/set/{instanceName}", webhookPayload, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "No se pudo configurar webhook de instancia {Instance}", instanceName);
        }
    }

    public async Task<Dictionary<string, string>> FetchContactsMapAsync(string instanceName, CancellationToken ct = default)
    {
        var map = new Dictionary<string, string>();
        try
        {
            var res = await _httpClient.PostAsJsonAsync($"chat/findContacts/{instanceName}", new { where = new { } }, ct);
            if (!res.IsSuccessStatusCode)
            {
                res = await _httpClient.GetAsync($"chat/findContacts/{instanceName}", ct);
            }

            if (res.IsSuccessStatusCode)
            {
                var json = await res.Content.ReadFromJsonAsync<JsonElement>(ct);
                var array = json;
                if (json.TryGetProperty("records", out var rArray)) array = rArray;

                if (array.ValueKind == JsonValueKind.Array)
                {
                    foreach (var c in array.EnumerateArray())
                    {
                        var remoteJid = c.TryGetProperty("id", out var idProp) ? idProp.GetString() : (c.TryGetProperty("remoteJid", out var rjProp) ? rjProp.GetString() : "");
                        if (string.IsNullOrWhiteSpace(remoteJid) || remoteJid.EndsWith("@g.us")) continue;

                        var cleanPhone = CommunicationChannelHelper.NormalizeWhatsAppPhone(
                            Regex.Replace(remoteJid.Split('@')[0].Split(':')[0], @"[^\d]", ""));
                        if (string.IsNullOrWhiteSpace(cleanPhone)) continue;

                        var name = c.TryGetProperty("name", out var nProp) ? nProp.GetString() : null;
                        var pushName = c.TryGetProperty("pushName", out var pnProp) ? pnProp.GetString() : null;
                        var verifiedName = c.TryGetProperty("verifiedName", out var vnProp) ? vnProp.GetString() : null;
                        var notify = c.TryGetProperty("notify", out var notProp) ? notProp.GetString() : null;

                        var bestName = !string.IsNullOrWhiteSpace(name) ? name
                            : !string.IsNullOrWhiteSpace(verifiedName) ? verifiedName
                            : !string.IsNullOrWhiteSpace(pushName) ? pushName
                            : notify;

                        if (!string.IsNullOrWhiteSpace(bestName) && !bestName.Equals(cleanPhone, StringComparison.OrdinalIgnoreCase))
                        {
                            map[cleanPhone] = bestName;
                        }
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "No se pudieron obtener contactos de agenda de WhatsApp para {Instance}", instanceName);
        }
        return map;
    }

    public async Task<List<WhatsAppMessageItem>> FetchRecentMessagesAsync(string instanceName, Dictionary<string, string>? contactsMap = null, CancellationToken ct = default)
    {
        var list = new List<WhatsAppMessageItem>();
        try
        {
            // 1. Try GET /chat/findChats
            var chatsRes = await _httpClient.GetAsync($"chat/findChats/{instanceName}", ct);
            if (chatsRes.IsSuccessStatusCode)
            {
                var chatsJson = await chatsRes.Content.ReadFromJsonAsync<JsonElement>(ct);
                var chatArray = chatsJson;
                if (chatsJson.TryGetProperty("records", out var cr)) chatArray = cr;

                if (chatArray.ValueKind == JsonValueKind.Array)
                {
                    foreach (var chat in chatArray.EnumerateArray())
                    {
                        var remoteJid = chat.TryGetProperty("id", out var idProp) ? idProp.GetString() : (chat.TryGetProperty("remoteJid", out var rjProp) ? rjProp.GetString() : "");
                        if (string.IsNullOrWhiteSpace(remoteJid) || remoteJid.EndsWith("@g.us")) continue;

                        var participantId = CommunicationChannelHelper.ExtractWhatsAppParticipantId(remoteJid);
                        if (string.IsNullOrWhiteSpace(participantId)) continue;

                        var pushName = chat.TryGetProperty("pushName", out var pnProp) ? pnProp.GetString() : (chat.TryGetProperty("name", out var nProp) ? nProp.GetString() : "");
                        if (contactsMap != null && contactsMap.TryGetValue(participantId, out var agendaName) && !string.IsNullOrWhiteSpace(agendaName))
                        {
                            pushName = agendaName;
                        }

                        var lastMsg = chat.TryGetProperty("lastMessage", out var lmProp) ? lmProp : default;

                        if (lastMsg.ValueKind == JsonValueKind.Object)
                        {
                            var key = lastMsg.TryGetProperty("key", out var kProp) ? kProp : default;
                            var msgId = key.TryGetProperty("id", out var midProp) ? midProp.GetString() : "";
                            var fromMe = key.TryGetProperty("fromMe", out var fmProp) && fmProp.GetBoolean();
                            var msgObj = lastMsg.TryGetProperty("message", out var mProp) ? mProp : default;

                            var ts = DateTime.UtcNow;
                            if (lastMsg.TryGetProperty("messageTimestamp", out var tsProp) && tsProp.TryGetInt64(out var tsVal))
                            {
                                ts = DateTimeOffset.FromUnixTimeSeconds(tsVal).UtcDateTime;
                            }

                            var item = BuildMessageItem(msgId, remoteJid!, fromMe, pushName, msgObj, ts);
                            if (item != null && !list.Exists(x => x.MessageId == item.MessageId))
                            {
                                list.Add(item);
                            }
                        }
                    }
                }
            }

            // 2. Also try POST /chat/findMessages
            var payload = new { where = new { } };
            var res = await _httpClient.PostAsJsonAsync($"chat/findMessages/{instanceName}", payload, ct);
            if (res.IsSuccessStatusCode)
            {
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
                        if (string.IsNullOrWhiteSpace(msgId) || string.IsNullOrWhiteSpace(remoteJid) || remoteJid.EndsWith("@g.us")) continue;

                        var participantId = CommunicationChannelHelper.ExtractWhatsAppParticipantId(remoteJid);
                        if (string.IsNullOrWhiteSpace(participantId)) continue;

                        var fromMe = key.TryGetProperty("fromMe", out var fmProp) && fmProp.GetBoolean();
                        var pushName = item.TryGetProperty("pushName", out var pnProp) ? pnProp.GetString() : "";
                        if (contactsMap != null && contactsMap.TryGetValue(participantId, out var agendaName) && !string.IsNullOrWhiteSpace(agendaName))
                        {
                            pushName = agendaName;
                        }

                        var msgObj = item.TryGetProperty("message", out var mProp) ? mProp : default;

                        var timestamp = DateTime.UtcNow;
                        if (item.TryGetProperty("messageTimestamp", out var tsProp) && tsProp.TryGetInt64(out var tsVal))
                        {
                            timestamp = DateTimeOffset.FromUnixTimeSeconds(tsVal).UtcDateTime;
                        }

                        var built = BuildMessageItem(msgId, remoteJid, fromMe, pushName, msgObj, timestamp);
                        if (built != null && !list.Exists(x => x.MessageId == built.MessageId))
                        {
                            list.Add(built);
                        }
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
        return await SendMediaInternalAsync(instanceName, number, mediaUrl, null, mediaType, GuessMimeType(mediaType, fileName), fileName, caption, ct);
    }

    public async Task<WhatsAppSendResult> SendMediaBase64Async(string instanceName, string number, string base64Data, string mediaType, string mimeType, string fileName, string caption, CancellationToken ct = default)
    {
        var media = base64Data.Contains("base64,") ? base64Data : $"data:{mimeType};base64,{base64Data}";
        return await SendMediaInternalAsync(instanceName, number, media, base64Data, mediaType, mimeType, fileName, caption, ct);
    }

    private async Task<WhatsAppSendResult> SendMediaInternalAsync(string instanceName, string number, string media, string? rawBase64, string mediaType, string mimeType, string fileName, string caption, CancellationToken ct)
    {
        try
        {
            var cleanNumber = CleanPhoneNumber(number);
            var payload = new Dictionary<string, object?>
            {
                ["number"] = cleanNumber,
                ["mediatype"] = mediaType,
                ["mimetype"] = mimeType,
                ["caption"] = caption,
                ["media"] = media,
                ["fileName"] = fileName
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

    public async Task<WhatsAppMediaDownloadResult?> DownloadMediaAsync(string instanceName, string remoteJid, bool fromMe, string messageId, CancellationToken ct = default)
    {
        try
        {
            var payload = new
            {
                message = new
                {
                    key = new { remoteJid, fromMe, id = messageId }
                },
                convertToMp4 = false
            };

            var res = await _httpClient.PostAsJsonAsync($"chat/getBase64FromMediaMessage/{instanceName}", payload, ct);
            if (!res.IsSuccessStatusCode) return null;

            var json = await res.Content.ReadFromJsonAsync<JsonElement>(ct);
            var base64 = json.TryGetProperty("base64", out var b64Prop) ? b64Prop.GetString() : null;
            if (string.IsNullOrWhiteSpace(base64)) return null;

            var mimeType = json.TryGetProperty("mimetype", out var mtProp) ? mtProp.GetString() : "application/octet-stream";
            var fileName = json.TryGetProperty("fileName", out var fnProp) ? fnProp.GetString() : null;
            var mediaType = GuessMediaTypeFromMime(mimeType);

            byte[] data;
            var commaIdx = base64.IndexOf("base64,", StringComparison.Ordinal);
            var raw = commaIdx >= 0 ? base64[(commaIdx + 7)..] : base64;
            data = Convert.FromBase64String(raw);

            return new WhatsAppMediaDownloadResult(mediaType, mimeType ?? "application/octet-stream", fileName, data);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "No se pudo descargar media de WhatsApp {MessageId}", messageId);
            return null;
        }
    }

    public static ParsedChannelMessage ParseMessageContent(JsonElement msgObj)
    {
        if (msgObj.ValueKind != JsonValueKind.Object)
            return new ParsedChannelMessage("", null, null, null, null);

        msgObj = UnwrapMessageElement(msgObj);

        if (msgObj.TryGetProperty("conversation", out var convProp))
            return new ParsedChannelMessage(convProp.GetString() ?? "", null, null, null, null);

        if (msgObj.TryGetProperty("extendedTextMessage", out var extObj) && extObj.TryGetProperty("text", out var extText))
            return new ParsedChannelMessage(extText.GetString() ?? "", null, null, null, null);

        if (msgObj.TryGetProperty("imageMessage", out var imgObj))
        {
            var cap = imgObj.TryGetProperty("caption", out var imgCap) ? imgCap.GetString() : null;
            var mime = imgObj.TryGetProperty("mimetype", out var mt) ? mt.GetString() : "image/jpeg";
            return new ParsedChannelMessage(cap ?? "📷 Imagen", "image", mime, "imagen.jpg", null);
        }

        if (msgObj.TryGetProperty("videoMessage", out var vidObj))
        {
            var cap = vidObj.TryGetProperty("caption", out var vidCap) ? vidCap.GetString() : null;
            var mime = vidObj.TryGetProperty("mimetype", out var mt) ? mt.GetString() : "video/mp4";
            return new ParsedChannelMessage(cap ?? "🎬 Video", "video", mime, "video.mp4", null);
        }

        if (msgObj.TryGetProperty("documentMessage", out var docObj))
        {
            var fn = docObj.TryGetProperty("fileName", out var docFn) ? docFn.GetString() : "documento";
            var mime = docObj.TryGetProperty("mimetype", out var mt) ? mt.GetString() : "application/octet-stream";
            return new ParsedChannelMessage($"📎 {fn}", "document", mime, fn, null);
        }

        if (msgObj.TryGetProperty("audioMessage", out var audObj))
        {
            var mime = audObj.TryGetProperty("mimetype", out var mt) ? mt.GetString() : "audio/ogg; codecs=opus";
            var seconds = audObj.TryGetProperty("seconds", out var sec) ? sec.GetInt32() : 0;
            return new ParsedChannelMessage(seconds > 0 ? $"🎤 Nota de voz ({seconds}s)" : "🎤 Nota de voz", "audio", mime, "audio.ogg", null);
        }

        if (msgObj.TryGetProperty("pttMessage", out var pttObj))
        {
            var mime = pttObj.TryGetProperty("mimetype", out var mt) ? mt.GetString() : "audio/ogg; codecs=opus";
            return new ParsedChannelMessage("🎤 Nota de voz", "audio", mime, "audio.ogg", null);
        }

        return new ParsedChannelMessage("", null, null, null, null);
    }

    private static JsonElement UnwrapMessageElement(JsonElement msgObj)
    {
        if (msgObj.ValueKind != JsonValueKind.Object) return msgObj;

        if (msgObj.TryGetProperty("ephemeralMessage", out var ephemeral) && ephemeral.TryGetProperty("message", out var ephemeralMsg))
            return UnwrapMessageElement(ephemeralMsg);

        if (msgObj.TryGetProperty("viewOnceMessage", out var viewOnce) && viewOnce.TryGetProperty("message", out var viewOnceMsg))
            return UnwrapMessageElement(viewOnceMsg);

        if (msgObj.TryGetProperty("viewOnceMessageV2", out var viewOnceV2) && viewOnceV2.TryGetProperty("message", out var viewOnceV2Msg))
            return UnwrapMessageElement(viewOnceV2Msg);

        if (msgObj.TryGetProperty("documentWithCaptionMessage", out var docCap) && docCap.TryGetProperty("message", out var docCapMsg))
            return UnwrapMessageElement(docCapMsg);

        if (msgObj.TryGetProperty("editedMessage", out var edited) && edited.TryGetProperty("message", out var editedMsg))
            return UnwrapMessageElement(editedMsg);

        return msgObj;
    }

    private static WhatsAppMessageItem? BuildMessageItem(
        string? msgId,
        string remoteJid,
        bool fromMe,
        string? pushName,
        JsonElement messageElement,
        DateTime timestampUtc)
    {
        if (string.IsNullOrWhiteSpace(msgId)) return null;

        var parsed = ParseMessageContent(messageElement);
        var text = parsed.Text;
        if (string.IsNullOrWhiteSpace(text) && !string.IsNullOrWhiteSpace(parsed.MediaType))
            text = CommunicationMediaHelper.MediaPreviewLabel(parsed.MediaType, parsed.FileName);
        if (string.IsNullOrWhiteSpace(text) && string.IsNullOrWhiteSpace(parsed.MediaType))
            return null;

        return new WhatsAppMessageItem(
            msgId,
            remoteJid,
            fromMe,
            pushName,
            text,
            timestampUtc,
            parsed.MediaType,
            parsed.MimeType,
            parsed.FileName);
    }

    private static string GuessMediaTypeFromMime(string? mimeType)
    {
        if (string.IsNullOrWhiteSpace(mimeType)) return "document";
        if (mimeType.StartsWith("audio/", StringComparison.OrdinalIgnoreCase)) return "audio";
        if (mimeType.StartsWith("image/", StringComparison.OrdinalIgnoreCase)) return "image";
        if (mimeType.StartsWith("video/", StringComparison.OrdinalIgnoreCase)) return "video";
        return "document";
    }

    private static string GuessMimeType(string mediaType, string fileName)
    {
        if (mediaType == "audio")
            return fileName.EndsWith(".mp3", StringComparison.OrdinalIgnoreCase) ? "audio/mpeg" : "audio/ogg; codecs=opus";
        if (mediaType == "image") return "image/jpeg";
        if (mediaType == "video") return "video/mp4";
        return "application/pdf";
    }

    private static string ExtractTextFromMessage(JsonElement msgObj) => ParseMessageContent(msgObj).Text;

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
        var digits = Regex.Replace(number, @"[^\d]", "");
        return digits;
    }
}

public sealed record WhatsAppStatusResult(bool Available, string State, string? PhoneNumber, string? Error);
public sealed record WhatsAppConnectResult(bool Success, string State, string? QrCodeBase64, string? Error);
public sealed record WhatsAppSendResult(bool Success, string? MessageId, string? Error);
public sealed record WhatsAppMessageItem(
    string MessageId,
    string RemoteJid,
    bool FromMe,
    string? PushName,
    string Text,
    DateTime TimestampUtc,
    string? MediaType = null,
    string? MimeType = null,
    string? FileName = null);
public sealed record WhatsAppMediaDownloadResult(string MediaType, string MimeType, string? FileName, byte[] Data);
