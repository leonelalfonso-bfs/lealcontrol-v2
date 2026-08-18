using System;
using System.Collections.Generic;
using LealControl.BuildingBlocks.Results;
using MediatR;

namespace LealControl.Modules.Sales.Application.Remitos;

public sealed record RemitoItemDto(
    Guid Id,
    Guid? ProductId,
    string Code,
    string Description,
    decimal Quantity,
    string UnitMeasure);

public sealed record RemitoDto(
    Guid Id,
    string RemitoNumber,
    Guid? OrderId,
    Guid CustomerId,
    string CustomerName,
    string CustomerDocument,
    string? DeliveryAddress,
    DateTime IssueDate,
    DateTime DeliveryDate,
    string? CarrierName,
    string? DriverLicense,
    string Status,
    string? Notes,
    IReadOnlyList<RemitoItemDto> Items,
    DateTime CreatedAtUtc);

public sealed record RemitoItemWriteDto(
    Guid? ProductId,
    string Code,
    string Description,
    decimal Quantity,
    string UnitMeasure);

public sealed record CreateRemitoCommand(
    Guid? OrderId,
    Guid CustomerId,
    string CustomerName,
    string CustomerDocument,
    string? DeliveryAddress,
    DateTime DeliveryDate,
    string? CarrierName,
    string? DriverLicense,
    string? Notes,
    IReadOnlyList<RemitoItemWriteDto> Items) : IRequest<Result<RemitoDto>>;

public sealed record ListRemitosQuery(string? Search, string? Status) : IRequest<Result<IReadOnlyList<RemitoDto>>>;

public sealed record GetRemitoByIdQuery(Guid Id) : IRequest<Result<RemitoDto>>;
