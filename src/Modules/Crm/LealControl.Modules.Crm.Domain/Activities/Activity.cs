using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Results;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Domain.Customers;
using LealControl.Modules.Crm.Domain.Leads;
using LealControl.Modules.Crm.Domain.Opportunities;

namespace LealControl.Modules.Crm.Domain.Activities;

public sealed class Activity : AggregateRoot<ActivityId>
{
    private Activity()
    {
    }

    private Activity(
        ActivityId id,
        TenantId tenantId,
        ActivityType type,
        string description,
        DateTime occurredAtUtc)
        : base(id)
    {
        TenantId = tenantId;
        Type = type;
        Description = description;
        OccurredAtUtc = occurredAtUtc;
        CreatedAtUtc = occurredAtUtc;
    }

    public TenantId TenantId { get; private set; }

    public ActivityType Type { get; private set; }

    public string Description { get; private set; } = string.Empty;

    public CustomerId? CustomerId { get; private set; }

    public LeadId? LeadId { get; private set; }

    public OpportunityId? OpportunityId { get; private set; }

    public Guid? AuthorId { get; private set; }

    public DateTime? NextFollowUpOn { get; private set; }

    public DateTime OccurredAtUtc { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    public static Result<Activity> Log(
        TenantId tenantId,
        ActivityType type,
        string? description,
        CustomerId? customerId,
        LeadId? leadId,
        OpportunityId? opportunityId,
        Guid? authorId,
        DateTime? nextFollowUpOn,
        DateTime utcNow)
    {
        var text = string.IsNullOrWhiteSpace(description) ? type.ToString() : description.Trim();
        if (string.IsNullOrWhiteSpace(text))
        {
            return Result<Activity>.Failure(CrmErrors.ActivityDescriptionRequired);
        }

        var activity = new Activity(ActivityId.New(), tenantId, type, text, utcNow)
        {
            CustomerId = customerId,
            LeadId = leadId,
            OpportunityId = opportunityId,
            AuthorId = authorId,
            NextFollowUpOn = nextFollowUpOn
        };

        return Result<Activity>.Success(activity);
    }
}
