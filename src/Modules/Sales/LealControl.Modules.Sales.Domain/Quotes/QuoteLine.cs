using LealControl.BuildingBlocks.Results;

namespace LealControl.Modules.Sales.Domain.Quotes;

public sealed class QuoteLine
{
    private QuoteLine()
    {
    }

    private QuoteLine(
        QuoteLineId id,
        string description,
        decimal quantity,
        decimal unitPrice,
        decimal discountPercent,
        decimal taxRate,
        bool isOptional,
        string currencyCode,
        string? technicalDetail)
    {
        Id = id;
        Description = description;
        Quantity = quantity;
        UnitPrice = unitPrice;
        DiscountPercent = discountPercent;
        TaxRate = taxRate;
        IsOptional = isOptional;
        CurrencyCode = currencyCode;
        TechnicalDetail = string.IsNullOrWhiteSpace(technicalDetail) ? null : technicalDetail.Trim();
    }

    public QuoteLineId Id { get; private set; }

    public Guid? ProductId { get; private set; }

    public string Description { get; private set; } = string.Empty;

    public decimal Quantity { get; private set; }

    public decimal UnitPrice { get; private set; }

    public decimal DiscountPercent { get; private set; }

    public decimal TaxRate { get; private set; }

    public bool IsOptional { get; private set; }

    public string CurrencyCode { get; private set; } = "ARS";

    public string? TechnicalDetail { get; private set; }

    public decimal LineSubtotal
    {
        get
        {
            var gross = Quantity * UnitPrice;
            var discounted = gross * (1m - DiscountPercent / 100m);
            return Math.Round(discounted, 2, MidpointRounding.AwayFromZero);
        }
    }

    public static Result<QuoteLine> Create(
        string description,
        decimal quantity,
        decimal unitPrice,
        decimal discountPercent = 0m,
        decimal taxRate = 21m,
        bool isOptional = false,
        string? currencyCode = null,
        Guid? productId = null,
        string? technicalDetail = null)
    {
        if (string.IsNullOrWhiteSpace(description))
        {
            return Result<QuoteLine>.Failure(SalesErrors.LineDescriptionRequired);
        }

        if (quantity <= 0)
        {
            return Result<QuoteLine>.Failure(SalesErrors.InvalidQuantity);
        }

        var line = new QuoteLine(
            QuoteLineId.New(),
            description.Trim(),
            quantity,
            Math.Max(0, unitPrice),
            Math.Clamp(discountPercent, 0, 100),
            Math.Clamp(taxRate, 0, 100),
            isOptional,
            string.IsNullOrWhiteSpace(currencyCode) ? "ARS" : currencyCode.Trim().ToUpperInvariant(),
            technicalDetail)
        {
            ProductId = productId
        };

        return Result<QuoteLine>.Success(line);
    }
}
