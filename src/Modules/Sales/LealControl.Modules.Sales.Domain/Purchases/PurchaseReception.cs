using System;
using System.Collections.Generic;
using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Tenancy;

namespace LealControl.Modules.Sales.Domain.Purchases;

public sealed class PurchaseReception : Entity<Guid>
{
    private readonly List<PurchaseReceptionItem> _items = new();

    private PurchaseReception()
    {
    }

    public PurchaseReception(
        Guid id,
        TenantId tenantId,
        string receptionNumber,
        Guid? purchaseOrderId,
        Guid supplierId,
        string supplierName,
        string? supplierRemitoNumber,
        DateTime receptionDate,
        string warehouseLocation,
        string? receivedBy,
        string? notes,
        DateTime createdAtUtc)
        : base(id)
    {
        TenantId = tenantId;
        ReceptionNumber = receptionNumber;
        PurchaseOrderId = purchaseOrderId;
        SupplierId = supplierId;
        SupplierName = supplierName;
        SupplierRemitoNumber = supplierRemitoNumber;
        ReceptionDate = receptionDate;
        WarehouseLocation = warehouseLocation;
        ReceivedBy = receivedBy;
        Notes = notes;
        CreatedAtUtc = createdAtUtc;
    }

    public TenantId TenantId { get; private set; }
    public string ReceptionNumber { get; private set; } = string.Empty;
    public Guid? PurchaseOrderId { get; private set; }
    public Guid SupplierId { get; private set; }
    public string SupplierName { get; private set; } = string.Empty;
    public string? SupplierRemitoNumber { get; private set; }
    public DateTime ReceptionDate { get; private set; }
    public string WarehouseLocation { get; private set; } = "Depósito Central";
    public string? ReceivedBy { get; private set; }
    public string? Notes { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }

    public IReadOnlyList<PurchaseReceptionItem> Items => _items.AsReadOnly();

    public static PurchaseReception Create(
        TenantId tenantId,
        string receptionNumber,
        Guid? purchaseOrderId,
        Guid supplierId,
        string supplierName,
        string? supplierRemitoNumber,
        DateTime receptionDate,
        string warehouseLocation,
        string? receivedBy,
        string? notes)
    {
        var utcDate = receptionDate.Kind == DateTimeKind.Unspecified
            ? DateTime.SpecifyKind(receptionDate, DateTimeKind.Utc)
            : receptionDate.ToUniversalTime();

        return new PurchaseReception(
            Guid.NewGuid(),
            tenantId,
            receptionNumber,
            purchaseOrderId,
            supplierId,
            supplierName,
            supplierRemitoNumber,
            utcDate,
            string.IsNullOrWhiteSpace(warehouseLocation) ? "Depósito Central" : warehouseLocation,
            receivedBy,
            notes,
            DateTime.UtcNow);
    }

    public void AddItem(
        Guid? productId,
        string code,
        string description,
        decimal quantity,
        string unitMeasure = "u",
        string? serialNumber = null)
    {
        var item = new PurchaseReceptionItem(
            Guid.NewGuid(),
            Id,
            productId,
            code,
            description,
            quantity,
            unitMeasure,
            serialNumber);

        _items.Add(item);
    }
}

public sealed class PurchaseReceptionItem : Entity<Guid>
{
    private PurchaseReceptionItem()
    {
    }

    public PurchaseReceptionItem(
        Guid id,
        Guid purchaseReceptionId,
        Guid? productId,
        string code,
        string description,
        decimal quantity,
        string unitMeasure,
        string? serialNumber)
        : base(id)
    {
        PurchaseReceptionId = purchaseReceptionId;
        ProductId = productId;
        Code = code;
        Description = description;
        Quantity = quantity;
        UnitMeasure = unitMeasure;
        SerialNumber = serialNumber;
    }

    public Guid PurchaseReceptionId { get; private set; }
    public Guid? ProductId { get; private set; }
    public string Code { get; private set; } = string.Empty;
    public string Description { get; private set; } = string.Empty;
    public decimal Quantity { get; private set; }
    public string UnitMeasure { get; private set; } = "u";
    public string? SerialNumber { get; private set; }
}
