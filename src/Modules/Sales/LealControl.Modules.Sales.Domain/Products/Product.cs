using System;
using System.Collections.Generic;
using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Results;
using LealControl.BuildingBlocks.Tenancy;

namespace LealControl.Modules.Sales.Domain.Products;

public sealed class Product : AggregateRoot<ProductId>
{
    private readonly List<ProductSupplier> _suppliers = [];

    private Product()
    {
    }

    private Product(
        ProductId id,
        TenantId tenantId,
        string code,
        string name,
        string? description,
        string? detailedDescription,
        ProductType type,
        CategoryId? categoryId,
        string? imagePath,
        CurrencyCode saleCurrency,
        decimal basePrice,
        CurrencyCode purchaseCurrency,
        decimal costPrice,
        decimal taxRate,
        string? salesAccountingCode,
        string? purchaseAccountingCode,
        bool trackStock,
        decimal stock,
        decimal minStock,
        string baseUnit,
        bool hasSerialNumber,
        bool trackLot,
        Dictionary<string, string>? customAttributes)
        : base(id)
    {
        TenantId = tenantId;
        Code = code;
        Name = name;
        Description = description;
        DetailedDescription = detailedDescription;
        Type = type;
        CategoryId = categoryId;
        ImagePath = imagePath;
        SaleCurrency = saleCurrency;
        BasePrice = basePrice;
        PurchaseCurrency = purchaseCurrency;
        CostPrice = costPrice;
        TaxRate = taxRate;
        SalesAccountingCode = salesAccountingCode;
        PurchaseAccountingCode = purchaseAccountingCode;
        TrackStock = trackStock;
        Stock = stock;
        MinStock = minStock;
        BaseUnit = baseUnit;
        HasSerialNumber = hasSerialNumber;
        TrackLot = trackLot;
        CustomAttributes = customAttributes ?? [];
        IsActive = true;
        CreatedAtUtc = DateTime.UtcNow;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public TenantId TenantId { get; private set; }

    public string Code { get; private set; } = string.Empty;

    public string Name { get; private set; } = string.Empty;

    public string? Description { get; private set; }

    public string? DetailedDescription { get; private set; }

    public ProductType Type { get; private set; } = ProductType.Product;

    public CategoryId? CategoryId { get; private set; }

    public string? ImagePath { get; private set; }

    public CurrencyCode SaleCurrency { get; private set; } = CurrencyCode.ARS;

    public decimal BasePrice { get; private set; }

    public CurrencyCode PurchaseCurrency { get; private set; } = CurrencyCode.ARS;

    public decimal CostPrice { get; private set; }

    public decimal TaxRate { get; private set; } = 21.00m;

    public string? SalesAccountingCode { get; private set; }

    public string? PurchaseAccountingCode { get; private set; }

    public bool TrackStock { get; private set; } = true;

    public decimal Stock { get; private set; }

    public decimal MinStock { get; private set; }

    public string BaseUnit { get; private set; } = "UN";

    public bool HasSerialNumber { get; private set; }

    public bool TrackLot { get; private set; }

    public Dictionary<string, string> CustomAttributes { get; private set; } = [];

    public bool IsActive { get; private set; } = true;

    public IReadOnlyCollection<ProductSupplier> Suppliers => _suppliers.AsReadOnly();

    public DateTime CreatedAtUtc { get; private set; }

    public DateTime UpdatedAtUtc { get; private set; }

    public static Result<Product> Create(
        TenantId tenantId,
        string code,
        string name,
        string? description = null,
        string? detailedDescription = null,
        ProductType type = ProductType.Product,
        CategoryId? categoryId = null,
        string? imagePath = null,
        CurrencyCode saleCurrency = CurrencyCode.ARS,
        decimal basePrice = 0m,
        CurrencyCode purchaseCurrency = CurrencyCode.ARS,
        decimal costPrice = 0m,
        decimal taxRate = 21.00m,
        string? salesAccountingCode = null,
        string? purchaseAccountingCode = null,
        bool trackStock = true,
        decimal stock = 0m,
        decimal minStock = 0m,
        string baseUnit = "UN",
        bool hasSerialNumber = false,
        bool trackLot = false,
        Dictionary<string, string>? customAttributes = null)
    {
        if (string.IsNullOrWhiteSpace(code))
        {
            return Result<Product>.Failure(SalesErrors.ProductCodeRequired);
        }

        if (string.IsNullOrWhiteSpace(name))
        {
            return Result<Product>.Failure(SalesErrors.ProductNameRequired);
        }

        if (type == ProductType.Service)
        {
            trackStock = false;
            stock = 0m;
            minStock = 0m;
            hasSerialNumber = false;
            trackLot = false;
        }

        return Result<Product>.Success(new Product(
            ProductId.New(),
            tenantId,
            code.Trim().ToUpperInvariant(),
            name.Trim(),
            string.IsNullOrWhiteSpace(description) ? null : description.Trim(),
            string.IsNullOrWhiteSpace(detailedDescription) ? null : detailedDescription.Trim(),
            type,
            categoryId,
            imagePath,
            saleCurrency,
            basePrice,
            purchaseCurrency,
            costPrice,
            taxRate,
            string.IsNullOrWhiteSpace(salesAccountingCode) ? null : salesAccountingCode.Trim(),
            string.IsNullOrWhiteSpace(purchaseAccountingCode) ? null : purchaseAccountingCode.Trim(),
            trackStock,
            stock,
            minStock,
            string.IsNullOrWhiteSpace(baseUnit) ? "UN" : baseUnit.Trim().ToUpperInvariant(),
            hasSerialNumber,
            trackLot,
            customAttributes));
    }

    public Result Update(
        string code,
        string name,
        string? description,
        string? detailedDescription,
        ProductType type,
        CategoryId? categoryId,
        string? imagePath,
        CurrencyCode saleCurrency,
        decimal basePrice,
        CurrencyCode purchaseCurrency,
        decimal costPrice,
        decimal taxRate,
        string? salesAccountingCode,
        string? purchaseAccountingCode,
        bool trackStock,
        decimal minStock,
        string baseUnit,
        bool hasSerialNumber,
        bool trackLot,
        Dictionary<string, string>? customAttributes)
    {
        if (string.IsNullOrWhiteSpace(code))
        {
            return Result.Failure(SalesErrors.ProductCodeRequired);
        }

        if (string.IsNullOrWhiteSpace(name))
        {
            return Result.Failure(SalesErrors.ProductNameRequired);
        }

        if (type == ProductType.Service)
        {
            trackStock = false;
            minStock = 0m;
            hasSerialNumber = false;
            trackLot = false;
            Stock = 0m;
        }

        Code = code.Trim().ToUpperInvariant();
        Name = name.Trim();
        Description = string.IsNullOrWhiteSpace(description) ? null : description.Trim();
        DetailedDescription = string.IsNullOrWhiteSpace(detailedDescription) ? null : detailedDescription.Trim();
        Type = type;
        CategoryId = categoryId;
        ImagePath = imagePath;
        SaleCurrency = saleCurrency;
        BasePrice = basePrice;
        PurchaseCurrency = purchaseCurrency;
        CostPrice = costPrice;
        TaxRate = taxRate;
        SalesAccountingCode = string.IsNullOrWhiteSpace(salesAccountingCode) ? null : salesAccountingCode.Trim();
        PurchaseAccountingCode = string.IsNullOrWhiteSpace(purchaseAccountingCode) ? null : purchaseAccountingCode.Trim();
        TrackStock = trackStock;
        MinStock = minStock;
        BaseUnit = string.IsNullOrWhiteSpace(baseUnit) ? "UN" : baseUnit.Trim().ToUpperInvariant();
        HasSerialNumber = hasSerialNumber;
        TrackLot = trackLot;
        CustomAttributes = customAttributes ?? [];
        UpdatedAtUtc = DateTime.UtcNow;

        return Result.Success();
    }

    public void AddSupplier(Guid supplierId, string? supplierCode, decimal purchasePrice, CurrencyCode currency, int leadTimeDays, decimal minimumOrder, bool isPreferred)
    {
        _suppliers.RemoveAll(s => s.SupplierId == supplierId);
        _suppliers.Add(new ProductSupplier(Guid.NewGuid(), supplierId, supplierCode, purchasePrice, currency, leadTimeDays, minimumOrder, isPreferred));
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void ToggleActive(bool isActive)
    {
        IsActive = isActive;
        UpdatedAtUtc = DateTime.UtcNow;
    }
}
