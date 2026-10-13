using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;
using System.Net.Http;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using LealControl.Modules.Sales.Application.Products.Models;

namespace LealControl.Modules.Sales.Infrastructure.Services;

public interface IExchangeRateService
{
    Task<ExchangeRatesDto> GetLiveRatesAsync(CancellationToken cancellationToken = default);

    /// <summary>Histórico BNA (type: "billete" o "divisa") hasta la fecha indicada, más reciente primero.</summary>
    Task<IReadOnlyList<BnaRateDto>> GetBnaHistoryAsync(string type, DateOnly date, CancellationToken cancellationToken = default);
}

internal sealed class DolarApiResponseItem
{
    [JsonPropertyName("moneda")]
    public string Moneda { get; set; } = string.Empty;

    [JsonPropertyName("casa")]
    public string Casa { get; set; } = string.Empty;

    [JsonPropertyName("nombre")]
    public string Nombre { get; set; } = string.Empty;

    [JsonPropertyName("compra")]
    public decimal Compra { get; set; }

    [JsonPropertyName("venta")]
    public decimal Venta { get; set; }

    [JsonPropertyName("fechaActualizacion")]
    public DateTime FechaActualizacion { get; set; }
}

public sealed class ExchangeRateService : IExchangeRateService
{
    private readonly HttpClient _httpClient;
    private static ExchangeRatesDto? _cachedRates;
    private static DateTime _cacheExpiresAtUtc = DateTime.MinValue;
    private static readonly SemaphoreSlim RefreshLock = new(1, 1);
    /// <summary>Tope por consulta a una fuente externa: si el BNA tarda, se usa el respaldo.</summary>
    private static readonly TimeSpan SourceTimeout = TimeSpan.FromSeconds(8);
    private static readonly TimeSpan LiveTtl = TimeSpan.FromMinutes(15);

    public ExchangeRateService(HttpClient httpClient)
    {
        _httpClient = httpClient;
    }

    private static readonly ConcurrentDictionary<string, (DateTime ExpiresAtUtc, IReadOnlyList<BnaRateDto> Rows)> _bnaCache = new();
    private static readonly Regex BnaRow = new(
        @"Dolar U\.S\.A\s+([\d.,]+)\s+([\d.,]+)\s+(\d{1,2}/\d{1,2}/\d{4})", RegexOptions.Compiled);

    public async Task<IReadOnlyList<BnaRateDto>> GetBnaHistoryAsync(
        string type, DateOnly date, CancellationToken cancellationToken = default)
    {
        // Ids del buscador histórico del BNA: billetes (Dólar 22) y divisas/"monedas" (Dólar 55).
        var (id, currency) = type switch
        {
            "billete" => ("billetes", 22),
            "divisa" => ("monedas", 55),
            _ => throw new ArgumentException("Tipo de cotización inválido.", nameof(type))
        };
        var key = $"{type}|{date:yyyyMMdd}";
        if (_bnaCache.TryGetValue(key, out var cached) && DateTime.UtcNow < cached.ExpiresAtUtc)
            return cached.Rows;

        var url = $"https://www.bna.com.ar/Cotizador/HistoricoPrincipales?id={id}" +
                  $"&fecha={Uri.EscapeDataString(date.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture))}&idMoneda={currency}";
        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.TryAddWithoutValidation("User-Agent", "Mozilla/5.0 (LealControl ERP)");
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(SourceTimeout);
        using var response = await _httpClient.SendAsync(request, timeout.Token);
        response.EnsureSuccessStatusCode();
        var html = await response.Content.ReadAsStringAsync(timeout.Token);
        var rows = ParseBnaHistory(html).Where(r => DateOnly.ParseExact(r.Date, "yyyy-MM-dd") <= date)
            .OrderByDescending(r => r.Date, StringComparer.Ordinal).ToList();
        _bnaCache[key] = (DateTime.UtcNow.AddMinutes(date >= DateOnly.FromDateTime(DateTime.UtcNow.AddHours(-3)) ? 10 : 720), rows);
        return rows;
    }

    public static IReadOnlyList<BnaRateDto> ParseBnaHistory(string html)
    {
        var text = Regex.Replace(html, "<[^>]+>", " ");
        text = Regex.Replace(text, @"\s+", " ");
        var rows = new Dictionary<string, BnaRateDto>();
        foreach (Match m in BnaRow.Matches(text))
        {
            if (!DateOnly.TryParseExact(m.Groups[3].Value, "d/M/yyyy", CultureInfo.InvariantCulture,
                    DateTimeStyles.None, out var day) ||
                !TryParseAmount(m.Groups[1].Value, out var buy) || !TryParseAmount(m.Groups[2].Value, out var sell) ||
                buy <= 0m || sell <= 0m)
                continue;
            var iso = day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            rows[iso] = new BnaRateDto(iso, buy, sell);
        }
        return rows.Values.ToList();
    }

    // El BNA publica "1490,0000" (billetes) y "1511.0000" (divisas).
    private static bool TryParseAmount(string raw, out decimal value)
    {
        var normalized = raw.Contains(',') ? raw.Replace(".", "").Replace(',', '.') : raw;
        return decimal.TryParse(normalized, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out value);
    }

    /// <summary>
    /// Cotizaciones del día. Nadie espera al BNA salvo la primera vez: cuando la copia guardada
    /// vence, se devuelve igual y se actualiza en segundo plano (una sola actualización a la vez).
    /// </summary>
    public async Task<ExchangeRatesDto> GetLiveRatesAsync(CancellationToken cancellationToken = default)
    {
        var cached = _cachedRates;
        if (cached is not null)
        {
            if (DateTime.UtcNow >= _cacheExpiresAtUtc && RefreshLock.CurrentCount > 0)
                _ = Task.Run(async () =>
                {
                    try { await RefreshAsync(CancellationToken.None); }
                    catch { /* se reintenta en el próximo pedido */ }
                });
            return cached;
        }
        return await RefreshAsync(cancellationToken);
    }

    private async Task<ExchangeRatesDto> RefreshAsync(CancellationToken cancellationToken)
    {
        await RefreshLock.WaitAsync(cancellationToken);
        try
        {
            // Otro pedido pudo haberla actualizado mientras esperábamos.
            if (_cachedRates is not null && DateTime.UtcNow < _cacheExpiresAtUtc) return _cachedRates;
            return await FetchAsync(cancellationToken);
        }
        finally
        {
            RefreshLock.Release();
        }
    }

    private async Task<ExchangeRatesDto> FetchAsync(CancellationToken cancellationToken)
    {
        // Fuente principal: Banco Nación (billete y divisa vendedor), las dos consultas a la vez.
        // DolarApi queda de respaldo.
        try
        {
            var today = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(-3));
            var billeteTask = GetBnaHistoryAsync("billete", today, cancellationToken);
            var divisaTask = GetBnaHistoryAsync("divisa", today, cancellationToken);
            await Task.WhenAll(billeteTask, divisaTask);
            var billete = billeteTask.Result.FirstOrDefault();
            var divisa = divisaTask.Result.FirstOrDefault();
            if (billete is not null && divisa is not null)
            {
                var billeteAt = DateTime.SpecifyKind(DateTime.Parse(billete.Date, CultureInfo.InvariantCulture), DateTimeKind.Utc);
                var divisaAt = DateTime.SpecifyKind(DateTime.Parse(divisa.Date, CultureInfo.InvariantCulture), DateTimeKind.Utc);
                _cachedRates = new ExchangeRatesDto(
                    new CurrencyRateDetailDto("USD_BILLETE", "Dólar Billete (BNA Vendedor)", "Banco de la Nación Argentina",
                        billete.Buy, billete.Sell, billeteAt),
                    new CurrencyRateDetailDto("USD_DIVISA", "Dólar Divisa (BNA Vendedor)", "Banco de la Nación Argentina",
                        divisa.Buy, divisa.Sell, divisaAt),
                    DateTime.UtcNow);
                _cacheExpiresAtUtc = DateTime.UtcNow.Add(LiveTtl);
                return _cachedRates;
            }
        }
        catch
        {
            // Se intenta la fuente de respaldo.
        }

        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(SourceTimeout);
            var response = await _httpClient.GetAsync("https://dolarapi.com/v1/dolares", timeout.Token);
            response.EnsureSuccessStatusCode();

            var json = await response.Content.ReadAsStringAsync(cancellationToken);
            var items = JsonSerializer.Deserialize<List<DolarApiResponseItem>>(json) ?? [];

            var oficial = items.Find(x => x.Casa.Equals("oficial", StringComparison.OrdinalIgnoreCase));
            var mayorista = items.Find(x => x.Casa.Equals("mayorista", StringComparison.OrdinalIgnoreCase));

            var usdBillete = new CurrencyRateDetailDto(
                "USD_BILLETE",
                "Dólar Billete (BNA Vendedor)",
                "Banco Nación Argentina (BNA)",
                oficial?.Compra ?? 1460.00m,
                oficial?.Venta ?? 1510.00m,
                oficial?.FechaActualizacion ?? DateTime.UtcNow);

            var usdDivisa = new CurrencyRateDetailDto(
                "USD_DIVISA",
                "Dólar Mayorista (respaldo: BNA no disponible)",
                "DolarApi · Mayorista BCRA",
                mayorista?.Compra ?? 1478.50m,
                mayorista?.Venta ?? 1487.50m,
                mayorista?.FechaActualizacion ?? DateTime.UtcNow);

            _cachedRates = new ExchangeRatesDto(usdBillete, usdDivisa, DateTime.UtcNow);
            // El respaldo dura menos: se vuelve a probar el BNA pronto.
            _cacheExpiresAtUtc = DateTime.UtcNow.AddMinutes(5);

            return _cachedRates;
        }
        catch
        {
            // Fallback default values if offline
            if (_cachedRates is not null) return _cachedRates;

            return new ExchangeRatesDto(
                new CurrencyRateDetailDto("USD_BILLETE", "Dólar Billete (BNA Vendedor)", "BNA (Estimado)", 1460m, 1510m, DateTime.UtcNow),
                new CurrencyRateDetailDto("USD_DIVISA", "Dólar Divisa (sin conexión, valor estimado)", "Estimado sin conexión", 1478.5m, 1487.5m, DateTime.UtcNow),
                DateTime.UtcNow);
        }
    }
}

/// <summary>Al arrancar el servidor busca la cotización del día, así el primero que entra no espera al BNA.</summary>
public sealed class ExchangeRateWarmup(IServiceProvider services) : Microsoft.Extensions.Hosting.BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
            using var scope = Microsoft.Extensions.DependencyInjection.ServiceProviderServiceExtensions.CreateScope(services);
            var rates = Microsoft.Extensions.DependencyInjection.ServiceProviderServiceExtensions.GetRequiredService<IExchangeRateService>(scope.ServiceProvider);
            await rates.GetLiveRatesAsync(stoppingToken);
        }
        catch
        {
            // Sin conexión al arrancar: el primer pedido lo vuelve a intentar.
        }
    }
}
