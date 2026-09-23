using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Sales.Domain.Quotes;

namespace LealControl.Modules.Sales.Application.Abstractions;

public interface IQuoteRepository
{
    Task<Quote?> GetByIdAsync(QuoteId id, CancellationToken cancellationToken = default);

    Task<Quote?> FindByOpportunityAsync(
        TenantId tenantId,
        Guid opportunityId,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<Quote>> ListAsync(TenantId tenantId, CancellationToken cancellationToken = default);

    Task<int> CountAsync(TenantId tenantId, CancellationToken cancellationToken = default);

    Task<string> NextNumberAsync(TenantId tenantId, int year, CancellationToken cancellationToken = default);

    Task EnsureTechnicalDetailColumnAsync(CancellationToken cancellationToken = default);

    Task SaveAsync(CancellationToken cancellationToken = default);

    void Add(Quote quote);

    void Remove(Quote quote);
}

public interface ISalesUnitOfWork
{
    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
