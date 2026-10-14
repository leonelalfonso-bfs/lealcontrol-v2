using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Results;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Sales.Application.Inventory;
using LealControl.Modules.Sales.Domain.Inventory;
using LealControl.Modules.Sales.Domain.Products;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Sales.Infrastructure.Persistence;

/// <summary>
/// Salida de stock por consumo, con el mismo libro de movimientos que el remito. Solo mueve
/// productos con control de stock; los servicios y los productos sin control se ignoran.
/// </summary>
internal sealed class StockConsumptionHandler(SalesDbContext dbContext, ITenantContext tenantContext)
    : IRequestHandler<ConsumeStockCommand, Result<int>>
{
    public const string MovementType = "Consumption";

    public async Task<Result<int>> Handle(ConsumeStockCommand request, CancellationToken cancellationToken)
    {
        var tenantId = tenantContext.TenantId;
        if (request.Items.Any(i => i.Quantity <= 0))
            return Result<int>.Failure(Error.Validation("Sales.Stock.InvalidQuantity", "Las cantidades consumidas tienen que ser positivas."));

        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        // Una referencia (por ejemplo, una orden de servicio) se descuenta una sola vez.
        if (await dbContext.StockMovements.AnyAsync(m => m.TenantId == tenantId && m.ReferenceId == request.ReferenceId
                && m.ReferenceType == request.ReferenceType && m.MovementType == MovementType, cancellationToken))
            return Result<int>.Success(0);

        var warehouse = await dbContext.Warehouses.FirstOrDefaultAsync(w => w.TenantId == tenantId && w.Type == WarehouseType.MainWarehouse, cancellationToken)
            ?? await dbContext.Warehouses.FirstOrDefaultAsync(w => w.TenantId == tenantId, cancellationToken);

        var moved = 0;
        foreach (var item in request.Items.GroupBy(i => i.ProductId)
                     .Select(g => new ConsumeStockItem(g.Key, g.Sum(i => i.Quantity),
                         string.Join(", ", g.Select(i => i.SerialNumbers).Where(s => !string.IsNullOrWhiteSpace(s))))))
        {
            var product = await dbContext.Products.FirstOrDefaultAsync(p => p.Id == new ProductId(item.ProductId) && p.TenantId == tenantId, cancellationToken);
            if (product is null)
                return Result<int>.Failure(Error.NotFound("Sales.Stock.ProductNotFound", "Un producto consumido no existe."));
            if (!product.TrackStock || product.Type == ProductType.Service) continue;

            var stock = await dbContext.StockItems.FirstOrDefaultAsync(s => s.ProductId == item.ProductId && s.TenantId == tenantId
                && (warehouse == null || s.WarehouseId == warehouse.Id || s.WarehouseId == null), cancellationToken);
            if (stock is null)
            {
                stock = StockItem.Create(tenantId, item.ProductId, 0, 0, "Depósito Central", warehouse?.Id, warehouse?.Name);
                dbContext.StockItems.Add(stock);
            }

            var previous = stock.PhysicalStock;
            stock.AdjustStock(previous - item.Quantity, stock.MinimumStock, warehouse?.Name ?? "Depósito Central");
            product.AdjustStock(-item.Quantity);
            dbContext.StockMovements.Add(StockMovement.Create(
                tenantId, item.ProductId, MovementType, -item.Quantity, previous, stock.PhysicalStock,
                warehouse?.Id, warehouse?.Name, null, null,
                string.IsNullOrWhiteSpace(item.SerialNumbers) ? null : item.SerialNumbers, null,
                request.ReferenceId, request.ReferenceType, request.ReferenceNumber,
                request.OperatorName ?? "Consumo", request.Notes));
            moved++;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return Result<int>.Success(moved);
    }
}
