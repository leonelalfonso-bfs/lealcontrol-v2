using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

namespace LealControl.Modules.Communications.Infrastructure.Services;

public sealed class MetaGraphApiService
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<MetaGraphApiService> _logger;
    private const string GraphApiBaseUrl = "https://graph.facebook.com/v19.0/";

    public MetaGraphApiService(HttpClient httpClient, ILogger<MetaGraphApiService> logger)
    {
        _httpClient = httpClient;
        _logger = logger;
        _httpClient.BaseAddress = new Uri(GraphApiBaseUrl);
        _httpClient.Timeout = TimeSpan.FromSeconds(15);
    }

    public async Task<MetaPageInfoResult> GetPageInfoAsync(string token, CancellationToken ct = default)
    {
        var cleanToken = token.Trim();
        try
        {
            var pageUrl = $"me?fields=id,name,instagram_business_account{{id,username}},connected_instagram_account{{id,username}}&access_token={Uri.EscapeDataString(cleanToken)}";
            var pageRes = await _httpClient.GetAsync(pageUrl, ct);
            if (pageRes.IsSuccessStatusCode)
            {
                var json = await pageRes.Content.ReadFromJsonAsync<JsonElement>(ct);
                var pageId = json.TryGetProperty("id", out var idProp) ? idProp.GetString() : null;
                var pageName = json.TryGetProperty("name", out var nameProp) ? nameProp.GetString() : null;
                string? igId = null;
                string? igUsername = null;

                if (json.TryGetProperty("instagram_business_account", out var igObj))
                {
                    if (igObj.TryGetProperty("id", out var igIdProp)) igId = igIdProp.GetString();
                    if (igObj.TryGetProperty("username", out var igUserProp)) igUsername = igUserProp.GetString();
                }
                else if (json.TryGetProperty("connected_instagram_account", out var connIgObj))
                {
                    if (connIgObj.TryGetProperty("id", out var igIdProp)) igId = igIdProp.GetString();
                    if (connIgObj.TryGetProperty("username", out var igUserProp)) igUsername = igUserProp.GetString();
                }

                return new MetaPageInfoResult(true, pageId, pageName, igId, igUsername, cleanToken, null);
            }

            var accountsUrl = $"me/accounts?fields=id,name,access_token,instagram_business_account{{id,username}},connected_instagram_account{{id,username}}&access_token={Uri.EscapeDataString(cleanToken)}";
            var accountsRes = await _httpClient.GetAsync(accountsUrl, ct);
            if (accountsRes.IsSuccessStatusCode)
            {
                var accountsJson = await accountsRes.Content.ReadFromJsonAsync<JsonElement>(ct);
                if (accountsJson.TryGetProperty("data", out var dataArray) && dataArray.ValueKind == JsonValueKind.Array && dataArray.GetArrayLength() > 0)
                {
                    JsonElement selectedPage = default;
                    foreach (var page in dataArray.EnumerateArray())
                    {
                        selectedPage = page;
                        if (page.TryGetProperty("instagram_business_account", out _) || page.TryGetProperty("connected_instagram_account", out _))
                        {
                            break;
                        }
                    }

                    var pId = selectedPage.TryGetProperty("id", out var piProp) ? piProp.GetString() : null;
                    var pName = selectedPage.TryGetProperty("name", out var pnProp) ? pnProp.GetString() : null;
                    var pToken = selectedPage.TryGetProperty("access_token", out var ptProp) ? ptProp.GetString() : cleanToken;
                    string? igId = null;
                    string? igUsername = null;

                    if (selectedPage.TryGetProperty("instagram_business_account", out var igObj))
                    {
                        if (igObj.TryGetProperty("id", out var igIdProp)) igId = igIdProp.GetString();
                        if (igObj.TryGetProperty("username", out var igUserProp)) igUsername = igUserProp.GetString();
                    }
                    else if (selectedPage.TryGetProperty("connected_instagram_account", out var connIgObj))
                    {
                        if (connIgObj.TryGetProperty("id", out var igIdProp)) igId = igIdProp.GetString();
                        if (connIgObj.TryGetProperty("username", out var igUserProp)) igUsername = igUserProp.GetString();
                    }

                    return new MetaPageInfoResult(true, pId, pName, igId, igUsername, pToken, null);
                }

                return new MetaPageInfoResult(false, null, null, null, null, null, "El usuario de Facebook no tiene ninguna Página administrada. Cree o vincule una Página comercial.");
            }

            var basicUrl = $"me?fields=id,name&access_token={Uri.EscapeDataString(cleanToken)}";
            var basicRes = await _httpClient.GetAsync(basicUrl, ct);
            if (basicRes.IsSuccessStatusCode)
            {
                var basicJson = await basicRes.Content.ReadFromJsonAsync<JsonElement>(ct);
                var id = basicJson.TryGetProperty("id", out var idProp) ? idProp.GetString() : null;
                var name = basicJson.TryGetProperty("name", out var nameProp) ? nameProp.GetString() : null;
                return new MetaPageInfoResult(true, id, name, null, null, cleanToken, null);
            }

            var errBody = await pageRes.Content.ReadAsStringAsync(ct);
            return new MetaPageInfoResult(false, null, null, null, null, null, $"Token inválido o expirado. Meta respondió: {errBody}");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error consultando información de página en Meta Graph API");
            return new MetaPageInfoResult(false, null, null, null, null, null, ex.Message);
        }
    }

    public async Task<MetaConversationFetchResult> FetchRecentConversationsAsync(
        string pageAccessToken,
        string channelType,
        string? pageName = null,
        string? pageId = null,
        string? igAccountId = null,
        CancellationToken ct = default)
    {
        var list = new List<MetaMessageItem>();
        var isIg = channelType.Equals(CommunicationChannelHelper.Instagram, StringComparison.OrdinalIgnoreCase);
        var fields = "id,snippet,updated_time,participants,messages{id,message,from,created_time,attachments{type,payload}}";
        var endpointsToTry = new List<string>();
        string? lastError = null;

        if (isIg)
        {
            if (string.IsNullOrWhiteSpace(igAccountId))
            {
                return new MetaConversationFetchResult(list, false,
                    "No hay cuenta de Instagram Business vinculada. Conectá Instagram desde una Página de Facebook con cuenta comercial de IG.");
            }

            endpointsToTry.Add($"{igAccountId}/conversations?platform=instagram&fields={fields}&access_token={Uri.EscapeDataString(pageAccessToken)}");
            if (!string.IsNullOrWhiteSpace(pageId))
            {
                endpointsToTry.Add($"{pageId}/conversations?platform=instagram&fields={fields}&access_token={Uri.EscapeDataString(pageAccessToken)}");
            }
        }
        else
        {
            if (string.IsNullOrWhiteSpace(pageId))
            {
                return new MetaConversationFetchResult(list, false, "No hay Page ID configurado para Facebook Messenger.");
            }

            endpointsToTry.Add($"{pageId}/conversations?fields={fields}&access_token={Uri.EscapeDataString(pageAccessToken)}");
        }

        foreach (var convUrl in endpointsToTry)
        {
            var res = await _httpClient.GetAsync(convUrl, ct);
            if (!res.IsSuccessStatusCode)
            {
                lastError = await res.Content.ReadAsStringAsync(ct);
                _logger.LogWarning("Meta Graph API error ({Channel}): {Status} {Body}", channelType, res.StatusCode, lastError);
                continue;
            }

            var json = await res.Content.ReadFromJsonAsync<JsonElement>(ct);
            if (json.TryGetProperty("data", out var dataArray) && dataArray.ValueKind == JsonValueKind.Array && dataArray.GetArrayLength() > 0)
            {
                foreach (var conv in dataArray.EnumerateArray())
                {
                    await ParseConversationMessagesAsync(conv, isIg, pageName, pageId, pageAccessToken, list, ct);
                }

                if (list.Count > 0)
                {
                    return new MetaConversationFetchResult(list, true, null);
                }
            }
        }

        if (list.Count == 0)
        {
            var channelLabel = isIg ? "Instagram Direct" : "Facebook Messenger";
            var detail = string.IsNullOrWhiteSpace(lastError)
                ? $"No se encontraron conversaciones de {channelLabel}. Verificá permisos pages_messaging e instagram_manage_messages."
                : $"Meta API respondió con error para {channelLabel}: {lastError}";
            return new MetaConversationFetchResult(list, false, detail);
        }

        return new MetaConversationFetchResult(list, true, null);
    }

    private async Task ParseConversationMessagesAsync(
        JsonElement conv,
        bool isIg,
        string? pageName,
        string? pageId,
        string pageAccessToken,
        List<MetaMessageItem> list,
        CancellationToken ct)
    {
        var convId = conv.TryGetProperty("id", out var ciProp) ? ciProp.GetString() : Guid.NewGuid().ToString("N");
        string? customerId = null;
        string? customerName = null;

        if (conv.TryGetProperty("participants", out var partObj) && partObj.TryGetProperty("data", out var partArray) && partArray.ValueKind == JsonValueKind.Array)
        {
            foreach (var p in partArray.EnumerateArray())
            {
                var pName = p.TryGetProperty("name", out var pnProp) ? pnProp.GetString() : (p.TryGetProperty("username", out var puProp) ? puProp.GetString() : null);
                var pId = p.TryGetProperty("id", out var piProp) ? piProp.GetString() : null;

                var isPage = (!string.IsNullOrWhiteSpace(pName) && !string.IsNullOrWhiteSpace(pageName) && pName.Equals(pageName, StringComparison.OrdinalIgnoreCase))
                    || (!string.IsNullOrWhiteSpace(pId) && !string.IsNullOrWhiteSpace(pageId) && pId.Equals(pageId, StringComparison.OrdinalIgnoreCase));

                if (!isPage)
                {
                    if (!string.IsNullOrWhiteSpace(pName)) customerName = pName;
                    if (!string.IsNullOrWhiteSpace(pId)) customerId = pId;
                }
            }
        }

        if (conv.TryGetProperty("messages", out var msgObj) && msgObj.TryGetProperty("data", out var msgArray) && msgArray.ValueKind == JsonValueKind.Array)
        {
            if (string.IsNullOrWhiteSpace(customerName))
            {
                foreach (var m in msgArray.EnumerateArray())
                {
                    var fromObj = m.TryGetProperty("from", out var foProp) ? foProp : default;
                    var fromName = fromObj.TryGetProperty("name", out var fnProp) ? fnProp.GetString() : (fromObj.TryGetProperty("username", out var fuProp) ? fuProp.GetString() : null);
                    var fromId = fromObj.TryGetProperty("id", out var fiProp) ? fiProp.GetString() : null;

                    var isFromPage = (!string.IsNullOrWhiteSpace(fromName) && !string.IsNullOrWhiteSpace(pageName) && fromName.Equals(pageName, StringComparison.OrdinalIgnoreCase))
                        || (!string.IsNullOrWhiteSpace(fromId) && !string.IsNullOrWhiteSpace(pageId) && fromId.Equals(pageId, StringComparison.OrdinalIgnoreCase));

                    if (!isFromPage)
                    {
                        if (!string.IsNullOrWhiteSpace(fromName)) customerName = fromName;
                        if (!string.IsNullOrWhiteSpace(fromId) && string.IsNullOrWhiteSpace(customerId)) customerId = fromId;
                        break;
                    }
                }
            }

            if (string.IsNullOrWhiteSpace(customerName) && !string.IsNullOrWhiteSpace(customerId) && !isIg)
            {
                try
                {
                    var userRes = await _httpClient.GetAsync($"{customerId}?fields=first_name,last_name,name&access_token={Uri.EscapeDataString(pageAccessToken)}", ct);
                    if (userRes.IsSuccessStatusCode)
                    {
                        var userJson = await userRes.Content.ReadFromJsonAsync<JsonElement>(ct);
                        var uName = userJson.TryGetProperty("name", out var unProp) ? unProp.GetString() : null;
                        if (!string.IsNullOrWhiteSpace(uName)) customerName = uName;
                    }
                }
                catch
                {
                    // ignore lookup failures
                }
            }

            var threadParticipantId = !string.IsNullOrWhiteSpace(customerId) ? customerId : (convId ?? Guid.NewGuid().ToString("N"));
            var threadContactName = !string.IsNullOrWhiteSpace(customerName)
                ? customerName
                : (isIg ? $"Contacto Instagram ({threadParticipantId[..Math.Min(6, threadParticipantId.Length)]})" : $"Contacto Facebook ({threadParticipantId[..Math.Min(6, threadParticipantId.Length)]})");

            foreach (var m in msgArray.EnumerateArray())
            {
                var mid = m.TryGetProperty("id", out var midProp) ? midProp.GetString() : null;
                var text = m.TryGetProperty("message", out var textProp) ? textProp.GetString() : null;
                var createdStr = m.TryGetProperty("created_time", out var crProp) ? crProp.GetString() : null;
                var fromObj = m.TryGetProperty("from", out var foProp) ? foProp : default;
                var fromName = fromObj.TryGetProperty("name", out var fnProp) ? fnProp.GetString() : (fromObj.TryGetProperty("username", out var fuProp) ? fuProp.GetString() : null);

                string? attachmentType = null;
                string? attachmentUrl = null;
                if (m.TryGetProperty("attachments", out var attObj) && attObj.TryGetProperty("data", out var attData) && attData.ValueKind == JsonValueKind.Array && attData.GetArrayLength() > 0)
                {
                    var firstAtt = attData[0];
                    attachmentType = firstAtt.TryGetProperty("type", out var atProp) ? atProp.GetString() : null;
                    if (firstAtt.TryGetProperty("payload", out var payload) && payload.TryGetProperty("url", out var urlProp))
                    {
                        attachmentUrl = urlProp.GetString();
                    }
                }

                DateTime createdUtc = DateTime.UtcNow;
                if (!string.IsNullOrWhiteSpace(createdStr) && DateTime.TryParse(createdStr, out var parsedDt))
                {
                    createdUtc = parsedDt.ToUniversalTime();
                }

                if (!string.IsNullOrWhiteSpace(mid) && (!string.IsNullOrWhiteSpace(text) || !string.IsNullOrWhiteSpace(attachmentType)))
                {
                    list.Add(new MetaMessageItem(
                        mid,
                        isIg ? CommunicationChannelHelper.Instagram : CommunicationChannelHelper.Facebook,
                        threadParticipantId,
                        threadContactName,
                        fromName ?? threadContactName,
                        text ?? CommunicationMediaHelper.MediaPreviewLabel(attachmentType, null),
                        createdUtc,
                        attachmentType,
                        attachmentUrl
                    ));
                }
            }
        }
    }

    public async Task<MetaSendResult> SendMessageAsync(string pageAccessToken, string recipientId, string text, CancellationToken ct = default)
    {
        return await SendPayloadAsync(pageAccessToken, recipientId, new { text }, ct);
    }

    public async Task<MetaSendResult> SendAttachmentAsync(string pageAccessToken, string recipientId, string attachmentType, string url, CancellationToken ct = default)
    {
        var payload = new
        {
            attachment = new
            {
                type = attachmentType,
                payload = new { url, is_reusable = true }
            }
        };
        return await SendPayloadAsync(pageAccessToken, recipientId, payload, ct);
    }

    public async Task<byte[]?> DownloadAttachmentAsync(string url, CancellationToken ct = default)
    {
        try
        {
            var response = await _httpClient.GetAsync(url, ct);
            if (!response.IsSuccessStatusCode) return null;
            return await response.Content.ReadAsByteArrayAsync(ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error descargando adjunto de Meta");
            return null;
        }
    }

    private async Task<MetaSendResult> SendPayloadAsync(string pageAccessToken, string recipientId, object messagePayload, CancellationToken ct)
    {
        try
        {
            var payload = new
            {
                recipient = new { id = recipientId },
                message = messagePayload,
                messaging_type = "RESPONSE"
            };

            var url = $"me/messages?access_token={Uri.EscapeDataString(pageAccessToken)}";
            var response = await _httpClient.PostAsJsonAsync(url, payload, ct);

            if (response.IsSuccessStatusCode)
            {
                var json = await response.Content.ReadFromJsonAsync<JsonElement>(ct);
                var msgId = json.TryGetProperty("message_id", out var mid) ? mid.GetString() : null;
                return new MetaSendResult(true, msgId, null);
            }

            var errBody = await response.Content.ReadAsStringAsync(ct);
            return new MetaSendResult(false, null, $"Error enviando mensaje a Meta ({response.StatusCode}): {errBody}");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error enviando mensaje a través de Meta Graph API");
            return new MetaSendResult(false, null, ex.Message);
        }
    }
}

public sealed record MetaPageInfoResult(bool Success, string? PageId, string? PageName, string? InstagramAccountId, string? InstagramUsername, string? ResolvedPageAccessToken, string? Error);
public sealed record MetaSendResult(bool Success, string? MessageId, string? Error);
public sealed record MetaConversationFetchResult(IReadOnlyList<MetaMessageItem> Messages, bool Success, string? Error);
public sealed record MetaMessageItem(string MessageId, string ChannelType, string ParticipantId, string ParticipantName, string FromName, string Text, DateTime CreatedAtUtc, string? AttachmentType = null, string? AttachmentUrl = null);
