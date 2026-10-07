using System;

namespace LealControl.Modules.Sales.Application.Products.Models;

public sealed record CurrencyRateDetailDto(
    string Code,
    string Name,
    string Source,
    decimal Compra,
    decimal Venta,
    DateTime UpdatedAtUtc);

public sealed record ExchangeRatesDto(
    CurrencyRateDetailDto UsdBillete,
    CurrencyRateDetailDto UsdDivisa,
    DateTime FetchedAtUtc);

/// <summary>Cotización vendedor/comprador publicada por el Banco Nación para una fecha.</summary>
public sealed record BnaRateDto(string Date, decimal Buy, decimal Sell);

/// <summary>
/// Cotización BNA del tipo pedido para una fecha (Current) y la del día hábil anterior (Previous),
/// que es la que se usa para cancelar en pesos una factura en dólares.
/// </summary>
public sealed record BnaRateHistoryDto(string Type, string Date, BnaRateDto? Current, BnaRateDto? Previous);
