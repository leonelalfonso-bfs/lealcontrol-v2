using System;
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

    public async Task<MetaPageInfoResult> GetPageInfoAsync(string pageAccessToken, CancellationToken ct = default)
    {
        try
        {
            var url = $"me?fields=id,name,instagram_business_account{{id,username}}&access_token={Uri.EscapeDataString(pageAccessToken)}";
            var response = await _httpClient.GetAsync(url, ct);
            if (!response.IsSuccessStatusCode)
            {
                var err = await response.Content.ReadAsStringAsync(ct);
                return new MetaPageInfoResult(false, null, null, null, null, $"Error de Meta API ({response.StatusCode}): {err}");
            }

            var json = await response.Content.ReadFromJsonAsync<JsonElement>(ct);
            var pageId = json.TryGetProperty("id", out var idProp) ? idProp.GetString() : null;
            var pageName = json.TryGetProperty("name", out var nameProp) ? nameProp.GetString() : null;
            
            string? igId = null;
            string? igUsername = null;

            if (json.TryGetProperty("instagram_business_account", out var igObj))
            {
                if (igObj.TryGetProperty("id", out var igIdProp)) igId = igIdProp.GetString();
                if (igObj.TryGetProperty("username", out var igUserProp)) igUsername = igUserProp.GetString();
            }

            return new MetaPageInfoResult(true, pageId, pageName, igId, igUsername, null);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error consultando información de página en Meta Graph API");
            return new MetaPageInfoResult(false, null, null, null, null, ex.Message);
        }
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

public sealed record MetaPageInfoResult(bool Success, string? PageId, string? PageName, string? InstagramAccountId, string? InstagramUsername, string? Error);
public sealed record MetaSendResult(bool Success, string? MessageId, string? Error);
