using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Contracts.Opportunities;
using LealControl.Modules.Crm.Domain.Customers;
using LealControl.Modules.Crm.Domain.Opportunities;
using LealControl.Modules.Crm.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Crm.Infrastructure.Directory;

internal sealed class OpportunityQuoteSync(CrmDbContext db, ITenantContext tenant, TimeProvider clock) : IOpportunityQuoteSync
{
    public async Task<Guid?> OpenForQuoteAsync(Guid customerId, string title, decimal amount, string currency, string? ownerName, CancellationToken cancellationToken = default)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        var opened = Opportunity.Open(tenant.TenantId, title, new CustomerId(customerId), null, amount, currency, null, ownerName,
            OpportunityPriority.Normal, ["presupuesto"], now);
        if (opened.IsFailure || opened.Value.MoveTo(OpportunityStage.Proposal, null, now).IsFailure) return null;
        db.Opportunities.Add(opened.Value);
        await db.SaveChangesAsync(cancellationToken);
        return opened.Value.Id.Value;
    }

    public async Task MarkWonAsync(Guid opportunityId, CancellationToken cancellationToken = default)
    {
        var opportunity = await db.Opportunities.FirstOrDefaultAsync(o => o.Id == new OpportunityId(opportunityId), cancellationToken);
        if (opportunity is null || opportunity.IsClosed) return;
        var now = clock.GetUtcNow().UtcDateTime;
        // El embudo exige pasar por Negociación antes de ganar.
        if (opportunity.Stage is OpportunityStage.Lead or OpportunityStage.Qualified) opportunity.MoveTo(OpportunityStage.Proposal, null, now);
        if (opportunity.Stage == OpportunityStage.Proposal) opportunity.MoveTo(OpportunityStage.Negotiation, null, now);
        if (opportunity.MoveTo(OpportunityStage.Won, null, now).IsSuccess) await db.SaveChangesAsync(cancellationToken);
    }

    public async Task MarkLostAsync(Guid opportunityId, string reason, CancellationToken cancellationToken = default)
    {
        var opportunity = await db.Opportunities.FirstOrDefaultAsync(o => o.Id == new OpportunityId(opportunityId), cancellationToken);
        if (opportunity is null || opportunity.IsClosed) return;
        if (opportunity.MoveTo(OpportunityStage.Lost, reason, clock.GetUtcNow().UtcDateTime).IsSuccess) await db.SaveChangesAsync(cancellationToken);
    }
}
