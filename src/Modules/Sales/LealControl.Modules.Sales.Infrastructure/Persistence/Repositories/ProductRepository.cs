using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Sales.Application.Abstractions;
using LealControl.Modules.Sales.Domain.Products;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Sales.Infrastructure.Persistence.Repositories;

internal sealed class ProductRepository : IProductRepository
{
    private readonly SalesDbContext _dbContext;

    public ProductRepository(SalesDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<Product?> GetByIdAsync(ProductId id, CancellationToken cancellationToken = default)
    {
        return await _dbContext.Products
            .FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
    }

    public async Task<Product?> GetByCodeAsync(TenantId tenantId, string code, CancellationToken cancellationToken = default)
    {
        var cleanCode = code.Trim().ToUpperInvariant();
        return await _dbContext.Products
            .FirstOrDefaultAsync(x => x.TenantId == tenantId && x.Code == cleanCode, cancellationToken);
    }

    public async Task<IReadOnlyList<Product>> ListAsync(
        TenantId tenantId,
        string? search = null,
        ProductType? type = null,
        CategoryId? categoryId = null,
        CancellationToken cancellationToken = default)
    {
        var query = _dbContext.Products.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(x => x.Code.ToLower().Contains(term) || x.Name.ToLower().Contains(term) || (x.Description != null && x.Description.ToLower().Contains(term)));
        }

        if (type.HasValue)
        {
            query = query.Where(x => x.Type == type.Value);
        }

        if (categoryId.HasValue)
        {
            query = query.Where(x => x.CategoryId == categoryId.Value);
        }

        return await query.OrderBy(x => x.Name).ToListAsync(cancellationToken);
    }

    public void Add(Product product)
    {
        _dbContext.Products.Add(product);
    }

    public void Remove(Product product)
    {
        _dbContext.Products.Remove(product);
    }
}

internal sealed class ProductCategoryRepository : IProductCategoryRepository
{
    private readonly SalesDbContext _dbContext;

    public ProductCategoryRepository(SalesDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<ProductCategory?> GetByIdAsync(CategoryId id, CancellationToken cancellationToken = default)
    {
        return await _dbContext.ProductCategories
            .FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
    }

    public async Task<IReadOnlyList<ProductCategory>> ListAsync(TenantId tenantId, CancellationToken cancellationToken = default)
    {
        return await _dbContext.ProductCategories
            .AsNoTracking()
            .Where(x => x.TenantId == tenantId)
            .OrderBy(x => x.Name)
            .ToListAsync(cancellationToken);
    }

    public void Add(ProductCategory category)
    {
        _dbContext.ProductCategories.Add(category);
    }
}
