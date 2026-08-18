using System;
using LealControl.BuildingBlocks.Domain;

namespace LealControl.Modules.Sales.Domain.Orders;

public sealed class OrderLine : Entity<OrderLineId>
{
    private OrderLine()
    {
    }

    internal OrderLine(
        OrderLineId id,
        Guid? productId,
        string description,
        decimal quantity,
        decimal unitPrice,
        string currencyCode,
        decimal discountPercent,
        decimal taxRate,
        bool isOptional)
        : base(id)
    {
        ProductId = productId;
        Description = description;
        Quantity = quantity;
        UnitPrice = unitPrice;
        CurrencyCode = currencyCode;
        DiscountPercent = discountPercent;
        TaxRate = taxRate;
        IsOptional = isOptional;
        Recalculate();
    }

    public Guid? ProductId { get; private set; }

    public string Description { get; private set; } = string.Empty;

    public decimal Quantity { get; private set; }

    public decimal UnitPrice { get; private set; }

    public string CurrencyCode { get; private set; } = "ARS";

    public decimal DiscountPercent { get; private set; }

    public decimal TaxRate { get; private set; }

    public bool IsOptional { get; private set; }

    public decimal LineSubtotal { get; private set; }

    public void Update(
        Guid? productId,
        string description,
        decimal quantity,
        decimal unitPrice,
        string currencyCode,
        decimal discountPercent,
        decimal taxRate,
        bool isOptional)
    {
        ProductId = productId;
        Description = description;
        Quantity = quantity;
        UnitPrice = unitPrice;
        CurrencyCode = currencyCode;
        DiscountPercent = discountPercent;
        TaxRate = taxRate;
        IsOptional = isOptional;
        Recalculate();
    }

    private void Recalculate()
    {
        if (Quantity <= 0 || UnitPrice <= 0)
        {
            LineSubtotal = 0;
            return;
        }

        var baseTotal = Quantity * UnitPrice;
        var discountAmount = baseTotal * (DiscountPercent / 100m);
        LineSubtotal = Math.Round(baseTotal - discountAmount, 2);
    }
}
