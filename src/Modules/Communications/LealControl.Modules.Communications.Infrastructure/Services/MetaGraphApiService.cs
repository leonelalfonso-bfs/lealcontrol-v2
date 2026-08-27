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
            // 1. Try if token is already a Page Access Token with IG
            var pageUrl = $"me?fields=id,name,instagram_business_account{{id,username}}&access_token={Uri.EscapeDataString(cleanToken)}";
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

                return new MetaPageInfoResult(true, pageId, pageName, igId, igUsername, cleanToken, null);
            }

            // 2. If 400, maybe it's a User Access Token -> fetch /me/accounts
            var accountsUrl = $"me/accounts?fields=id,name,access_token,instagram_business_account{{id,username}}&access_token={Uri.EscapeDataString(cleanToken)}";
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
                        if (page.TryGetProperty("instagram_business_account", out _))
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

    public async Task<List<MetaMessageItem>> FetchRecentConversationsAsync(string pageAccessToken, string channelType, CancellationToken ct = default)
    {
        var list = new List<MetaMessageItem>();
        try
        {
            var isIg = channelType.Equals("instagram", StringComparison.OrdinalIgnoreCase);
            var convUrl = isIg
                ? $"me/conversations?platform=instagram&fields=id,snippet,updated_time,participants,messages{{id,message,from,created_time}}&access_token={Uri.EscapeDataString(pageAccessToken)}"
                : $"me/conversations?fields=id,snippet,updated_time,participants,messages{{id,message,from,created_time}}&access_token={Uri.EscapeDataString(pageAccessToken)}";

            var res = await _httpClient.GetAsync(convUrl, ct);
            if (!res.IsSuccessStatusCode)
            {
                _logger.LogWarning("Error fetching conversations from Meta ({Status})", res.StatusCode);
                return list;
            }

            var json = await res.Content.ReadFromJsonAsync<JsonElement>(ct);
            if (json.TryGetProperty("data", out var dataArray) && dataArray.ValueKind == JsonValueKind.Array)
            {
                foreach (var conv in dataArray.EnumerateArray())
                {
                    string? participantId = null;
                    string? participantName = null;

                    if (conv.TryGetProperty("participants", out var partObj) && partObj.TryGetProperty("data", out var partArray) && partArray.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var p in partArray.EnumerateArray())
                        {
                            var pName = p.TryGetProperty("name", out var pnProp) ? pnProp.GetString() : (p.TryGetProperty("username", out var puProp) ? puProp.GetString() : null);
                            var pId = p.TryGetProperty("id", out var piProp) ? piProp.GetString() : null;
                            if (!string.IsNullOrWhiteSpace(pName))
                            {
                                participantName = pName;
                                participantId = pId;
                            }
                        }
                    }

                    if (conv.TryGetProperty("messages", out var msgObj) && msgObj.TryGetProperty("data", out var msgArray) && msgArray.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var m in msgArray.EnumerateArray())
                        {
                            var mid = m.TryGetProperty("id", out var midProp) ? midProp.GetString() : null;
                            var text = m.TryGetProperty("message", out var textProp) ? textProp.GetString() : null;
                            var createdStr = m.TryGetProperty("created_time", out var crProp) ? crProp.GetString() : null;
                            var fromObj = m.TryGetProperty("from", out var foProp) ? foProp : default;
                            var fromName = fromObj.TryGetProperty("name", out var fnProp) ? fnProp.GetString() : (fromObj.TryGetProperty("username", out var fuProp) ? fuProp.GetString() : null);
                            var fromId = fromObj.TryGetProperty("id", out var fiProp) ? fiProp.GetString() : null;

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
                                    participantId ?? fromId ?? "desconocido",
                                    participantName ?? fromName ?? (isIg ? "Usuario Instagram" : "Usuario Facebook"),
                                    fromName ?? "Usuario",
                                    text,
                                    createdUtc
                                ));
                            }
                        }
                    }
                    else if (conv.TryGetProperty("snippet", out var snipProp))
                    {
                        var snippet = snipProp.GetString();
                        var convId = conv.TryGetProperty("id", out var ciProp) ? ciProp.GetString() : Guid.NewGuid().ToString("N");
                        if (!string.IsNullOrWhiteSpace(snippet))
                        {
                            list.Add(new MetaMessageItem(
                                convId ?? Guid.NewGuid().ToString("N"),
                                isIg ? "instagram" : "facebook",
                                participantId ?? "desconocido",
                                participantName ?? (isIg ? "Usuario Instagram" : "Usuario Facebook"),
                                participantName ?? "Usuario",
                                snippet,
                                DateTime.UtcNow
                            ));
                        }
                    }
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
