using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Results;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.BuildingBlocks.Time;
using LealControl.Modules.Directory.Contracts.Customers;
using LealControl.Modules.Crm.Contracts.Opportunities;
using LealControl.Modules.Sales.Application.Abstractions;
using LealControl.Modules.Sales.Domain;
using LealControl.Modules.Sales.Domain.Orders;
using LealControl.Modules.Sales.Domain.Quotes;
using MediatR;

namespace LealControl.Modules.Sales.Application.Quotes;

public sealed record CreateDraftFromOpportunityCommand(Guid OpportunityId)
    : IRequest<Result<QuoteDto>>;

public sealed record CreateQuoteCommand(QuoteWriteModel Model)
    : IRequest<Result<QuoteDto>>;

public sealed record UpdateQuoteCommand(Guid Id, QuoteWriteModel Model)
    : IRequest<Result<QuoteDto>>;

public sealed record AcceptQuoteCommand(Guid Id)
    : IRequest<Result<QuoteDto>>;

public sealed record SendQuoteCommand(Guid Id)
    : IRequest<Result<QuoteDto>>;

public sealed record RejectQuoteCommand(Guid Id)
    : IRequest<Result<QuoteDto>>;

public sealed record CancelQuoteCommand(Guid Id)
    : IRequest<Result<QuoteDto>>;

public sealed record DeleteQuoteCommand(Guid Id)
    : IRequest<Result>;

public sealed record ListQuotesQuery : IRequest<Result<IReadOnlyList<QuoteDto>>>;

public sealed record GetQuoteQuery(Guid QuoteId) : IRequest<Result<QuoteDto>>;

public sealed record QuoteLineWriteModel(
    string Description,
    decimal Quantity,
    decimal UnitPrice,
    decimal DiscountPercent = 0m,
    decimal TaxRate = 21m,
    bool IsOptional = false,
    string CurrencyCode = "ARS",
    Guid? ProductId = null,
    string? TechnicalDetail = null);

public sealed record QuoteWriteModel(
    Guid CustomerId,
    Guid? LocationId,
    Guid? ContactId,
    Guid? OpportunityId,
    string Currency,
    decimal ExchangeRateUsdBillete,
    decimal ExchangeRateUsdDivisa,
    decimal DiscountPercent,
    int ValidDays,
    string? PaymentTerms,
    string? PaymentMethod,
    int? DeliveryTimeDays,
    string? Transportation,
    string? Warranty,
    string? Notes,
    string? OwnerName,
    List<QuoteLineWriteModel> Lines);

public sealed record QuoteLineDto(
    Guid Id,
    Guid? ProductId,
    string Description,
    decimal Quantity,
    decimal UnitPrice,
    decimal DiscountPercent,
    decimal TaxRate,
    bool IsOptional,
    string CurrencyCode,
    decimal LineSubtotal,
    string? TechnicalDetail);

public sealed record QuoteDto(
    Guid Id,
    string QuoteNumber,
    int Revision,
    Guid CustomerId,
    Guid? LocationId,
    Guid? ContactId,
    Guid? OpportunityId,
    string Status,
    string Currency,
    decimal ExchangeRateUsdBillete,
    decimal ExchangeRateUsdDivisa,
    decimal DiscountPercent,
    decimal Subtotal,
    decimal Total,
    int ValidDays,
    string? PaymentTerms,
    string? PaymentMethod,
    int? DeliveryTimeDays,
    string? Transportation,
    string? Warranty,
    string? Notes,
    string? OwnerName,
    DateTime CreatedAtUtc,
    DateTime UpdatedAtUtc,
    IReadOnlyList<QuoteLineDto> Lines);

internal static class QuoteMappings
{
    public static QuoteDto ToDto(Quote quote) => new(
        quote.Id.Value,
        quote.QuoteNumber,
        quote.Revision,
        quote.CustomerId,
        quote.LocationId,
        quote.ContactId,
        quote.OpportunityId,
        quote.Status.ToString(),
        quote.Currency,
        quote.ExchangeRateUsdBillete,
        quote.ExchangeRateUsdDivisa,
        quote.DiscountPercent,
        quote.Subtotal,
        quote.Total,
        quote.ValidDays,
        quote.PaymentTerms,
        quote.PaymentMethod,
        quote.DeliveryTimeDays,
        quote.Transportation,
        quote.Warranty,
        quote.Notes,
        quote.OwnerName,
        quote.CreatedAtUtc,
        quote.UpdatedAtUtc,
        quote.Lines.Select(l => new QuoteLineDto(
            l.Id.Value,
            l.ProductId,
            l.Description,
            l.Quantity,
            l.UnitPrice,
            l.DiscountPercent,
            l.TaxRate,
            l.IsOptional,
            l.CurrencyCode,
            l.LineSubtotal,
            l.TechnicalDetail)).ToList());
}

internal sealed class CreateQuoteCommandHandler : IRequestHandler<CreateQuoteCommand, Result<QuoteDto>>
{
    private readonly IQuoteRepository _quotes;
    private readonly ITenantContext _tenant;
    private readonly IClock _clock;

    public CreateQuoteCommandHandler(
        IQuoteRepository quotes,
        ITenantContext tenant,
        IClock clock)
    {
        _quotes = quotes;
        _tenant = tenant;
        _clock = clock;
    }

    public async Task<Result<QuoteDto>> Handle(CreateQuoteCommand request, CancellationToken cancellationToken)
    {
        await _quotes.EnsureTechnicalDetailColumnAsync(cancellationToken);
        var number = await _quotes.NextNumberAsync(_tenant.TenantId, _clock.UtcNow.Year, cancellationToken);

        if (request.Model.Lines is null)
        {
            return Result<QuoteDto>.Failure(SalesErrors.LineDescriptionRequired);
        }

        var quoteResult = Quote.Draft(
            _tenant.TenantId,
            number,
            request.Model.CustomerId,
            request.Model.OpportunityId,
            request.Model.Currency,
            request.Model.Notes,
            request.Model.OwnerName,
            request.Model.ValidDays,
            _clock.UtcNow,
            request.Model.LocationId,
            request.Model.ContactId,
            request.Model.ExchangeRateUsdBillete,
            request.Model.ExchangeRateUsdDivisa,
            request.Model.DiscountPercent,
            request.Model.PaymentTerms,
            request.Model.PaymentMethod,
            request.Model.DeliveryTimeDays,
            request.Model.Transportation,
            request.Model.Warranty);

        if (quoteResult.IsFailure)
        {
            return Result<QuoteDto>.Failure(quoteResult.Error);
        }

        var quote = quoteResult.Value;
        foreach (var lineModel in request.Model.Lines)
        {
            var lineAdd = quote.AddLine(
                lineModel.Description,
                lineModel.Quantity,
                lineModel.UnitPrice,
                _clock.UtcNow,
                lineModel.DiscountPercent,
                lineModel.TaxRate,
                lineModel.IsOptional,
                lineModel.ProductId,
                lineModel.TechnicalDetail);

            if (lineAdd.IsFailure)
            {
                return Result<QuoteDto>.Failure(lineAdd.Error);
            }
        }

        _quotes.Add(quote);
        var persisted = await PersistQuoteAsync(quote, renumberOnCollision: true, cancellationToken);
        return persisted ?? Result<QuoteDto>.Success(QuoteMappings.ToDto(quote));
    }

    private async Task<Result<QuoteDto>?> PersistQuoteAsync(
        Quote quote,
        bool renumberOnCollision,
        CancellationToken cancellationToken)
    {
        try
        {
            await _quotes.SaveAsync(cancellationToken);
            return null;
        }
        catch (QuotePersistenceException ex) when (renumberOnCollision && ex.IsNumberCollision)
        {
            quote.AssignNumber(await _quotes.NextNumberAsync(_tenant.TenantId, _clock.UtcNow.Year, cancellationToken));
            try
            {
                await _quotes.SaveAsync(cancellationToken);
                return null;
            }
            catch (QuotePersistenceException retry)
            {
                return Result<QuoteDto>.Failure(Error.Validation("Sales.Quote.SaveFailed", retry.Message));
            }
        }
        catch (QuotePersistenceException ex)
        {
            return Result<QuoteDto>.Failure(Error.Validation("Sales.Quote.SaveFailed", ex.Message));
        }
    }
}

internal sealed class UpdateQuoteCommandHandler : IRequestHandler<UpdateQuoteCommand, Result<QuoteDto>>
{
    private readonly IQuoteRepository _quotes;
    private readonly IClock _clock;

    public UpdateQuoteCommandHandler(
        IQuoteRepository quotes,
        IClock clock)
    {
        _quotes = quotes;
        _clock = clock;
    }

    public async Task<Result<QuoteDto>> Handle(UpdateQuoteCommand request, CancellationToken cancellationToken)
    {
        await _quotes.EnsureTechnicalDetailColumnAsync(cancellationToken);
        var quote = await _quotes.GetByIdAsync(new QuoteId(request.Id), cancellationToken);
        if (quote is null)
        {
            return Result<QuoteDto>.Failure(SalesErrors.QuoteNotFound);
        }

        if (request.Model.Lines is null)
        {
            return Result<QuoteDto>.Failure(SalesErrors.LineDescriptionRequired);
        }

        var updateResult = quote.UpdateDetails(
            request.Model.CustomerId,
            request.Model.LocationId,
            request.Model.ContactId,
            request.Model.Currency,
            request.Model.ExchangeRateUsdBillete,
            request.Model.ExchangeRateUsdDivisa,
            request.Model.DiscountPercent,
            request.Model.ValidDays,
            request.Model.PaymentTerms,
            request.Model.PaymentMethod,
            request.Model.DeliveryTimeDays,
            request.Model.Transportation,
            request.Model.Warranty,
            request.Model.Notes,
            request.Model.OwnerName,
            _clock.UtcNow);

        if (updateResult.IsFailure)
        {
            return Result<QuoteDto>.Failure(updateResult.Error);
        }

        quote.ClearLines();
        foreach (var lineModel in request.Model.Lines)
        {
            var lineAdd = quote.AddLine(
                lineModel.Description,
                lineModel.Quantity,
                lineModel.UnitPrice,
                _clock.UtcNow,
                lineModel.DiscountPercent,
                lineModel.TaxRate,
                lineModel.IsOptional,
                lineModel.ProductId,
                lineModel.TechnicalDetail);

            if (lineAdd.IsFailure)
            {
                return Result<QuoteDto>.Failure(lineAdd.Error);
            }
        }

        var persisted = await PersistQuoteAsync(cancellationToken);
        return persisted ?? Result<QuoteDto>.Success(QuoteMappings.ToDto(quote));
    }

    private async Task<Result<QuoteDto>?> PersistQuoteAsync(CancellationToken cancellationToken)
    {
        try
        {
            await _quotes.SaveAsync(cancellationToken);
            return null;
        }
        catch (QuotePersistenceException ex)
        {
            return Result<QuoteDto>.Failure(Error.Validation("Sales.Quote.SaveFailed", ex.Message));
        }
    }
}

internal sealed class AcceptQuoteCommandHandler : IRequestHandler<AcceptQuoteCommand, Result<QuoteDto>>
{
    private readonly IQuoteRepository _quotes;
    private readonly ISalesUnitOfWork _unitOfWork;
    private readonly IClock _clock;

    public AcceptQuoteCommandHandler(IQuoteRepository quotes, ISalesUnitOfWork unitOfWork, IClock clock)
    {
        _quotes = quotes;
        _unitOfWork = unitOfWork;
        _clock = clock;
    }

    public async Task<Result<QuoteDto>> Handle(AcceptQuoteCommand request, CancellationToken cancellationToken)
    {
        var quote = await _quotes.GetByIdAsync(new QuoteId(request.Id), cancellationToken);
        if (quote is null)
        {
            return Result<QuoteDto>.Failure(SalesErrors.QuoteNotFound);
        }

        var acceptResult = quote.AcceptAndWin(_clock.UtcNow);
        if (acceptResult.IsFailure)
        {
            return Result<QuoteDto>.Failure(acceptResult.Error);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result<QuoteDto>.Success(QuoteMappings.ToDto(quote));
    }
}

internal sealed class SendQuoteCommandHandler : IRequestHandler<SendQuoteCommand, Result<QuoteDto>>
{
    private readonly IQuoteRepository _quotes;
    private readonly ISalesUnitOfWork _unitOfWork;
    private readonly IClock _clock;

    public SendQuoteCommandHandler(IQuoteRepository quotes, ISalesUnitOfWork unitOfWork, IClock clock)
    {
        _quotes = quotes;
        _unitOfWork = unitOfWork;
        _clock = clock;
    }

    public async Task<Result<QuoteDto>> Handle(SendQuoteCommand request, CancellationToken cancellationToken)
    {
        var quote = await _quotes.GetByIdAsync(new QuoteId(request.Id), cancellationToken);
        if (quote is null)
        {
            return Result<QuoteDto>.Failure(SalesErrors.QuoteNotFound);
        }

        var sendResult = quote.MarkSent(_clock.UtcNow);
        if (sendResult.IsFailure)
        {
            return Result<QuoteDto>.Failure(sendResult.Error);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result<QuoteDto>.Success(QuoteMappings.ToDto(quote));
    }
}

internal sealed class RejectQuoteCommandHandler : IRequestHandler<RejectQuoteCommand, Result<QuoteDto>>
{
    private readonly IQuoteRepository _quotes;
    private readonly ISalesUnitOfWork _unitOfWork;
    private readonly IClock _clock;

    public RejectQuoteCommandHandler(IQuoteRepository quotes, ISalesUnitOfWork unitOfWork, IClock clock)
    {
        _quotes = quotes;
        _unitOfWork = unitOfWork;
        _clock = clock;
    }

    public async Task<Result<QuoteDto>> Handle(RejectQuoteCommand request, CancellationToken cancellationToken)
    {
        var quote = await _quotes.GetByIdAsync(new QuoteId(request.Id), cancellationToken);
        if (quote is null)
        {
            return Result<QuoteDto>.Failure(SalesErrors.QuoteNotFound);
        }

        var rejectResult = quote.Reject(_clock.UtcNow);
        if (rejectResult.IsFailure)
        {
            return Result<QuoteDto>.Failure(rejectResult.Error);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result<QuoteDto>.Success(QuoteMappings.ToDto(quote));
    }
}

internal sealed class CreateDraftFromOpportunityCommandHandler
    : IRequestHandler<CreateDraftFromOpportunityCommand, Result<QuoteDto>>
{
    private readonly IOpportunityLookup _opportunities;
    private readonly ICustomerDirectory _customers;
    private readonly IQuoteRepository _quotes;
    private readonly ITenantContext _tenant;
    private readonly IClock _clock;

    public CreateDraftFromOpportunityCommandHandler(
        IOpportunityLookup opportunities,
        ICustomerDirectory customers,
        IQuoteRepository quotes,
        ITenantContext tenant,
        IClock clock)
    {
        _opportunities = opportunities;
        _customers = customers;
        _quotes = quotes;
        _tenant = tenant;
        _clock = clock;
    }

    public async Task<Result<QuoteDto>> Handle(
        CreateDraftFromOpportunityCommand request,
        CancellationToken cancellationToken)
    {
        var opportunity = await _opportunities.FindAsync(request.OpportunityId, cancellationToken);
        if (opportunity is null)
        {
            return Result<QuoteDto>.Failure(SalesErrors.OpportunityNotFound);
        }

        if (string.Equals(opportunity.Stage, "Won", StringComparison.Ordinal)
            || string.Equals(opportunity.Stage, "Lost", StringComparison.Ordinal))
        {
            return Result<QuoteDto>.Failure(SalesErrors.OpportunityNotWon);
        }

        if (opportunity.CustomerId is null)
        {
            return Result<QuoteDto>.Failure(SalesErrors.OpportunityCustomerRequired);
        }

        if (!await _customers.ExistsAsync(opportunity.CustomerId.Value, cancellationToken))
        {
            return Result<QuoteDto>.Failure(SalesErrors.QuoteCustomerRequired);
        }

        var existing = await _quotes.FindByOpportunityAsync(
            _tenant.TenantId,
            opportunity.Id,
            cancellationToken);
        if (existing is not null)
        {
            return Result<QuoteDto>.Success(QuoteMappings.ToDto(existing));
        }

        await _quotes.EnsureTechnicalDetailColumnAsync(cancellationToken);
        var number = await _quotes.NextNumberAsync(_tenant.TenantId, _clock.UtcNow.Year, cancellationToken);

        var draft = Quote.Draft(
            _tenant.TenantId,
            number,
            opportunity.CustomerId.Value,
            opportunity.Id,
            opportunity.Currency,
            $"Generado desde oportunidad: {opportunity.Title}",
            opportunity.OwnerName,
            15,
            _clock.UtcNow);

        if (draft.IsFailure)
        {
            return Result<QuoteDto>.Failure(draft.Error);
        }

        var amount = opportunity.Amount is > 0 ? opportunity.Amount.Value : 0m;
        var line = draft.Value.AddLine(
            opportunity.Title,
            1m,
            amount,
            _clock.UtcNow);

        if (line.IsFailure)
        {
            return Result<QuoteDto>.Failure(line.Error);
        }

        _quotes.Add(draft.Value);
        try
        {
            await _quotes.SaveAsync(cancellationToken);
        }
        catch (QuotePersistenceException ex) when (ex.IsNumberCollision)
        {
            draft.Value.AssignNumber(await _quotes.NextNumberAsync(_tenant.TenantId, _clock.UtcNow.Year, cancellationToken));
            try
            {
                await _quotes.SaveAsync(cancellationToken);
            }
            catch (QuotePersistenceException retry)
            {
                return Result<QuoteDto>.Failure(Error.Validation("Sales.Quote.SaveFailed", retry.Message));
            }
        }
        catch (QuotePersistenceException ex)
        {
            return Result<QuoteDto>.Failure(Error.Validation("Sales.Quote.SaveFailed", ex.Message));
        }

        return Result<QuoteDto>.Success(QuoteMappings.ToDto(draft.Value));
    }
}

internal sealed class ListQuotesQueryHandler
    : IRequestHandler<ListQuotesQuery, Result<IReadOnlyList<QuoteDto>>>
{
    private readonly IQuoteRepository _quotes;
    private readonly ITenantContext _tenant;

    public ListQuotesQueryHandler(IQuoteRepository quotes, ITenantContext tenant)
    {
        _quotes = quotes;
        _tenant = tenant;
    }

    public async Task<Result<IReadOnlyList<QuoteDto>>> Handle(
        ListQuotesQuery request,
        CancellationToken cancellationToken)
    {
        var items = await _quotes.ListAsync(_tenant.TenantId, cancellationToken);
        return Result<IReadOnlyList<QuoteDto>>.Success(
            items.Select(QuoteMappings.ToDto).ToList());
    }
}

internal sealed class GetQuoteQueryHandler : IRequestHandler<GetQuoteQuery, Result<QuoteDto>>
{
    private readonly IQuoteRepository _quotes;

    public GetQuoteQueryHandler(IQuoteRepository quotes) => _quotes = quotes;

    public async Task<Result<QuoteDto>> Handle(GetQuoteQuery request, CancellationToken cancellationToken)
    {
        var quote = await _quotes.GetByIdAsync(new QuoteId(request.QuoteId), cancellationToken);
        return quote is null
            ? Result<QuoteDto>.Failure(SalesErrors.QuoteNotFound)
            : Result<QuoteDto>.Success(QuoteMappings.ToDto(quote));
    }
}

internal sealed class CancelQuoteCommandHandler : IRequestHandler<CancelQuoteCommand, Result<QuoteDto>>
{
    private readonly IQuoteRepository _quotes;
    private readonly IOrderRepository _orders;
    private readonly ISalesUnitOfWork _unitOfWork;
    private readonly ITenantContext _tenant;
    private readonly IClock _clock;

    public CancelQuoteCommandHandler(
        IQuoteRepository quotes,
        IOrderRepository orders,
        ISalesUnitOfWork unitOfWork,
        ITenantContext tenant,
        IClock clock)
    {
        _quotes = quotes;
        _orders = orders;
        _unitOfWork = unitOfWork;
        _tenant = tenant;
        _clock = clock;
    }

    public async Task<Result<QuoteDto>> Handle(CancelQuoteCommand request, CancellationToken cancellationToken)
    {
        var quote = await _quotes.GetByIdAsync(new QuoteId(request.Id), cancellationToken);
        if (quote is null)
        {
            return Result<QuoteDto>.Failure(SalesErrors.QuoteNotFound);
        }

        var order = await _orders.GetOpenByQuoteIdAsync(_tenant.TenantId, quote.Id.Value, cancellationToken);
        if (order is not null)
        {
            return Result<QuoteDto>.Failure(SalesErrors.QuoteHasSalesOrder);
        }

        var cancelResult = quote.Cancel(_clock.UtcNow);
        if (cancelResult.IsFailure)
        {
            return Result<QuoteDto>.Failure(cancelResult.Error);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result<QuoteDto>.Success(QuoteMappings.ToDto(quote));
    }
}

internal sealed class DeleteQuoteCommandHandler : IRequestHandler<DeleteQuoteCommand, Result>
{
    private readonly IQuoteRepository _quotes;
    private readonly IOrderRepository _orders;
    private readonly ISalesUnitOfWork _unitOfWork;
    private readonly ITenantContext _tenant;

    public DeleteQuoteCommandHandler(
        IQuoteRepository quotes,
        IOrderRepository orders,
        ISalesUnitOfWork unitOfWork,
        ITenantContext tenant)
    {
        _quotes = quotes;
        _orders = orders;
        _unitOfWork = unitOfWork;
        _tenant = tenant;
    }

    public async Task<Result> Handle(DeleteQuoteCommand request, CancellationToken cancellationToken)
    {
        var quote = await _quotes.GetByIdAsync(new QuoteId(request.Id), cancellationToken);
        if (quote is null)
        {
            return Result.Failure(SalesErrors.QuoteNotFound);
        }

        var order = await _orders.GetOpenByQuoteIdAsync(_tenant.TenantId, quote.Id.Value, cancellationToken);
        if (order is not null)
        {
            return Result.Failure(SalesErrors.QuoteHasSalesOrder);
        }

        _quotes.Remove(quote);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
