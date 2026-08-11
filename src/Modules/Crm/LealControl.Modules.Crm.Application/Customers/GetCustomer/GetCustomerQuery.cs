using LealControl.BuildingBlocks.Results;
using LealControl.Modules.Crm.Application.Abstractions;
using LealControl.Modules.Crm.Application.Customers.Models;
using LealControl.Modules.Crm.Contracts.Customers;
using LealControl.Modules.Crm.Domain;
using LealControl.Modules.Crm.Domain.Customers;
using LealControl.Modules.Crm.Domain.Shared;
using MediatR;

namespace LealControl.Modules.Crm.Application.Customers.GetCustomer;

public sealed record GetCustomerQuery(Guid CustomerId) : IRequest<Result<CustomerDetailDto>>;

internal sealed class GetCustomerQueryHandler : IRequestHandler<GetCustomerQuery, Result<CustomerDetailDto>>
{
    private readonly ICustomerRepository _customers;

    public GetCustomerQueryHandler(ICustomerRepository customers) => _customers = customers;

    public async Task<Result<CustomerDetailDto>> Handle(GetCustomerQuery request, CancellationToken cancellationToken)
    {
        var customer = await _customers.GetByIdAsync(new CustomerId(request.CustomerId), cancellationToken);
        if (customer is null || customer.IsDeleted)
        {
            return Result<CustomerDetailDto>.Failure(CrmErrors.CustomerNotFound);
        }

        return Result<CustomerDetailDto>.Success(CustomerMappings.ToDetail(customer));
    }
}

public sealed record ListCustomersQuery(string? Search, bool? OnlyActive, int Page, int PageSize)
    : IRequest<Result<PagedResult<CustomerSummary>>>;

internal sealed class ListCustomersQueryHandler
    : IRequestHandler<ListCustomersQuery, Result<PagedResult<CustomerSummary>>>
{
    private readonly ICustomerRepository _customers;
    private readonly LealControl.BuildingBlocks.Tenancy.ITenantContext _tenant;

    public ListCustomersQueryHandler(
        ICustomerRepository customers,
        LealControl.BuildingBlocks.Tenancy.ITenantContext tenant)
    {
        _customers = customers;
        _tenant = tenant;
    }

    public async Task<Result<PagedResult<CustomerSummary>>> Handle(
        ListCustomersQuery request,
        CancellationToken cancellationToken)
    {
        var page = new PageRequest(request.Page, request.PageSize);
        var items = await _customers.SearchAsync(
            _tenant.TenantId,
            request.Search,
            request.OnlyActive,
            page.Skip,
            page.Take,
            cancellationToken);

        var total = await _customers.CountAsync(
            _tenant.TenantId,
            request.Search,
            request.OnlyActive,
            cancellationToken);

        var summaries = items.Select(c => new CustomerSummary(
            c.Id.Value,
            c.LegalName,
            c.TradeName,
            c.Document.Type.ToString(),
            c.Document.Number,
            c.TaxCondition.ToString(),
            c.Status.ToString(),
            c.IsCustomer,
            c.IsSupplier,
            c.Email?.Value,
            c.Phone?.Value)).ToList();

        return Result<PagedResult<CustomerSummary>>.Success(
            new PagedResult<CustomerSummary>(summaries, total, page.NormalizedPage, page.Take));
    }
}

public sealed record ChangeCustomerStatusCommand(Guid CustomerId, CustomerStatus Status)
    : IRequest<Result<CustomerDetailDto>>;

internal sealed class ChangeCustomerStatusCommandHandler
    : IRequestHandler<ChangeCustomerStatusCommand, Result<CustomerDetailDto>>
{
    private readonly ICustomerRepository _customers;
    private readonly LealControl.BuildingBlocks.Persistence.IUnitOfWork _unitOfWork;
    private readonly LealControl.BuildingBlocks.Time.IClock _clock;

    public ChangeCustomerStatusCommandHandler(
        ICustomerRepository customers,
        LealControl.BuildingBlocks.Persistence.IUnitOfWork unitOfWork,
        LealControl.BuildingBlocks.Time.IClock clock)
    {
        _customers = customers;
        _unitOfWork = unitOfWork;
        _clock = clock;
    }

    public async Task<Result<CustomerDetailDto>> Handle(
        ChangeCustomerStatusCommand request,
        CancellationToken cancellationToken)
    {
        var customer = await _customers.GetByIdAsync(new CustomerId(request.CustomerId), cancellationToken);
        if (customer is null || customer.IsDeleted)
        {
            return Result<CustomerDetailDto>.Failure(CrmErrors.CustomerNotFound);
        }

        var result = request.Status == CustomerStatus.Active
            ? customer.Activate(_clock.UtcNow)
            : customer.Deactivate(_clock.UtcNow);

        if (result.IsFailure)
        {
            return Result<CustomerDetailDto>.Failure(result.Error);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result<CustomerDetailDto>.Success(CustomerMappings.ToDetail(customer));
    }
}
