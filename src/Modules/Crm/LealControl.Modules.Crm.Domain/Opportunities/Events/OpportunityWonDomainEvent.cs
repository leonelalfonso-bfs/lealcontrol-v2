using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Domain.Customers;

namespace LealControl.Modules.Crm.Domain.Opportunities.Events;

public sealed record OpportunityWonDomainEvent(
    OpportunityId OpportunityId,
    TenantId TenantId,
    CustomerId? CustomerId,
    string Title,
    decimal? Amount,
    string? Currency,
    Guid EventId,
    DateTimeOccurredUtc OccurredOnUtc) : IDomainEvent
{
    public static OpportunityWonDomainEvent Create(
        OpportunityId opportunityId,
        TenantId tenantId,
        CustomerId? customerId,
        string title,
        decimal? amount,
        string? currency,
        DateTime utcNow) => new(
            opportunityId,
            tenantId,
            customerId,
            title,
            amount,
            currency,
            Guid.NewGuid(),
            new DateTimeOccurredUtc(utcNow));
}
