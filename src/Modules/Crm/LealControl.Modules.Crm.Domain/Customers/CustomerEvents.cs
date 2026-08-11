using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Domain.Shared;

namespace LealControl.Modules.Crm.Domain.Customers;

public sealed record CustomerRegisteredDomainEvent(
    CustomerId CustomerId,
    TenantId TenantId,
    string LegalName,
    DocumentType DocumentType,
    string DocumentNumber,
    DateTime OccurredAtUtc) : IDomainEvent
{
    public Guid EventId { get; } = Guid.NewGuid();

    public DateTimeOccurredUtc OccurredOnUtc { get; } = new(OccurredAtUtc);
}

public sealed record CustomerDeactivatedDomainEvent(
    CustomerId CustomerId,
    TenantId TenantId,
    DateTime OccurredAtUtc) : IDomainEvent
{
    public Guid EventId { get; } = Guid.NewGuid();

    public DateTimeOccurredUtc OccurredOnUtc { get; } = new(OccurredAtUtc);
}
