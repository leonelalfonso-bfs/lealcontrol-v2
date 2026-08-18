using System;
using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Tenancy;

namespace LealControl.Modules.Sales.Domain.Inventory;

public sealed class StockItem : Entity<Guid>
{
    private StockItem()
    {
    }

    public StockItem(
        Guid id,
        TenantId tenantId,
        Guid productId,
        Guid? warehouseId,
        string? warehouseName,
        decimal physicalStock,
        decimal reservedStock,
        decimal incomingStock,
        decimal minimumStock,
        decimal reorderPoint,
        string? warehouseLocation,
        DateTime updatedAtUtc)
        : base(id)
    {
        TenantId = tenantId;
        ProductId = productId;
        WarehouseId = warehouseId;
        WarehouseName = warehouseName ?? "Depósito Central";
        PhysicalStock = physicalStock;
        ReservedStock = reservedStock;
        IncomingStock = incomingStock;
        MinimumStock = minimumStock;
        ReorderPoint = reorderPoint;
        WarehouseLocation = warehouseLocation;
        UpdatedAtUtc = updatedAtUtc;
    }

    public TenantId TenantId { get; private set; }

    public Guid ProductId { get; private set; }

    public Guid? WarehouseId { get; private set; }

    public string WarehouseName { get; private set; } = "Depósito Central";

    public decimal PhysicalStock { get; private set; }

    public decimal ReservedStock { get; private set; }

    public decimal AvailableStock => PhysicalStock - ReservedStock;

    public decimal IncomingStock { get; private set; }

    public decimal ForecastedStock => AvailableStock + IncomingStock;

    public decimal MinimumStock { get; private set; }

    public decimal ReorderPoint { get; private set; }

    public string? WarehouseLocation { get; private set; } = "Depósito Central";

    public DateTime UpdatedAtUtc { get; private set; }

    public static StockItem Create(
        TenantId tenantId,
        Guid productId,
        decimal physicalStock,
        decimal minimumStock,
        string? warehouseLocation,
        Guid? warehouseId = null,
        string? warehouseName = null)
    {
        return new StockItem(
            Guid.NewGuid(),
            tenantId,
            productId,
            warehouseId,
            warehouseName ?? "Depósito Central",
            physicalStock,
            0,
            0,
            minimumStock,
            minimumStock * 1.2m,
            warehouseLocation ?? "Depósito Central",
            DateTime.UtcNow);
    }

    public void AdjustStock(decimal newPhysicalStock, decimal newMinimumStock, string? location, Guid? warehouseId = null, string? warehouseName = null)
    {
        PhysicalStock = newPhysicalStock < 0 ? 0 : newPhysicalStock;
        MinimumStock = newMinimumStock < 0 ? 0 : newMinimumStock;
        ReorderPoint = MinimumStock * 1.2m;
        if (!string.IsNullOrWhiteSpace(location)) WarehouseLocation = location.Trim();
        if (warehouseId.HasValue) WarehouseId = warehouseId.Value;
        if (!string.IsNullOrWhiteSpace(warehouseName)) WarehouseName = warehouseName.Trim();
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void AddIncoming(decimal quantity)
    {
        if (quantity <= 0) return;
        IncomingStock += quantity;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void RemoveIncoming(decimal quantity)
    {
        if (quantity <= 0) return;
        IncomingStock = Math.Max(0, IncomingStock - quantity);
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void ReceiveStock(decimal quantity)
    {
        if (quantity <= 0) return;
        PhysicalStock += quantity;
        IncomingStock = Math.Max(0, IncomingStock - quantity);
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void TransferOut(decimal quantity)
    {
        if (quantity <= 0) return;
        PhysicalStock = Math.Max(0, PhysicalStock - quantity);
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void TransferIn(decimal quantity)
    {
        if (quantity <= 0) return;
        PhysicalStock += quantity;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void Reserve(decimal quantity)
    {
        if (quantity <= 0) return;
        ReservedStock += quantity;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void ReleaseReservation(decimal quantity)
    {
        if (quantity <= 0) return;
        ReservedStock = Math.Max(0, ReservedStock - quantity);
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void Consume(decimal quantity)
    {
        if (quantity <= 0) return;
        PhysicalStock = Math.Max(0, PhysicalStock - quantity);
        ReservedStock = Math.Max(0, ReservedStock - quantity);
        UpdatedAtUtc = DateTime.UtcNow;
    }
}

public sealed class StockMovement : Entity<Guid>
{
    private StockMovement()
    {
    }

    public StockMovement(
        Guid id,
        TenantId tenantId,
        Guid productId,
        Guid? warehouseId,
        string? warehouseName,
        string movementType,
        decimal quantity,
        decimal previousPhysicalStock,
        decimal newPhysicalStock,
        decimal? unitCostArs,
        decimal? unitCostUsd,
        string? serialNumbers,
        string? lotNumber,
        Guid? referenceId,
        string? referenceType,
        string? referenceNumber,
        string? operatorName,
        string? notes,
        DateTime createdAtUtc)
        : base(id)
    {
        TenantId = tenantId;
        ProductId = productId;
        WarehouseId = warehouseId;
        WarehouseName = warehouseName ?? "Depósito Central";
        MovementType = movementType;
        Quantity = quantity;
        PreviousPhysicalStock = previousPhysicalStock;
        NewPhysicalStock = newPhysicalStock;
        UnitCostArs = unitCostArs;
        UnitCostUsd = unitCostUsd;
        SerialNumbers = serialNumbers;
        LotNumber = lotNumber;
        ReferenceId = referenceId;
        ReferenceType = referenceType;
        ReferenceNumber = referenceNumber;
        OperatorName = operatorName;
        Notes = notes;
        CreatedAtUtc = createdAtUtc;
    }

    public TenantId TenantId { get; private set; }

    public Guid ProductId { get; private set; }

    public Guid? WarehouseId { get; private set; }

    public string WarehouseName { get; private set; } = "Depósito Central";

    public string MovementType { get; private set; } = "Adjustment";

    public decimal Quantity { get; private set; }

    public decimal PreviousPhysicalStock { get; private set; }

    public decimal NewPhysicalStock { get; private set; }

    public decimal? UnitCostArs { get; private set; }

    public decimal? UnitCostUsd { get; private set; }

    public string? SerialNumbers { get; private set; }

    public string? LotNumber { get; private set; }

    public Guid? ReferenceId { get; private set; }

    public string? ReferenceType { get; private set; }

    public string? ReferenceNumber { get; private set; }

    public string? OperatorName { get; private set; }

    public string? Notes { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    public static StockMovement Create(
        TenantId tenantId,
        Guid productId,
        string movementType,
        decimal quantity,
        decimal previousPhysicalStock,
        decimal newPhysicalStock,
        Guid? referenceId,
        string? referenceType,
        string? notes)
    {
        return new StockMovement(
            Guid.NewGuid(),
            tenantId,
            productId,
            null,
            "Depósito Central",
            movementType,
            quantity,
            previousPhysicalStock,
            newPhysicalStock,
            null,
            null,
            null,
            null,
            referenceId,
            referenceType,
            null,
            null,
            notes,
            DateTime.UtcNow);
    }

    public static StockMovement Create(
        TenantId tenantId,
        Guid productId,
        string movementType,
        decimal quantity,
        decimal previousPhysicalStock,
        decimal newPhysicalStock,
        Guid? warehouseId = null,
        string? warehouseName = null,
        decimal? unitCostArs = null,
        decimal? unitCostUsd = null,
        string? serialNumbers = null,
        string? lotNumber = null,
        Guid? referenceId = null,
        string? referenceType = null,
        string? referenceNumber = null,
        string? operatorName = null,
        string? notes = null)
    {
        return new StockMovement(
            Guid.NewGuid(),
            tenantId,
            productId,
            warehouseId,
            warehouseName ?? "Depósito Central",
            movementType,
            quantity,
            previousPhysicalStock,
            newPhysicalStock,
            unitCostArs,
            unitCostUsd,
            serialNumbers,
            lotNumber,
            referenceId,
            referenceType,
            referenceNumber,
            operatorName,
            notes,
            DateTime.UtcNow);
    }
}
