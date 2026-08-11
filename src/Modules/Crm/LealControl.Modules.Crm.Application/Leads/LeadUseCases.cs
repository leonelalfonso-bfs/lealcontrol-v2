using LealControl.BuildingBlocks.Persistence;
using LealControl.BuildingBlocks.Results;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.BuildingBlocks.Time;
using LealControl.Modules.Crm.Application.Abstractions;
using LealControl.Modules.Crm.Application.Customers;
using LealControl.Modules.Crm.Application.Customers.Models;
using LealControl.Modules.Crm.Domain;
using LealControl.Modules.Crm.Domain.Customers;
using LealControl.Modules.Crm.Domain.Leads;
using LealControl.Modules.Crm.Domain.ValueObjects;
using MediatR;

namespace LealControl.Modules.Crm.Application.Leads;

public sealed record CaptureLeadCommand(
    string Name,
    string? ContactName,
    string? Email,
    string? Phone,
    string? Description,
    LeadSource Source,
    Guid? AssignedTo) : IRequest<Result<LeadDto>>;

public sealed record ConvertLeadCommand(Guid LeadId, CustomerWriteModel Customer)
    : IRequest<Result<CustomerDetailDto>>;

public sealed record ArchiveLeadCommand(Guid LeadId) : IRequest<Result<LeadDto>>;

public sealed record ListLeadsQuery : IRequest<Result<IReadOnlyList<LeadDto>>>;

public sealed record LeadDto(
    Guid Id,
    string Name,
    string? ContactName,
    string? Email,
    string? Phone,
    string? Description,
    string Source,
    string Status,
    Guid? AssignedTo,
    Guid? ConvertedCustomerId,
    DateTime CreatedAtUtc);

internal static class LeadMappings
{
    public static LeadDto ToDto(Lead lead) => new(
        lead.Id.Value,
        lead.Name,
        lead.ContactName,
        lead.Email?.Value,
        lead.Phone?.Value,
        lead.Description,
        lead.Source.ToString(),
        lead.Status.ToString(),
        lead.AssignedTo,
        lead.ConvertedCustomerId?.Value,
        lead.CreatedAtUtc);
}

internal sealed class CaptureLeadCommandHandler : IRequestHandler<CaptureLeadCommand, Result<LeadDto>>
{
    private readonly ILeadRepository _leads;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ITenantContext _tenant;
    private readonly IClock _clock;

    public CaptureLeadCommandHandler(
        ILeadRepository leads,
        IUnitOfWork unitOfWork,
        ITenantContext tenant,
        IClock clock)
    {
        _leads = leads;
        _unitOfWork = unitOfWork;
        _tenant = tenant;
        _clock = clock;
    }

    public async Task<Result<LeadDto>> Handle(CaptureLeadCommand request, CancellationToken cancellationToken)
    {
        var email = EmailAddress.CreateOptional(request.Email);
        if (email.IsFailure)
        {
            return Result<LeadDto>.Failure(email.Error);
        }

        var phone = PhoneNumber.CreateOptional(request.Phone);
        if (phone.IsFailure)
        {
            return Result<LeadDto>.Failure(phone.Error);
        }

        var lead = Lead.Capture(
            _tenant.TenantId,
            request.Name,
            request.ContactName,
            email.Value,
            phone.Value,
            request.Description,
            request.Source,
            request.AssignedTo,
            _clock.UtcNow);

        if (lead.IsFailure)
        {
            return Result<LeadDto>.Failure(lead.Error);
        }

        _leads.Add(lead.Value);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result<LeadDto>.Success(LeadMappings.ToDto(lead.Value));
    }
}

internal sealed class ConvertLeadCommandHandler : IRequestHandler<ConvertLeadCommand, Result<CustomerDetailDto>>
{
    private readonly ILeadRepository _leads;
    private readonly ICustomerRepository _customers;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ITenantContext _tenant;
    private readonly IClock _clock;

    public ConvertLeadCommandHandler(
        ILeadRepository leads,
        ICustomerRepository customers,
        IUnitOfWork unitOfWork,
        ITenantContext tenant,
        IClock clock)
    {
        _leads = leads;
        _customers = customers;
        _unitOfWork = unitOfWork;
        _tenant = tenant;
        _clock = clock;
    }

    public async Task<Result<CustomerDetailDto>> Handle(ConvertLeadCommand request, CancellationToken cancellationToken)
    {
        var lead = await _leads.GetByIdAsync(new LeadId(request.LeadId), cancellationToken);
        if (lead is null)
        {
            return Result<CustomerDetailDto>.Failure(CrmErrors.LeadNotFound);
        }

        var parts = CustomerComposition.Compose(request.Customer);
        if (parts.IsFailure)
        {
            return Result<CustomerDetailDto>.Failure(parts.Error);
        }

        if (await _customers.ExistsWithDocumentAsync(_tenant.TenantId, parts.Value.Document, null, cancellationToken))
        {
            return Result<CustomerDetailDto>.Failure(CrmErrors.DuplicateDocument);
        }

        var registered = Customer.Register(new CustomerRegistration(
            _tenant.TenantId,
            request.Customer.LegalName,
            request.Customer.TradeName,
            parts.Value.Document,
            request.Customer.TaxCondition,
            request.Customer.IibbRegime,
            request.Customer.IsCustomer,
            request.Customer.IsSupplier,
            parts.Value.Email,
            parts.Value.Phone,
            parts.Value.WhatsApp,
            parts.Value.FiscalAddress,
            request.Customer.CreditLimit,
            request.Customer.PaymentTermsDays,
            request.Customer.SellerId,
            request.Customer.Notes,
            _clock.UtcNow));

        if (registered.IsFailure)
        {
            return Result<CustomerDetailDto>.Failure(registered.Error);
        }

        var converted = lead.MarkConverted(registered.Value.Id, _clock.UtcNow);
        if (converted.IsFailure)
        {
            return Result<CustomerDetailDto>.Failure(converted.Error);
        }

        _customers.Add(registered.Value);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result<CustomerDetailDto>.Success(CustomerMappings.ToDetail(registered.Value));
    }
}

internal sealed class ArchiveLeadCommandHandler : IRequestHandler<ArchiveLeadCommand, Result<LeadDto>>
{
    private readonly ILeadRepository _leads;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClock _clock;

    public ArchiveLeadCommandHandler(ILeadRepository leads, IUnitOfWork unitOfWork, IClock clock)
    {
        _leads = leads;
        _unitOfWork = unitOfWork;
        _clock = clock;
    }

    public async Task<Result<LeadDto>> Handle(ArchiveLeadCommand request, CancellationToken cancellationToken)
    {
        var lead = await _leads.GetByIdAsync(new LeadId(request.LeadId), cancellationToken);
        if (lead is null)
        {
            return Result<LeadDto>.Failure(CrmErrors.LeadNotFound);
        }

        var archived = lead.Archive(_clock.UtcNow);
        if (archived.IsFailure)
        {
            return Result<LeadDto>.Failure(archived.Error);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result<LeadDto>.Success(LeadMappings.ToDto(lead));
    }
}

internal sealed class ListLeadsQueryHandler : IRequestHandler<ListLeadsQuery, Result<IReadOnlyList<LeadDto>>>
{
    private readonly ILeadRepository _leads;
    private readonly ITenantContext _tenant;

    public ListLeadsQueryHandler(ILeadRepository leads, ITenantContext tenant)
    {
        _leads = leads;
        _tenant = tenant;
    }

    public async Task<Result<IReadOnlyList<LeadDto>>> Handle(ListLeadsQuery request, CancellationToken cancellationToken)
    {
        var leads = await _leads.ListOpenAsync(_tenant.TenantId, cancellationToken);
        return Result<IReadOnlyList<LeadDto>>.Success(leads.Select(LeadMappings.ToDto).ToList());
    }
}
