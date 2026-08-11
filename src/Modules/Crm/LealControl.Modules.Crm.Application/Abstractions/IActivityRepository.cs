using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Domain.Activities;
using LealControl.Modules.Crm.Domain.Customers;

namespace LealControl.Modules.Crm.Application.Abstractions;

public interface IActivityRepository
{
    Task<IReadOnlyList<Activity>> ListByCustomerAsync(
        TenantId tenantId,
        CustomerId customerId,
        int take,
        CancellationToken cancellationToken = default);

    void Add(Activity activity);
}
