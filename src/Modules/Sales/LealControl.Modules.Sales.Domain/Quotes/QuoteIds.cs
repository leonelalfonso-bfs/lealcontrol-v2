namespace LealControl.Modules.Sales.Domain.Quotes;

public readonly record struct QuoteId(Guid Value)
{
    public static QuoteId New() => new(Guid.NewGuid());
}

public readonly record struct QuoteLineId(Guid Value)
{
    public static QuoteLineId New() => new(Guid.NewGuid());
}

public enum QuoteStatus
{
    Draft = 1,
    Sent = 2,
    Accepted = 3,
    Ordered = 3,
    Rejected = 4,
    Expired = 5
}
