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
        _httpClient.Timeout = TimeSpan.FromSeconds(20);
    }

    public async Task<MetaPageInfoResult> GetPageInfoAsync(string token, CancellationToken ct = default)
    {
        var cleanToken = token.Trim();
        try
        {
            string? foundPageId = null;
            string? foundPageName = null;
            string? foundPageToken = cleanToken;
            string? foundIgId = null;
            string? foundIgUsername = null;

            // 1. Try querying "me" directly
            var meUrl = $"me?fields=id,name,instagram_business_account{{id,username}},connected_instagram_account{{id,username}}&access_token={Uri.EscapeDataString(cleanToken)}";
            var meRes = await _httpClient.GetAsync(meUrl, ct);
            if (meRes.IsSuccessStatusCode)
            {
                var json = await meRes.Content.ReadFromJsonAsync<JsonElement>(ct);
                foundPageId = json.TryGetProperty("id", out var idProp) ? idProp.GetString() : null;
                foundPageName = json.TryGetProperty("name", out var nameProp) ? nameProp.GetString() : null;

                ExtractInstagramFields(json, ref foundIgId, ref foundIgUsername);
            }

            // 2. Try querying "me/accounts" (Facebook Pages managed by this user/system user)
            var accountsUrl = $"me/accounts?fields=id,name,access_token,instagram_business_account{{id,username}},connected_instagram_account{{id,username}}&access_token={Uri.EscapeDataString(cleanToken)}";
            var accountsRes = await _httpClient.GetAsync(accountsUrl, ct);
            if (accountsRes.IsSuccessStatusCode)
            {
                var accountsJson = await accountsRes.Content.ReadFromJsonAsync<JsonElement>(ct);
                if (accountsJson.TryGetProperty("data", out var dataArray) && dataArray.ValueKind == JsonValueKind.Array && dataArray.GetArrayLength() > 0)
                {
                    foreach (var page in dataArray.EnumerateArray())
                    {
                        var pId = page.TryGetProperty("id", out var piProp) ? piProp.GetString() : null;
                        var pName = page.TryGetProperty("name", out var pnProp) ? pnProp.GetString() : null;
                        var pToken = page.TryGetProperty("access_token", out var ptProp) ? ptProp.GetString() : cleanToken;

                        if (foundPageId is null)
                        {
                            foundPageId = pId;
                            foundPageName = pName;
                            foundPageToken = pToken;
                        }

                        ExtractInstagramFields(page, ref foundIgId, ref foundIgUsername);

                        // If not found in summary, try querying the specific page directly with its page token
                        if (foundIgId is null && !string.IsNullOrWhiteSpace(pId))
                        {
                            try
                            {
                                var singlePageUrl = $"{pId}?fields=id,name,access_token,instagram_business_account{{id,username}},connected_instagram_account{{id,username}},instagram_accounts{{id,username}}&access_token={Uri.EscapeDataString(pToken ?? cleanToken)}";
                                var spRes = await _httpClient.GetAsync(singlePageUrl, ct);
                                if (spRes.IsSuccessStatusCode)
                                {
                                    var spJson = await spRes.Content.ReadFromJsonAsync<JsonElement>(ct);
                                    ExtractInstagramFields(spJson, ref foundIgId, ref foundIgUsername);
                                    if (foundIgId is not null)
                                    {
                                        foundPageId = pId;
                                        foundPageName = pName;
                                        foundPageToken = pToken;
                                        break;
                                    }
                                }
                            }
                            catch
                            {
                                // continue to next page
                            }
                        }
                        else if (foundIgId is not null)
                        {
                            foundPageId = pId;
                            foundPageName = pName;
                            foundPageToken = pToken;
                            break;
                        }
                    }
                }
            }

            // 3. If Instagram ID still not found, try querying Instagram accounts directly
            if (foundIgId is null && !string.IsNullOrWhiteSpace(foundPageId))
            {
                try
                {
                    var igAccUrl = $"{foundPageId}/instagram_accounts?fields=id,username&access_token={Uri.EscapeDataString(foundPageToken ?? cleanToken)}";
                    var igAccRes = await _httpClient.GetAsync(igAccUrl, ct);
                    if (igAccRes.IsSuccessStatusCode)
                    {
                        var igAccJson = await igAccRes.Content.ReadFromJsonAsync<JsonElement>(ct);
                        if (igAccJson.TryGetProperty("data", out var igArr) && igArr.ValueKind == JsonValueKind.Array && igArr.GetArrayLength() > 0)
                        {
                            var firstIg = igArr[0];
                            if (firstIg.TryGetProperty("id", out var iid)) foundIgId = iid.GetString();
                            if (firstIg.TryGetProperty("username", out var iun)) foundIgUsername = iun.GetString();
                        }
                    }
                }
                catch
                {
                    // ignore
                }
            }

            if (!string.IsNullOrWhiteSpace(foundPageId) || !string.IsNullOrWhiteSpace(foundIgId))
            {
                return new MetaPageInfoResult(true, foundPageId, foundPageName, foundIgId, foundIgUsername, foundPageToken, null);
            }

            var errBody = await meRes.Content.ReadAsStringAsync(ct);
            return new MetaPageInfoResult(false, null, null, null, null, null, $"No se detectó ninguna Página de Facebook ni cuenta de Instagram comercial. Meta respondió: {errBody}");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error consultando información de página en Meta Graph API");
            return new MetaPageInfoResult(false, null, null, null, null, null, ex.Message);
        }
    }

    private static void ExtractInstagramFields(JsonElement json, ref string? igId, ref string? igUsername)
    {
        if (json.TryGetProperty("instagram_business_account", out var igObj) && igObj.ValueKind == JsonValueKind.Object)
        {
            if (igObj.TryGetProperty("id", out var igIdProp)) igId = igIdProp.GetString();
            if (igObj.TryGetProperty("username", out var igUserProp)) igUsername = igUserProp.GetString();
        }
        else if (json.TryGetProperty("connected_instagram_account", out var connIgObj) && connIgObj.ValueKind == JsonValueKind.Object)
        {
            if (connIgObj.TryGetProperty("id", out var igIdProp)) igId = igIdProp.GetString();
            if (connIgObj.TryGetProperty("username", out var igUserProp)) igUsername = igUserProp.GetString();
        }
        else if (json.TryGetProperty("instagram_accounts", out var igAccObj) && igAccObj.TryGetProperty("data", out var igData) && igData.ValueKind == JsonValueKind.Array && igData.GetArrayLength() > 0)
        {
            var first = igData[0];
            if (first.TryGetProperty("id", out var igIdProp)) igId = igIdProp.GetString();
            if (first.TryGetProperty("username", out var igUserProp)) igUsername = igUserProp.GetString();
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
            // If igAccountId was missing, try to resolve it on the fly
            if (string.IsNullOrWhiteSpace(igAccountId) && !string.IsNullOrWhiteSpace(pageId))
            {
                try
                {
                    var pageInfo = await GetPageInfoAsync(pageAccessToken, ct);
                    if (!string.IsNullOrWhiteSpace(pageInfo.InstagramAccountId))
                    {
                        igAccountId = pageInfo.InstagramAccountId;
                    }
                }
                catch
                {
                    // ignore
                }
            }

            if (!string.IsNullOrWhiteSpace(igAccountId))
            {
                endpointsToTry.Add($"{igAccountId}/conversations?platform=instagram&fields={fields}&access_token={Uri.EscapeDataString(pageAccessToken)}");
            }
            if (!string.IsNullOrWhiteSpace(pageId))
            {
                endpointsToTry.Add($"{pageId}/conversations?platform=instagram&fields={fields}&access_token={Uri.EscapeDataString(pageAccessToken)}");
            }
            endpointsToTry.Add($"me/conversations?platform=instagram&fields={fields}&access_token={Uri.EscapeDataString(pageAccessToken)}");
        }
        else
        {
            if (!string.IsNullOrWhiteSpace(pageId))
            {
                endpointsToTry.Add($"{pageId}/conversations?fields={fields}&access_token={Uri.EscapeDataString(pageAccessToken)}");
            }
            endpointsToTry.Add($"me/conversations?fields={fields}&access_token={Uri.EscapeDataString(pageAccessToken)}");
        }

        var triedAny = false;
        foreach (var endpoint in endpointsToTry)
        {
            triedAny = true;
            try
            {
                var response = await _httpClient.GetAsync(endpoint, ct);
                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadFromJsonAsync<JsonElement>(ct);
                    if (json.TryGetProperty("data", out var dataArray) && dataArray.ValueKind == JsonValueKind.Array)
                    {
                        ParseConversationsData(dataArray, list, isIg, pageName, pageId, igAccountId, pageAccessToken, ct);
                        return new MetaConversationFetchResult(list, true, null);
                    }
                }
                else
                {
                    var body = await response.Content.ReadAsStringAsync(ct);
                    lastError = $"HTTP {response.StatusCode}: {body}";
                }
            }
            catch (Exception ex)
            {
                lastError = ex.Message;
            }
        }

        if (!triedAny)
        {
            return new MetaConversationFetchResult(list, false, "No se encontraron identificadores de Página ni Instagram para sincronizar.");
        }

        return new MetaConversationFetchResult(list, false, lastError ?? "No se pudieron obtener las conversaciones de Meta.");
    }

    private async void ParseConversationsData(
        JsonElement dataArray,
        List<MetaMessageItem> list,
        bool isIg,
        string? pageName,
        string? pageId,
        string? igAccountId,
        string pageAccessToken,
        CancellationToken ct)
    {
        foreach (var conv in dataArray.EnumerateArray())
        {
            var convId = conv.TryGetProperty("id", out var idProp) ? idProp.GetString() : null;
            var participants = conv.TryGetProperty("participants", out var pProp) ? pProp : default;
            var messages = conv.TryGetProperty("messages", out var mProp) ? mProp : default;

            if (!messages.TryGetProperty("data", out var msgArray) || msgArray.ValueKind != JsonValueKind.Array)
                continue;

            string? customerName = null;
            string? customerId = null;

            if (participants.TryGetProperty("data", out var partArray) && partArray.ValueKind == JsonValueKind.Array)
            {
                foreach (var p in partArray.EnumerateArray())
                {
                    var fromId = p.TryGetProperty("id", out var pidProp) ? pidProp.GetString() : null;
                    var fromName = p.TryGetProperty("name", out var pnProp) ? pnProp.GetString() : (p.TryGetProperty("username", out var puProp) ? puProp.GetString() : null);

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

    public static bool IsTokenExpiredError(string? error)
    {
        if (string.IsNullOrWhiteSpace(error)) return false;
        return error.Contains("Session has expired", StringComparison.OrdinalIgnoreCase)
            || error.Contains("\"code\":190", StringComparison.Ordinal)
            || error.Contains("Error validating access token", StringComparison.OrdinalIgnoreCase);
    }

    public static string? ShortenMetaError(string? error)
    {
        if (string.IsNullOrWhiteSpace(error)) return error;
        if (IsTokenExpiredError(error))
            return "El token de acceso de Meta expiró. Reconectá Facebook/Instagram desde Canales con un token nuevo.";
        if (error.Length > 220)
            return error[..220] + "…";
        return error;
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
