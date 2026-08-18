using System;
using System.Collections.Generic;
using System.Linq;
using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Results;
using LealControl.BuildingBlocks.Tenancy;

namespace LealControl.Modules.Sales.Domain.Orders;

public sealed class Order : AggregateRoot<OrderId>
{
    private readonly List<OrderLine> _lines = [];

    private Order()
    {
    }

    private Order(
        OrderId id,
        TenantId tenantId,
        string orderNumber,
        Guid customerId,
        DateTime createdAtUtc)
        : base(id)
    {
        TenantId = tenantId;
        OrderNumber = orderNumber;
        CustomerId = customerId;
        Status = OrderStatus.Draft;
        Currency = "ARS";
        CreatedAtUtc = createdAtUtc;
        UpdatedAtUtc = createdAtUtc;
    }

    public TenantId TenantId { get; private set; }

    public string OrderNumber { get; private set; } = string.Empty;

    public Guid? QuoteId { get; private set; }

    public string? QuoteNumber { get; private set; }

    public Guid CustomerId { get; private set; }

    public Guid? LocationId { get; private set; }

    public Guid? ContactId { get; private set; }

    public Guid? OpportunityId { get; private set; }

    public OrderStatus Status { get; private set; }

    public string Currency { get; private set; } = "ARS";

    public decimal ExchangeRateUsdBillete { get; private set; } = 1510.00m;

    public decimal ExchangeRateUsdDivisa { get; private set; } = 1487.50m;

    public decimal DiscountPercent { get; private set; }

    public decimal Subtotal { get; private set; }

    public decimal Total { get; private set; }

    public string? PaymentTerms { get; private set; }

    public string? PaymentMethod { get; private set; }

    public int? DeliveryTimeDays { get; private set; }

    public string? Transportation { get; private set; }

    public string? Warranty { get; private set; }

    public string? Notes { get; private set; }

    public string? OwnerName { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    public DateTime UpdatedAtUtc { get; private set; }

    public IReadOnlyCollection<OrderLine> Lines => _lines.AsReadOnly();

    public static Order Create(
        TenantId tenantId,
        string orderNumber,
        Guid customerId,
        DateTime createdAtUtc,
        Guid? quoteId = null,
        string? quoteNumber = null,
        Guid? locationId = null,
        Guid? contactId = null,
        Guid? opportunityId = null,
        string currency = "ARS",
        decimal exchangeRateUsdBillete = 1510.00m,
        decimal exchangeRateUsdDivisa = 1487.50m,
        decimal discountPercent = 0m,
        string? paymentTerms = null,
        string? paymentMethod = null,
        int? deliveryTimeDays = null,
        string? transportation = null,
        string? warranty = null,
        string? notes = null,
        string? ownerName = null,
        OrderStatus initialStatus = OrderStatus.Draft)
    {
        var order = new Order(OrderId.New(), tenantId, orderNumber, customerId, createdAtUtc)
        {
            QuoteId = quoteId,
            QuoteNumber = quoteNumber,
            LocationId = locationId,
            ContactId = contactId,
            OpportunityId = opportunityId,
            Currency = string.IsNullOrWhiteSpace(currency) ? "ARS" : currency,
            ExchangeRateUsdBillete = exchangeRateUsdBillete > 0 ? exchangeRateUsdBillete : 1510.00m,
            ExchangeRateUsdDivisa = exchangeRateUsdDivisa > 0 ? exchangeRateUsdDivisa : 1487.50m,
            DiscountPercent = discountPercent,
            PaymentTerms = paymentTerms,
            PaymentMethod = paymentMethod,
            DeliveryTimeDays = deliveryTimeDays,
            Transportation = transportation,
            Warranty = warranty,
            Notes = notes,
            OwnerName = ownerName,
            Status = initialStatus
        };

        return order;
    }

    public void AddLine(
        Guid? productId,
        string description,
        decimal quantity,
        decimal unitPrice,
        string currencyCode,
        decimal discountPercent,
        decimal taxRate,
        bool isOptional = false)
    {
        var line = new OrderLine(
            OrderLineId.New(),
            productId,
            description,
            quantity,
            unitPrice,
            currencyCode,
            discountPercent,
            taxRate,
            isOptional);

        _lines.Add(line);
        RecalculateTotals();
    }

    public void UpdateHeader(
        Guid customerId,
        Guid? locationId,
        Guid? contactId,
        Guid? opportunityId,
        string currency,
        decimal exchangeRateUsdBillete,
        decimal exchangeRateUsdDivisa,
        decimal discountPercent,
        string? paymentTerms,
        string? paymentMethod,
        int? deliveryTimeDays,
        string? transportation,
        string? warranty,
        string? notes,
        string? ownerName,
        DateTime updatedAtUtc)
    {
        CustomerId = customerId;
        LocationId = locationId;
        ContactId = contactId;
        OpportunityId = opportunityId;
        Currency = string.IsNullOrWhiteSpace(currency) ? "ARS" : currency;
        ExchangeRateUsdBillete = exchangeRateUsdBillete > 0 ? exchangeRateUsdBillete : 1510.00m;
        ExchangeRateUsdDivisa = exchangeRateUsdDivisa > 0 ? exchangeRateUsdDivisa : 1487.50m;
        DiscountPercent = discountPercent;
        PaymentTerms = paymentTerms;
        PaymentMethod = paymentMethod;
        DeliveryTimeDays = deliveryTimeDays;
        Transportation = transportation;
        Warranty = warranty;
        Notes = notes;
        OwnerName = ownerName;
        UpdatedAtUtc = updatedAtUtc;

        RecalculateTotals();
    }

    public Result ChangeStatus(OrderStatus newStatus, DateTime updatedAtUtc)
    {
        if (Status == newStatus)
        {
            return Result.Success();
        }

        var canCancel = Status is OrderStatus.Draft or OrderStatus.Confirmed or OrderStatus.InPreparation;
        var validTransition = (Status == OrderStatus.Draft && newStatus == OrderStatus.Confirmed)
            || (Status == OrderStatus.Confirmed && newStatus == OrderStatus.InPreparation)
            || (Status == OrderStatus.InPreparation && newStatus == OrderStatus.Dispatched)
            || (Status == OrderStatus.Dispatched && newStatus == OrderStatus.Delivered)
            || (Status == OrderStatus.Delivered && newStatus == OrderStatus.Invoiced)
            || (newStatus == OrderStatus.Cancelled && canCancel);

        if (!validTransition)
        {
            return Result.Failure(Error.Validation(
                "Sales.Order.InvalidTransition",
                "El pedido debe avanzar respetando confirmación, preparación, despacho, entrega y facturación."));
        }

        Status = newStatus;
        UpdatedAtUtc = updatedAtUtc;
        return Result.Success();
    }

    public void RecalculateTotals()
    {
        var activeLines = _lines.Where(l => !l.IsOptional).ToList();
        Subtotal = Math.Round(activeLines.Sum(l => l.LineSubtotal), 2);
        var globalDiscount = Subtotal * (DiscountPercent / 100m);
        var subtotalAfterDiscount = Subtotal - globalDiscount;

        var taxTotal = activeLines.Sum(l =>
        {
            var lineDiscount = l.LineSubtotal * (DiscountPercent / 100m);
            var lineNet = l.LineSubtotal - lineDiscount;
            return lineNet * (l.TaxRate / 100m);
        });

        Total = Math.Round(subtotalAfterDiscount + taxTotal, 2);
    }
}
