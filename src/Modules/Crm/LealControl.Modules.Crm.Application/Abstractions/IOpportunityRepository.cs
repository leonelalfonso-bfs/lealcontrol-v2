using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Domain.Customers;
using LealControl.Modules.Crm.Domain.Opportunities;

namespace LealControl.Modules.Crm.Application.Abstractions;

public interface IOpportunityRepository
{
    Task<Opportunity?> GetByIdAsync(OpportunityId id, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<Opportunity>> ListByCustomerAsync(
        TenantId tenantId,
        CustomerId customerId,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<Opportunity>> ListAsync(TenantId tenantId, CancellationToken cancellationToken = default);

    void Add(Opportunity opportunity);
}
