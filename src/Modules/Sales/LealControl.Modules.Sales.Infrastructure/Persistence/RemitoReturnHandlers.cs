using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Results;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Sales.Application.Remitos;
using LealControl.Modules.Sales.Domain.Inventory;
using LealControl.Modules.Sales.Domain.Products;
using LealControl.Modules.Sales.Domain.Remitos;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LealControl.Modules.Sales.Infrastructure.Persistence;

internal sealed class RemitoReturnConfiguration : IEntityTypeConfiguration<RemitoReturn>
{
    public void Configure(EntityTypeBuilder<RemitoReturn> builder)
    {
        builder.ToTable("remito_returns", "sales");
        builder.HasKey(r => r.Id);
        builder.Property(r => r.TenantId).HasConversion(id => id.Value, value => new TenantId(value));
        builder.Property(r => r.ReturnNumber).HasMaxLength(40).IsRequired();
        builder.Property(r => r.WarehouseName).HasMaxLength(120).IsRequired();
        builder.Property(r => r.Reason).HasMaxLength(400).IsRequired();
        builder.Property(r => r.Notes).HasMaxLength(1000);
        builder.HasIndex(r => new { r.TenantId, r.RemitoId });
        builder.HasMany(r => r.Items).WithOne().HasForeignKey(i => i.ReturnId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class RemitoReturnItemConfiguration : IEntityTypeConfiguration<RemitoReturnItem>
{
    public void Configure(EntityTypeBuilder<RemitoReturnItem> builder)
    {
        builder.ToTable("remito_return_items", "sales");
        builder.HasKey(i => i.Id);
        builder.Property(i => i.Quantity).HasPrecision(18, 4);
        builder.HasIndex(i => i.RemitoItemId);
    }
}

internal sealed class RemitoReturnHandlers :
    IRequestHandler<ListRemitoReturnsQuery, Result<IReadOnlyList<RemitoReturnDto>>>,
    IRequestHandler<ConfirmRemitoReturnCommand, Result<RemitoReturnDto>>
{
    private readonly SalesDbContext _db;
    private readonly ITenantContext _tenant;
    public RemitoReturnHandlers(SalesDbContext db, ITenantContext tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<Result<IReadOnlyList<RemitoReturnDto>>> Handle(
        ListRemitoReturnsQuery request, CancellationToken cancellationToken)
    {
        var tenantId = _tenant.TenantId;
        var remito = await _db.Remitos.Include(r => r.Items).AsNoTracking()
            .FirstOrDefaultAsync(r => r.Id == request.RemitoId && r.TenantId == tenantId, cancellationToken);
        if (remito is null)
            return Result<IReadOnlyList<RemitoReturnDto>>.Failure(
                Error.NotFound("Sales.Remito.NotFound", "Remito no encontrado."));
        var returns = await _db.RemitoReturns.Include(r => r.Items).AsNoTracking()
            .Where(r => r.TenantId == tenantId && r.RemitoId == request.RemitoId)
            .OrderBy(r => r.ReceivedAtUtc).ToListAsync(cancellationToken);
        IReadOnlyList<RemitoReturnDto> result = returns.Select(r => Map(r, remito)).ToList();
        return Result<IReadOnlyList<RemitoReturnDto>>.Success(result);
    }

    public async Task<Result<RemitoReturnDto>> Handle(
        ConfirmRemitoReturnCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenant.TenantId;
        if (request.Items is null || request.Items.Count == 0 ||
            request.Items.Any(i => i.Quantity <= 0 || i.RemitoItemId == Guid.Empty ||
                decimal.Round(i.Quantity, 4) != i.Quantity) ||
            request.Items.GroupBy(i => i.RemitoItemId).Any(g => g.Count() > 1) ||
            string.IsNullOrWhiteSpace(request.Reason) || request.Reason.Trim().Length > 400 ||
            request.Notes?.Length > 1000)
            return Result<RemitoReturnDto>.Failure(
                Error.Validation("Sales.RemitoReturn.Invalid", "Indicá motivo y cantidades positivas por cada ítem devuelto."));

        await using var transaction = await _db.Database.BeginTransactionAsync(cancellationToken);
        await _db.Database.ExecuteSqlInterpolatedAsync(
            $@"SELECT 1 FROM sales.remitos WHERE ""Id"" = {request.RemitoId} AND ""TenantId"" = {tenantId.Value} FOR UPDATE",
            cancellationToken);
        var remito = await _db.Remitos.Include(r => r.Items)
            .FirstOrDefaultAsync(r => r.Id == request.RemitoId && r.TenantId == tenantId, cancellationToken);
        if (remito is null)
            return Result<RemitoReturnDto>.Failure(Error.NotFound("Sales.Remito.NotFound", "Remito no encontrado."));
        if (remito.Status != "Delivered" || remito.InvoiceId.HasValue ||
            await _db.Invoices.AnyAsync(i => i.TenantId == tenantId && i.RemitoId == remito.Id, cancellationToken))
            return Result<RemitoReturnDto>.Failure(
                Error.Validation("Sales.RemitoReturn.Invoiced", "La devolución debe confirmarse antes de facturar el remito."));

        var warehouse = request.WarehouseId.HasValue
            ? await _db.Warehouses.FirstOrDefaultAsync(w => w.Id == request.WarehouseId.Value && w.TenantId == tenantId && w.IsActive, cancellationToken)
            : await _db.Warehouses.FirstOrDefaultAsync(w => w.TenantId == tenantId && w.Type == WarehouseType.MainWarehouse && w.IsActive, cancellationToken)
                ?? await _db.Warehouses.FirstOrDefaultAsync(w => w.TenantId == tenantId && w.IsActive, cancellationToken);
        if (request.WarehouseId.HasValue && warehouse is null)
            return Result<RemitoReturnDto>.Failure(
                Error.Validation("Sales.RemitoReturn.Warehouse", "El depósito elegido no existe o está inactivo."));

        var previous = await _db.RemitoReturns.Include(r => r.Items)
            .Where(r => r.TenantId == tenantId && r.RemitoId == remito.Id)
            .ToListAsync(cancellationToken);
        var returned = previous.SelectMany(r => r.Items).GroupBy(i => i.RemitoItemId)
            .ToDictionary(g => g.Key, g => g.Sum(i => i.Quantity));
        var returnRecord = RemitoReturn.Create(tenantId, remito.Id, warehouse?.Id,
            warehouse?.Name ?? "Depósito Central", request.Reason, request.Notes);

        foreach (var line in request.Items)
        {
            var source = remito.Items.FirstOrDefault(i => i.Id == line.RemitoItemId);
            if (source is null || line.Quantity > source.Quantity - returned.GetValueOrDefault(line.RemitoItemId))
                return Result<RemitoReturnDto>.Failure(
                    Error.Validation("Sales.RemitoReturn.ExceedsDelivered", "La cantidad devuelta supera lo enviado menos las devoluciones anteriores."));
            returnRecord.AddItem(source.Id, line.Quantity);

            Guid? productId = source.ProductId;
            Product? product = null;
            if (productId is Guid id && id != Guid.Empty)
                product = await _db.Products.FirstOrDefaultAsync(p => p.Id == new ProductId(id) && p.TenantId == tenantId, cancellationToken);
            else if (!string.IsNullOrWhiteSpace(source.Code))
            {
                var code = source.Code.Trim().ToLower();
                product = await _db.Products.FirstOrDefaultAsync(p => p.TenantId == tenantId && p.Code.ToLower() == code, cancellationToken);
                productId = product?.Id.Value;
            }
            if (productId is not Guid resolvedId || resolvedId == Guid.Empty ||
                product?.Type == ProductType.Service)
                return Result<RemitoReturnDto>.Failure(
                    Error.Validation("Sales.RemitoReturn.NotInventory", "Solo se pueden devolver artículos inventariables del remito."));

            // A return must reverse a real dispatch; never create stock from a service or an untracked line.
            var dispatched = await _db.StockMovements.AnyAsync(m =>
                m.TenantId == tenantId && m.ReferenceId == remito.Id &&
                m.ReferenceType == "Remito" && m.ProductId == resolvedId, cancellationToken);
            if (!dispatched)
                return Result<RemitoReturnDto>.Failure(
                    Error.Validation("Sales.RemitoReturn.NoDispatch", "El ítem no tiene un egreso de stock del remito para revertir."));

            var stockQuery = _db.StockItems.Where(s => s.TenantId == tenantId && s.ProductId == resolvedId);
            if (warehouse is null)
                stockQuery = stockQuery.Where(s => s.WarehouseId == null);
            else if (warehouse.Type == WarehouseType.MainWarehouse)
                stockQuery = stockQuery.Where(s => s.WarehouseId == warehouse.Id || s.WarehouseId == null);
            else
                stockQuery = stockQuery.Where(s => s.WarehouseId == warehouse.Id);
            var stock = _db.StockItems.Local.FirstOrDefault(s =>
                s.TenantId == tenantId && s.ProductId == resolvedId &&
                (warehouse is null ? s.WarehouseId == null :
                    s.WarehouseId == warehouse.Id ||
                    (warehouse.Type == WarehouseType.MainWarehouse && s.WarehouseId == null)))
                ?? await stockQuery.FirstOrDefaultAsync(cancellationToken);
            if (stock is null)
            {
                stock = StockItem.Create(tenantId, resolvedId, 0, 0,
                    warehouse?.Name ?? "Depósito Central", warehouse?.Id, warehouse?.Name);
                _db.StockItems.Add(stock);
            }
            var before = stock.PhysicalStock;
            stock.ReceiveStock(line.Quantity);
            if (product is not null && product.TrackStock) product.AdjustStock(line.Quantity);
            _db.StockMovements.Add(StockMovement.Create(
                tenantId, resolvedId, "SaleDeliveryReturn", line.Quantity, before, stock.PhysicalStock,
                warehouse?.Id, warehouse?.Name, null, null, null, null,
                returnRecord.Id, "RemitoReturn", returnRecord.ReturnNumber, null,
                "Devolución del remito " + remito.RemitoNumber));
        }

        _db.RemitoReturns.Add(returnRecord);
        await _db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return Result<RemitoReturnDto>.Success(Map(returnRecord, remito));
    }

    private static RemitoReturnDto Map(RemitoReturn record, Remito remito)
    {
        var source = remito.Items.ToDictionary(i => i.Id);
        return new RemitoReturnDto(record.Id, record.RemitoId, record.ReturnNumber,
            record.WarehouseId, record.WarehouseName, record.Reason, record.Notes,
            record.ReceivedAtUtc, record.Items.Select(i => new RemitoReturnItemDto(
                i.Id, i.RemitoItemId, source[i.RemitoItemId].Code,
                source[i.RemitoItemId].Description, source[i.RemitoItemId].ProductId, i.Quantity)).ToList());
    }
}
