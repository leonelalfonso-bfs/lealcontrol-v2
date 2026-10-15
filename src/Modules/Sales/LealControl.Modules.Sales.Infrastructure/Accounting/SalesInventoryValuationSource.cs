using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Accounting.Contracts.Inventory;
using LealControl.Modules.Sales.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Sales.Infrastructure.Accounting;

/// <summary>
/// Existencias a una fecha: el stock de hoy menos lo que se movió después, valuado al último costo de
/// compra en pesos (precio de la última factura de proveedor del producto hasta esa fecha). Sin compras,
/// el costo cargado en el producto.
/// </summary>
internal sealed class SalesInventoryValuationSource(SalesDbContext db, ITenantContext tenant) : IInventoryValuationSource
{
    public async Task<IReadOnlyList<InventoryValuationLine>> ValueAsync(DateTime untilUtc, decimal? usdRate, CancellationToken cancellationToken = default)
    {
        var tenantId = tenant.TenantId;
        var products = await db.Products.AsNoTracking()
            .Where(p => p.TenantId == tenantId && p.TrackStock)
            .Select(p => new { p.Id, p.Code, p.Name, p.CostPrice, p.PurchaseCurrency })
            .ToListAsync(cancellationToken);
        var current = await db.StockItems.AsNoTracking()
            .Where(s => s.TenantId == tenantId)
            .GroupBy(s => s.ProductId)
            .Select(g => new { ProductId = g.Key, Quantity = g.Sum(s => s.PhysicalStock) })
            .ToDictionaryAsync(x => x.ProductId, x => x.Quantity, cancellationToken);
        var after = await db.StockMovements.AsNoTracking()
            .Where(m => m.TenantId == tenantId && m.CreatedAtUtc > untilUtc)
            .GroupBy(m => m.ProductId)
            .Select(g => new { ProductId = g.Key, Quantity = g.Sum(m => m.Quantity) })
            .ToDictionaryAsync(x => x.ProductId, x => x.Quantity, cancellationToken);

        // Último precio de compra de cada producto hasta la fecha (facturas, no notas de crédito), en pesos.
        var purchases = await db.PurchaseInvoices.AsNoTracking()
            .Where(i => i.TenantId == tenantId && i.Status != "Cancelled" && i.IssueDate <= untilUtc && !i.InvoiceType.StartsWith("NC"))
            .SelectMany(i => i.Items.Where(x => x.ProductId != null && x.UnitPrice > 0m)
                .Select(x => new { ProductId = x.ProductId!.Value, i.IssueDate, i.CreatedAtUtc, x.UnitPrice, i.Currency, i.ExchangeRate }))
            .ToListAsync(cancellationToken);
        var lastCost = purchases
            .GroupBy(p => p.ProductId)
            .ToDictionary(g => g.Key, g =>
            {
                var last = g.OrderByDescending(p => p.IssueDate).ThenByDescending(p => p.CreatedAtUtc).First();
                return last.Currency == "ARS" ? last.UnitPrice : last.UnitPrice * (last.ExchangeRate > 0m ? last.ExchangeRate : 1m);
            });

        var lines = new List<InventoryValuationLine>();
        foreach (var p in products)
        {
            var id = p.Id.Value;
            var quantity = current.GetValueOrDefault(id) - after.GetValueOrDefault(id);
            if (quantity == 0m) continue;
            decimal unitCost;
            string source;
            if (lastCost.TryGetValue(id, out var purchaseCost))
                (unitCost, source) = (purchaseCost, "LastPurchase");
            else if (p.CostPrice > 0m && p.PurchaseCurrency == CurrencyCode.ARS)
                (unitCost, source) = (p.CostPrice, "ProductCost");
            else if (p.CostPrice > 0m && usdRate is > 1m)
                (unitCost, source) = (p.CostPrice * usdRate.Value, "ProductCost");
            else
                (unitCost, source) = (0m, "Missing");
            unitCost = Math.Round(unitCost, 4, MidpointRounding.AwayFromZero);
            lines.Add(new InventoryValuationLine(id, p.Code, p.Name, quantity, unitCost,
                Math.Round(quantity * unitCost, 2, MidpointRounding.AwayFromZero), source));
        }
        return lines.OrderBy(l => l.Code).ToList();
    }
}
