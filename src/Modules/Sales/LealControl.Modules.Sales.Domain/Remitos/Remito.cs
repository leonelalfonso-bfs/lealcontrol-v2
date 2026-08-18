using System;
using System.Collections.Generic;
using System.Linq;
using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Tenancy;

namespace LealControl.Modules.Sales.Domain.Remitos;

public sealed class Remito : Entity<Guid>
{
    private readonly List<RemitoItem> _items = new();

    private Remito()
    {
    }

    public Remito(
        Guid id,
        TenantId tenantId,
        string remitoNumber,
        Guid? orderId,
        Guid customerId,
        string customerName,
        string customerDocument,
        string? deliveryAddress,
        DateTime issueDate,
        DateTime deliveryDate,
        string? carrierName,
        string? driverLicense,
        string status,
        string? notes,
        DateTime createdAtUtc)
        : base(id)
    {
        TenantId = tenantId;
        RemitoNumber = remitoNumber;
        OrderId = orderId;
        CustomerId = customerId;
        CustomerName = customerName;
        CustomerDocument = customerDocument;
        DeliveryAddress = deliveryAddress;
        IssueDate = issueDate;
        DeliveryDate = deliveryDate;
        CarrierName = carrierName;
        DriverLicense = driverLicense;
        Status = status;
        Notes = notes;
        CreatedAtUtc = createdAtUtc;
    }

    public TenantId TenantId { get; private set; }

    public string RemitoNumber { get; private set; } = string.Empty;

    public Guid? OrderId { get; private set; }

    public Guid CustomerId { get; private set; }

    public string CustomerName { get; private set; } = string.Empty;

    public string CustomerDocument { get; private set; } = string.Empty;

    public string? DeliveryAddress { get; private set; }

    public DateTime IssueDate { get; private set; }

    public DateTime DeliveryDate { get; private set; }

    public string? CarrierName { get; private set; }

    public string? DriverLicense { get; private set; }

    public string Status { get; private set; } = "Delivered"; // Delivered, Draft, Cancelled

    public string? Notes { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    public IReadOnlyList<RemitoItem> Items => _items.AsReadOnly();

    public static Remito Create(
        TenantId tenantId,
        string remitoNumber,
        Guid? orderId,
        Guid customerId,
        string customerName,
        string customerDocument,
        string? deliveryAddress,
        DateTime deliveryDate,
        string? carrierName,
        string? driverLicense,
        string? notes)
    {
        var utcDeliveryDate = deliveryDate.Kind == DateTimeKind.Unspecified
            ? DateTime.SpecifyKind(deliveryDate, DateTimeKind.Utc)
            : deliveryDate.ToUniversalTime();

        return new Remito(
            Guid.NewGuid(),
            tenantId,
            remitoNumber,
            orderId,
            customerId,
            customerName,
            customerDocument,
            deliveryAddress,
            DateTime.UtcNow,
            utcDeliveryDate,
            carrierName,
            driverLicense,
            "Delivered",
            notes,
            DateTime.UtcNow);
    }

    public void AddItem(Guid? productId, string code, string description, decimal quantity, string unitMeasure = "u")
    {
        var item = new RemitoItem(
            Guid.NewGuid(),
            Id,
            productId,
            code,
            description,
            quantity,
            unitMeasure);

        _items.Add(item);
    }

    public void Cancel()
    {
        Status = "Cancelled";
    }
}

public sealed class RemitoItem : Entity<Guid>
{
    private RemitoItem()
    {
    }

    public RemitoItem(
        Guid id,
        Guid remitoId,
        Guid? productId,
        string code,
        string description,
        decimal quantity,
        string unitMeasure)
        : base(id)
    {
        RemitoId = remitoId;
        ProductId = productId;
        Code = code;
        Description = description;
        Quantity = quantity;
        UnitMeasure = unitMeasure;
    }

    public Guid RemitoId { get; private set; }

    public Guid? ProductId { get; private set; }

    public string Code { get; private set; } = string.Empty;

    public string Description { get; private set; } = string.Empty;

    public decimal Quantity { get; private set; }

    public string UnitMeasure { get; private set; } = "u";
}
