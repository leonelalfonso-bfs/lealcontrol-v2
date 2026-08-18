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
