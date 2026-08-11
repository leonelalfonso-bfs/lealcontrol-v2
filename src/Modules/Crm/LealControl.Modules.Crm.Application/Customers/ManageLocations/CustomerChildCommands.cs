using LealControl.BuildingBlocks.Persistence;
using LealControl.BuildingBlocks.Results;
using LealControl.BuildingBlocks.Time;
using LealControl.Modules.Crm.Application.Abstractions;
using LealControl.Modules.Crm.Application.Customers.Models;
using LealControl.Modules.Crm.Domain;
using LealControl.Modules.Crm.Domain.Customers;
using LealControl.Modules.Crm.Domain.Shared;
using LealControl.Modules.Crm.Domain.ValueObjects;
using MediatR;

namespace LealControl.Modules.Crm.Application.Customers.ManageLocations;

public sealed record AddCustomerLocationCommand(
    Guid CustomerId,
    string Name,
    string Street,
    string City,
    ArgentineProvince Province,
    string PostalCode,
    string? Phone,
    string? Notes) : IRequest<Result<CustomerDetailDto>>;

public sealed record UpdateCustomerLocationCommand(
    Guid CustomerId,
    Guid LocationId,
    string Name,
    string Street,
    string City,
    ArgentineProvince Province,
    string PostalCode,
    string? Phone,
    string? Notes) : IRequest<Result<CustomerDetailDto>>;

public sealed record RemoveCustomerLocationCommand(Guid CustomerId, Guid LocationId)
    : IRequest<Result<CustomerDetailDto>>;

public sealed record AddCustomerContactCommand(
    Guid CustomerId,
    string Name,
    ContactRole Role,
    Guid? LocationId,
    string? Email,
    string? Phone,
    string? WhatsApp,
    bool IsPrimary,
    string? Notes) : IRequest<Result<CustomerDetailDto>>;

public sealed record UpdateCustomerContactCommand(
    Guid CustomerId,
    Guid ContactId,
    string Name,
    ContactRole Role,
    Guid? LocationId,
    string? Email,
    string? Phone,
    string? WhatsApp,
    bool IsPrimary,
    string? Notes) : IRequest<Result<CustomerDetailDto>>;

public sealed record RemoveCustomerContactCommand(Guid CustomerId, Guid ContactId)
    : IRequest<Result<CustomerDetailDto>>;

public sealed record UpsertCustomerFiscalRateCommand(
    Guid CustomerId,
    FiscalJurisdiction Jurisdiction,
    decimal PerceptionRate,
    decimal RetentionRate,
    bool HasPerceptionExclusion,
    DateOnly? PerceptionExclusionExpiresOn,
    bool HasRetentionExclusion,
    DateOnly? RetentionExclusionExpiresOn,
    string? ExclusionCertificateNumber) : IRequest<Result<CustomerDetailDto>>;

internal sealed class CustomerChildCommandHandler :
    IRequestHandler<AddCustomerLocationCommand, Result<CustomerDetailDto>>,
    IRequestHandler<UpdateCustomerLocationCommand, Result<CustomerDetailDto>>,
    IRequestHandler<RemoveCustomerLocationCommand, Result<CustomerDetailDto>>,
    IRequestHandler<AddCustomerContactCommand, Result<CustomerDetailDto>>,
    IRequestHandler<UpdateCustomerContactCommand, Result<CustomerDetailDto>>,
    IRequestHandler<RemoveCustomerContactCommand, Result<CustomerDetailDto>>,
    IRequestHandler<UpsertCustomerFiscalRateCommand, Result<CustomerDetailDto>>
{
    private readonly ICustomerRepository _customers;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClock _clock;

    public CustomerChildCommandHandler(
        ICustomerRepository customers,
        IUnitOfWork unitOfWork,
        IClock clock)
    {
        _customers = customers;
        _unitOfWork = unitOfWork;
        _clock = clock;
    }

    public Task<Result<CustomerDetailDto>> Handle(AddCustomerLocationCommand request, CancellationToken cancellationToken)
        => Mutate(request.CustomerId, cancellationToken, customer =>
        {
            var address = PostalAddress.Create(request.Street, request.City, request.Province, request.PostalCode);
            if (address.IsFailure)
            {
                return Result.Failure(address.Error);
            }

            var phone = PhoneNumber.CreateOptional(request.Phone);
            return phone.IsFailure
                ? Result.Failure(phone.Error)
                : customer.AddLocation(request.Name, address.Value, phone.Value, request.Notes, _clock.UtcNow);
        });

    public Task<Result<CustomerDetailDto>> Handle(UpdateCustomerLocationCommand request, CancellationToken cancellationToken)
        => Mutate(request.CustomerId, cancellationToken, customer =>
        {
            var address = PostalAddress.Create(request.Street, request.City, request.Province, request.PostalCode);
            if (address.IsFailure)
            {
                return Result.Failure(address.Error);
            }

            var phone = PhoneNumber.CreateOptional(request.Phone);
            return phone.IsFailure
                ? Result.Failure(phone.Error)
                : customer.UpdateLocation(
                    new LocationId(request.LocationId),
                    request.Name,
                    address.Value,
                    phone.Value,
                    request.Notes,
                    _clock.UtcNow);
        });

    public Task<Result<CustomerDetailDto>> Handle(RemoveCustomerLocationCommand request, CancellationToken cancellationToken)
        => Mutate(request.CustomerId, cancellationToken, customer =>
            customer.RemoveLocation(new LocationId(request.LocationId), _clock.UtcNow));

    public Task<Result<CustomerDetailDto>> Handle(AddCustomerContactCommand request, CancellationToken cancellationToken)
        => Mutate(request.CustomerId, cancellationToken, customer =>
        {
            var channels = ComposeContactChannels(request.Email, request.Phone, request.WhatsApp);
            return channels.IsFailure
                ? Result.Failure(channels.Error)
                : customer.AddContact(
                    request.Name,
                    request.Role,
                    request.LocationId is null ? null : new LocationId(request.LocationId.Value),
                    channels.Value.Email,
                    channels.Value.Phone,
                    channels.Value.WhatsApp,
                    request.IsPrimary,
                    request.Notes,
                    _clock.UtcNow);
        });

    public Task<Result<CustomerDetailDto>> Handle(UpdateCustomerContactCommand request, CancellationToken cancellationToken)
        => Mutate(request.CustomerId, cancellationToken, customer =>
        {
            var channels = ComposeContactChannels(request.Email, request.Phone, request.WhatsApp);
            return channels.IsFailure
                ? Result.Failure(channels.Error)
                : customer.UpdateContact(
                    new ContactId(request.ContactId),
                    request.Name,
                    request.Role,
                    request.LocationId is null ? null : new LocationId(request.LocationId.Value),
                    channels.Value.Email,
                    channels.Value.Phone,
                    channels.Value.WhatsApp,
                    request.IsPrimary,
                    request.Notes,
                    _clock.UtcNow);
        });

    public Task<Result<CustomerDetailDto>> Handle(RemoveCustomerContactCommand request, CancellationToken cancellationToken)
        => Mutate(request.CustomerId, cancellationToken, customer =>
            customer.RemoveContact(new ContactId(request.ContactId), _clock.UtcNow));

    public Task<Result<CustomerDetailDto>> Handle(UpsertCustomerFiscalRateCommand request, CancellationToken cancellationToken)
        => Mutate(request.CustomerId, cancellationToken, customer =>
            customer.UpsertFiscalRate(
                request.Jurisdiction,
                request.PerceptionRate,
                request.RetentionRate,
                request.HasPerceptionExclusion,
                request.PerceptionExclusionExpiresOn,
                request.HasRetentionExclusion,
                request.RetentionExclusionExpiresOn,
                request.ExclusionCertificateNumber,
                _clock.UtcNow));

    private async Task<Result<CustomerDetailDto>> Mutate(
        Guid customerId,
        CancellationToken cancellationToken,
        Func<Customer, Result> action)
    {
        var customer = await _customers.GetByIdAsync(new CustomerId(customerId), cancellationToken);
        if (customer is null || customer.IsDeleted)
        {
            return Result<CustomerDetailDto>.Failure(CrmErrors.CustomerNotFound);
        }

        var result = action(customer);
        if (result.IsFailure)
        {
            return Result<CustomerDetailDto>.Failure(result.Error);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result<CustomerDetailDto>.Success(CustomerMappings.ToDetail(customer));
    }

    private static Result<(EmailAddress? Email, PhoneNumber? Phone, PhoneNumber? WhatsApp)> ComposeContactChannels(
        string? email,
        string? phone,
        string? whatsApp)
    {
        var emailResult = EmailAddress.CreateOptional(email);
        if (emailResult.IsFailure)
        {
            return Result<(EmailAddress?, PhoneNumber?, PhoneNumber?)>.Failure(emailResult.Error);
        }

        var phoneResult = PhoneNumber.CreateOptional(phone);
        if (phoneResult.IsFailure)
        {
            return Result<(EmailAddress?, PhoneNumber?, PhoneNumber?)>.Failure(phoneResult.Error);
        }

        var whatsAppResult = PhoneNumber.CreateOptional(whatsApp);
        if (whatsAppResult.IsFailure)
        {
            return Result<(EmailAddress?, PhoneNumber?, PhoneNumber?)>.Failure(whatsAppResult.Error);
        }

        return Result<(EmailAddress?, PhoneNumber?, PhoneNumber?)>.Success(
            (emailResult.Value, phoneResult.Value, whatsAppResult.Value));
    }
}
