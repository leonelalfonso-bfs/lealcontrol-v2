using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Domain.Customers;
using LealControl.Modules.Crm.Domain.ValueObjects;

namespace LealControl.Modules.Crm.Application.Abstractions;

public interface ICustomerRepository
{
    Task<Customer?> GetByIdAsync(CustomerId id, CancellationToken cancellationToken = default);

    Task<bool> ExistsWithDocumentAsync(
        TenantId tenantId,
        PartyDocument document,
        CustomerId? excludingId,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<Customer>> SearchAsync(
        TenantId tenantId,
        string? search,
        bool? onlyActive,
        string? role,
        int skip,
        int take,
        CancellationToken cancellationToken = default);

    Task<int> CountAsync(
        TenantId tenantId,
        string? search,
        bool? onlyActive,
        string? role,
        CancellationToken cancellationToken = default);

    void Add(Customer customer);
}
