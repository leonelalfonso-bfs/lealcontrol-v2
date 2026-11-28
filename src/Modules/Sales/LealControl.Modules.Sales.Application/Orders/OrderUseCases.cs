using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Results;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Contracts.Opportunities;
using LealControl.Modules.Sales.Application.Abstractions;
using LealControl.Modules.Sales.Application.Orders.Models;
using LealControl.Modules.Sales.Domain.Orders;
using LealControl.Modules.Sales.Domain.Quotes;
using MediatR;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

namespace LealControl.Modules.Sales.Application.Orders;

public sealed record CreateOrderCommand(OrderWriteModel Model)
    : IRequest<Result<OrderDto>>;

public sealed record CreateOrderFromQuoteCommand(
    Guid QuoteId,
    IReadOnlyList<Guid>? IncludeOptionalLineIds = null,
    IReadOnlyList<Guid>? SelectedLineIds = null,
    string? CustomerPurchaseOrder = null)
    : IRequest<Result<OrderDto>>;

public sealed record UpdateOrderCommand(Guid Id, OrderWriteModel Model)
    : IRequest<Result<OrderDto>>;

public sealed record UpdateOrderStatusCommand(Guid Id, OrderStatus NewStatus)
    : IRequest<Result<OrderDto>>;

public sealed record ListOrdersQuery(string? Search = null, OrderStatus? Status = null)
    : IRequest<Result<IReadOnlyList<OrderDto>>>;

public sealed record GetOrderQuery(Guid Id)
    : IRequest<Result<OrderDto>>;

internal static class OrderMappingExtensions
{
    public static OrderDto ToDto(this Order order)
    {
        return new OrderDto(
            order.Id.Value,
            order.OrderNumber,
            order.QuoteId,
            order.QuoteNumber,
            order.CustomerId,
            order.LocationId,
            order.ContactId,
            order.OpportunityId,
            order.Status.ToString(),
            order.Currency,
            order.ExchangeRateUsdBillete,
            order.ExchangeRateUsdDivisa,
            order.DiscountPercent,
            order.Subtotal,
            order.Total,
            order.PaymentTerms,
            order.PaymentMethod,
            order.DeliveryTimeDays,
            order.Transportation,
            order.Warranty,
            order.Notes,
            order.OwnerName,
            order.CreatedAtUtc,
            order.UpdatedAtUtc,
            order.Lines.Select(l => new OrderLineDto(
                l.Id.Value,
                l.ProductId,
                l.Description,
                l.Quantity,
                l.UnitPrice,
                l.CurrencyCode,
                l.DiscountPercent,
                l.TaxRate,
                l.IsOptional,
                l.LineSubtotal,
                l.SourceQuoteLineId)).ToList(),
            order.DeliveryTimeText,
            order.CustomerPurchaseOrder);
    }
}

internal sealed class CreateOrderCommandHandler : IRequestHandler<CreateOrderCommand, Result<OrderDto>>
{
    private readonly IOrderRepository _orderRepository;
    private readonly IQuoteRepository _quoteRepository;
    private readonly ISalesUnitOfWork _unitOfWork;
    private readonly ITenantContext _tenantContext;
    private readonly IOpportunityQuoteSync _crm;
    private readonly ILogger<CreateOrderCommandHandler> _logger;

    public CreateOrderCommandHandler(
        IOrderRepository orderRepository,
        IQuoteRepository quoteRepository,
        ISalesUnitOfWork unitOfWork,
        ITenantContext tenantContext,
        IOpportunityQuoteSync crm,
        ILogger<CreateOrderCommandHandler>? logger = null)
    {
        _orderRepository = orderRepository;
        _quoteRepository = quoteRepository;
        _unitOfWork = unitOfWork;
        _tenantContext = tenantContext;
        _crm = crm;
        _logger = logger ?? NullLogger<CreateOrderCommandHandler>.Instance;
    }

    public async Task<Result<OrderDto>> Handle(CreateOrderCommand request, CancellationToken cancellationToken)
    {
        var count = await _orderRepository.GetCountAsync(_tenantContext.TenantId, cancellationToken);
        var orderNumber = $"PED-{(count + 1):D4}";
        var now = DateTime.UtcNow;

        Quote? linkedQuote = null;
        if (request.Model.QuoteId is { } qid)
        {
            linkedQuote = await _quoteRepository.GetByIdAsync(new QuoteId(qid), cancellationToken);
        }

        // Sin OpportunityId explícito (del modelo o del presupuesto) el pedido NO se vincula a ninguna oportunidad.
        var opportunityId = request.Model.OpportunityId ?? linkedQuote?.OpportunityId;

        var order = Order.Create(
            _tenantContext.TenantId,
            orderNumber,
            request.Model.CustomerId,
            now,
            request.Model.QuoteId,
            request.Model.QuoteNumber ?? linkedQuote?.QuoteNumber,
            request.Model.LocationId,
            request.Model.ContactId,
            opportunityId,
            request.Model.Currency,
            request.Model.ExchangeRateUsdBillete,
            request.Model.ExchangeRateUsdDivisa,
            request.Model.DiscountPercent,
            request.Model.PaymentTerms,
            request.Model.PaymentMethod,
            request.Model.DeliveryTimeDays,
            request.Model.Transportation,
            request.Model.Warranty,
            request.Model.Notes,
            request.Model.OwnerName,
            deliveryTimeText: request.Model.DeliveryTimeText);

        foreach (var line in request.Model.Lines)
        {
            order.AddLine(
                line.ProductId,
                line.Description,
                line.Quantity,
                line.UnitPrice,
                string.IsNullOrWhiteSpace(line.CurrencyCode) ? request.Model.Currency : line.CurrencyCode,
                line.DiscountPercent,
                line.TaxRate,
                line.IsOptional);
        }

        if (linkedQuote is not null && linkedQuote.Status is not (QuoteStatus.Ordered or QuoteStatus.Cancelled or QuoteStatus.Rejected))
        {
            linkedQuote.MarkOrdered(now);
        }

        await _orderRepository.AddAsync(order, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        if (opportunityId is { } oppId)
        {
            try
            {
                if (order.Status == OrderStatus.Draft)
                    await _crm.SyncQuoteProgressAsync(oppId, order.Total, order.Currency, isSent: true, isAccepted: true, cancellationToken);
                else if (order.Status != OrderStatus.Cancelled)
                    await _crm.MarkWonAsync(oppId, order.Total, order.Currency, cancellationToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogWarning(ex, "Ventas guardó el pedido {OrderNumber}, pero falló la sincronización con CRM (oportunidad {OpportunityId}).", order.OrderNumber, oppId);
            }
        }

        return Result.Success(order.ToDto());
    }
}

internal sealed class CreateOrderFromQuoteCommandHandler : IRequestHandler<CreateOrderFromQuoteCommand, Result<OrderDto>>
{
    private readonly IQuoteRepository _quoteRepository;
    private readonly IOrderRepository _orderRepository;
    private readonly ISalesUnitOfWork _unitOfWork;
    private readonly ITenantContext _tenantContext;
    private readonly IOpportunityQuoteSync _crm;
    private readonly ILogger<CreateOrderFromQuoteCommandHandler> _logger;

    public CreateOrderFromQuoteCommandHandler(
        IQuoteRepository quoteRepository,
        IOrderRepository orderRepository,
        ISalesUnitOfWork unitOfWork,
        ITenantContext tenantContext,
        IOpportunityQuoteSync crm,
        ILogger<CreateOrderFromQuoteCommandHandler>? logger = null)
    {
        _crm = crm;
        _quoteRepository = quoteRepository;
        _orderRepository = orderRepository;
        _unitOfWork = unitOfWork;
        _tenantContext = tenantContext;
        _logger = logger ?? NullLogger<CreateOrderFromQuoteCommandHandler>.Instance;
    }

    public async Task<Result<OrderDto>> Handle(CreateOrderFromQuoteCommand request, CancellationToken cancellationToken)
    {
        var quote = await _quoteRepository.GetByIdAsync(new QuoteId(request.QuoteId), cancellationToken);
        if (quote is null)
        {
            return Result.Failure<OrderDto>(Error.NotFound("Quote.NotFound", $"No se encontró el presupuesto '{request.QuoteId}'."));
        }

        var existingOrder = await _orderRepository.GetOpenByQuoteIdAsync(
            _tenantContext.TenantId,
            quote.Id.Value,
            cancellationToken);

        if (existingOrder is not null)
        {
            var existingOppId = existingOrder.OpportunityId ?? quote.OpportunityId;
            if (existingOppId is { } oppId && existingOrder.Status != OrderStatus.Cancelled)
            {
                try
                {
                    await _crm.MarkWonAsync(oppId, existingOrder.Total, existingOrder.Currency, cancellationToken);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    _logger.LogWarning(ex, "El pedido {OrderNumber} ya existía, pero falló la sincronización con CRM (oportunidad {OpportunityId}).", existingOrder.OrderNumber, oppId);
                }
            }
            return Result.Success(existingOrder.ToDto());
        }

        if (quote.Status is QuoteStatus.Cancelled or QuoteStatus.Rejected or QuoteStatus.Ordered)
        {
            return Result.Failure<OrderDto>(Error.Validation(
                "Sales.Order.QuoteNotConvertible",
                "No se puede generar otro pedido desde un presupuesto anulado, rechazado o ya pedido."));
        }

        var count = await _orderRepository.GetCountAsync(_tenantContext.TenantId, cancellationToken);
        var orderNumber = $"PED-{(count + 1):D4}";
        var now = DateTime.UtcNow;

        List<QuoteLine> linesToAdd;
        if (request.SelectedLineIds is { Count: > 0 })
        {
            var selected = new HashSet<Guid>(request.SelectedLineIds);
            linesToAdd = quote.Lines.Where(line => selected.Contains(line.Id.Value)).ToList();
        }
        else
        {
            var includeOptional = new HashSet<Guid>(request.IncludeOptionalLineIds ?? Array.Empty<Guid>());
            linesToAdd = quote.Lines
                .Where(line => !line.IsOptional || includeOptional.Contains(line.Id.Value))
                .ToList();
        }

        if (linesToAdd.Count == 0)
        {
            return Result.Failure<OrderDto>(Error.Validation(
                "Sales.Order.NoLinesSelected",
                "Seleccioná al menos un renglón del presupuesto para generar el pedido."));
        }

        var order = Order.Create(
            _tenantContext.TenantId,
            orderNumber,
            quote.CustomerId,
            now,
            quote.Id.Value,
            quote.QuoteNumber,
            quote.LocationId,
            quote.ContactId,
            quote.OpportunityId,
            quote.Currency,
            quote.ExchangeRateUsdBillete,
            quote.ExchangeRateUsdDivisa,
            quote.DiscountPercent,
            quote.PaymentTerms,
            quote.PaymentMethod,
            quote.DeliveryTimeDays,
            quote.Transportation,
            quote.Warranty,
            quote.Notes,
            quote.OwnerName,
            OrderStatus.Confirmed,
            quote.DeliveryTimeText,
            request.CustomerPurchaseOrder);

        foreach (var line in linesToAdd)
        {
            order.AddLine(
                line.ProductId,
                line.Description,
                line.Quantity,
                line.UnitPrice,
                line.CurrencyCode,
                line.DiscountPercent,
                line.TaxRate,
                isOptional: false,
                sourceQuoteLineId: line.Id.Value);
        }

        // Marcar la cotización como Ordered
        var markedOrdered = quote.MarkOrdered(now);
        if (markedOrdered.IsFailure)
        {
            return Result.Failure<OrderDto>(markedOrdered.Error);
        }

        await _orderRepository.AddAsync(order, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        // El pedido gana la oportunidad del CRM y actualiza su monto al del pedido.
        if (quote.OpportunityId is { } opportunityId)
        {
            try
            {
                await _crm.MarkWonAsync(opportunityId, order.Total, order.Currency, cancellationToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogWarning(ex, "Ventas guardó el pedido {OrderNumber}, pero falló la sincronización con CRM (oportunidad {OpportunityId}).", order.OrderNumber, opportunityId);
            }
        }

        return Result.Success(order.ToDto());
    }
}

internal sealed class UpdateOrderCommandHandler : IRequestHandler<UpdateOrderCommand, Result<OrderDto>>
{
    private readonly IOrderRepository _orderRepository;
    private readonly ISalesUnitOfWork _unitOfWork;
    private readonly IOpportunityQuoteSync _crm;
    private readonly ILogger<UpdateOrderCommandHandler> _logger;

    public UpdateOrderCommandHandler(
        IOrderRepository orderRepository,
        ISalesUnitOfWork unitOfWork,
        IOpportunityQuoteSync crm,
        ILogger<UpdateOrderCommandHandler>? logger = null)
    {
        _orderRepository = orderRepository;
        _unitOfWork = unitOfWork;
        _crm = crm;
        _logger = logger ?? NullLogger<UpdateOrderCommandHandler>.Instance;
    }

    public async Task<Result<OrderDto>> Handle(UpdateOrderCommand request, CancellationToken cancellationToken)
    {
        var order = await _orderRepository.GetByIdAsync(new OrderId(request.Id), cancellationToken);
        if (order is null)
        {
            return Result.Failure<OrderDto>(Error.NotFound("Order.NotFound", $"No se encontró el pedido '{request.Id}'."));
        }

        var now = DateTime.UtcNow;
        order.UpdateHeader(
            request.Model.CustomerId,
            request.Model.LocationId,
            request.Model.ContactId,
            request.Model.OpportunityId,
            request.Model.Currency,
            request.Model.ExchangeRateUsdBillete,
            request.Model.ExchangeRateUsdDivisa,
            request.Model.DiscountPercent,
            request.Model.PaymentTerms,
            request.Model.PaymentMethod,
            request.Model.DeliveryTimeDays,
            request.Model.Transportation,
            request.Model.Warranty,
            request.Model.Notes,
            request.Model.OwnerName,
            now,
            request.Model.DeliveryTimeText);

        _orderRepository.Update(order);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        if (order.OpportunityId is { } oppId && order.Status != OrderStatus.Draft && order.Status != OrderStatus.Cancelled)
        {
            try
            {
                await _crm.MarkWonAsync(oppId, order.Total, order.Currency, cancellationToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogWarning(ex, "Ventas actualizó el pedido {OrderNumber}, pero falló la sincronización con CRM (oportunidad {OpportunityId}).", order.OrderNumber, oppId);
            }
        }

        return Result.Success(order.ToDto());
    }
}

internal sealed class UpdateOrderStatusCommandHandler : IRequestHandler<UpdateOrderStatusCommand, Result<OrderDto>>
{
    private readonly IOrderRepository _orderRepository;
    private readonly IQuoteRepository _quoteRepository;
    private readonly ISalesUnitOfWork _unitOfWork;
    private readonly ITenantContext _tenantContext;
    private readonly IOpportunityQuoteSync _crm;
    private readonly ILogger<UpdateOrderStatusCommandHandler> _logger;

    public UpdateOrderStatusCommandHandler(
        IOrderRepository orderRepository,
        IQuoteRepository quoteRepository,
        ISalesUnitOfWork unitOfWork,
        ITenantContext tenantContext,
        IOpportunityQuoteSync crm,
        ILogger<UpdateOrderStatusCommandHandler>? logger = null)
    {
        _orderRepository = orderRepository;
        _quoteRepository = quoteRepository;
        _unitOfWork = unitOfWork;
        _tenantContext = tenantContext;
        _crm = crm;
        _logger = logger ?? NullLogger<UpdateOrderStatusCommandHandler>.Instance;
    }

    public async Task<Result<OrderDto>> Handle(UpdateOrderStatusCommand request, CancellationToken cancellationToken)
    {
        var order = await _orderRepository.GetByIdAsync(new OrderId(request.Id), cancellationToken);
        if (order is null)
        {
            return Result.Failure<OrderDto>(Error.NotFound("Order.NotFound", $"No se encontró el pedido '{request.Id}'."));
        }

        var now = DateTime.UtcNow;
        var result = order.ChangeStatus(request.NewStatus, now);
        if (result.IsFailure)
        {
            return Result.Failure<OrderDto>(result.Error);
        }

        if (request.NewStatus == OrderStatus.Cancelled && order.QuoteId is Guid quoteId)
        {
            var quote = await _quoteRepository.GetByIdAsync(new QuoteId(quoteId), cancellationToken);
            quote?.Reopen(now);
        }

        _orderRepository.Update(order);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        if (order.OpportunityId is { } oppId)
        {
            try
            {
                if (request.NewStatus == OrderStatus.Cancelled)
                {
                    var hasOtherActive = await _orderRepository.HasActiveOrderForOpportunityAsync(_tenantContext.TenantId, oppId, order.Id.Value, cancellationToken);
                    if (!hasOtherActive)
                        await _crm.ReopenFromCancelledOrderAsync(oppId, $"Pedido {order.OrderNumber} anulado", cancellationToken);
                }
                else if (request.NewStatus != OrderStatus.Draft)
                {
                    await _crm.MarkWonAsync(oppId, order.Total, order.Currency, cancellationToken);
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogWarning(ex, "Ventas cambió el estado del pedido {OrderNumber} a {Status}, pero falló la sincronización con CRM (oportunidad {OpportunityId}).", order.OrderNumber, request.NewStatus, oppId);
            }
        }

        return Result.Success(order.ToDto());
    }
}

internal sealed class ListOrdersQueryHandler : IRequestHandler<ListOrdersQuery, Result<IReadOnlyList<OrderDto>>>
{
    private readonly IOrderRepository _orderRepository;
    private readonly ITenantContext _tenantContext;

    public ListOrdersQueryHandler(IOrderRepository orderRepository, ITenantContext tenantContext)
    {
        _orderRepository = orderRepository;
        _tenantContext = tenantContext;
    }

    public async Task<Result<IReadOnlyList<OrderDto>>> Handle(ListOrdersQuery request, CancellationToken cancellationToken)
    {
        var orders = await _orderRepository.ListAsync(_tenantContext.TenantId, request.Search, request.Status, cancellationToken);
        var dtos = orders.Select(o => o.ToDto()).ToList();
        return Result.Success<IReadOnlyList<OrderDto>>(dtos);
    }
}

internal sealed class GetOrderQueryHandler : IRequestHandler<GetOrderQuery, Result<OrderDto>>
{
    private readonly IOrderRepository _orderRepository;

    public GetOrderQueryHandler(IOrderRepository orderRepository)
    {
        _orderRepository = orderRepository;
    }

    public async Task<Result<OrderDto>> Handle(GetOrderQuery request, CancellationToken cancellationToken)
    {
        var order = await _orderRepository.GetByIdAsync(new OrderId(request.Id), cancellationToken);
        if (order is null)
        {
            return Result.Failure<OrderDto>(Error.NotFound("Order.NotFound", $"No se encontró el pedido '{request.Id}'."));
        }

        return Result.Success(order.ToDto());
    }
}
