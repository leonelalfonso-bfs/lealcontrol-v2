using System;
using System.Collections.Generic;
using System.Linq;
using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Tenancy;

namespace LealControl.Modules.Sales.Domain.Purchases;

public sealed class PurchaseOrder : Entity<Guid>
{
    private readonly List<PurchaseOrderItem> _items = new();

    private PurchaseOrder()
    {
    }

    public PurchaseOrder(
        Guid id,
        TenantId tenantId,
        string orderNumber,
        Guid supplierId,
        string supplierName,
        string supplierDocument,
        DateTime issueDate,
        DateTime? expectedDeliveryDate,
        string currency,
        decimal exchangeRate,
        string? paymentTerms,
        string? paymentMethod,
        string? deliveryAddress,
        decimal subtotal,
        decimal taxAmount,
        decimal total,
        string status,
        string? notes,
        DateTime createdAtUtc,
        DateTime updatedAtUtc)
        : base(id)
    {
        TenantId = tenantId;
        OrderNumber = orderNumber;
        SupplierId = supplierId;
        SupplierName = supplierName;
        SupplierDocument = supplierDocument;
        IssueDate = issueDate;
        ExpectedDeliveryDate = expectedDeliveryDate;
        Currency = currency;
        ExchangeRate = exchangeRate;
        PaymentTerms = paymentTerms;
        PaymentMethod = paymentMethod;
        DeliveryAddress = deliveryAddress;
        Subtotal = subtotal;
        TaxAmount = taxAmount;
        Total = total;
        Status = status;
        Notes = notes;
        CreatedAtUtc = createdAtUtc;
        UpdatedAtUtc = updatedAtUtc;
    }

    public TenantId TenantId { get; private set; }
    public string OrderNumber { get; private set; } = string.Empty;
    public Guid SupplierId { get; private set; }
    public string SupplierName { get; private set; } = string.Empty;
    public string SupplierDocument { get; private set; } = string.Empty;
    public DateTime IssueDate { get; private set; }
    public DateTime? ExpectedDeliveryDate { get; private set; }
    public string Currency { get; private set; } = "ARS";
    public decimal ExchangeRate { get; private set; } = 1.0m;
    public string? PaymentTerms { get; private set; }
    public string? PaymentMethod { get; private set; }
    public string? DeliveryAddress { get; private set; }
    public decimal Subtotal { get; private set; }
    public decimal TaxAmount { get; private set; }
    public decimal Total { get; private set; }
    public string Status { get; private set; } = "Draft"; // Draft, Sent, PartiallyReceived, Received, Cancelled
    public string? Notes { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }

    public IReadOnlyList<PurchaseOrderItem> Items => _items.AsReadOnly();

    public static PurchaseOrder Create(
        TenantId tenantId,
        string orderNumber,
        Guid supplierId,
        string supplierName,
        string supplierDocument,
        DateTime? expectedDeliveryDate,
        string currency,
        decimal exchangeRate,
        string? paymentTerms,
        string? paymentMethod,
        string? deliveryAddress,
        string? notes)
    {
        var now = DateTime.UtcNow;
        var utcExpected = expectedDeliveryDate.HasValue
            ? (expectedDeliveryDate.Value.Kind == DateTimeKind.Unspecified
                ? DateTime.SpecifyKind(expectedDeliveryDate.Value, DateTimeKind.Utc)
                : expectedDeliveryDate.Value.ToUniversalTime())
            : (DateTime?)null;

        return new PurchaseOrder(
            Guid.NewGuid(),
            tenantId,
            orderNumber,
            supplierId,
            supplierName,
            supplierDocument,
            now,
            utcExpected,
            currency,
            exchangeRate <= 0 ? 1.0m : exchangeRate,
            paymentTerms,
            paymentMethod,
            deliveryAddress,
            0,
            0,
            0,
            "Draft",
            notes,
            now,
            now);
    }

    public void AddItem(
        Guid? productId,
        string code,
        string description,
        decimal quantity,
        decimal unitPrice,
        decimal discountPercent,
        decimal taxRate)
    {
        var gross = quantity * unitPrice;
        var discount = gross * (discountPercent / 100m);
        var net = Math.Round(Math.Max(0, gross - discount), 2);
        var tax = Math.Round(net * (taxRate / 100m), 2);
        var tot = net + tax;

        var item = new PurchaseOrderItem(
            Guid.NewGuid(),
            Id,
            productId,
            code,
            description,
            quantity,
            0,
            unitPrice,
            discountPercent,
            taxRate,
            net,
            tot);

        _items.Add(item);
        RecalculateTotals();
    }

    public void RecalculateTotals()
    {
        Subtotal = _items.Sum(i => i.NetSubtotal);
        TaxAmount = _items.Sum(i => i.Total - i.NetSubtotal);
        Total = _items.Sum(i => i.Total);
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public bool CanChangeStatus(string newStatus)
    {
        if (Status == "Cancelled" && newStatus != "Cancelled") return false;
        return true;
    }

    public void ChangeStatus(string newStatus)
    {
        if (!CanChangeStatus(newStatus)) throw new InvalidOperationException($"No se puede pasar una orden de {Status} a {newStatus}.");
        Status = newStatus;
        UpdatedAtUtc = DateTime.UtcNow;
    }
}

public sealed class PurchaseOrderItem : Entity<Guid>
{
    private PurchaseOrderItem()
    {
    }

    public PurchaseOrderItem(
        Guid id,
        Guid purchaseOrderId,
        Guid? productId,
        string code,
        string description,
        decimal quantity,
        decimal receivedQuantity,
        decimal unitPrice,
        decimal discountPercent,
        decimal taxRate,
        decimal netSubtotal,
        decimal total)
        : base(id)
    {
        PurchaseOrderId = purchaseOrderId;
        ProductId = productId;
        Code = code;
        Description = description;
        Quantity = quantity;
        ReceivedQuantity = receivedQuantity;
        UnitPrice = unitPrice;
        DiscountPercent = discountPercent;
        TaxRate = taxRate;
        NetSubtotal = netSubtotal;
        Total = total;
    }

    public Guid PurchaseOrderId { get; private set; }
    public Guid? ProductId { get; private set; }
    public string Code { get; private set; } = string.Empty;
    public string Description { get; private set; } = string.Empty;
    public decimal Quantity { get; private set; }
    public decimal ReceivedQuantity { get; private set; }
    public decimal UnitPrice { get; private set; }
    public decimal DiscountPercent { get; private set; }
    public decimal TaxRate { get; private set; }
    public decimal NetSubtotal { get; private set; }
    public decimal Total { get; private set; }

    public void RecordReceived(decimal qty)
    {
        ReceivedQuantity += qty;
    }
}
