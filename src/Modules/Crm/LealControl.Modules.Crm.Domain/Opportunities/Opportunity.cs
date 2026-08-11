using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Results;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Domain.Customers;
using LealControl.Modules.Crm.Domain.Leads;

namespace LealControl.Modules.Crm.Domain.Opportunities;

public sealed class Opportunity : AggregateRoot<OpportunityId>
{
    private Opportunity()
    {
    }

    private Opportunity(
        OpportunityId id,
        TenantId tenantId,
        string title,
        OpportunityStage stage,
        DateTime createdAtUtc)
        : base(id)
    {
        TenantId = tenantId;
        Title = title;
        Stage = stage;
        CreatedAtUtc = createdAtUtc;
        UpdatedAtUtc = createdAtUtc;
    }

    public TenantId TenantId { get; private set; }

    public string Title { get; private set; } = string.Empty;

    public CustomerId? CustomerId { get; private set; }

    public LeadId? LeadId { get; private set; }

    public OpportunityStage Stage { get; private set; }

    public decimal? Amount { get; private set; }

    public string? Currency { get; private set; }

    public Guid? OwnerId { get; private set; }

    public string? LostReason { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    public DateTime UpdatedAtUtc { get; private set; }

    public bool IsClosed => Stage is OpportunityStage.Won or OpportunityStage.Lost;

    public static Result<Opportunity> Open(
        TenantId tenantId,
        string title,
        CustomerId? customerId,
        LeadId? leadId,
        decimal? amount,
        string? currency,
        Guid? ownerId,
        DateTime utcNow)
    {
        if (string.IsNullOrWhiteSpace(title))
        {
            return Result<Opportunity>.Failure(CrmErrors.OpportunityTitleRequired);
        }

        var opportunity = new Opportunity(
            OpportunityId.New(),
            tenantId,
            title.Trim(),
            OpportunityStage.Lead,
            utcNow)
        {
            CustomerId = customerId,
            LeadId = leadId,
            Amount = amount,
            Currency = string.IsNullOrWhiteSpace(currency) ? "ARS" : currency.Trim().ToUpperInvariant(),
            OwnerId = ownerId
        };

        return Result<Opportunity>.Success(opportunity);
    }

    public Result MoveTo(OpportunityStage stage, string? lostReason, DateTime utcNow)
    {
        if (IsClosed)
        {
            return Result.Failure(CrmErrors.OpportunityClosed);
        }

        Stage = stage;
        LostReason = stage == OpportunityStage.Lost
            ? (string.IsNullOrWhiteSpace(lostReason) ? null : lostReason.Trim())
            : null;
        UpdatedAtUtc = utcNow;
        return Result.Success();
    }

    public void AttachCustomer(CustomerId customerId, DateTime utcNow)
    {
        CustomerId = customerId;
        UpdatedAtUtc = utcNow;
    }
}
