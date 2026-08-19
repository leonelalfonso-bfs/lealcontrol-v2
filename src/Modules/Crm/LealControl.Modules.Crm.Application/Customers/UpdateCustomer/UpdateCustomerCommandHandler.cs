using LealControl.BuildingBlocks.Persistence;
using LealControl.BuildingBlocks.Results;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.BuildingBlocks.Time;
using LealControl.Modules.Crm.Application.Abstractions;
using LealControl.Modules.Crm.Application.Customers.Models;
using LealControl.Modules.Crm.Domain;
using LealControl.Modules.Crm.Domain.Customers;
using MediatR;

namespace LealControl.Modules.Crm.Application.Customers.UpdateCustomer;

internal sealed class UpdateCustomerCommandHandler
    : IRequestHandler<UpdateCustomerCommand, Result<CustomerDetailDto>>
{
    private readonly ICustomerRepository _customers;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ITenantContext _tenant;
    private readonly IClock _clock;

    public UpdateCustomerCommandHandler(
        ICustomerRepository customers,
        IUnitOfWork unitOfWork,
        ITenantContext tenant,
        IClock clock)
    {
        _customers = customers;
        _unitOfWork = unitOfWork;
        _tenant = tenant;
        _clock = clock;
    }

    public async Task<Result<CustomerDetailDto>> Handle(
        UpdateCustomerCommand request,
        CancellationToken cancellationToken)
    {
        var customer = await _customers.GetByIdAsync(new CustomerId(request.CustomerId), cancellationToken);
        if (customer is null || customer.IsDeleted)
        {
            return Result<CustomerDetailDto>.Failure(CrmErrors.CustomerNotFound);
        }

        var parts = CustomerComposition.Compose(request.Model);
        if (parts.IsFailure)
        {
            return Result<CustomerDetailDto>.Failure(parts.Error);
        }

        if (await _customers.ExistsWithDocumentAsync(
                _tenant.TenantId,
                parts.Value.Document,
                customer.Id,
                cancellationToken))
        {
            return Result<CustomerDetailDto>.Failure(CrmErrors.DuplicateDocument);
        }

        var updated = customer.UpdateProfile(new CustomerProfileUpdate(
            request.Model.LegalName,
            request.Model.TradeName,
            parts.Value.Document,
            request.Model.TaxCondition,
            request.Model.IibbRegime,
            request.Model.IsCustomer,
            request.Model.IsSupplier,
            parts.Value.Email,
            parts.Value.Phone,
            parts.Value.WhatsApp,
            parts.Value.FiscalAddress,
            request.Model.CreditLimit,
            request.Model.PaymentTermsDays,
            request.Model.SellerId,
            request.Model.Notes,
            _clock.UtcNow));

        if (updated.IsFailure)
        {
            return Result<CustomerDetailDto>.Failure(updated.Error);
        }

        if (!string.IsNullOrWhiteSpace(request.Model.CreditRating))
        {
            customer.UpdateBcraCreditReport(
                request.Model.CreditRating,
                request.Model.BcraWorstSituation,
                request.Model.BcraTotalDebt,
                request.Model.BcraRejectedChequesCount,
                request.Model.CreditRecommendation,
                _clock.UtcNow);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result<CustomerDetailDto>.Success(CustomerMappings.ToDetail(customer));
    }
}
