using System;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Persistence;
using LealControl.BuildingBlocks.Results;
using LealControl.BuildingBlocks.Time;
using LealControl.Modules.Crm.Application.Abstractions;
using LealControl.Modules.Crm.Application.Customers.Models;
using LealControl.Modules.Crm.Domain;
using LealControl.Modules.Crm.Domain.Customers;
using MediatR;

namespace LealControl.Modules.Crm.Application.Customers;

public sealed record UpdateCustomerBcraCommand(
    Guid CustomerId,
    string? CreditRating,
    int? WorstSituation,
    decimal? TotalDebt,
    int? RejectedChequesCount,
    string? Recommendation
) : IRequest<Result<CustomerDetailDto>>;

public sealed record UpdateBcraReportRequest(
    string? CreditRating,
    int? WorstSituation,
    decimal? TotalDebt,
    int? RejectedChequesCount,
    string? Recommendation
);

internal sealed class UpdateCustomerBcraCommandHandler : IRequestHandler<UpdateCustomerBcraCommand, Result<CustomerDetailDto>>
{
    private readonly ICustomerRepository _customers;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClock _clock;

    public UpdateCustomerBcraCommandHandler(
        ICustomerRepository customers,
        IUnitOfWork unitOfWork,
        IClock clock)
    {
        _customers = customers;
        _unitOfWork = unitOfWork;
        _clock = clock;
    }

    public async Task<Result<CustomerDetailDto>> Handle(
        UpdateCustomerBcraCommand request,
        CancellationToken cancellationToken)
    {
        var customer = await _customers.GetByIdAsync(new CustomerId(request.CustomerId), cancellationToken);
        if (customer is null || customer.IsDeleted)
        {
            return Result<CustomerDetailDto>.Failure(CrmErrors.CustomerNotFound);
        }

        customer.UpdateBcraCreditReport(
            request.CreditRating,
            request.WorstSituation,
            request.TotalDebt,
            request.RejectedChequesCount,
            request.Recommendation,
            _clock.UtcNow);

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result<CustomerDetailDto>.Success(CustomerMappings.ToDetail(customer));
    }
}
