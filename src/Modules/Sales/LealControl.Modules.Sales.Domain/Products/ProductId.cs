using System;

namespace LealControl.Modules.Sales.Domain.Products;

public readonly record struct ProductId(Guid Value)
{
    public static ProductId New() => new(Guid.NewGuid());

    public static ProductId Empty => new(Guid.Empty);
}

public readonly record struct CategoryId(Guid Value)
{
    public static CategoryId New() => new(Guid.NewGuid());

    public static CategoryId Empty => new(Guid.Empty);
}
