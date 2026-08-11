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
    Guid? OwnerId) : IRequest<Result<OpportunityDto>>;

public sealed record MoveOpportunityCommand(Guid OpportunityId, OpportunityStage Stage, string? LostReason)
    : IRequest<Result<OpportunityDto>>;

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
    DateTime? NextFollowUpOn) : IRequest<Result<ActivityDto>>;

public sealed record ListCustomerTimelineQuery(Guid CustomerId, int Take = 50)
    : IRequest<Result<IReadOnlyList<ActivityDto>>>;

public sealed record OpportunityDto(
    Guid Id,
    string Title,
    Guid? CustomerId,
    Guid? LeadId,
    string Stage,
    decimal? Amount,
    string? Currency,
    Guid? OwnerId,
    DateTime CreatedAtUtc);

public sealed record ActivityDto(
    Guid Id,
    string Type,
    string Description,
    Guid? CustomerId,
    Guid? LeadId,
    Guid? OpportunityId,
    DateTime? NextFollowUpOn,
    DateTime OccurredAtUtc);

internal sealed class OpenOpportunityCommandHandler : IRequestHandler<OpenOpportunityCommand, Result<OpportunityDto>>
{
    private readonly IOpportunityRepository _opportunities;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ITenantContext _tenant;
    private readonly IClock _clock;

    public OpenOpportunityCommandHandler(
        IOpportunityRepository opportunities,
        IUnitOfWork unitOfWork,
        ITenantContext tenant,
        IClock clock)
    {
        _opportunities = opportunities;
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
            _clock.UtcNow);

        if (opportunity.IsFailure)
        {
            return Result<OpportunityDto>.Failure(opportunity.Error);
        }

        _opportunities.Add(opportunity.Value);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result<OpportunityDto>.Success(ToDto(opportunity.Value));
    }

    internal static OpportunityDto ToDto(Opportunity opportunity) => new(
        opportunity.Id.Value,
        opportunity.Title,
        opportunity.CustomerId?.Value,
        opportunity.LeadId?.Value,
        opportunity.Stage.ToString(),
        opportunity.Amount,
        opportunity.Currency,
        opportunity.OwnerId,
        opportunity.CreatedAtUtc);
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

        var moved = opportunity.MoveTo(request.Stage, request.LostReason, _clock.UtcNow);
        if (moved.IsFailure)
        {
            return Result<OpportunityDto>.Failure(moved.Error);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result<OpportunityDto>.Success(OpenOpportunityCommandHandler.ToDto(opportunity));
    }
}

internal sealed class ListOpportunitiesQueryHandler
    : IRequestHandler<ListOpportunitiesQuery, Result<IReadOnlyList<OpportunityDto>>>
{
    private readonly IOpportunityRepository _opportunities;
    private readonly ITenantContext _tenant;

    public ListOpportunitiesQueryHandler(IOpportunityRepository opportunities, ITenantContext tenant)
    {
        _opportunities = opportunities;
        _tenant = tenant;
    }

    public async Task<Result<IReadOnlyList<OpportunityDto>>> Handle(
        ListOpportunitiesQuery request,
        CancellationToken cancellationToken)
    {
        var items = await _opportunities.ListAsync(_tenant.TenantId, cancellationToken);
        return Result<IReadOnlyList<OpportunityDto>>.Success(items.Select(OpenOpportunityCommandHandler.ToDto).ToList());
    }
}

internal sealed class ListCustomerOpportunitiesQueryHandler
    : IRequestHandler<ListCustomerOpportunitiesQuery, Result<IReadOnlyList<OpportunityDto>>>
{
    private readonly IOpportunityRepository _opportunities;
    private readonly ITenantContext _tenant;

    public ListCustomerOpportunitiesQueryHandler(IOpportunityRepository opportunities, ITenantContext tenant)
    {
        _opportunities = opportunities;
        _tenant = tenant;
    }

    public async Task<Result<IReadOnlyList<OpportunityDto>>> Handle(
        ListCustomerOpportunitiesQuery request,
        CancellationToken cancellationToken)
    {
        var items = await _opportunities.ListByCustomerAsync(
            _tenant.TenantId,
            new CustomerId(request.CustomerId),
            cancellationToken);

        return Result<IReadOnlyList<OpportunityDto>>.Success(items.Select(OpenOpportunityCommandHandler.ToDto).ToList());
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
            _clock.UtcNow);

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
