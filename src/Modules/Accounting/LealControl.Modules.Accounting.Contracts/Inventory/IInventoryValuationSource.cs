namespace LealControl.Modules.Accounting.Contracts.Inventory;

/// <summary>
/// Existencias valuadas a una fecha, para el costo de ventas por diferencia de inventario. Lo implementa
/// Inventario: cantidad en stock a esa fecha por el último costo de compra en pesos.
/// </summary>
public interface IInventoryValuationSource
{
    /// <param name="untilUtc">Fin del día de la valuación.</param>
    /// <param name="usdRate">Cotización para los productos cuyo único costo está en dólares (opcional).</param>
    Task<IReadOnlyList<InventoryValuationLine>> ValueAsync(DateTime untilUtc, decimal? usdRate, CancellationToken cancellationToken = default);
}

/// <summary>
/// Un producto valuado. <see cref="CostSource"/>: "LastPurchase" (última factura de compra), "ProductCost"
/// (costo cargado en el producto) o "Missing" (sin costo: vale cero y se avisa).
/// </summary>
public sealed record InventoryValuationLine(
    Guid ProductId, string Code, string Name, decimal Quantity, decimal UnitCostArs, decimal ValueArs, string CostSource);
