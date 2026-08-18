using System;
using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Tenancy;

namespace LealControl.Modules.Sales.Domain.Inventory;

public sealed class ProductSupplier : Entity<Guid>
{
    private ProductSupplier()
    {
    }

    public ProductSupplier(
        Guid id,
        TenantId tenantId,
        Guid productId,
        Guid supplierId,
        string? supplierProductCode,
        decimal purchasePrice,
        string currency,
        int leadTimeDays,
        decimal minimumOrderQuantity,
        bool isPreferred,
        DateTime createdAtUtc)
        : base(id)
    {
        TenantId = tenantId;
        ProductId = productId;
        SupplierId = supplierId;
        SupplierProductCode = supplierProductCode;
        PurchasePrice = purchasePrice;
        Currency = currency;
        LeadTimeDays = leadTimeDays;
        MinimumOrderQuantity = minimumOrderQuantity;
        IsPreferred = isPreferred;
        CreatedAtUtc = createdAtUtc;
    }

    public TenantId TenantId { get; private set; }

    public Guid ProductId { get; private set; }

    public Guid SupplierId { get; private set; }

    public string? SupplierProductCode { get; private set; }

    public decimal PurchasePrice { get; private set; }

    public string Currency { get; private set; } = "ARS";

    public int LeadTimeDays { get; private set; } = 7;

    public decimal MinimumOrderQuantity { get; private set; } = 1;

    public bool IsPreferred { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    public static ProductSupplier Create(
        TenantId tenantId,
        Guid productId,
        Guid supplierId,
        string? supplierProductCode,
        decimal purchasePrice,
        string currency,
        int leadTimeDays,
        decimal minimumOrderQuantity,
        bool isPreferred)
    {
        return new ProductSupplier(
            Guid.NewGuid(),
            tenantId,
            productId,
            supplierId,
            supplierProductCode?.Trim(),
            purchasePrice < 0 ? 0 : purchasePrice,
            string.IsNullOrWhiteSpace(currency) ? "ARS" : currency.Trim(),
            leadTimeDays < 1 ? 1 : leadTimeDays,
            minimumOrderQuantity < 1 ? 1 : minimumOrderQuantity,
            isPreferred,
            DateTime.UtcNow);
    }
}
