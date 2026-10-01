using System;
using System.Collections.Generic;
using LealControl.BuildingBlocks.Results;
using MediatR;

namespace LealControl.Modules.Sales.Application.Remitos;

public sealed record RemitoReturnItemWriteDto(Guid RemitoItemId, decimal Quantity);
public sealed record ConfirmRemitoReturnCommand(Guid RemitoId, Guid? WarehouseId, string Reason,
    string? Notes, IReadOnlyList<RemitoReturnItemWriteDto> Items) : IRequest<Result<RemitoReturnDto>>;
public sealed record ListRemitoReturnsQuery(Guid RemitoId) : IRequest<Result<IReadOnlyList<RemitoReturnDto>>>;
public sealed record RemitoReturnItemDto(Guid Id, Guid RemitoItemId, string Code, string Description,
    Guid? ProductId, decimal Quantity);
public sealed record RemitoReturnDto(Guid Id, Guid RemitoId, string ReturnNumber, Guid? WarehouseId,
    string WarehouseName, string Reason, string? Notes, DateTime ReceivedAtUtc,
    IReadOnlyList<RemitoReturnItemDto> Items);
