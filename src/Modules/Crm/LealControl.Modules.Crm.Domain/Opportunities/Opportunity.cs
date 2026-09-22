using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Results;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Domain.Customers;
using LealControl.Modules.Crm.Domain.Leads;
using LealControl.Modules.Crm.Domain.Opportunities.Events;

namespace LealControl.Modules.Crm.Domain.Opportunities;

public sealed class Opportunity : AggregateRoot<OpportunityId>
{
    private readonly List<string> _tags = [];

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
        Priority = OpportunityPriority.Normal;
        Probability = GetDefaultProbability(stage);
        CustomFields = [];
    }

    public TenantId TenantId { get; private set; }

    public string Title { get; private set; } = string.Empty;

    public CustomerId? CustomerId { get; private set; }

    public LeadId? LeadId { get; private set; }

    public OpportunityStage Stage { get; private set; }

    public decimal? Amount { get; private set; }

    public string? Currency { get; private set; }

    public Guid? OwnerId { get; private set; }

    public string? OwnerName { get; private set; }

    public OpportunityPriority Priority { get; private set; }

    public int Probability { get; private set; }

    public int? RottingDays { get; private set; }

    public DateTime? ExpectedCloseDate { get; private set; }

    public Dictionary<string, string> CustomFields { get; private set; } = [];

    public IReadOnlyList<string> Tags => _tags;

    public string? LostReason { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    public DateTime UpdatedAtUtc { get; private set; }

    public bool IsClosed => Stage is OpportunityStage.Won or OpportunityStage.Lost;

    public bool IsRotting(DateTime utcNow, int defaultRottingDays = 14)
    {
        if (IsClosed) return false;
        var maxDays = RottingDays ?? defaultRottingDays;
        return (utcNow - UpdatedAtUtc).TotalDays >= maxDays;
    }

    public static Result<Opportunity> Open(
        TenantId tenantId,
        string title,
        CustomerId? customerId,
        LeadId? leadId,
        decimal? amount,
        string? currency,
        Guid? ownerId,
        string? ownerName,
        OpportunityPriority priority,
        IEnumerable<string>? tags,
        DateTime utcNow,
        DateTime? expectedCloseDate = null,
        Dictionary<string, string>? customFields = null)
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
            OwnerId = ownerId,
            OwnerName = NormalizeOwner(ownerName),
            Priority = priority,
            ExpectedCloseDate = expectedCloseDate,
            CustomFields = customFields ?? []
        };

        opportunity.ReplaceTags(tags);
        return Result<Opportunity>.Success(opportunity);
    }

    public Result MoveTo(
        OpportunityStage stage,
        string? lostReason,
        DateTime utcNow,
        int? probability = null,
        Dictionary<string, string>? customFields = null)
    {
        if (IsClosed)
        {
            return Result.Failure(CrmErrors.OpportunityClosed);
        }

        if (Stage == stage)
        {
            return Result.Success();
        }

        var validTransition = stage == OpportunityStage.Lost
            || ((Stage is OpportunityStage.Lead or OpportunityStage.Qualified) && stage == OpportunityStage.Proposal)
            || (Stage == OpportunityStage.Proposal && stage == OpportunityStage.Negotiation)
            || (Stage == OpportunityStage.Negotiation && stage == OpportunityStage.Won);

        if (!validTransition)
        {
            return Result.Failure(CrmErrors.OpportunityInvalidTransition);
        }

        if (stage == OpportunityStage.Proposal && CustomerId is null)
        {
            return Result.Failure(CrmErrors.OpportunityCustomerRequired);
        }

        if (stage == OpportunityStage.Lost && string.IsNullOrWhiteSpace(lostReason))
        {
            return Result.Failure(CrmErrors.OpportunityLostReasonRequired);
        }

        var previousStage = Stage;
        Stage = stage;
        Probability = probability ?? GetDefaultProbability(stage);
        LostReason = stage == OpportunityStage.Lost ? lostReason!.Trim() : null;
        if (customFields is not null)
        {
            CustomFields = customFields;
        }
        UpdatedAtUtc = utcNow;

        if (previousStage != OpportunityStage.Won && stage == OpportunityStage.Won)
        {
            Raise(OpportunityWonDomainEvent.Create(
                Id,
                TenantId,
                CustomerId,
                Title,
                Amount,
                Currency,
                utcNow));
        }

        return Result.Success();
    }

    public Result Classify(
        OpportunityPriority priority,
        string? ownerName,
        Guid? ownerId,
        IEnumerable<string>? tags,
        DateTime utcNow,
        DateTime? expectedCloseDate = null,
        Dictionary<string, string>? customFields = null)
    {
        if (IsClosed)
        {
            return Result.Failure(CrmErrors.OpportunityClosed);
        }

        Priority = priority;
        OwnerName = NormalizeOwner(ownerName);
        OwnerId = ownerId;
        ExpectedCloseDate = expectedCloseDate ?? ExpectedCloseDate;
        if (customFields is not null)
        {
            CustomFields = customFields;
        }
        ReplaceTags(tags);
        UpdatedAtUtc = utcNow;
        return Result.Success();
    }

    /// <summary>
    /// Reabre una oportunidad cerrada (Ganada/Perdida) hacia una etapa abierta.
    /// Requiere motivo de auditoría (validado en la aplicación vía actividad).
    /// </summary>
    public Result Reopen(OpportunityStage stage, string? reason, DateTime utcNow)
    {
        if (!IsClosed)
        {
            return Result.Failure(CrmErrors.OpportunityInvalidTransition);
        }

        if (stage is OpportunityStage.Won or OpportunityStage.Lost)
        {
            return Result.Failure(CrmErrors.OpportunityInvalidTransition);
        }

        if (string.IsNullOrWhiteSpace(reason))
        {
            return Result.Failure(CrmErrors.OpportunityLostReasonRequired);
        }

        Stage = stage;
        Probability = GetDefaultProbability(stage);
        LostReason = null;
        UpdatedAtUtc = utcNow;
        return Result.Success();
    }

    public void AttachCustomer(CustomerId customerId, DateTime utcNow)
    {
        CustomerId = customerId;
        UpdatedAtUtc = utcNow;
    }

    private static int GetDefaultProbability(OpportunityStage stage) => stage switch
    {
        OpportunityStage.Lead => 10,
        OpportunityStage.Qualified => 30,
        OpportunityStage.Proposal => 60,
        OpportunityStage.Negotiation => 80,
        OpportunityStage.Won => 100,
        OpportunityStage.Lost => 0,
        _ => 10
    };

    private void ReplaceTags(IEnumerable<string>? tags)
    {
        _tags.Clear();
        if (tags is null)
        {
            return;
        }

        foreach (var tag in tags
                     .Select(NormalizeTag)
                     .Where(t => t is not null)
                     .Cast<string>()
                     .Distinct(StringComparer.OrdinalIgnoreCase)
                     .Take(12))
        {
            _tags.Add(tag);
        }
    }

    private static string? NormalizeOwner(string? ownerName) =>
        string.IsNullOrWhiteSpace(ownerName) ? null : ownerName.Trim()[..Math.Min(ownerName.Trim().Length, 120)];

    private static string? NormalizeTag(string? tag)
    {
        if (string.IsNullOrWhiteSpace(tag))
        {
            return null;
        }

        var cleaned = tag.Trim().TrimStart('#');
        return cleaned.Length == 0 ? null : cleaned[..Math.Min(cleaned.Length, 40)];
    }
}
