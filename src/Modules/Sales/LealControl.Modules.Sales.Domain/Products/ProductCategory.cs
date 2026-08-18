using System;
using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Results;
using LealControl.BuildingBlocks.Tenancy;

namespace LealControl.Modules.Sales.Domain.Products;

public sealed class ProductCategory : AggregateRoot<CategoryId>
{
    private ProductCategory()
    {
    }

    private ProductCategory(
        CategoryId id,
        TenantId tenantId,
        string name,
        string? description,
        CategoryId? parentCategoryId,
        string? defaultSalesAccountingCode,
        string? defaultPurchaseAccountingCode,
        decimal defaultTaxRate)
        : base(id)
    {
        TenantId = tenantId;
        Name = name;
        Description = description;
        ParentCategoryId = parentCategoryId;
        DefaultSalesAccountingCode = defaultSalesAccountingCode;
        DefaultPurchaseAccountingCode = defaultPurchaseAccountingCode;
        DefaultTaxRate = defaultTaxRate;
        CreatedAtUtc = DateTime.UtcNow;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public TenantId TenantId { get; private set; }

    public string Name { get; private set; } = string.Empty;

    public string? Description { get; private set; }

    public CategoryId? ParentCategoryId { get; private set; }

    public string? DefaultSalesAccountingCode { get; private set; }

    public string? DefaultPurchaseAccountingCode { get; private set; }

    public decimal DefaultTaxRate { get; private set; } = 21.00m;

    public DateTime CreatedAtUtc { get; private set; }

    public DateTime UpdatedAtUtc { get; private set; }

    public static Result<ProductCategory> Create(
        TenantId tenantId,
        string name,
        string? description = null,
        CategoryId? parentCategoryId = null,
        string? defaultSalesAccountingCode = null,
        string? defaultPurchaseAccountingCode = null,
        decimal defaultTaxRate = 21.00m)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return Result<ProductCategory>.Failure(SalesErrors.CategoryNameRequired);
        }

        return Result<ProductCategory>.Success(new ProductCategory(
            CategoryId.New(),
            tenantId,
            name.Trim(),
            string.IsNullOrWhiteSpace(description) ? null : description.Trim(),
            parentCategoryId,
            defaultSalesAccountingCode,
            defaultPurchaseAccountingCode,
            defaultTaxRate));
    }
}
