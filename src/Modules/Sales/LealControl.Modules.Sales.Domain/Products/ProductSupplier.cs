using System;
using LealControl.BuildingBlocks.Domain;

namespace LealControl.Modules.Sales.Domain.Products;

public sealed class ProductSupplier : Entity<Guid>
{
    private ProductSupplier()
    {
    }

    internal ProductSupplier(
        Guid id,
        Guid supplierId,
        string? supplierCode,
        decimal purchasePrice,
        CurrencyCode currency,
        int leadTimeDays,
        decimal minimumOrder,
        bool isPreferred)
        : base(id)
    {
        SupplierId = supplierId;
        SupplierCode = supplierCode;
        PurchasePrice = purchasePrice;
        Currency = currency;
        LeadTimeDays = leadTimeDays;
        MinimumOrder = minimumOrder;
        IsPreferred = isPreferred;
    }

    public Guid SupplierId { get; private set; }

    public string? SupplierCode { get; private set; }

    public decimal PurchasePrice { get; private set; }

    public CurrencyCode Currency { get; private set; } = CurrencyCode.ARS;

    public int LeadTimeDays { get; private set; }

    public decimal MinimumOrder { get; private set; }

    public bool IsPreferred { get; private set; }
}
