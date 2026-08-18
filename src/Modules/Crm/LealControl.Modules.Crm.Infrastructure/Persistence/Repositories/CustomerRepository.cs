using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Application.Abstractions;
using LealControl.Modules.Crm.Domain.Activities;
using LealControl.Modules.Crm.Domain.Customers;
using LealControl.Modules.Crm.Domain.Leads;
using LealControl.Modules.Crm.Domain.Opportunities;
using LealControl.Modules.Crm.Domain.ValueObjects;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Crm.Infrastructure.Persistence.Repositories;

internal sealed class CustomerRepository : ICustomerRepository
{
    private readonly CrmDbContext _db;

    public CustomerRepository(CrmDbContext db) => _db = db;

    public Task<Customer?> GetByIdAsync(CustomerId id, CancellationToken cancellationToken = default) =>
        _db.Customers
            .Include(x => x.Locations)
            .Include(x => x.Contacts)
            .AsSplitQuery()
            .FirstOrDefaultAsync(x => x.Id == id, cancellationToken);

    public Task<bool> ExistsWithDocumentAsync(
        TenantId tenantId,
        PartyDocument document,
        CustomerId? excludingId,
        CancellationToken cancellationToken = default)
    {
        var query = _db.Customers.Where(x =>
            x.TenantId == tenantId
            && x.Document.Type == document.Type
            && x.Document.Number == document.Number);

        if (excludingId is not null)
        {
            query = query.Where(x => x.Id != excludingId.Value);
        }

        return query.AnyAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<Customer>> SearchAsync(
        TenantId tenantId,
        string? search,
        bool? onlyActive,
        int skip,
        int take,
        CancellationToken cancellationToken = default)
    {
        return await ApplyFilters(_db.Customers.AsNoTracking(), tenantId, search, onlyActive)
            .OrderBy(x => x.LegalName)
            .Skip(skip)
            .Take(take)
            .ToListAsync(cancellationToken);
    }

    public Task<int> CountAsync(
        TenantId tenantId,
        string? search,
        bool? onlyActive,
        CancellationToken cancellationToken = default) =>
        ApplyFilters(_db.Customers.AsNoTracking(), tenantId, search, onlyActive).CountAsync(cancellationToken);

    public void Add(Customer customer) => _db.Customers.Add(customer);

    private static IQueryable<Customer> ApplyFilters(
        IQueryable<Customer> query,
        TenantId tenantId,
        string? search,
        bool? onlyActive)
    {
        query = query.Where(x => x.TenantId == tenantId);

        if (onlyActive == true)
        {
            query = query.Where(x => x.Status == Domain.Shared.CustomerStatus.Active);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(x =>
                x.LegalName.ToLower().Contains(term)
                || (x.TradeName != null && x.TradeName.ToLower().Contains(term))
                || x.Document.Number.Contains(term)
                || (x.Email != null && x.Email.Value.Contains(term))
                || (x.Phone != null && x.Phone.Value.Contains(term)));
        }

        return query;
    }
}

internal sealed class LeadRepository : ILeadRepository
{
    private readonly CrmDbContext _db;

    public LeadRepository(CrmDbContext db) => _db = db;

    public Task<Lead?> GetByIdAsync(LeadId id, CancellationToken cancellationToken = default) =>
        _db.Leads.FirstOrDefaultAsync(x => x.Id == id, cancellationToken);

    public async Task<IReadOnlyList<Lead>> ListOpenAsync(TenantId tenantId, CancellationToken cancellationToken = default) =>
        await _db.Leads.AsNoTracking()
            .Where(x => x.TenantId == tenantId && x.Status == LeadStatus.Open)
            .OrderByDescending(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);

    public void Add(Lead lead) => _db.Leads.Add(lead);
}

internal sealed class OpportunityRepository : IOpportunityRepository
{
    private readonly CrmDbContext _db;

    public OpportunityRepository(CrmDbContext db) => _db = db;

    public Task<Opportunity?> GetByIdAsync(OpportunityId id, CancellationToken cancellationToken = default) =>
        _db.Opportunities.FirstOrDefaultAsync(x => x.Id == id, cancellationToken);

    public async Task<IReadOnlyList<Opportunity>> ListByCustomerAsync(
        TenantId tenantId,
        CustomerId customerId,
        CancellationToken cancellationToken = default) =>
        await _db.Opportunities.AsNoTracking()
            .Where(x => x.TenantId == tenantId && x.CustomerId == customerId)
            .OrderByDescending(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<Opportunity>> ListAsync(
        TenantId tenantId,
        CancellationToken cancellationToken = default) =>
        await _db.Opportunities.AsNoTracking()
            .Where(x => x.TenantId == tenantId)
            .OrderByDescending(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);

    public void Add(Opportunity opportunity) => _db.Opportunities.Add(opportunity);
}

internal sealed class ActivityRepository : IActivityRepository
{
    private readonly CrmDbContext _db;

    public ActivityRepository(CrmDbContext db) => _db = db;

    public async Task<IReadOnlyList<Activity>> ListByCustomerAsync(
        TenantId tenantId,
        CustomerId customerId,
        int take,
        CancellationToken cancellationToken = default) =>
        await _db.Activities.AsNoTracking()
            .Where(x => x.TenantId == tenantId && x.CustomerId == customerId)
            .OrderByDescending(x => x.OccurredAtUtc)
            .Take(take)
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<Activity>> ListWithFollowUpAsync(
        TenantId tenantId,
        int take,
        CancellationToken cancellationToken = default) =>
        await _db.Activities.AsNoTracking()
            .Where(x => x.TenantId == tenantId && x.NextFollowUpOn != null)
            .OrderBy(x => x.NextFollowUpOn)
            .Take(take)
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<Activity>> ListByOpportunityAsync(
        TenantId tenantId,
        OpportunityId opportunityId,
        int take,
        CancellationToken cancellationToken = default) =>
        await _db.Activities.AsNoTracking()
            .Where(x => x.TenantId == tenantId && x.OpportunityId == opportunityId)
            .OrderByDescending(x => x.OccurredAtUtc)
            .Take(take)
            .ToListAsync(cancellationToken);

    public void Add(Activity activity) => _db.Activities.Add(activity);
}
