using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Results;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Sales.Application.Abstractions;
using LealControl.Modules.Sales.Application.Products.Models;
using LealControl.Modules.Sales.Domain;
using LealControl.Modules.Sales.Domain.Products;
using MediatR;

namespace LealControl.Modules.Sales.Application.Products;

public sealed record CreateProductCommand(ProductWriteModel Model)
    : IRequest<Result<ProductDto>>;

public sealed record UpdateProductCommand(Guid Id, ProductWriteModel Model)
    : IRequest<Result<ProductDto>>;

public sealed record DeleteProductCommand(Guid Id)
    : IRequest<Result>;

public sealed record ListProductsQuery(string? Search = null, ProductType? Type = null, Guid? CategoryId = null)
    : IRequest<Result<IReadOnlyList<ProductDto>>>;

public sealed record GetProductQuery(Guid Id)
    : IRequest<Result<ProductDto>>;

public sealed record ListCategoriesQuery
    : IRequest<Result<IReadOnlyList<ProductCategoryDto>>>;

public sealed record CreateCategoryCommand(ProductCategoryWriteModel Model)
    : IRequest<Result<ProductCategoryDto>>;

internal sealed class CreateProductCommandHandler : IRequestHandler<CreateProductCommand, Result<ProductDto>>
{
    private readonly IProductRepository _productRepository;
    private readonly IProductCategoryRepository _categoryRepository;
    private readonly ISalesUnitOfWork _unitOfWork;
    private readonly ITenantContext _tenantContext;

    public CreateProductCommandHandler(
        IProductRepository productRepository,
        IProductCategoryRepository categoryRepository,
        ISalesUnitOfWork unitOfWork,
        ITenantContext tenantContext)
    {
        _productRepository = productRepository;
        _categoryRepository = categoryRepository;
        _unitOfWork = unitOfWork;
        _tenantContext = tenantContext;
    }

    public async Task<Result<ProductDto>> Handle(CreateProductCommand request, CancellationToken cancellationToken)
    {
        var existing = await _productRepository.GetByCodeAsync(_tenantContext.TenantId, request.Model.Code, cancellationToken);
        if (existing is not null)
        {
            return Result<ProductDto>.Failure(Error.Conflict("Sales.Product.CodeExists", "Ya existe un producto con este código."));
        }

        CategoryId? categoryId = request.Model.CategoryId.HasValue ? new CategoryId(request.Model.CategoryId.Value) : null;
        string? categoryName = null;
        if (categoryId.HasValue)
        {
            var cat = await _categoryRepository.GetByIdAsync(categoryId.Value, cancellationToken);
            categoryName = cat?.Name;
        }

        var result = Product.Create(
            _tenantContext.TenantId,
            request.Model.Code,
            request.Model.Name,
            request.Model.Description,
            request.Model.DetailedDescription,
            request.Model.Type,
            categoryId,
            request.Model.ImagePath,
            request.Model.SaleCurrency,
            request.Model.BasePrice,
            request.Model.PurchaseCurrency,
            request.Model.CostPrice,
            request.Model.TaxRate,
            request.Model.SalesAccountingCode,
            request.Model.PurchaseAccountingCode,
            request.Model.TrackStock,
            0m,
            request.Model.MinStock,
            request.Model.BaseUnit,
            request.Model.HasSerialNumber,
            request.Model.TrackLot,
            request.Model.CustomAttributes);

        if (result.IsFailure)
        {
            return Result<ProductDto>.Failure(result.Error);
        }

        _productRepository.Add(result.Value);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result<ProductDto>.Success(ProductMappings.ToDto(result.Value, categoryName));
    }
}

internal sealed class UpdateProductCommandHandler : IRequestHandler<UpdateProductCommand, Result<ProductDto>>
{
    private readonly IProductRepository _productRepository;
    private readonly IProductCategoryRepository _categoryRepository;
    private readonly ISalesUnitOfWork _unitOfWork;

    public UpdateProductCommandHandler(
        IProductRepository productRepository,
        IProductCategoryRepository categoryRepository,
        ISalesUnitOfWork unitOfWork)
    {
        _productRepository = productRepository;
        _categoryRepository = categoryRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<ProductDto>> Handle(UpdateProductCommand request, CancellationToken cancellationToken)
    {
        var product = await _productRepository.GetByIdAsync(new ProductId(request.Id), cancellationToken);
        if (product is null)
        {
            return Result<ProductDto>.Failure(SalesErrors.ProductNotFound);
        }

        CategoryId? categoryId = request.Model.CategoryId.HasValue ? new CategoryId(request.Model.CategoryId.Value) : null;
        string? categoryName = null;
        if (categoryId.HasValue)
        {
            var cat = await _categoryRepository.GetByIdAsync(categoryId.Value, cancellationToken);
            categoryName = cat?.Name;
        }

        var updateResult = product.Update(
            request.Model.Code,
            request.Model.Name,
            request.Model.Description,
            request.Model.DetailedDescription,
            request.Model.Type,
            categoryId,
            request.Model.ImagePath,
            request.Model.SaleCurrency,
            request.Model.BasePrice,
            request.Model.PurchaseCurrency,
            request.Model.CostPrice,
            request.Model.TaxRate,
            request.Model.SalesAccountingCode,
            request.Model.PurchaseAccountingCode,
            request.Model.TrackStock,
            request.Model.MinStock,
            request.Model.BaseUnit,
            request.Model.HasSerialNumber,
            request.Model.TrackLot,
            request.Model.CustomAttributes);

        if (updateResult.IsFailure)
        {
            return Result<ProductDto>.Failure(updateResult.Error);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result<ProductDto>.Success(ProductMappings.ToDto(product, categoryName));
    }
}

internal sealed class DeleteProductCommandHandler : IRequestHandler<DeleteProductCommand, Result>
{
    private readonly IProductRepository _productRepository;
    private readonly ISalesUnitOfWork _unitOfWork;

    public DeleteProductCommandHandler(IProductRepository productRepository, ISalesUnitOfWork unitOfWork)
    {
        _productRepository = productRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result> Handle(DeleteProductCommand request, CancellationToken cancellationToken)
    {
        var product = await _productRepository.GetByIdAsync(new ProductId(request.Id), cancellationToken);
        if (product is null)
        {
            return Result.Failure(SalesErrors.ProductNotFound);
        }

        product.ToggleActive(false);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}

internal sealed class ListProductsQueryHandler : IRequestHandler<ListProductsQuery, Result<IReadOnlyList<ProductDto>>>
{
    private readonly IProductRepository _productRepository;
    private readonly IProductCategoryRepository _categoryRepository;
    private readonly ITenantContext _tenantContext;

    public ListProductsQueryHandler(
        IProductRepository productRepository,
        IProductCategoryRepository categoryRepository,
        ITenantContext tenantContext)
    {
        _productRepository = productRepository;
        _categoryRepository = categoryRepository;
        _tenantContext = tenantContext;
    }

    public async Task<Result<IReadOnlyList<ProductDto>>> Handle(ListProductsQuery request, CancellationToken cancellationToken)
    {
        var categoryId = request.CategoryId.HasValue ? new CategoryId(request.CategoryId.Value) : (CategoryId?)null;
        var products = await _productRepository.ListAsync(_tenantContext.TenantId, request.Search, request.Type, categoryId, cancellationToken);
        var categories = await _categoryRepository.ListAsync(_tenantContext.TenantId, cancellationToken);
        var catDict = categories.ToDictionary(c => c.Id, c => c.Name);

        var dtos = products.Select(p => ProductMappings.ToDto(
            p,
            p.CategoryId.HasValue && catDict.TryGetValue(p.CategoryId.Value, out var cName) ? cName : null
        )).ToList();

        return Result<IReadOnlyList<ProductDto>>.Success(dtos);
    }
}

internal sealed class GetProductQueryHandler : IRequestHandler<GetProductQuery, Result<ProductDto>>
{
    private readonly IProductRepository _productRepository;
    private readonly IProductCategoryRepository _categoryRepository;

    public GetProductQueryHandler(IProductRepository productRepository, IProductCategoryRepository categoryRepository)
    {
        _productRepository = productRepository;
        _categoryRepository = categoryRepository;
    }

    public async Task<Result<ProductDto>> Handle(GetProductQuery request, CancellationToken cancellationToken)
    {
        var product = await _productRepository.GetByIdAsync(new ProductId(request.Id), cancellationToken);
        if (product is null)
        {
            return Result<ProductDto>.Failure(SalesErrors.ProductNotFound);
        }

        string? categoryName = null;
        if (product.CategoryId.HasValue)
        {
            var cat = await _categoryRepository.GetByIdAsync(product.CategoryId.Value, cancellationToken);
            categoryName = cat?.Name;
        }

        return Result<ProductDto>.Success(ProductMappings.ToDto(product, categoryName));
    }
}

internal sealed class ListCategoriesQueryHandler : IRequestHandler<ListCategoriesQuery, Result<IReadOnlyList<ProductCategoryDto>>>
{
    private readonly IProductCategoryRepository _categoryRepository;
    private readonly ITenantContext _tenantContext;

    public ListCategoriesQueryHandler(IProductCategoryRepository categoryRepository, ITenantContext tenantContext)
    {
        _categoryRepository = categoryRepository;
        _tenantContext = tenantContext;
    }

    public async Task<Result<IReadOnlyList<ProductCategoryDto>>> Handle(ListCategoriesQuery request, CancellationToken cancellationToken)
    {
        var categories = await _categoryRepository.ListAsync(_tenantContext.TenantId, cancellationToken);
        var dtos = categories.Select(ProductMappings.ToDto).ToList();
        return Result<IReadOnlyList<ProductCategoryDto>>.Success(dtos);
    }
}

internal sealed class CreateCategoryCommandHandler : IRequestHandler<CreateCategoryCommand, Result<ProductCategoryDto>>
{
    private readonly IProductCategoryRepository _categoryRepository;
    private readonly ISalesUnitOfWork _unitOfWork;
    private readonly ITenantContext _tenantContext;

    public CreateCategoryCommandHandler(
        IProductCategoryRepository categoryRepository,
        ISalesUnitOfWork unitOfWork,
        ITenantContext tenantContext)
    {
        _categoryRepository = categoryRepository;
        _unitOfWork = unitOfWork;
        _tenantContext = tenantContext;
    }

    public async Task<Result<ProductCategoryDto>> Handle(CreateCategoryCommand request, CancellationToken cancellationToken)
    {
        CategoryId? parentId = request.Model.ParentCategoryId.HasValue ? new CategoryId(request.Model.ParentCategoryId.Value) : null;
        var result = ProductCategory.Create(
            _tenantContext.TenantId,
            request.Model.Name,
            request.Model.Description,
            parentId,
            request.Model.DefaultSalesAccountingCode,
            request.Model.DefaultPurchaseAccountingCode,
            request.Model.DefaultTaxRate);

        if (result.IsFailure)
        {
            return Result<ProductCategoryDto>.Failure(result.Error);
        }

        _categoryRepository.Add(result.Value);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result<ProductCategoryDto>.Success(ProductMappings.ToDto(result.Value));
    }
}
