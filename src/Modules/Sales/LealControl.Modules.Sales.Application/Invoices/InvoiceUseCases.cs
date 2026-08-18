using System;
using System.Collections.Generic;
using LealControl.BuildingBlocks.Results;
using MediatR;

namespace LealControl.Modules.Sales.Application.Invoices;

public sealed record InvoiceItemDto(
    Guid Id,
    Guid? ProductId,
    string Code,
    string Description,
    decimal Quantity,
    decimal UnitPrice,
    decimal VatRate,
    decimal NetSubtotal,
    decimal VatAmount,
    decimal Total);

public sealed record InvoiceDto(
    Guid Id,
    string InvoiceType,
    int PointOfSale,
    int InvoiceNumber,
    string FormattedNumber,
    Guid? OrderId,
    Guid? RemitoId,
    Guid CustomerId,
    string CustomerName,
    string CustomerDocument,
    string CustomerTaxCondition,
    string? CustomerAddress,
    DateTime IssueDate,
    DateTime DueDate,
    string Currency,
    decimal ExchangeRate,
    decimal Subtotal,
    decimal Iva21,
    decimal Iva105,
    decimal Iva27,
    decimal ExemptAmount,
    decimal IibbPerception,
    decimal Total,
    string? Cae,
    DateTime? CaeDueDate,
    string? QrUrl,
    string Status,
    string? AfipRawResponse,
    string? Notes,
    IReadOnlyList<InvoiceItemDto> Items,
    DateTime CreatedAtUtc);

public sealed record InvoiceItemWriteDto(
    Guid? ProductId,
    string Code,
    string Description,
    decimal Quantity,
    decimal UnitPrice,
    decimal VatRate);

public sealed record CreateInvoiceCommand(
    string InvoiceType,
    int PointOfSale,
    Guid? OrderId,
    Guid? RemitoId,
    Guid CustomerId,
    string CustomerName,
    string CustomerDocument,
    string CustomerTaxCondition,
    string? CustomerAddress,
    DateTime DueDate,
    string Currency,
    decimal ExchangeRate,
    string? Notes,
    IReadOnlyList<InvoiceItemWriteDto> Items) : IRequest<Result<InvoiceDto>>;

public sealed record AuthorizeInvoiceArcaCommand(Guid Id) : IRequest<Result<InvoiceDto>>;

public sealed record ListInvoicesQuery(string? Search, string? Status, string? Type) : IRequest<Result<IReadOnlyList<InvoiceDto>>>;

public sealed record GetInvoiceByIdQuery(Guid Id) : IRequest<Result<InvoiceDto>>;
