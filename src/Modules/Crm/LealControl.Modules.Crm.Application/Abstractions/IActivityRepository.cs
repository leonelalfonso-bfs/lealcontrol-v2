using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Domain.Activities;
using LealControl.Modules.Crm.Domain.Customers;
using LealControl.Modules.Crm.Domain.Opportunities;

namespace LealControl.Modules.Crm.Application.Abstractions;

public interface IActivityRepository
{
    Task<IReadOnlyList<Activity>> ListByCustomerAsync(
        TenantId tenantId,
        CustomerId customerId,
        int take,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<Activity>> ListWithFollowUpAsync(
        TenantId tenantId,
        int take,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<Activity>> ListByOpportunityAsync(
        TenantId tenantId,
        OpportunityId opportunityId,
        int take,
        CancellationToken cancellationToken = default);

    void Add(Activity activity);
}
