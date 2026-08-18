using LealControl.BuildingBlocks.Persistence;
using LealControl.BuildingBlocks.Results;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.BuildingBlocks.Time;
using LealControl.Modules.Crm.Application.Abstractions;
using LealControl.Modules.Crm.Domain;
using LealControl.Modules.Crm.Domain.Activities;
using LealControl.Modules.Crm.Domain.Customers;
using LealControl.Modules.Crm.Domain.Leads;
using LealControl.Modules.Crm.Domain.Opportunities;
using MediatR;

namespace LealControl.Modules.Crm.Application.Pipeline;

public sealed record OpenOpportunityCommand(
    string Title,
    Guid? CustomerId,
    Guid? LeadId,
    decimal? Amount,
    string? Currency,
    Guid? OwnerId,
    string? OwnerName,
    OpportunityPriority? Priority,
    IReadOnlyList<string>? Tags,
    DateTime? ExpectedCloseDate = null,
    Dictionary<string, string>? CustomFields = null) : IRequest<Result<OpportunityDto>>;

public sealed record MoveOpportunityCommand(
    Guid OpportunityId,
    OpportunityStage Stage,
    string? LostReason = null,
    int? Probability = null,
    Dictionary<string, string>? CustomFields = null)
    : IRequest<Result<OpportunityDto>>;

public sealed record ClassifyOpportunityCommand(
    Guid OpportunityId,
    OpportunityPriority Priority,
    string? OwnerName,
    Guid? OwnerId,
    IReadOnlyList<string>? Tags,
    DateTime? ExpectedCloseDate = null,
    Dictionary<string, string>? CustomFields = null) : IRequest<Result<OpportunityDto>>;

public sealed record ListCustomerOpportunitiesQuery(Guid CustomerId)
    : IRequest<Result<IReadOnlyList<OpportunityDto>>>;

public sealed record ListOpportunitiesQuery : IRequest<Result<IReadOnlyList<OpportunityDto>>>;

public sealed record LogActivityCommand(
    ActivityType Type,
    string? Description,
    Guid? CustomerId,
    Guid? LeadId,
    Guid? OpportunityId,
    Guid? AuthorId,
    DateTime? NextFollowUpOn,
    DateTime? DueDate = null) : IRequest<Result<ActivityDto>>;

public sealed record CompleteActivityCommand(Guid ActivityId)
    : IRequest<Result<ActivityDto>>;

public sealed record ListCustomerTimelineQuery(Guid CustomerId, int Take = 50)
    : IRequest<Result<IReadOnlyList<ActivityDto>>>;

public sealed record ListOpportunityTimelineQuery(Guid OpportunityId, int Take = 100)
    : IRequest<Result<IReadOnlyList<ActivityDto>>>;

public sealed record ListFollowUpsQuery(int Take = 100)
    : IRequest<Result<IReadOnlyList<ActivityDto>>>;

public sealed record GetKanbanBoardQuery(string? OwnerName = null)
    : IRequest<Result<KanbanBoardDto>>;

public sealed record OpportunityDto(
    Guid Id,
    string Title,
    Guid? CustomerId,
    Guid? LeadId,
    string Stage,
    decimal? Amount,
    string? Currency,
    Guid? OwnerId,
    string? OwnerName,
    string Priority,
    int Probability,
    bool IsRotting,
    string ActivityBadgeStatus,
    DateTime? ExpectedCloseDate,
    IReadOnlyList<string> Tags,
    string? LostReason,
    IReadOnlyDictionary<string, string> CustomFields,
    DateTime CreatedAtUtc);

public sealed record KanbanColumnDto(
    string Stage,
    string StageName,
    int OrderIndex,
    int Probability,
    int TotalDeals,
    decimal TotalAmount,
    decimal WeightedAmount,
    IReadOnlyList<OpportunityDto> Deals);

public sealed record KanbanBoardDto(
    IReadOnlyList<KanbanColumnDto> Columns,
    int TotalOpenDeals,
    decimal TotalOpenAmount);

public sealed record ActivityDto(
    Guid Id,
    string Type,
    string Description,
    Guid? CustomerId,
    Guid? LeadId,
    Guid? OpportunityId,
    DateTime? NextFollowUpOn,
    DateTime? DueDate,
    bool IsDone,
    DateTime? CompletedAtUtc,
    DateTime OccurredAtUtc);

internal sealed class OpenOpportunityCommandHandler : IRequestHandler<OpenOpportunityCommand, Result<OpportunityDto>>
{
    private readonly IOpportunityRepository _opportunities;
    private readonly IActivityRepository _activities;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ITenantContext _tenant;
    private readonly IClock _clock;

    public OpenOpportunityCommandHandler(
        IOpportunityRepository opportunities,
        IActivityRepository activities,
        IUnitOfWork unitOfWork,
        ITenantContext tenant,
        IClock clock)
    {
        _opportunities = opportunities;
        _activities = activities;
        _unitOfWork = unitOfWork;
        _tenant = tenant;
        _clock = clock;
    }

    public async Task<Result<OpportunityDto>> Handle(OpenOpportunityCommand request, CancellationToken cancellationToken)
    {
        var opportunity = Opportunity.Open(
            _tenant.TenantId,
            request.Title,
            request.CustomerId is null ? null : new CustomerId(request.CustomerId.Value),
            request.LeadId is null ? null : new LeadId(request.LeadId.Value),
            request.Amount,
            request.Currency,
            request.OwnerId,
            request.OwnerName,
            request.Priority ?? OpportunityPriority.Normal,
            request.Tags,
            _clock.UtcNow,
            request.ExpectedCloseDate,
            request.CustomFields);

        if (opportunity.IsFailure)
        {
            return Result<OpportunityDto>.Failure(opportunity.Error);
        }

        _opportunities.Add(opportunity.Value);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result<OpportunityDto>.Success(ToDto(opportunity.Value, "Gray", _clock.UtcNow));
    }

    internal static OpportunityDto ToDto(Opportunity opportunity, string activityBadgeStatus, DateTime utcNow) => new(
        opportunity.Id.Value,
        opportunity.Title,
        opportunity.CustomerId?.Value,
        opportunity.LeadId?.Value,
        opportunity.Stage.ToString(),
        opportunity.Amount,
        opportunity.Currency,
        opportunity.OwnerId,
        opportunity.OwnerName,
        opportunity.Priority.ToString(),
        opportunity.Probability,
        opportunity.IsRotting(utcNow),
        activityBadgeStatus,
        opportunity.ExpectedCloseDate,
        opportunity.Tags.ToList(),
        opportunity.LostReason,
        opportunity.CustomFields,
        opportunity.CreatedAtUtc);
}

internal sealed class ClassifyOpportunityCommandHandler
    : IRequestHandler<ClassifyOpportunityCommand, Result<OpportunityDto>>
{
    private readonly IOpportunityRepository _opportunities;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClock _clock;

    public ClassifyOpportunityCommandHandler(
        IOpportunityRepository opportunities,
        IUnitOfWork unitOfWork,
        IClock clock)
    {
        _opportunities = opportunities;
        _unitOfWork = unitOfWork;
        _clock = clock;
    }

    public async Task<Result<OpportunityDto>> Handle(
        ClassifyOpportunityCommand request,
        CancellationToken cancellationToken)
    {
        var opportunity = await _opportunities.GetByIdAsync(new OpportunityId(request.OpportunityId), cancellationToken);
        if (opportunity is null)
        {
            return Result<OpportunityDto>.Failure(CrmErrors.OpportunityNotFound);
        }

        var classified = opportunity.Classify(
            request.Priority,
            request.OwnerName,
            request.OwnerId,
            request.Tags,
            _clock.UtcNow,
            request.ExpectedCloseDate,
            request.CustomFields);

        if (classified.IsFailure)
        {
            return Result<OpportunityDto>.Failure(classified.Error);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result<OpportunityDto>.Success(OpenOpportunityCommandHandler.ToDto(opportunity, "Gray", _clock.UtcNow));
    }
}

internal sealed class MoveOpportunityCommandHandler : IRequestHandler<MoveOpportunityCommand, Result<OpportunityDto>>
{
    private readonly IOpportunityRepository _opportunities;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IClock _clock;

    public MoveOpportunityCommandHandler(
        IOpportunityRepository opportunities,
        IUnitOfWork unitOfWork,
        IClock clock)
    {
        _opportunities = opportunities;
        _unitOfWork = unitOfWork;
        _clock = clock;
    }

    public async Task<Result<OpportunityDto>> Handle(MoveOpportunityCommand request, CancellationToken cancellationToken)
    {
        var opportunity = await _opportunities.GetByIdAsync(new OpportunityId(request.OpportunityId), cancellationToken);
        if (opportunity is null)
        {
            return Result<OpportunityDto>.Failure(CrmErrors.OpportunityNotFound);
        }

        var moved = opportunity.MoveTo(
            request.Stage,
            request.LostReason,
            _clock.UtcNow,
            request.Probability,
            request.CustomFields);

        if (moved.IsFailure)
        {
            return Result<OpportunityDto>.Failure(moved.Error);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result<OpportunityDto>.Success(OpenOpportunityCommandHandler.ToDto(opportunity, "Gray", _clock.UtcNow));
    }
}

internal sealed class GetKanbanBoardQueryHandler
    : IRequestHandler<GetKanbanBoardQuery, Result<KanbanBoardDto>>
{
    private readonly IOpportunityRepository _opportunities;
    private readonly IActivityRepository _activities;
    private readonly ITenantContext _tenant;
    private readonly IClock _clock;

    public GetKanbanBoardQueryHandler(
        IOpportunityRepository opportunities,
        IActivityRepository activities,
        ITenantContext tenant,
        IClock clock)
    {
        _opportunities = opportunities;
        _activities = activities;
        _tenant = tenant;
        _clock = clock;
    }

    public async Task<Result<KanbanBoardDto>> Handle(GetKanbanBoardQuery request, CancellationToken cancellationToken)
    {
        var items = await _opportunities.ListAsync(_tenant.TenantId, cancellationToken);
        if (!string.IsNullOrWhiteSpace(request.OwnerName))
        {
            items = items.Where(o => string.Equals(o.OwnerName, request.OwnerName, StringComparison.OrdinalIgnoreCase)).ToList();
        }

        var today = _clock.UtcNow.Date;
        var stages = Enum.GetValues<OpportunityStage>();
        var columns = new List<KanbanColumnDto>();

        foreach (var stage in stages)
        {
            var stageDeals = items.Where(o => o.Stage == stage).ToList();
            var dealDtos = stageDeals.Select(o =>
            {
                var badge = "Gray";
                return OpenOpportunityCommandHandler.ToDto(o, badge, _clock.UtcNow);
            }).ToList();

            var totalAmount = stageDeals.Sum(o => o.Amount ?? 0m);
            var prob = stageDeals.FirstOrDefault()?.Probability ?? 10;
            var weighted = totalAmount * (prob / 100m);

            columns.Add(new KanbanColumnDto(
                stage.ToString(),
                GetStageLabel(stage),
                (int)stage,
                prob,
                stageDeals.Count,
                totalAmount,
                weighted,
                dealDtos));
        }

        var openDeals = items.Where(o => !o.IsClosed).ToList();
        return Result<KanbanBoardDto>.Success(new KanbanBoardDto(
            columns,
            openDeals.Count,
            openDeals.Sum(o => o.Amount ?? 0m)));
    }

    private static string GetStageLabel(OpportunityStage stage) => stage switch
    {
        OpportunityStage.Lead => "📥 Lead / Contacto",
        OpportunityStage.Qualified => "🔍 Relevamiento / Calificado",
        OpportunityStage.Proposal => "📄 Presupuesto Enviado",
        OpportunityStage.Negotiation => "🤝 Negociación",
        OpportunityStage.Won => "🏆 Ganada",
        OpportunityStage.Lost => "❌ Perdida",
        _ => stage.ToString()
    };
}

internal sealed class ListOpportunitiesQueryHandler
    : IRequestHandler<ListOpportunitiesQuery, Result<IReadOnlyList<OpportunityDto>>>
{
    private readonly IOpportunityRepository _opportunities;
    private readonly ITenantContext _tenant;
    private readonly IClock _clock;

    public ListOpportunitiesQueryHandler(IOpportunityRepository opportunities, ITenantContext tenant, IClock clock)
    {
        _opportunities = opportunities;
        _tenant = tenant;
        _clock = clock;
    }

    public async Task<Result<IReadOnlyList<OpportunityDto>>> Handle(
        ListOpportunitiesQuery request,
        CancellationToken cancellationToken)
    {
        var items = await _opportunities.ListAsync(_tenant.TenantId, cancellationToken);
        return Result<IReadOnlyList<OpportunityDto>>.Success(
            items.Select(o => OpenOpportunityCommandHandler.ToDto(o, "Gray", _clock.UtcNow)).ToList());
    }
}

internal sealed class ListCustomerOpportunitiesQueryHandler
    : IRequestHandler<ListCustomerOpportunitiesQuery, Result<IReadOnlyList<OpportunityDto>>>
{
    private readonly IOpportunityRepository _opportunities;
    private readonly ITenantContext _tenant;
    private readonly IClock _clock;

    public ListCustomerOpportunitiesQueryHandler(IOpportunityRepository opportunities, ITenantContext tenant, IClock clock)
    {
        _opportunities = opportunities;
        _tenant = tenant;
        _clock = clock;
    }

    public async Task<Result<IReadOnlyList<OpportunityDto>>> Handle(
        ListCustomerOpportunitiesQuery request,
        CancellationToken cancellationToken)
    {
        var items = await _opportunities.ListByCustomerAsync(
            _tenant.TenantId,
            new CustomerId(request.CustomerId),
            cancellationToken);

        return Result<IReadOnlyList<OpportunityDto>>.Success(
            items.Select(o => OpenOpportunityCommandHandler.ToDto(o, "Gray", _clock.UtcNow)).ToList());
    }
}

internal sealed class LogActivityCommandHandler : IRequestHandler<LogActivityCommand, Result<ActivityDto>>
{
    private readonly IActivityRepository _activities;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ITenantContext _tenant;
    private readonly IClock _clock;

    public LogActivityCommandHandler(
        IActivityRepository activities,
        IUnitOfWork unitOfWork,
        ITenantContext tenant,
        IClock clock)
    {
        _activities = activities;
        _unitOfWork = unitOfWork;
        _tenant = tenant;
        _clock = clock;
    }

    public async Task<Result<ActivityDto>> Handle(LogActivityCommand request, CancellationToken cancellationToken)
    {
        var activity = Activity.Log(
            _tenant.TenantId,
            request.Type,
            request.Description,
            request.CustomerId is null ? null : new CustomerId(request.CustomerId.Value),
            request.LeadId is null ? null : new LeadId(request.LeadId.Value),
            request.OpportunityId is null ? null : new OpportunityId(request.OpportunityId.Value),
            request.AuthorId,
            request.NextFollowUpOn,
            _clock.UtcNow,
            request.DueDate);

        if (activity.IsFailure)
        {
            return Result<ActivityDto>.Failure(activity.Error);
        }

        _activities.Add(activity.Value);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result<ActivityDto>.Success(ToDto(activity.Value));
    }

    internal static ActivityDto ToDto(Activity activity) => new(
        activity.Id.Value,
        activity.Type.ToString(),
        activity.Description,
        activity.CustomerId?.Value,
        activity.LeadId?.Value,
        activity.OpportunityId?.Value,
        activity.NextFollowUpOn,
        activity.DueDate,
        activity.IsDone,
        activity.CompletedAtUtc,
        activity.OccurredAtUtc);
}

internal sealed class ListCustomerTimelineQueryHandler
    : IRequestHandler<ListCustomerTimelineQuery, Result<IReadOnlyList<ActivityDto>>>
{
    private readonly IActivityRepository _activities;
    private readonly ITenantContext _tenant;

    public ListCustomerTimelineQueryHandler(IActivityRepository activities, ITenantContext tenant)
    {
        _activities = activities;
        _tenant = tenant;
    }

    public async Task<Result<IReadOnlyList<ActivityDto>>> Handle(
        ListCustomerTimelineQuery request,
        CancellationToken cancellationToken)
    {
        var items = await _activities.ListByCustomerAsync(
            _tenant.TenantId,
            new CustomerId(request.CustomerId),
            Math.Clamp(request.Take, 1, 200),
            cancellationToken);

        return Result<IReadOnlyList<ActivityDto>>.Success(items.Select(LogActivityCommandHandler.ToDto).ToList());
    }
}

internal sealed class ListFollowUpsQueryHandler
    : IRequestHandler<ListFollowUpsQuery, Result<IReadOnlyList<ActivityDto>>>
{
    private readonly IActivityRepository _activities;
    private readonly ITenantContext _tenant;

    public ListFollowUpsQueryHandler(IActivityRepository activities, ITenantContext tenant)
    {
        _activities = activities;
        _tenant = tenant;
    }

    public async Task<Result<IReadOnlyList<ActivityDto>>> Handle(
        ListFollowUpsQuery request,
        CancellationToken cancellationToken)
    {
        var items = await _activities.ListWithFollowUpAsync(
            _tenant.TenantId,
            Math.Clamp(request.Take, 1, 200),
            cancellationToken);

        return Result<IReadOnlyList<ActivityDto>>.Success(items.Select(LogActivityCommandHandler.ToDto).ToList());
    }
}

internal sealed class ListOpportunityTimelineQueryHandler
    : IRequestHandler<ListOpportunityTimelineQuery, Result<IReadOnlyList<ActivityDto>>>
{
    private readonly IActivityRepository _activities;
    private readonly ITenantContext _tenant;

    public ListOpportunityTimelineQueryHandler(IActivityRepository activities, ITenantContext tenant)
    {
        _activities = activities;
        _tenant = tenant;
    }

    public async Task<Result<IReadOnlyList<ActivityDto>>> Handle(
        ListOpportunityTimelineQuery request,
        CancellationToken cancellationToken)
    {
        var items = await _activities.ListByOpportunityAsync(
            _tenant.TenantId,
            new OpportunityId(request.OpportunityId),
            Math.Clamp(request.Take, 1, 200),
            cancellationToken);

        return Result<IReadOnlyList<ActivityDto>>.Success(items.Select(LogActivityCommandHandler.ToDto).ToList());
    }
}

public sealed record GetPipelineReportQuery(string? OwnerName, DateTime? FromUtc, DateTime? ToUtc)
    : IRequest<Result<PipelineReportDto>>;

public sealed record PipelineStageStatDto(string Stage, int Count, decimal Amount);

public sealed record PipelineOwnerStatDto(
    string OwnerName,
    int OpenCount,
    decimal OpenAmount,
    int WonCount,
    decimal WonAmount,
    int LostCount,
    decimal LostAmount);

public sealed record PipelineLostReasonStatDto(string Reason, int Count, decimal Amount);

public sealed record PipelineReportDto(
    int OpenCount,
    decimal OpenAmount,
    int WonCount,
    decimal WonAmount,
    int LostCount,
    decimal LostAmount,
    decimal WinRate,
    IReadOnlyList<PipelineStageStatDto> ByStage,
    IReadOnlyList<PipelineOwnerStatDto> ByOwner,
    IReadOnlyList<PipelineLostReasonStatDto> LostReasons);

internal sealed class GetPipelineReportQueryHandler
    : IRequestHandler<GetPipelineReportQuery, Result<PipelineReportDto>>
{
    private readonly IOpportunityRepository _opportunities;
    private readonly ITenantContext _tenant;

    public GetPipelineReportQueryHandler(IOpportunityRepository opportunities, ITenantContext tenant)
    {
        _opportunities = opportunities;
        _tenant = tenant;
    }

    public async Task<Result<PipelineReportDto>> Handle(
        GetPipelineReportQuery request,
        CancellationToken cancellationToken)
    {
        var items = await _opportunities.ListAsync(_tenant.TenantId, cancellationToken);

        IEnumerable<Opportunity> query = items;
        if (!string.IsNullOrWhiteSpace(request.OwnerName))
        {
            var owner = request.OwnerName.Trim();
            query = query.Where(o =>
                string.Equals(o.OwnerName ?? "Sin responsable", owner, StringComparison.OrdinalIgnoreCase));
        }

        if (request.FromUtc is not null)
        {
            query = query.Where(o => o.UpdatedAtUtc >= request.FromUtc.Value);
        }

        if (request.ToUtc is not null)
        {
            query = query.Where(o => o.UpdatedAtUtc <= request.ToUtc.Value);
        }

        var filtered = query.ToList();
        var open = filtered.Where(o => !o.IsClosed).ToList();
        var won = filtered.Where(o => o.Stage == OpportunityStage.Won).ToList();
        var lost = filtered.Where(o => o.Stage == OpportunityStage.Lost).ToList();
        var closed = won.Count + lost.Count;
        var winRate = closed == 0 ? 0m : Math.Round((decimal)won.Count / closed * 100m, 1);

        var byStage = Enum.GetValues<OpportunityStage>()
            .Select(stage =>
            {
                var bucket = filtered.Where(o => o.Stage == stage).ToList();
                return new PipelineStageStatDto(
                    stage.ToString(),
                    bucket.Count,
                    bucket.Sum(o => o.Amount ?? 0m));
            })
            .ToList();

        var byOwner = filtered
            .GroupBy(o => string.IsNullOrWhiteSpace(o.OwnerName) ? "Sin responsable" : o.OwnerName!)
            .Select(g =>
            {
                var list = g.ToList();
                var openG = list.Where(o => !o.IsClosed).ToList();
                var wonG = list.Where(o => o.Stage == OpportunityStage.Won).ToList();
                var lostG = list.Where(o => o.Stage == OpportunityStage.Lost).ToList();
                return new PipelineOwnerStatDto(
                    g.Key,
                    openG.Count,
                    openG.Sum(o => o.Amount ?? 0m),
                    wonG.Count,
                    wonG.Sum(o => o.Amount ?? 0m),
                    lostG.Count,
                    lostG.Sum(o => o.Amount ?? 0m));
            })
            .OrderByDescending(x => x.WonAmount + x.OpenAmount)
            .ToList();

        var lostReasons = lost
            .GroupBy(o => string.IsNullOrWhiteSpace(o.LostReason) ? "Sin motivo" : o.LostReason!)
            .Select(g => new PipelineLostReasonStatDto(
                g.Key,
                g.Count(),
                g.Sum(o => o.Amount ?? 0m)))
            .OrderByDescending(x => x.Count)
            .ToList();

        return Result<PipelineReportDto>.Success(new PipelineReportDto(
            open.Count,
            open.Sum(o => o.Amount ?? 0m),
            won.Count,
            won.Sum(o => o.Amount ?? 0m),
            lost.Count,
            lost.Sum(o => o.Amount ?? 0m),
            winRate,
            byStage,
            byOwner,
            lostReasons));
    }
}
