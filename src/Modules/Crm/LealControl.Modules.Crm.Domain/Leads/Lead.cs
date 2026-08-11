using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Results;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Domain.Customers;
using LealControl.Modules.Crm.Domain.ValueObjects;

namespace LealControl.Modules.Crm.Domain.Leads;

public sealed class Lead : AggregateRoot<LeadId>
{
    private Lead()
    {
    }

    private Lead(
        LeadId id,
        TenantId tenantId,
        string name,
        LeadSource source,
        DateTime createdAtUtc)
        : base(id)
    {
        TenantId = tenantId;
        Name = name;
        Source = source;
        Status = LeadStatus.Open;
        CreatedAtUtc = createdAtUtc;
        UpdatedAtUtc = createdAtUtc;
    }

    public TenantId TenantId { get; private set; }

    public string Name { get; private set; } = string.Empty;

    public string? ContactName { get; private set; }

    public EmailAddress? Email { get; private set; }

    public PhoneNumber? Phone { get; private set; }

    public string? Description { get; private set; }

    public LeadSource Source { get; private set; }

    public LeadStatus Status { get; private set; }

    public Guid? AssignedTo { get; private set; }

    public CustomerId? ConvertedCustomerId { get; private set; }

    public DateTime? ConvertedAtUtc { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    public DateTime UpdatedAtUtc { get; private set; }

    public static Result<Lead> Capture(
        TenantId tenantId,
        string name,
        string? contactName,
        EmailAddress? email,
        PhoneNumber? phone,
        string? description,
        LeadSource source,
        Guid? assignedTo,
        DateTime utcNow)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return Result<Lead>.Failure(CrmErrors.LeadNameRequired);
        }

        var lead = new Lead(LeadId.New(), tenantId, name.Trim(), source, utcNow)
        {
            ContactName = string.IsNullOrWhiteSpace(contactName) ? null : contactName.Trim(),
            Email = email,
            Phone = phone,
            Description = string.IsNullOrWhiteSpace(description) ? null : description.Trim(),
            AssignedTo = assignedTo
        };

        lead.Raise(new LeadCapturedDomainEvent(lead.Id, tenantId, lead.Name, source, utcNow));
        return Result<Lead>.Success(lead);
    }

    public Result Archive(DateTime utcNow)
    {
        if (Status == LeadStatus.Converted)
        {
            return Result.Failure(CrmErrors.LeadAlreadyConverted);
        }

        Status = LeadStatus.Archived;
        UpdatedAtUtc = utcNow;
        return Result.Success();
    }

    public Result MarkConverted(CustomerId customerId, DateTime utcNow)
    {
        if (Status == LeadStatus.Converted)
        {
            return Result.Failure(CrmErrors.LeadAlreadyConverted);
        }

        if (Status == LeadStatus.Archived)
        {
            return Result.Failure(CrmErrors.LeadArchived);
        }

        Status = LeadStatus.Converted;
        ConvertedCustomerId = customerId;
        ConvertedAtUtc = utcNow;
        UpdatedAtUtc = utcNow;
        Raise(new LeadConvertedDomainEvent(Id, TenantId, customerId, utcNow));
        return Result.Success();
    }
}

public sealed record LeadCapturedDomainEvent(
    LeadId LeadId,
    TenantId TenantId,
    string Name,
    LeadSource Source,
    DateTime OccurredAtUtc) : IDomainEvent
{
    public Guid EventId { get; } = Guid.NewGuid();

    public DateTimeOccurredUtc OccurredOnUtc { get; } = new(OccurredAtUtc);
}

public sealed record LeadConvertedDomainEvent(
    LeadId LeadId,
    TenantId TenantId,
    CustomerId CustomerId,
    DateTime OccurredAtUtc) : IDomainEvent
{
    public Guid EventId { get; } = Guid.NewGuid();

    public DateTimeOccurredUtc OccurredOnUtc { get; } = new(OccurredAtUtc);
}
