using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Sales.Application.Quotes;
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

    /// <summary>Guarda la revisión reemplazada (se persiste con el próximo SaveAsync).</summary>
    void AddRevision(TenantId tenantId, Guid quoteId, int revision, DateTime revisionDateUtc, decimal total, string currency, string snapshotJson, DateTime replacedAtUtc);

    Task<IReadOnlyList<QuoteRevisionSummary>> ListRevisionsAsync(TenantId tenantId, Guid quoteId, CancellationToken cancellationToken = default);

    Task<string?> GetRevisionSnapshotAsync(TenantId tenantId, Guid quoteId, int revision, CancellationToken cancellationToken = default);

    void Remove(Quote quote);
}

public interface ISalesUnitOfWork
{
    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
