using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Domain.Leads;

namespace LealControl.Modules.Crm.Application.Abstractions;

public interface ILeadRepository
{
    Task<Lead?> GetByIdAsync(LeadId id, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<Lead>> ListOpenAsync(TenantId tenantId, CancellationToken cancellationToken = default);

    void Add(Lead lead);
}
