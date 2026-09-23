using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Sales.Application.Abstractions;
using LealControl.Modules.Sales.Domain.Quotes;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Sales.Infrastructure.Persistence.Repositories;

internal sealed class QuoteRepository : IQuoteRepository
{
    private readonly SalesDbContext _db;

    public QuoteRepository(SalesDbContext db) => _db = db;

    public Task<Quote?> GetByIdAsync(QuoteId id, CancellationToken cancellationToken = default) =>
        _db.Quotes.Include(x => x.Lines).FirstOrDefaultAsync(x => x.Id == id, cancellationToken);

    public async Task<Quote?> FindByOpportunityAsync(
        TenantId tenantId,
        Guid opportunityId,
        CancellationToken cancellationToken = default) =>
        await _db.Quotes.Include(x => x.Lines)
            .FirstOrDefaultAsync(
                x => x.TenantId == tenantId
                    && x.OpportunityId == opportunityId
                    && x.Status != QuoteStatus.Cancelled,
                cancellationToken);

    public async Task<IReadOnlyList<Quote>> ListAsync(
        TenantId tenantId,
        CancellationToken cancellationToken = default) =>
        await _db.Quotes.AsNoTracking()
            .Include(x => x.Lines)
            .Where(x => x.TenantId == tenantId)
            .OrderByDescending(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);

    public Task<int> CountAsync(TenantId tenantId, CancellationToken cancellationToken = default) =>
        _db.Quotes.CountAsync(x => x.TenantId == tenantId, cancellationToken);

    public void Add(Quote quote) => _db.Quotes.Add(quote);

    public void Remove(Quote quote) => _db.Quotes.Remove(quote);
}
