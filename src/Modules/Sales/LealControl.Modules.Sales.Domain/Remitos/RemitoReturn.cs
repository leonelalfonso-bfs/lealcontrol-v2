using System;
using System.Collections.Generic;
using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Tenancy;

namespace LealControl.Modules.Sales.Domain.Remitos;

public sealed class RemitoReturn : Entity<Guid>
{
    private readonly List<RemitoReturnItem> _items = new();
    private RemitoReturn() { }

    private RemitoReturn(Guid id, TenantId tenantId, Guid remitoId, string returnNumber,
        Guid? warehouseId, string warehouseName, string reason, string? notes, DateTime receivedAtUtc)
        : base(id)
    {
        TenantId = tenantId;
        RemitoId = remitoId;
        ReturnNumber = returnNumber;
        WarehouseId = warehouseId;
        WarehouseName = warehouseName;
        Reason = reason;
        Notes = notes;
        ReceivedAtUtc = receivedAtUtc;
    }

    public TenantId TenantId { get; private set; }
    public Guid RemitoId { get; private set; }
    public string ReturnNumber { get; private set; } = "";
    public Guid? WarehouseId { get; private set; }
    public string WarehouseName { get; private set; } = "";
    public string Reason { get; private set; } = "";
    public string? Notes { get; private set; }
    public DateTime ReceivedAtUtc { get; private set; }
    public IReadOnlyList<RemitoReturnItem> Items => _items.AsReadOnly();

    public static RemitoReturn Create(TenantId tenantId, Guid remitoId, Guid? warehouseId,
        string warehouseName, string reason, string? notes)
    {
        var id = Guid.NewGuid();
        return new RemitoReturn(id, tenantId, remitoId,
            "DEV-" + DateTime.UtcNow.ToString("yyyyMMdd") + "-" + id.ToString("N")[..8].ToUpperInvariant(),
            warehouseId, warehouseName, reason.Trim(), notes?.Trim(), DateTime.UtcNow);
    }

    public void AddItem(Guid remitoItemId, decimal quantity)
    {
        _items.Add(new RemitoReturnItem(Guid.NewGuid(), Id, remitoItemId, quantity));
    }
}

public sealed class RemitoReturnItem : Entity<Guid>
{
    private RemitoReturnItem() { }
    public RemitoReturnItem(Guid id, Guid returnId, Guid remitoItemId, decimal quantity) : base(id)
    {
        ReturnId = returnId;
        RemitoItemId = remitoItemId;
        Quantity = quantity;
    }

    public Guid ReturnId { get; private set; }
    public Guid RemitoItemId { get; private set; }
    public decimal Quantity { get; private set; }
}
