using System;
using System.Collections.Generic;
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

    public ExchangeRateService(HttpClient httpClient)
    {
        _httpClient = httpClient;
    }

    public async Task<ExchangeRatesDto> GetLiveRatesAsync(CancellationToken cancellationToken = default)
    {
        if (_cachedRates is not null && DateTime.UtcNow < _cacheExpiresAtUtc)
        {
            return _cachedRates;
        }

        try
        {
            var response = await _httpClient.GetAsync("https://dolarapi.com/v1/dolares", cancellationToken);
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
                "Dólar Divisa (BNA Mayorista Vendedor)",
                "Banco Nación Argentina Divisas (Mayorista)",
                mayorista?.Compra ?? 1478.50m,
                mayorista?.Venta ?? 1487.50m,
                mayorista?.FechaActualizacion ?? DateTime.UtcNow);

            _cachedRates = new ExchangeRatesDto(usdBillete, usdDivisa, DateTime.UtcNow);
            _cacheExpiresAtUtc = DateTime.UtcNow.AddMinutes(5);

            return _cachedRates;
        }
        catch
        {
            // Fallback default values if offline
            if (_cachedRates is not null) return _cachedRates;

            return new ExchangeRatesDto(
                new CurrencyRateDetailDto("USD_BILLETE", "Dólar Billete (BNA Vendedor)", "BNA (Estimado)", 1460m, 1510m, DateTime.UtcNow),
                new CurrencyRateDetailDto("USD_DIVISA", "Dólar Divisa (BNA Mayorista Vendedor)", "BNA Mayorista (Estimado)", 1478.5m, 1487.5m, DateTime.UtcNow),
                DateTime.UtcNow);
        }
    }
}
