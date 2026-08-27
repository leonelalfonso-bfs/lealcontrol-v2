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
            // 1. Try if token is a Page Access Token
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

            // 2. If 400, maybe it's a User Access Token -> fetch /me/accounts
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
                else
                {
                    return new MetaPageInfoResult(false, null, null, null, null, null, "El usuario de Facebook no tiene ninguna Página administrada. Cree o vincule una Página comercial.");
                }
            }

            // 3. Try basic /me?fields=id,name
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

    public async Task<List<MetaMessageItem>> FetchRecentConversationsAsync(string pageAccessToken, string channelType, string? pageName = null, string? pageId = null, string? igAccountId = null, CancellationToken ct = default)
    {
        var list = new List<MetaMessageItem>();
        try
        {
            var isIg = channelType.Equals("instagram", StringComparison.OrdinalIgnoreCase);
            
            // Multiple endpoint options for Instagram vs Facebook
            var endpointsToTry = new List<string>();
            if (isIg)
            {
                if (!string.IsNullOrWhiteSpace(igAccountId))
                {
                    endpointsToTry.Add($"{igAccountId}/conversations?platform=instagram&fields=id,snippet,updated_time,participants,messages{{id,message,from,created_time}}&access_token={Uri.EscapeDataString(pageAccessToken)}");
                }
                if (!string.IsNullOrWhiteSpace(pageId))
                {
                    endpointsToTry.Add($"{pageId}/conversations?platform=instagram&fields=id,snippet,updated_time,participants,messages{{id,message,from,created_time}}&access_token={Uri.EscapeDataString(pageAccessToken)}");
                }
                endpointsToTry.Add($"me/conversations?platform=instagram&fields=id,snippet,updated_time,participants,messages{{id,message,from,created_time}}&access_token={Uri.EscapeDataString(pageAccessToken)}");
                endpointsToTry.Add($"me/conversations?fields=id,snippet,updated_time,participants,messages{{id,message,from,created_time}}&access_token={Uri.EscapeDataString(pageAccessToken)}");
            }
            else
            {
                if (!string.IsNullOrWhiteSpace(pageId))
                {
                    endpointsToTry.Add($"{pageId}/conversations?fields=id,snippet,updated_time,participants,messages{{id,message,from,created_time}}&access_token={Uri.EscapeDataString(pageAccessToken)}");
                }
                endpointsToTry.Add($"me/conversations?fields=id,snippet,updated_time,participants,messages{{id,message,from,created_time}}&access_token={Uri.EscapeDataString(pageAccessToken)}");
            }

            foreach (var convUrl in endpointsToTry)
            {
                var res = await _httpClient.GetAsync(convUrl, ct);
                if (!res.IsSuccessStatusCode) continue;

                var json = await res.Content.ReadFromJsonAsync<JsonElement>(ct);
                if (json.TryGetProperty("data", out var dataArray) && dataArray.ValueKind == JsonValueKind.Array && dataArray.GetArrayLength() > 0)
                {
                    foreach (var conv in dataArray.EnumerateArray())
                    {
                        var convId = conv.TryGetProperty("id", out var ciProp) ? ciProp.GetString() : Guid.NewGuid().ToString("N");
                        string? customerId = null;
                        string? customerName = null;

                        // 1. Check participants for the external user
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

                        // 2. Parse messages in conversation
                        if (conv.TryGetProperty("messages", out var msgObj) && msgObj.TryGetProperty("data", out var msgArray) && msgArray.ValueKind == JsonValueKind.Array)
                        {
                            // First pass on messages to extract customer name if missing
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

                            // If customerName is still missing, try resolving PSID name via Graph API
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
                                catch {}
                            }

                            // Final thread participant ID
                            var threadParticipantId = !string.IsNullOrWhiteSpace(customerId) ? customerId : (convId ?? Guid.NewGuid().ToString("N"));
                            var threadContactName = !string.IsNullOrWhiteSpace(customerName) ? customerName : (isIg ? "Contacto de Instagram" : $"Contacto Facebook ({threadParticipantId[..Math.Min(6, threadParticipantId.Length)]})");

                            foreach (var m in msgArray.EnumerateArray())
                            {
                                var mid = m.TryGetProperty("id", out var midProp) ? midProp.GetString() : null;
                                var text = m.TryGetProperty("message", out var textProp) ? textProp.GetString() : null;
                                var createdStr = m.TryGetProperty("created_time", out var crProp) ? crProp.GetString() : null;
                                var fromObj = m.TryGetProperty("from", out var foProp) ? foProp : default;
                                var fromName = fromObj.TryGetProperty("name", out var fnProp) ? fnProp.GetString() : (fromObj.TryGetProperty("username", out var fuProp) ? fuProp.GetString() : null);

                                DateTime createdUtc = DateTime.UtcNow;
                                if (!string.IsNullOrWhiteSpace(createdStr) && DateTime.TryParse(createdStr, out var parsedDt))
                                {
                                    createdUtc = parsedDt.ToUniversalTime();
                                }

                                if (!string.IsNullOrWhiteSpace(mid) && !string.IsNullOrWhiteSpace(text))
                                {
                                    list.Add(new MetaMessageItem(
                                        mid,
                                        isIg ? "instagram" : "facebook",
                                        threadParticipantId,
                                        threadContactName,
                                        fromName ?? threadContactName,
                                        text,
                                        createdUtc
                                    ));
                                }
                            }
                        }
                    }

                    if (list.Count > 0) break;
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error sincronizando conversaciones de Meta ({Channel})", channelType);
        }

        return list;
    }

    public async Task<MetaSendResult> SendMessageAsync(string pageAccessToken, string recipientId, string text, CancellationToken ct = default)
    {
        try
        {
            var payload = new
            {
                recipient = new { id = recipientId },
                message = new { text = text },
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
public sealed record MetaMessageItem(string MessageId, string ChannelType, string ParticipantId, string ParticipantName, string FromName, string Text, DateTime CreatedAtUtc);
