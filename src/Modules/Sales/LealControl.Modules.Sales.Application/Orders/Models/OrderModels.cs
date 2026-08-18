using System;
using System.Collections.Generic;

namespace LealControl.Modules.Sales.Application.Orders.Models;

public sealed record OrderLineDto(
    Guid Id,
    Guid? ProductId,
    string Description,
    decimal Quantity,
    decimal UnitPrice,
    string CurrencyCode,
    decimal DiscountPercent,
    decimal TaxRate,
    bool IsOptional,
    decimal LineSubtotal);

public sealed record OrderDto(
    Guid Id,
    string OrderNumber,
    Guid? QuoteId,
    string? QuoteNumber,
    Guid CustomerId,
    Guid? LocationId,
    Guid? ContactId,
    Guid? OpportunityId,
    string Status,
    string Currency,
    decimal ExchangeRateUsdBillete,
    decimal ExchangeRateUsdDivisa,
    decimal DiscountPercent,
    decimal Subtotal,
    decimal Total,
    string? PaymentTerms,
    string? PaymentMethod,
    int? DeliveryTimeDays,
    string? Transportation,
    string? Warranty,
    string? Notes,
    string? OwnerName,
    DateTime CreatedAtUtc,
    DateTime UpdatedAtUtc,
    IReadOnlyList<OrderLineDto> Lines);

public sealed record OrderLineWriteModel(
    Guid? ProductId,
    string Description,
    decimal Quantity,
    decimal UnitPrice,
    string CurrencyCode,
    decimal DiscountPercent,
    decimal TaxRate,
    bool IsOptional);

public sealed record OrderWriteModel(
    Guid CustomerId,
    Guid? LocationId,
    Guid? ContactId,
    Guid? OpportunityId,
    Guid? QuoteId,
    string? QuoteNumber,
    string Currency,
    decimal ExchangeRateUsdBillete,
    decimal ExchangeRateUsdDivisa,
    decimal DiscountPercent,
    string? PaymentTerms,
    string? PaymentMethod,
    int? DeliveryTimeDays,
    string? Transportation,
    string? Warranty,
    string? Notes,
    string? OwnerName,
    IReadOnlyList<OrderLineWriteModel> Lines);
