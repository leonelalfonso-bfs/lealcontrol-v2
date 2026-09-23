using System;
using System.Collections.Generic;
using System.Linq;
using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Results;
using LealControl.BuildingBlocks.Tenancy;

namespace LealControl.Modules.Sales.Domain.Quotes;

public sealed class Quote : AggregateRoot<QuoteId>
{
    private readonly List<QuoteLine> _lines = [];

    private Quote()
    {
    }

    private Quote(
        QuoteId id,
        TenantId tenantId,
        string quoteNumber,
        Guid customerId,
        DateTime createdAtUtc)
        : base(id)
    {
        TenantId = tenantId;
        QuoteNumber = quoteNumber;
        CustomerId = customerId;
        Status = QuoteStatus.Draft;
        Revision = 1;
        Currency = "ARS";
        ValidDays = 15;
        CreatedAtUtc = createdAtUtc;
        UpdatedAtUtc = createdAtUtc;
    }

    public TenantId TenantId { get; private set; }

    public string QuoteNumber { get; private set; } = string.Empty;

    public int Revision { get; private set; }

    public Guid CustomerId { get; private set; }

    public Guid? LocationId { get; private set; }

    public Guid? ContactId { get; private set; }

    public Guid? OpportunityId { get; private set; }

    public QuoteStatus Status { get; private set; }

    public string Currency { get; private set; } = "ARS";

    public decimal ExchangeRateUsdBillete { get; private set; } = 1510.00m;

    public decimal ExchangeRateUsdDivisa { get; private set; } = 1487.50m;

    public decimal DiscountPercent { get; private set; }

    public decimal Subtotal => Math.Round(_lines.Where(l => !l.IsOptional).Sum(l => l.LineSubtotal), 2);

    public decimal Total => Math.Round(Subtotal * (1 - DiscountPercent / 100m) + TaxTotal, 2);

    public decimal TaxTotal => Math.Round(_lines.Where(l => !l.IsOptional).Sum(l => (l.LineSubtotal * (1 - DiscountPercent / 100m)) * (l.TaxRate / 100m)), 2);

    public int ValidDays { get; private set; }

    public string? PaymentTerms { get; private set; }

    public string? PaymentMethod { get; private set; }

    public int? DeliveryTimeDays { get; private set; }

    public string? Transportation { get; private set; }

    public string? Warranty { get; private set; }

    public string? Notes { get; private set; }

    public string? OwnerName { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    public DateTime UpdatedAtUtc { get; private set; }

    public bool IsEditable => Status == QuoteStatus.Draft || Status == QuoteStatus.Sent;

    public IReadOnlyCollection<QuoteLine> Lines => _lines.AsReadOnly();

    public static Result<Quote> Draft(
        TenantId tenantId,
        string quoteNumber,
        Guid customerId,
        Guid? opportunityId,
        string? currency,
        string? notes,
        string? ownerName,
        int validDays,
        DateTime utcNow,
        Guid? locationId = null,
        Guid? contactId = null,
        decimal exchangeRateUsdBillete = 1510.00m,
        decimal exchangeRateUsdDivisa = 1487.50m,
        decimal discountPercent = 0m,
        string? paymentTerms = null,
        string? paymentMethod = null,
        int? deliveryTimeDays = null,
        string? transportation = null,
        string? warranty = null)
    {
        if (customerId == Guid.Empty)
        {
            return Result.Failure<Quote>(SalesErrors.QuoteCustomerRequired);
        }

        var quote = new Quote(QuoteId.New(), tenantId, quoteNumber, customerId, utcNow)
        {
            OpportunityId = opportunityId,
            Currency = string.IsNullOrWhiteSpace(currency) ? "ARS" : currency.Trim().ToUpperInvariant(),
            Notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim(),
            OwnerName = string.IsNullOrWhiteSpace(ownerName) ? null : ownerName.Trim(),
            ValidDays = validDays <= 0 ? 15 : validDays,
            LocationId = locationId,
            ContactId = contactId,
            ExchangeRateUsdBillete = exchangeRateUsdBillete <= 0 ? 1510.00m : exchangeRateUsdBillete,
            ExchangeRateUsdDivisa = exchangeRateUsdDivisa <= 0 ? 1487.50m : exchangeRateUsdDivisa,
            DiscountPercent = Math.Clamp(discountPercent, 0, 100),
            PaymentTerms = string.IsNullOrWhiteSpace(paymentTerms) ? null : paymentTerms.Trim(),
            PaymentMethod = string.IsNullOrWhiteSpace(paymentMethod) ? null : paymentMethod.Trim(),
            DeliveryTimeDays = deliveryTimeDays,
            Transportation = string.IsNullOrWhiteSpace(transportation) ? null : transportation.Trim(),
            Warranty = string.IsNullOrWhiteSpace(warranty) ? null : warranty.Trim()
        };

        return Result<Quote>.Success(quote);
    }

    public Result UpdateDetails(
        Guid customerId,
        Guid? locationId,
        Guid? contactId,
        string currency,
        decimal exchangeRateUsdBillete,
        decimal exchangeRateUsdDivisa,
        decimal discountPercent,
        int validDays,
        string? paymentTerms,
        string? paymentMethod,
        int? deliveryTimeDays,
        string? transportation,
        string? warranty,
        string? notes,
        string? ownerName,
        DateTime utcNow)
    {
        if (!IsEditable)
        {
            return Result.Failure(SalesErrors.QuoteNotEditable);
        }

        if (customerId == Guid.Empty)
        {
            return Result.Failure(SalesErrors.QuoteCustomerRequired);
        }

        CustomerId = customerId;
        LocationId = locationId;
        ContactId = contactId;
        Currency = string.IsNullOrWhiteSpace(currency) ? "ARS" : currency.Trim().ToUpperInvariant();
        ExchangeRateUsdBillete = exchangeRateUsdBillete <= 0 ? 1510.00m : exchangeRateUsdBillete;
        ExchangeRateUsdDivisa = exchangeRateUsdDivisa <= 0 ? 1487.50m : exchangeRateUsdDivisa;
        DiscountPercent = Math.Clamp(discountPercent, 0, 100);
        ValidDays = validDays <= 0 ? 15 : validDays;
        PaymentTerms = string.IsNullOrWhiteSpace(paymentTerms) ? null : paymentTerms.Trim();
        PaymentMethod = string.IsNullOrWhiteSpace(paymentMethod) ? null : paymentMethod.Trim();
        DeliveryTimeDays = deliveryTimeDays;
        Transportation = string.IsNullOrWhiteSpace(transportation) ? null : transportation.Trim();
        Warranty = string.IsNullOrWhiteSpace(warranty) ? null : warranty.Trim();
        Notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim();
        OwnerName = string.IsNullOrWhiteSpace(ownerName) ? null : ownerName.Trim();
        UpdatedAtUtc = utcNow;

        return Result.Success();
    }

    public Result ClearLines()
    {
        if (!IsEditable)
        {
            return Result.Failure(SalesErrors.QuoteNotEditable);
        }

        _lines.Clear();
        return Result.Success();
    }

    public Result AddLine(
        string description,
        decimal quantity,
        decimal unitPrice,
        DateTime utcNow,
        decimal discountPercent = 0m,
        decimal taxRate = 21m,
        bool isOptional = false,
        Guid? productId = null)
    {
        if (!IsEditable)
        {
            return Result.Failure(SalesErrors.QuoteNotEditable);
        }

        var line = QuoteLine.Create(
            description,
            quantity,
            unitPrice,
            discountPercent,
            taxRate,
            isOptional,
            Currency,
            productId);

        if (line.IsFailure)
        {
            return Result.Failure(line.Error);
        }

        _lines.Add(line.Value);
        UpdatedAtUtc = utcNow;
        return Result.Success();
    }

    public Result MarkSent(DateTime utcNow)
    {
        if (Status != QuoteStatus.Draft)
        {
            return Result.Failure(SalesErrors.QuoteNotEditable);
        }

        Status = QuoteStatus.Sent;
        UpdatedAtUtc = utcNow;
        return Result.Success();
    }

    public Result AcceptAndWin(DateTime utcNow)
    {
        if (!IsEditable)
        {
            return Result.Failure(SalesErrors.QuoteNotEditable);
        }

        Status = QuoteStatus.Accepted;
        UpdatedAtUtc = utcNow;
        return Result.Success();
    }

    public Result MarkOrdered(DateTime utcNow)
    {
        Status = QuoteStatus.Ordered;
        UpdatedAtUtc = utcNow;
        return Result.Success();
    }

    public Result Reject(DateTime utcNow)
    {
        if (!IsEditable)
        {
            return Result.Failure(SalesErrors.QuoteNotEditable);
        }

        Status = QuoteStatus.Rejected;
        UpdatedAtUtc = utcNow;
        return Result.Success();
    }

    public Result Cancel(DateTime utcNow)
    {
        if (Status == QuoteStatus.Cancelled)
        {
            return Result.Failure(SalesErrors.QuoteAlreadyCancelled);
        }

        if (Status == QuoteStatus.Ordered)
        {
            return Result.Failure(SalesErrors.QuoteHasSalesOrder);
        }

        Status = QuoteStatus.Cancelled;
        UpdatedAtUtc = utcNow;
        return Result.Success();
    }
}
