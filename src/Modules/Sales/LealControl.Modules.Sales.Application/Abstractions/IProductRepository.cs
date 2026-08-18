using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Sales.Domain.Products;

namespace LealControl.Modules.Sales.Application.Abstractions;

public interface IProductRepository
{
    Task<Product?> GetByIdAsync(ProductId id, CancellationToken cancellationToken = default);

    Task<Product?> GetByCodeAsync(TenantId tenantId, string code, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<Product>> ListAsync(
        TenantId tenantId,
        string? search = null,
        ProductType? type = null,
        CategoryId? categoryId = null,
        CancellationToken cancellationToken = default);

    void Add(Product product);

    void Remove(Product product);
}

public interface IProductCategoryRepository
{
    Task<ProductCategory?> GetByIdAsync(CategoryId id, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<ProductCategory>> ListAsync(TenantId tenantId, CancellationToken cancellationToken = default);

    void Add(ProductCategory category);
}
