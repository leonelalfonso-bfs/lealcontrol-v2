using System;
using System.Collections.Generic;
using LealControl.BuildingBlocks.Results;
using LealControl.Modules.Sales.Domain.Inventory;
using MediatR;

namespace LealControl.Modules.Sales.Application.Inventory;

public sealed record WarehouseDto(
    Guid Id,
    string Code,
    string Name,
    string Type,
    string? Address,
    string? AssignedTechnicianName,
    bool IsActive,
    DateTime CreatedAtUtc);

public sealed record CreateWarehouseCommand(
    string Code,
    string Name,
    string Type,
    string? Address,
    string? AssignedTechnicianName) : IRequest<Result<WarehouseDto>>;

public sealed record UpdateWarehouseCommand(
    Guid Id,
    string Code,
    string Name,
    string Type,
    string? Address,
    string? AssignedTechnicianName,
    bool IsActive) : IRequest<Result<WarehouseDto>>;

public sealed record ListWarehousesQuery() : IRequest<Result<IReadOnlyList<WarehouseDto>>>;

public sealed record StockItemDto(
    Guid Id,
    Guid ProductId,
    string ProductCode,
    string ProductName,
    Guid? WarehouseId,
    string WarehouseName,
    decimal PhysicalStock,
    decimal ReservedStock,
    decimal AvailableStock,
    decimal IncomingStock,
    decimal InTransitStock,
    decimal ForecastedStock,
    decimal MinimumStock,
    decimal ReorderPoint,
    string? WarehouseLocation,
    string Status, // 'StockOK', 'LowStock', 'OutStock'
    decimal UnitCostArs,
    decimal UnitCostUsd,
    decimal PriceArs,
    decimal PriceUsd,
    DateTime UpdatedAtUtc);

public sealed record AdjustStockCommand(
    Guid ProductId,
    decimal NewPhysicalStock,
    decimal MinimumStock,
    Guid? WarehouseId,
    string? WarehouseName,
    string? WarehouseLocation,
    string? ReasonNotes,
    string? OperatorName,
    string? SerialNumbers,
    string? LotNumber) : IRequest<Result<StockItemDto>>;

public sealed record ProductSupplierDto(
    Guid Id,
    Guid ProductId,
    Guid SupplierId,
    string SupplierName,
    string? SupplierProductCode,
    decimal PurchasePrice,
    string Currency,
    int LeadTimeDays,
    decimal MinimumOrderQuantity,
    bool IsPreferred,
    DateTime CreatedAtUtc);

public sealed record LinkProductSupplierCommand(
    Guid ProductId,
    Guid SupplierId,
    string? SupplierProductCode,
    decimal PurchasePrice,
    string Currency,
    int LeadTimeDays,
    decimal MinimumOrderQuantity,
    bool IsPreferred) : IRequest<Result<ProductSupplierDto>>;

public sealed record ListInventoryQuery(string? Search, string? StatusFilter, Guid? WarehouseId = null) : IRequest<Result<IReadOnlyList<StockItemDto>>>;

public sealed record ListProductSuppliersQuery(Guid ProductId) : IRequest<Result<IReadOnlyList<ProductSupplierDto>>>;

public sealed record StockTransferItemWrite(
    Guid ProductId,
    string ProductCode,
    string ProductName,
    decimal Quantity,
    string? SerialNumbers,
    string? LotNumber);

public sealed record StockTransferItemDto(
    Guid Id,
    Guid ProductId,
    string ProductCode,
    string ProductName,
    decimal Quantity,
    string? SerialNumbers,
    string? LotNumber);

public sealed record StockTransferDto(
    Guid Id,
    string TransferNumber,
    Guid OriginWarehouseId,
    string OriginWarehouseName,
    Guid DestinationWarehouseId,
    string DestinationWarehouseName,
    string Status,
    string? OperatorName,
    DateTime? DispatchedAtUtc,
    DateTime? ReceivedAtUtc,
    string? Notes,
    IReadOnlyList<StockTransferItemDto> Items,
    DateTime CreatedAtUtc);

public sealed record CreateStockTransferCommand(
    Guid OriginWarehouseId,
    Guid DestinationWarehouseId,
    string? OperatorName,
    string? Notes,
    IReadOnlyList<StockTransferItemWrite> Items) : IRequest<Result<StockTransferDto>>;

public sealed record ReceiveStockTransferCommand(
    Guid StockTransferId,
    string? OperatorName) : IRequest<Result<StockTransferDto>>;

public sealed record ListStockTransfersQuery(string? Status) : IRequest<Result<IReadOnlyList<StockTransferDto>>>;

public sealed record StockMovementDto(
    Guid Id,
    Guid ProductId,
    string ProductCode,
    string ProductName,
    Guid? WarehouseId,
    string WarehouseName,
    string MovementType,
    decimal Quantity,
    decimal PreviousPhysicalStock,
    decimal NewPhysicalStock,
    decimal? UnitCostArs,
    decimal? UnitCostUsd,
    string? SerialNumbers,
    string? LotNumber,
    string? ReferenceType,
    string? ReferenceNumber,
    string? OperatorName,
    string? Notes,
    DateTime CreatedAtUtc);

public sealed record ListKardexQuery(
    Guid? ProductId = null,
    Guid? WarehouseId = null,
    string? MovementType = null,
    string? Search = null,
    int Limit = 100) : IRequest<Result<IReadOnlyList<StockMovementDto>>>;

public sealed record GeneratePurchaseRequestFromStockCommand(
    string? Notes) : IRequest<Result<Guid>>;
