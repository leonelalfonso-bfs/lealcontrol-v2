using System;
using System.Linq;
using System.Threading.Tasks;
using LealControl.Modules.Sales.Domain.Products;
using LealControl.Modules.Sales.Infrastructure.Persistence;
using LealControl.QA.Infrastructure;
using LealControl.QA.Models;
using Microsoft.EntityFrameworkCore;

namespace LealControl.QA.Auditors;

public sealed class StockAuditor : IQaAuditor
{
    public string Name => "Stock Auditor";
    public string Module => "Stock";

    public async Task AuditProductStockAsync(QaTestContext context, QaScenarioResult scenario, Guid productId, decimal expectedFinalStock)
    {
        var salesDb = context.GetService<SalesDbContext>();
        var tenantId = context.TenantId;

        // 1. Fetch physical stock item
        var stockItem = await salesDb.StockItems.AsNoTracking().FirstOrDefaultAsync(s => s.TenantId == tenantId && s.ProductId == productId);

        var actualPhysicalStock = stockItem?.PhysicalStock ?? 0m;
        scenario.AddCheck(
            name: "Stock físico en depósito coincide con valor esperado",
            module: Module,
            condition: actualPhysicalStock == expectedFinalStock,
            expected: expectedFinalStock.ToString("G29"),
            actual: actualPhysicalStock.ToString("G29"),
            message: $"El stock físico registrado ({actualPhysicalStock}) debe ser igual al valor esperado ({expectedFinalStock}).",
            entity: "StockItem",
            entityId: productId.ToString());

        // 2. Fetch product catalog stock
        var product = await salesDb.Products.AsNoTracking().FirstOrDefaultAsync(p => p.TenantId == tenantId && p.Id == new ProductId(productId));

        var actualCatalogStock = product?.Stock ?? 0m;
        scenario.AddCheck(
            name: "Stock de catálogo del producto coincide con stock físico",
            module: Module,
            condition: actualCatalogStock == actualPhysicalStock,
            expected: actualPhysicalStock.ToString("G29"),
            actual: actualCatalogStock.ToString("G29"),
            message: $"El stock en catálogo ({actualCatalogStock}) debe sincronizarse exactamente con el stock en depósito ({actualPhysicalStock}).",
            entity: "Product",
            entityId: productId.ToString());

        // 3. Reconstruct stock strictly from immutable kardex movements
        var movements = await salesDb.StockMovements
            .Where(m => m.TenantId == tenantId && m.ProductId == productId)
            .OrderBy(m => m.CreatedAtUtc)
            .ToListAsync();

        var reconstructedStock = movements.Sum(m => m.Quantity);
        scenario.AddCheck(
            name: "Reconstrucción matemática por movimientos (Kardex)",
            module: Module,
            condition: reconstructedStock == expectedFinalStock,
            expected: expectedFinalStock.ToString("G29"),
            actual: reconstructedStock.ToString("G29"),
            message: $"La sumatoria de movimientos ({reconstructedStock}) debe reconstruir con precisión el stock final ({expectedFinalStock}). Total movimientos: {movements.Count}",
            entity: "StockMovement",
            entityId: productId.ToString());
    }
}

