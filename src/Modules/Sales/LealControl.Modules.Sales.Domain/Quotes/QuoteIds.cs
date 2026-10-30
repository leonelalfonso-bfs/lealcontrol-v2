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
    // Valor propio: antes compartía el 3 con Aceptado y un presupuesto con pedido seguía ofreciendo "Generar pedido".
    Ordered = 7,
    Rejected = 4,
    Expired = 5,
    Cancelled = 6
}
