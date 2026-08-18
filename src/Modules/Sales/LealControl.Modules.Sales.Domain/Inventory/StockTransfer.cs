using System;
using System.Collections.Generic;
using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Tenancy;

namespace LealControl.Modules.Sales.Domain.Inventory;

public enum StockTransferStatus
{
    Draft = 1,
    InTransit = 2,
    Received = 3,
    Cancelled = 4
}

public sealed class StockTransfer : Entity<Guid>
{
    private readonly List<StockTransferItem> _items = new();

    private StockTransfer()
    {
    }

    public StockTransfer(
        Guid id,
        TenantId tenantId,
        string transferNumber,
        Guid originWarehouseId,
        string originWarehouseName,
        Guid destinationWarehouseId,
        string destinationWarehouseName,
        StockTransferStatus status,
        string? operatorName,
        DateTime? dispatchedAtUtc,
        DateTime? receivedAtUtc,
        string? notes,
        DateTime createdAtUtc)
        : base(id)
    {
        TenantId = tenantId;
        TransferNumber = transferNumber;
        OriginWarehouseId = originWarehouseId;
        OriginWarehouseName = originWarehouseName;
        DestinationWarehouseId = destinationWarehouseId;
        DestinationWarehouseName = destinationWarehouseName;
        Status = status;
        OperatorName = operatorName;
        DispatchedAtUtc = dispatchedAtUtc;
        ReceivedAtUtc = receivedAtUtc;
        Notes = notes;
        CreatedAtUtc = createdAtUtc;
    }

    public TenantId TenantId { get; private set; }

    public string TransferNumber { get; private set; } = string.Empty;

    public Guid OriginWarehouseId { get; private set; }

    public string OriginWarehouseName { get; private set; } = string.Empty;

    public Guid DestinationWarehouseId { get; private set; }

    public string DestinationWarehouseName { get; private set; } = string.Empty;

    public StockTransferStatus Status { get; private set; } = StockTransferStatus.Draft;

    public string? OperatorName { get; private set; }

    public DateTime? DispatchedAtUtc { get; private set; }

    public DateTime? ReceivedAtUtc { get; private set; }

    public string? Notes { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    public IReadOnlyCollection<StockTransferItem> Items => _items.AsReadOnly();

    public static StockTransfer Create(
        TenantId tenantId,
        string transferNumber,
        Guid originWarehouseId,
        string originWarehouseName,
        Guid destinationWarehouseId,
        string destinationWarehouseName,
        string? operatorName,
        string? notes)
    {
        return new StockTransfer(
            Guid.NewGuid(),
            tenantId,
            transferNumber,
            originWarehouseId,
            originWarehouseName,
            destinationWarehouseId,
            destinationWarehouseName,
            StockTransferStatus.InTransit,
            operatorName,
            DateTime.UtcNow,
            null,
            notes,
            DateTime.UtcNow);
    }

    public void AddItem(Guid productId, string productCode, string productName, decimal quantity, string? serialNumbers, string? lotNumber)
    {
        if (quantity <= 0) return;
        _items.Add(new StockTransferItem(Guid.NewGuid(), Id, productId, productCode, productName, quantity, serialNumbers, lotNumber));
    }

    public void MarkReceived(string? operatorName)
    {
        Status = StockTransferStatus.Received;
        ReceivedAtUtc = DateTime.UtcNow;
        if (!string.IsNullOrWhiteSpace(operatorName))
        {
            OperatorName = operatorName;
        }
    }

    public void Cancel()
    {
        Status = StockTransferStatus.Cancelled;
    }
}

public sealed class StockTransferItem : Entity<Guid>
{
    private StockTransferItem()
    {
    }

    public StockTransferItem(
        Guid id,
        Guid stockTransferId,
        Guid productId,
        string productCode,
        string productName,
        decimal quantity,
        string? serialNumbers,
        string? lotNumber)
        : base(id)
    {
        StockTransferId = stockTransferId;
        ProductId = productId;
        ProductCode = productCode;
        ProductName = productName;
        Quantity = quantity;
        SerialNumbers = serialNumbers;
        LotNumber = lotNumber;
    }

    public Guid StockTransferId { get; private set; }

    public Guid ProductId { get; private set; }

    public string ProductCode { get; private set; } = string.Empty;

    public string ProductName { get; private set; } = string.Empty;

    public decimal Quantity { get; private set; }

    public string? SerialNumbers { get; private set; }

    public string? LotNumber { get; private set; }
}
