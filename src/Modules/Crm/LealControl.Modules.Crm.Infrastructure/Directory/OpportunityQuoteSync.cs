using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Contracts.Opportunities;
using LealControl.Modules.Crm.Domain.Customers;
using LealControl.Modules.Crm.Domain.Opportunities;
using LealControl.Modules.Crm.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace LealControl.Modules.Crm.Infrastructure.Directory;

internal sealed class OpportunityQuoteSync(CrmDbContext db, ITenantContext tenant, TimeProvider clock, ILogger<OpportunityQuoteSync> logger) : IOpportunityQuoteSync
{
    public async Task<Guid?> OpenForQuoteAsync(Guid customerId, string title, decimal amount, string currency, string? ownerName, CancellationToken cancellationToken = default)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        // Ventas usa USD_BILLETE y USD_DIVISA; la oportunidad guarda el código ISO.
        var iso = currency.StartsWith("USD", StringComparison.OrdinalIgnoreCase) ? "USD" : "ARS";
        var opened = Opportunity.Open(tenant.TenantId, title, new CustomerId(customerId), null, amount, iso, null, ownerName,
            OpportunityPriority.Normal, ["presupuesto"], now);
        if (opened.IsFailure || opened.Value.MoveTo(OpportunityStage.Proposal, null, now).IsFailure) return null;
        db.Opportunities.Add(opened.Value);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex)
        {
            // Si el CRM no puede guardarla, el presupuesto sigue: queda sin oportunidad.
            db.Entry(opened.Value).State = EntityState.Detached;
            logger.LogWarning(ex, "No se pudo abrir la oportunidad para {Title}", title);
            return null;
        }
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
