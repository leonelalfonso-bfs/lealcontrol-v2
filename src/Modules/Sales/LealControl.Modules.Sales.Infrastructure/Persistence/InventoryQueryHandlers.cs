using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Results;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Sales.Application.Inventory;
using LealControl.Modules.Sales.Domain.Inventory;
using LealControl.Modules.Sales.Domain.Products;
using LealControl.Modules.Sales.Domain.Purchases;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Sales.Infrastructure.Persistence;

internal sealed class InventoryQueryHandlers
    : IRequestHandler<ListWarehousesQuery, Result<IReadOnlyList<WarehouseDto>>>,
      IRequestHandler<CreateWarehouseCommand, Result<WarehouseDto>>,
      IRequestHandler<UpdateWarehouseCommand, Result<WarehouseDto>>,
      IRequestHandler<ListInventoryQuery, Result<IReadOnlyList<StockItemDto>>>,
      IRequestHandler<AdjustStockCommand, Result<StockItemDto>>,
      IRequestHandler<CreateStockTransferCommand, Result<StockTransferDto>>,
      IRequestHandler<ReceiveStockTransferCommand, Result<StockTransferDto>>,
      IRequestHandler<ListStockTransfersQuery, Result<IReadOnlyList<StockTransferDto>>>,
      IRequestHandler<ListKardexQuery, Result<IReadOnlyList<StockMovementDto>>>,
      IRequestHandler<GeneratePurchaseRequestFromStockCommand, Result<Guid>>,
      IRequestHandler<ListProductSuppliersQuery, Result<IReadOnlyList<ProductSupplierDto>>>,
      IRequestHandler<LinkProductSupplierCommand, Result<ProductSupplierDto>>
{
    private readonly SalesDbContext _dbContext;
    private readonly ITenantContext _tenantContext;

    public InventoryQueryHandlers(SalesDbContext dbContext, ITenantContext tenantContext)
    {
        _dbContext = dbContext;
        _tenantContext = tenantContext;
    }

    private async Task EnsureDefaultWarehousesAsync(TenantId tenantId, CancellationToken cancellationToken)
    {
        var existing = await _dbContext.Warehouses.AnyAsync(w => w.TenantId == tenantId, cancellationToken);
        if (!existing)
        {
            _dbContext.Warehouses.AddRange(
                Warehouse.Create(tenantId, "DEP-01", "Casa Central - Almacén Principal", WarehouseType.MainWarehouse, "Casa Matriz - San Lorenzo", null),
                Warehouse.Create(tenantId, "LAB-01", "Taller & Laboratorio Metrológico", WarehouseType.Workshop, "Sector Calibraciones", null),
                Warehouse.Create(tenantId, "MOV-01", "Móvil Técnico 1 - Furgón Sprinter", WarehouseType.MobileUnit, "Patente AF-123-JK", "Técnico Metrología 1")
            );
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
    }

    public async Task<Result<IReadOnlyList<WarehouseDto>>> Handle(ListWarehousesQuery request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        await EnsureDefaultWarehousesAsync(tenantId, cancellationToken);

        var warehouses = await _dbContext.Warehouses
            .AsNoTracking()
            .Where(w => w.TenantId == tenantId)
            .OrderBy(w => w.Code)
            .ToListAsync(cancellationToken);

        var dtos = warehouses.Select(w => new WarehouseDto(
            w.Id,
            w.Code,
            w.Name,
            w.Type.ToString(),
            w.Address,
            w.AssignedTechnicianName,
            w.IsActive,
            w.CreatedAtUtc)).ToList();

        return Result<IReadOnlyList<WarehouseDto>>.Success(dtos);
    }

    public async Task<Result<WarehouseDto>> Handle(CreateWarehouseCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        if (string.IsNullOrWhiteSpace(request.Code) || string.IsNullOrWhiteSpace(request.Name))
        {
            return Result<WarehouseDto>.Failure(Error.Validation("Sales.Warehouse.Invalid", "El código y el nombre del depósito son obligatorios."));
        }

        if (!Enum.TryParse<WarehouseType>(request.Type, true, out var type))
        {
            type = WarehouseType.MainWarehouse;
        }

        var warehouse = Warehouse.Create(
            tenantId,
            request.Code,
            request.Name,
            type,
            request.Address,
            request.AssignedTechnicianName);

        _dbContext.Warehouses.Add(warehouse);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return Result<WarehouseDto>.Success(new WarehouseDto(
            warehouse.Id,
            warehouse.Code,
            warehouse.Name,
            warehouse.Type.ToString(),
            warehouse.Address,
            warehouse.AssignedTechnicianName,
            warehouse.IsActive,
            warehouse.CreatedAtUtc));
    }

    public async Task<Result<WarehouseDto>> Handle(UpdateWarehouseCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var warehouse = await _dbContext.Warehouses.FirstOrDefaultAsync(w => w.Id == request.Id && w.TenantId == tenantId, cancellationToken);
        if (warehouse == null) return Result<WarehouseDto>.Failure(Error.NotFound("Sales.Warehouse.NotFound", "Depósito no encontrado."));

        if (!Enum.TryParse<WarehouseType>(request.Type, true, out var type))
        {
            type = warehouse.Type;
        }

        warehouse.Update(request.Code, request.Name, type, request.Address, request.AssignedTechnicianName, request.IsActive);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return Result<WarehouseDto>.Success(new WarehouseDto(
            warehouse.Id,
            warehouse.Code,
            warehouse.Name,
            warehouse.Type.ToString(),
            warehouse.Address,
            warehouse.AssignedTechnicianName,
            warehouse.IsActive,
            warehouse.CreatedAtUtc));
    }

    public async Task<Result<IReadOnlyList<StockItemDto>>> Handle(ListInventoryQuery request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        await EnsureDefaultWarehousesAsync(tenantId, cancellationToken);

        var products = await _dbContext.Products
            .AsNoTracking()
            .Where(p => p.TenantId == tenantId)
            .OrderBy(p => p.Name)
            .ToListAsync(cancellationToken);

        var stockItems = await _dbContext.StockItems
            .AsNoTracking()
            .Where(s => s.TenantId == tenantId)
            .ToListAsync(cancellationToken);

        var defaultWarehouse = await _dbContext.Warehouses
            .AsNoTracking()
            .FirstOrDefaultAsync(w => w.TenantId == tenantId && w.Type == WarehouseType.MainWarehouse, cancellationToken);

        var stockMap = stockItems.ToDictionary(s => s.ProductId);

        var list = new List<StockItemDto>();
        foreach (var p in products)
        {
            var pId = p.Id.Value;
            if (!stockMap.TryGetValue(pId, out var stock))
            {
                stock = StockItem.Create(
                    tenantId,
                    pId,
                    10,
                    2,
                    "Pasillo A - Estante 1",
                    defaultWarehouse?.Id,
                    defaultWarehouse?.Name ?? "Depósito Central");
                _dbContext.StockItems.Add(stock);
                await _dbContext.SaveChangesAsync(cancellationToken);
            }

            if (request.WarehouseId.HasValue && stock.WarehouseId.HasValue && stock.WarehouseId.Value != request.WarehouseId.Value)
            {
                continue;
            }

            var avail = stock.PhysicalStock - stock.ReservedStock;
            var status = avail <= 0 ? "OutStock" : avail <= stock.MinimumStock ? "LowStock" : "StockOK";

            if (!string.IsNullOrWhiteSpace(request.Search))
            {
                var s = request.Search.Trim().ToLower();
                if (!p.Name.ToLower().Contains(s) && !p.Code.ToLower().Contains(s)) continue;
            }

            if (!string.IsNullOrWhiteSpace(request.StatusFilter) && request.StatusFilter != "All")
            {
                if (status != request.StatusFilter) continue;
            }

            var isCostUsd = p.PurchaseCurrency is CurrencyCode.USD_BILLETE or CurrencyCode.USD_DIVISA;
            var isPriceUsd = p.SaleCurrency is CurrencyCode.USD_BILLETE or CurrencyCode.USD_DIVISA;
            var costArs = p.PurchaseCurrency == CurrencyCode.ARS ? p.CostPrice : 0;
            var costUsd = isCostUsd ? p.CostPrice : 0;
            var priceArs = p.SaleCurrency == CurrencyCode.ARS ? p.BasePrice : 0;
            var priceUsd = isPriceUsd ? p.BasePrice : 0;

            list.Add(new StockItemDto(
                stock.Id,
                pId,
                p.Code,
                p.Name,
                stock.WarehouseId,
                stock.WarehouseName,
                stock.PhysicalStock,
                stock.ReservedStock,
                avail,
                stock.IncomingStock,
                stock.ForecastedStock,
                stock.MinimumStock,
                stock.ReorderPoint,
                stock.WarehouseLocation,
                status,
                costArs,
                costUsd,
                priceArs,
                priceUsd,
                stock.UpdatedAtUtc));
        }

        return Result<IReadOnlyList<StockItemDto>>.Success(list);
    }

    public async Task<Result<StockItemDto>> Handle(AdjustStockCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var prodId = new ProductId(request.ProductId);
        var product = await _dbContext.Products.FirstOrDefaultAsync(p => p.Id == prodId && p.TenantId == tenantId, cancellationToken);
        if (product == null) return Result<StockItemDto>.Failure(Error.NotFound("Sales.Product.NotFound", "Producto no encontrado."));

        var stock = await _dbContext.StockItems.FirstOrDefaultAsync(s => s.ProductId == request.ProductId && s.TenantId == tenantId, cancellationToken);
        if (stock == null)
        {
            stock = StockItem.Create(tenantId, request.ProductId, request.NewPhysicalStock, request.MinimumStock, request.WarehouseLocation, request.WarehouseId, request.WarehouseName);
            _dbContext.StockItems.Add(stock);
        }

        var prevStock = stock.PhysicalStock;
        var diff = request.NewPhysicalStock - prevStock;
        stock.AdjustStock(request.NewPhysicalStock, request.MinimumStock, request.WarehouseLocation, request.WarehouseId, request.WarehouseName);

        var isCostUsd = product.PurchaseCurrency is CurrencyCode.USD_BILLETE or CurrencyCode.USD_DIVISA;
        var isPriceUsd = product.SaleCurrency is CurrencyCode.USD_BILLETE or CurrencyCode.USD_DIVISA;
        var costArs = product.PurchaseCurrency == CurrencyCode.ARS ? product.CostPrice : 0;
        var costUsd = isCostUsd ? product.CostPrice : 0;
        var priceArs = product.SaleCurrency == CurrencyCode.ARS ? product.BasePrice : 0;
        var priceUsd = isPriceUsd ? product.BasePrice : 0;

        var movement = StockMovement.Create(
            tenantId,
            request.ProductId,
            "PhysicalCountAdjustment",
            diff,
            prevStock,
            request.NewPhysicalStock,
            request.WarehouseId,
            request.WarehouseName ?? stock.WarehouseName,
            costArs,
            costUsd,
            request.SerialNumbers,
            request.LotNumber,
            null,
            "PhysicalCount",
            $"Ajuste Conteo Físico ({product.Code})",
            request.OperatorName ?? "Operador Logística",
            request.ReasonNotes ?? (diff >= 0 ? $"Sobrante de {diff} u. por recuento físico" : $"Faltante de {Math.Abs(diff)} u. por recuento físico"));

        _dbContext.StockMovements.Add(movement);
        await _dbContext.SaveChangesAsync(cancellationToken);

        var avail = stock.PhysicalStock - stock.ReservedStock;
        var status = avail <= 0 ? "OutStock" : avail <= stock.MinimumStock ? "LowStock" : "StockOK";

        return Result<StockItemDto>.Success(new StockItemDto(
            stock.Id,
            product.Id.Value,
            product.Code,
            product.Name,
            stock.WarehouseId,
            stock.WarehouseName,
            stock.PhysicalStock,
            stock.ReservedStock,
            avail,
            stock.IncomingStock,
            stock.ForecastedStock,
            stock.MinimumStock,
            stock.ReorderPoint,
            stock.WarehouseLocation,
            status,
            costArs,
            costUsd,
            priceArs,
            priceUsd,
            stock.UpdatedAtUtc));
    }

    public async Task<Result<StockTransferDto>> Handle(CreateStockTransferCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var origin = await _dbContext.Warehouses.FirstOrDefaultAsync(w => w.Id == request.OriginWarehouseId && w.TenantId == tenantId, cancellationToken);
        var destination = await _dbContext.Warehouses.FirstOrDefaultAsync(w => w.Id == request.DestinationWarehouseId && w.TenantId == tenantId, cancellationToken);

        if (origin == null || destination == null)
        {
            return Result<StockTransferDto>.Failure(Error.NotFound("Sales.Warehouse.NotFound", "Depósito de origen o destino no encontrado."));
        }

        if (origin.Id == destination.Id)
        {
            return Result<StockTransferDto>.Failure(Error.Validation("Sales.Transfer.SameWarehouse", "El depósito de origen y destino no pueden ser iguales."));
        }

        if (request.Items == null || request.Items.Count == 0)
        {
            return Result<StockTransferDto>.Failure(Error.Validation("Sales.Transfer.EmptyItems", "Debe incluir al menos un artículo en la transferencia."));
        }

        var count = await _dbContext.StockTransfers.CountAsync(t => t.TenantId == tenantId, cancellationToken) + 1;
        var transferNumber = $"TRF-{count:D5}";

        var transfer = StockTransfer.Create(
            tenantId,
            transferNumber,
            origin.Id,
            origin.Name,
            destination.Id,
            destination.Name,
            request.OperatorName ?? "Logística",
            request.Notes);

        foreach (var item in request.Items)
        {
            transfer.AddItem(item.ProductId, item.ProductCode, item.ProductName, item.Quantity, item.SerialNumbers, item.LotNumber);

            // Descontar stock de origen
            var stock = await _dbContext.StockItems.FirstOrDefaultAsync(s => s.ProductId == item.ProductId && s.TenantId == tenantId, cancellationToken);
            var prevStock = stock?.PhysicalStock ?? 0;
            if (stock != null)
            {
                stock.TransferOut(item.Quantity);
            }

            var movement = StockMovement.Create(
                tenantId,
                item.ProductId,
                "TransferOut",
                -item.Quantity,
                prevStock,
                prevStock - item.Quantity,
                origin.Id,
                origin.Name,
                null,
                null,
                item.SerialNumbers,
                item.LotNumber,
                transfer.Id,
                "StockTransfer",
                transferNumber,
                request.OperatorName ?? "Logística",
                $"Salida por transferencia {transferNumber} hacia {destination.Name}");

            _dbContext.StockMovements.Add(movement);
        }

        _dbContext.StockTransfers.Add(transfer);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return Result<StockTransferDto>.Success(MapTransfer(transfer));
    }

    public async Task<Result<StockTransferDto>> Handle(ReceiveStockTransferCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var transfer = await _dbContext.StockTransfers
            .Include(t => t.Items)
            .FirstOrDefaultAsync(t => t.Id == request.StockTransferId && t.TenantId == tenantId, cancellationToken);

        if (transfer == null) return Result<StockTransferDto>.Failure(Error.NotFound("Sales.Transfer.NotFound", "Transferencia no encontrada."));
        if (transfer.Status == StockTransferStatus.Received)
        {
            return Result<StockTransferDto>.Failure(Error.Validation("Sales.Transfer.AlreadyReceived", "La transferencia ya fue recibida anteriormente."));
        }

        transfer.MarkReceived(request.OperatorName);

        foreach (var item in transfer.Items)
        {
            var stock = await _dbContext.StockItems.FirstOrDefaultAsync(s => s.ProductId == item.ProductId && s.TenantId == tenantId, cancellationToken);
            var prevStock = stock?.PhysicalStock ?? 0;
            if (stock != null)
            {
                stock.TransferIn(item.Quantity);
            }

            var movement = StockMovement.Create(
                tenantId,
                item.ProductId,
                "TransferIn",
                item.Quantity,
                prevStock,
                prevStock + item.Quantity,
                transfer.DestinationWarehouseId,
                transfer.DestinationWarehouseName,
                null,
                null,
                item.SerialNumbers,
                item.LotNumber,
                transfer.Id,
                "StockTransfer",
                transfer.TransferNumber,
                request.OperatorName ?? "Receptor",
                $"Ingreso por recepción de transferencia {transfer.TransferNumber} desde {transfer.OriginWarehouseName}");

            _dbContext.StockMovements.Add(movement);
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
        return Result<StockTransferDto>.Success(MapTransfer(transfer));
    }

    public async Task<Result<IReadOnlyList<StockTransferDto>>> Handle(ListStockTransfersQuery request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var query = _dbContext.StockTransfers
            .Include(t => t.Items)
            .AsNoTracking()
            .Where(t => t.TenantId == tenantId);

        if (!string.IsNullOrWhiteSpace(request.Status) && Enum.TryParse<StockTransferStatus>(request.Status, true, out var status))
        {
            query = query.Where(t => t.Status == status);
        }

        var transfers = await query.OrderByDescending(t => t.CreatedAtUtc).ToListAsync(cancellationToken);
        var dtos = transfers.Select(MapTransfer).ToList();
        return Result<IReadOnlyList<StockTransferDto>>.Success(dtos);
    }

    public async Task<Result<IReadOnlyList<StockMovementDto>>> Handle(ListKardexQuery request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var query = _dbContext.StockMovements
            .AsNoTracking()
            .Where(m => m.TenantId == tenantId);

        if (request.ProductId.HasValue) query = query.Where(m => m.ProductId == request.ProductId.Value);
        if (request.WarehouseId.HasValue) query = query.Where(m => m.WarehouseId == request.WarehouseId.Value);
        if (!string.IsNullOrWhiteSpace(request.MovementType) && request.MovementType != "All") query = query.Where(m => m.MovementType == request.MovementType);

        var limit = request.Limit <= 0 ? 100 : request.Limit;
        var movements = await query.OrderByDescending(m => m.CreatedAtUtc).Take(limit).ToListAsync(cancellationToken);

        var productIds = movements.Select(m => m.ProductId).Distinct().ToList();
        var typedProductIds = productIds.Select(id => new ProductId(id)).ToList();
        var products = await _dbContext.Products.AsNoTracking().Where(p => typedProductIds.Contains(p.Id)).ToListAsync(cancellationToken);
        var productMap = products.ToDictionary(p => p.Id.Value);

        var dtos = movements.Select(m =>
        {
            productMap.TryGetValue(m.ProductId, out var prod);
            return new StockMovementDto(
                m.Id,
                m.ProductId,
                prod?.Code ?? "ART-000",
                prod?.Name ?? "Artículo",
                m.WarehouseId,
                m.WarehouseName,
                m.MovementType,
                m.Quantity,
                m.PreviousPhysicalStock,
                m.NewPhysicalStock,
                m.UnitCostArs,
                m.UnitCostUsd,
                m.SerialNumbers,
                m.LotNumber,
                m.ReferenceType,
                m.ReferenceNumber,
                m.OperatorName,
                m.Notes,
                m.CreatedAtUtc);
        }).ToList();

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var s = request.Search.Trim().ToLowerInvariant();
            dtos = dtos.Where(d => d.ProductName.ToLowerInvariant().Contains(s) || d.ProductCode.ToLowerInvariant().Contains(s) || (d.ReferenceNumber?.ToLowerInvariant().Contains(s) ?? false)).ToList();
        }

        return Result<IReadOnlyList<StockMovementDto>>.Success(dtos);
    }

    public async Task<Result<Guid>> Handle(GeneratePurchaseRequestFromStockCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var stocks = await _dbContext.StockItems
            .AsNoTracking()
            .Where(s => s.TenantId == tenantId)
            .ToListAsync(cancellationToken);

        var criticalStocks = stocks.Where(s => (s.PhysicalStock - s.ReservedStock) <= s.MinimumStock).ToList();
        if (criticalStocks.Count == 0)
        {
            return Result<Guid>.Failure(Error.Validation("Sales.Reorder.NoItems", "No hay artículos con stock crítico por debajo del mínimo actualmente."));
        }

        var productIds = criticalStocks.Select(s => s.ProductId).ToList();
        var typedProductIds = productIds.Select(id => new ProductId(id)).ToList();
        var products = await _dbContext.Products.AsNoTracking().Where(p => typedProductIds.Contains(p.Id)).ToListAsync(cancellationToken);
        var prodMap = products.ToDictionary(p => p.Id.Value);

        var count = await _dbContext.PurchaseRequests.CountAsync(pr => pr.TenantId == tenantId, cancellationToken) + 1;
        var reqNumber = $"SC-{count:D5}";

        var purchaseRequest = PurchaseRequest.Create(
            tenantId,
            reqNumber,
            "Motor de Inventario",
            "Logística y Almacén",
            "Normal",
            DateTime.UtcNow.AddDays(7),
            request.Notes ?? "Generado automáticamente por el motor de inventario al detectar stock crítico.");

        foreach (var cs in criticalStocks)
        {
            if (prodMap.TryGetValue(cs.ProductId, out var prod))
            {
                var neededQty = Math.Max(cs.MinimumStock * 2, 5); // Sugerencia de compra
                purchaseRequest.AddItem(prod.Id.Value, prod.Code, prod.Name, neededQty, prod.BaseUnit ?? "u", prod.CostPrice, "Reabastecimiento");
            }
        }

        _dbContext.PurchaseRequests.Add(purchaseRequest);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return Result<Guid>.Success(purchaseRequest.Id);
    }

    public async Task<Result<IReadOnlyList<ProductSupplierDto>>> Handle(ListProductSuppliersQuery request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var links = await _dbContext.ProductSuppliers
            .AsNoTracking()
            .Where(ps => ps.ProductId == request.ProductId && ps.TenantId == tenantId)
            .ToListAsync(cancellationToken);

        var supplierIds = links.Select(l => l.SupplierId).Distinct().ToList();
        var suppliers = await _dbContext.Database
            .SqlQueryRaw<SupplierRaw>("SELECT \"Id\", \"LegalName\" FROM crm.suppliers WHERE \"TenantId\" = {0}", tenantId.Value)
            .ToListAsync(cancellationToken);

        var suppMap = suppliers.ToDictionary(s => s.Id, s => s.LegalName);

        IReadOnlyList<ProductSupplierDto> dtos = links.Select(l => new ProductSupplierDto(
            l.Id,
            l.ProductId,
            l.SupplierId,
            suppMap.TryGetValue(l.SupplierId, out var name) ? name : "Proveedor",
            l.SupplierProductCode,
            l.PurchasePrice,
            l.Currency,
            l.LeadTimeDays,
            l.MinimumOrderQuantity,
            l.IsPreferred,
            l.CreatedAtUtc)).ToList();

        return Result<IReadOnlyList<ProductSupplierDto>>.Success(dtos);
    }

    public async Task<Result<ProductSupplierDto>> Handle(LinkProductSupplierCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var link = LealControl.Modules.Sales.Domain.Inventory.ProductSupplier.Create(
            tenantId,
            request.ProductId,
            request.SupplierId,
            request.SupplierProductCode,
            request.PurchasePrice,
            request.Currency,
            request.LeadTimeDays,
            request.MinimumOrderQuantity,
            request.IsPreferred);

        _dbContext.ProductSuppliers.Add(link);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return Result<ProductSupplierDto>.Success(new ProductSupplierDto(
            link.Id,
            link.ProductId,
            link.SupplierId,
            "Proveedor Registrado",
            link.SupplierProductCode,
            link.PurchasePrice,
            link.Currency,
            link.LeadTimeDays,
            link.MinimumOrderQuantity,
            link.IsPreferred,
            link.CreatedAtUtc));
    }

    private static StockTransferDto MapTransfer(StockTransfer t)
    {
        return new StockTransferDto(
            t.Id,
            t.TransferNumber,
            t.OriginWarehouseId,
            t.OriginWarehouseName,
            t.DestinationWarehouseId,
            t.DestinationWarehouseName,
            t.Status.ToString(),
            t.OperatorName,
            t.DispatchedAtUtc,
            t.ReceivedAtUtc,
            t.Notes,
            t.Items.Select(i => new StockTransferItemDto(
                i.Id,
                i.ProductId,
                i.ProductCode,
                i.ProductName,
                i.Quantity,
                i.SerialNumbers,
                i.LotNumber)).ToList(),
            t.CreatedAtUtc);
    }

    private sealed record SupplierRaw(Guid Id, string LegalName);
}
