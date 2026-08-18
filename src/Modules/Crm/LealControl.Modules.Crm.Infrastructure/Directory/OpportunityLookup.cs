using LealControl.Modules.Crm.Application.Abstractions;
using LealControl.Modules.Crm.Contracts.Opportunities;
using LealControl.Modules.Crm.Domain.Opportunities;

namespace LealControl.Modules.Crm.Infrastructure.Directory;

internal sealed class OpportunityLookup : IOpportunityLookup
{
    private readonly IOpportunityRepository _opportunities;

    public OpportunityLookup(IOpportunityRepository opportunities) => _opportunities = opportunities;

    public async Task<OpportunitySnapshot?> FindAsync(Guid opportunityId, CancellationToken cancellationToken = default)
    {
        var opportunity = await _opportunities.GetByIdAsync(new OpportunityId(opportunityId), cancellationToken);
        if (opportunity is null)
        {
            return null;
        }

        return new OpportunitySnapshot(
            opportunity.Id.Value,
            opportunity.Title,
            opportunity.CustomerId?.Value,
            opportunity.Stage.ToString(),
            opportunity.Amount,
            opportunity.Currency,
            opportunity.OwnerName);
    }
}
