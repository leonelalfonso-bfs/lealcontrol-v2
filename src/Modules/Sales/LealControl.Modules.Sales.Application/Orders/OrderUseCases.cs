using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Results;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Sales.Application.Abstractions;
using LealControl.Modules.Sales.Application.Orders.Models;
using LealControl.Modules.Sales.Domain.Orders;
using LealControl.Modules.Sales.Domain.Quotes;
using MediatR;

namespace LealControl.Modules.Sales.Application.Orders;

public sealed record CreateOrderCommand(OrderWriteModel Model)
    : IRequest<Result<OrderDto>>;

public sealed record CreateOrderFromQuoteCommand(Guid QuoteId)
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
                l.LineSubtotal)).ToList());
    }
}

internal sealed class CreateOrderCommandHandler : IRequestHandler<CreateOrderCommand, Result<OrderDto>>
{
    private readonly IOrderRepository _orderRepository;
    private readonly ISalesUnitOfWork _unitOfWork;
    private readonly ITenantContext _tenantContext;

    public CreateOrderCommandHandler(
        IOrderRepository orderRepository,
        ISalesUnitOfWork unitOfWork,
        ITenantContext tenantContext)
    {
        _orderRepository = orderRepository;
        _unitOfWork = unitOfWork;
        _tenantContext = tenantContext;
    }

    public async Task<Result<OrderDto>> Handle(CreateOrderCommand request, CancellationToken cancellationToken)
    {
        var count = await _orderRepository.GetCountAsync(_tenantContext.TenantId, cancellationToken);
        var orderNumber = $"PED-{(count + 1):D4}";
        var now = DateTime.UtcNow;

        var order = Order.Create(
            _tenantContext.TenantId,
            orderNumber,
            request.Model.CustomerId,
            now,
            request.Model.QuoteId,
            request.Model.QuoteNumber,
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
            request.Model.OwnerName);

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

        await _orderRepository.AddAsync(order, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result.Success(order.ToDto());
    }
}

internal sealed class CreateOrderFromQuoteCommandHandler : IRequestHandler<CreateOrderFromQuoteCommand, Result<OrderDto>>
{
    private readonly IQuoteRepository _quoteRepository;
    private readonly IOrderRepository _orderRepository;
    private readonly ISalesUnitOfWork _unitOfWork;
    private readonly ITenantContext _tenantContext;

    public CreateOrderFromQuoteCommandHandler(
        IQuoteRepository quoteRepository,
        IOrderRepository orderRepository,
        ISalesUnitOfWork unitOfWork,
        ITenantContext tenantContext)
    {
        _quoteRepository = quoteRepository;
        _orderRepository = orderRepository;
        _unitOfWork = unitOfWork;
        _tenantContext = tenantContext;
    }

    public async Task<Result<OrderDto>> Handle(CreateOrderFromQuoteCommand request, CancellationToken cancellationToken)
    {
        var quote = await _quoteRepository.GetByIdAsync(new QuoteId(request.QuoteId), cancellationToken);
        if (quote is null)
        {
            return Result.Failure<OrderDto>(Error.NotFound("Quote.NotFound", $"No se encontró el presupuesto '{request.QuoteId}'."));
        }

        var existingOrder = await _orderRepository.GetByQuoteIdAsync(
            _tenantContext.TenantId,
            quote.Id.Value,
            cancellationToken);

        if (existingOrder is not null)
        {
            return Result.Success(existingOrder.ToDto());
        }

        if (quote.Status != QuoteStatus.Accepted)
        {
            return Result.Failure<OrderDto>(Error.Validation(
                "Sales.Order.QuoteNotAccepted",
                "El presupuesto debe estar aceptado antes de generar el pedido de venta."));
        }

        var count = await _orderRepository.GetCountAsync(_tenantContext.TenantId, cancellationToken);
        var orderNumber = $"PED-{(count + 1):D4}";
        var now = DateTime.UtcNow;

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
            OrderStatus.Confirmed);

        foreach (var line in quote.Lines)
        {
            order.AddLine(
                line.ProductId,
                line.Description,
                line.Quantity,
                line.UnitPrice,
                line.CurrencyCode,
                line.DiscountPercent,
                line.TaxRate,
                line.IsOptional);
        }

        // Marcar la cotización como Ordered
        var markedOrdered = quote.MarkOrdered(now);
        if (markedOrdered.IsFailure)
        {
            return Result.Failure<OrderDto>(markedOrdered.Error);
        }

        await _orderRepository.AddAsync(order, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result.Success(order.ToDto());
    }
}

internal sealed class UpdateOrderCommandHandler : IRequestHandler<UpdateOrderCommand, Result<OrderDto>>
{
    private readonly IOrderRepository _orderRepository;
    private readonly ISalesUnitOfWork _unitOfWork;

    public UpdateOrderCommandHandler(
        IOrderRepository orderRepository,
        ISalesUnitOfWork unitOfWork)
    {
        _orderRepository = orderRepository;
        _unitOfWork = unitOfWork;
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
            now);

        _orderRepository.Update(order);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result.Success(order.ToDto());
    }
}

internal sealed class UpdateOrderStatusCommandHandler : IRequestHandler<UpdateOrderStatusCommand, Result<OrderDto>>
{
    private readonly IOrderRepository _orderRepository;
    private readonly ISalesUnitOfWork _unitOfWork;

    public UpdateOrderStatusCommandHandler(
        IOrderRepository orderRepository,
        ISalesUnitOfWork unitOfWork)
    {
        _orderRepository = orderRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<OrderDto>> Handle(UpdateOrderStatusCommand request, CancellationToken cancellationToken)
    {
        var order = await _orderRepository.GetByIdAsync(new OrderId(request.Id), cancellationToken);
        if (order is null)
        {
            return Result.Failure<OrderDto>(Error.NotFound("Order.NotFound", $"No se encontró el pedido '{request.Id}'."));
        }

        var result = order.ChangeStatus(request.NewStatus, DateTime.UtcNow);
        if (result.IsFailure)
        {
            return Result.Failure<OrderDto>(result.Error);
        }

        _orderRepository.Update(order);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

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
