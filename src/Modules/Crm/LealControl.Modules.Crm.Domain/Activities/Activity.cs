using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Results;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Domain.Customers;
using LealControl.Modules.Crm.Domain.Leads;
using LealControl.Modules.Crm.Domain.Opportunities;

namespace LealControl.Modules.Crm.Domain.Activities;

public enum ActivityStatusBadge
{
    Green = 1,  // Programada a futuro (DueDate > hoy)
    Yellow = 2, // Vence hoy (DueDate.Date == hoy)
    Red = 3,    // Vencida (DueDate < hoy y no realizada)
    Gray = 4    // Sin actividad asignada
}

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
        IsDone = false;
    }

    public TenantId TenantId { get; private set; }

    public ActivityType Type { get; private set; }

    public string Description { get; private set; } = string.Empty;

    public CustomerId? CustomerId { get; private set; }

    public LeadId? LeadId { get; private set; }

    public OpportunityId? OpportunityId { get; private set; }

    public Guid? AuthorId { get; private set; }

    public DateTime? NextFollowUpOn { get; private set; }

    public DateTime? DueDate { get; private set; }

    public bool IsDone { get; private set; }

    public DateTime? CompletedAtUtc { get; private set; }

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
        DateTime utcNow,
        DateTime? dueDate = null)
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
            NextFollowUpOn = nextFollowUpOn,
            DueDate = dueDate ?? nextFollowUpOn
        };

        return Result<Activity>.Success(activity);
    }

    public Result MarkAsDone(DateTime utcNow)
    {
        if (IsDone)
        {
            return Result.Success();
        }

        IsDone = true;
        CompletedAtUtc = utcNow;
        return Result.Success();
    }

    public ActivityStatusBadge EvaluateBadge(DateTime todayDate)
    {
        if (IsDone)
        {
            return ActivityStatusBadge.Gray;
        }

        var targetDate = DueDate ?? NextFollowUpOn;
        if (targetDate is null)
        {
            return ActivityStatusBadge.Gray;
        }

        if (targetDate.Value.Date > todayDate.Date)
        {
            return ActivityStatusBadge.Green;
        }

        if (targetDate.Value.Date == todayDate.Date)
        {
            return ActivityStatusBadge.Yellow;
        }

        return ActivityStatusBadge.Red;
    }
}
