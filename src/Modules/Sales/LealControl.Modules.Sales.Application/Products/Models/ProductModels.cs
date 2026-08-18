using System;
using System.Collections.Generic;
using LealControl.BuildingBlocks.Domain;
using LealControl.Modules.Sales.Domain.Products;

namespace LealControl.Modules.Sales.Application.Products.Models;

public sealed record ProductDto(
    Guid Id,
    string Code,
    string Name,
    string? Description,
    string? DetailedDescription,
    string Type,
    Guid? CategoryId,
    string? CategoryName,
    string? ImagePath,
    string SaleCurrency,
    decimal BasePrice,
    string PurchaseCurrency,
    decimal CostPrice,
    decimal TaxRate,
    string? SalesAccountingCode,
    string? PurchaseAccountingCode,
    bool TrackStock,
    decimal Stock,
    decimal MinStock,
    string BaseUnit,
    bool HasSerialNumber,
    bool TrackLot,
    bool IsActive,
    IReadOnlyDictionary<string, string> CustomAttributes,
    DateTime CreatedAtUtc,
    DateTime UpdatedAtUtc);

public sealed record ProductWriteModel(
    string Code,
    string Name,
    string? Description,
    string? DetailedDescription,
    ProductType Type,
    Guid? CategoryId,
    string? ImagePath,
    CurrencyCode SaleCurrency,
    decimal BasePrice,
    CurrencyCode PurchaseCurrency,
    decimal CostPrice,
    decimal TaxRate,
    string? SalesAccountingCode,
    string? PurchaseAccountingCode,
    bool TrackStock,
    decimal MinStock,
    string BaseUnit,
    bool HasSerialNumber,
    bool TrackLot,
    Dictionary<string, string>? CustomAttributes);

public sealed record ProductCategoryDto(
    Guid Id,
    string Name,
    string? Description,
    Guid? ParentCategoryId,
    string? DefaultSalesAccountingCode,
    string? DefaultPurchaseAccountingCode,
    decimal DefaultTaxRate,
    DateTime CreatedAtUtc);

public sealed record ProductCategoryWriteModel(
    string Name,
    string? Description,
    Guid? ParentCategoryId,
    string? DefaultSalesAccountingCode,
    string? DefaultPurchaseAccountingCode,
    decimal DefaultTaxRate);

public static class ProductMappings
{
    public static ProductDto ToDto(Product product, string? categoryName = null) => new(
        product.Id.Value,
        product.Code,
        product.Name,
        product.Description,
        product.DetailedDescription,
        product.Type.ToString(),
        product.CategoryId?.Value,
        categoryName,
        product.ImagePath,
        product.SaleCurrency.ToString(),
        product.BasePrice,
        product.PurchaseCurrency.ToString(),
        product.CostPrice,
        product.TaxRate,
        product.SalesAccountingCode,
        product.PurchaseAccountingCode,
        product.TrackStock,
        product.Stock,
        product.MinStock,
        product.BaseUnit,
        product.HasSerialNumber,
        product.TrackLot,
        product.IsActive,
        product.CustomAttributes,
        product.CreatedAtUtc,
        product.UpdatedAtUtc);

    public static ProductCategoryDto ToDto(ProductCategory category) => new(
        category.Id.Value,
        category.Name,
        category.Description,
        category.ParentCategoryId?.Value,
        category.DefaultSalesAccountingCode,
        category.DefaultPurchaseAccountingCode,
        category.DefaultTaxRate,
        category.CreatedAtUtc);
}
