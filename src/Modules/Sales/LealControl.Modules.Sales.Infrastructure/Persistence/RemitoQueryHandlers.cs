using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Results;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Sales.Application.Remitos;
using LealControl.Modules.Sales.Domain.Remitos;
using LealControl.Modules.Sales.Domain.Inventory;
using LealControl.Modules.Sales.Domain.Products;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LealControl.Modules.Sales.Infrastructure.Persistence;

internal sealed class RemitoConfiguration : IEntityTypeConfiguration<Remito>
{
    public void Configure(EntityTypeBuilder<Remito> builder)
    {
        builder.ToTable("remitos", "sales");
        builder.HasKey(r => r.Id);
        builder.Property(r => r.TenantId).HasConversion(id => id.Value, value => new TenantId(value));
        builder.Property(r => r.RemitoNumber).HasMaxLength(32).IsRequired();
        builder.Property(r => r.CustomerName).HasMaxLength(256).IsRequired();
        builder.Property(r => r.CustomerDocument).HasMaxLength(32).IsRequired();
        builder.Property(r => r.DeliveryAddress).HasMaxLength(512);
        builder.Property(r => r.CarrierName).HasMaxLength(128);
        builder.Property(r => r.DriverLicense).HasMaxLength(64);
        builder.Property(r => r.Status).HasMaxLength(32).IsRequired();
        builder.Property(r => r.InvoiceNumber).HasMaxLength(32);

        builder.HasMany(r => r.Items)
            .WithOne()
            .HasForeignKey(i => i.RemitoId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class RemitoItemConfiguration : IEntityTypeConfiguration<RemitoItem>
{
    public void Configure(EntityTypeBuilder<RemitoItem> builder)
    {
        builder.ToTable("remito_items", "sales");
        builder.HasKey(i => i.Id);
        builder.Property(i => i.Code).HasMaxLength(80).IsRequired();
        builder.Property(i => i.Description).HasMaxLength(512).IsRequired();
        builder.Property(i => i.UnitMeasure).HasMaxLength(32).IsRequired();
    }
}

internal sealed class RemitoQueryHandlers
    : IRequestHandler<ListRemitosQuery, Result<IReadOnlyList<RemitoDto>>>,
      IRequestHandler<GetRemitoByIdQuery, Result<RemitoDto>>,
      IRequestHandler<CreateRemitoCommand, Result<RemitoDto>>
{
    private readonly SalesDbContext _dbContext;
    private readonly ITenantContext _tenantContext;

    public RemitoQueryHandlers(SalesDbContext dbContext, ITenantContext tenantContext)
    {
        _dbContext = dbContext;
        _tenantContext = tenantContext;
    }

    public async Task<Result<IReadOnlyList<RemitoDto>>> Handle(ListRemitosQuery request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var query = _dbContext.Remitos
            .Include(r => r.Items)
            .AsNoTracking()
            .Where(r => r.TenantId == tenantId);

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var s = request.Search.Trim().ToLower();
            query = query.Where(r => r.RemitoNumber.ToLower().Contains(s)
                                  || r.CustomerName.ToLower().Contains(s)
                                  || r.CustomerDocument.Contains(s));
        }

        if (!string.IsNullOrWhiteSpace(request.Status) && request.Status != "All")
        {
            query = query.Where(r => r.Status == request.Status);
        }

        var list = await query.OrderByDescending(r => r.IssueDate).ToListAsync(cancellationToken);
        IReadOnlyList<RemitoDto> dtos = list.Select(MapToDto).ToList();
        return Result<IReadOnlyList<RemitoDto>>.Success(dtos);
    }

    public async Task<Result<RemitoDto>> Handle(GetRemitoByIdQuery request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var remito = await _dbContext.Remitos
            .Include(r => r.Items)
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.Id == request.Id && r.TenantId == tenantId, cancellationToken);

        if (remito == null)
        {
            return Result<RemitoDto>.Failure(Error.NotFound("Sales.Remito.NotFound", $"Remito {request.Id} no encontrado."));
        }

        return Result<RemitoDto>.Success(MapToDto(remito));
    }

    public async Task<Result<RemitoDto>> Handle(CreateRemitoCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;

        // Auto calculate next Remito number
        var lastRemito = await _dbContext.Remitos
            .Where(r => r.TenantId == tenantId)
            .OrderByDescending(r => r.CreatedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);

        int nextSeq = 1;
        if (lastRemito != null && lastRemito.RemitoNumber.Contains("-"))
        {
            var parts = lastRemito.RemitoNumber.Split('-');
            if (parts.Length == 2 && int.TryParse(parts[1], out int currentNum))
            {
                nextSeq = currentNum + 1;
            }
        }

        var remitoNum = $"0001-{nextSeq:D8}";

        var remito = Remito.Create(
            tenantId,
            remitoNum,
            request.OrderId,
            request.CustomerId,
            request.CustomerName,
            request.CustomerDocument,
            request.DeliveryAddress,
            request.DeliveryDate,
            request.CarrierName,
            request.DriverLicense,
            request.Notes);

        foreach (var item in request.Items)
        {
            remito.AddItem(
                item.ProductId,
                item.Code,
                item.Description,
                item.Quantity,
                item.UnitMeasure);
        }

        _dbContext.Remitos.Add(remito);
        var warehouse = await _dbContext.Warehouses.FirstOrDefaultAsync(w => w.TenantId == tenantId && w.Type == WarehouseType.MainWarehouse, cancellationToken)
            ?? await _dbContext.Warehouses.FirstOrDefaultAsync(w => w.TenantId == tenantId, cancellationToken);

        // A dispatch changes the balance and writes the same immutable ledger used by every stock circuit.
        foreach (var item in request.Items)
        {
            Guid? prodId = item.ProductId;
            Product? product = null;
            if (prodId.HasValue && prodId.Value != Guid.Empty)
            {
                product = await _dbContext.Products.FirstOrDefaultAsync(p => p.Id == new ProductId(prodId.Value) && p.TenantId == tenantId, cancellationToken);
            }
            else if (!string.IsNullOrWhiteSpace(item.Code))
            {
                var normCode = item.Code.Trim().ToLower();
                product = await _dbContext.Products.FirstOrDefaultAsync(p => p.TenantId == tenantId && p.Code.ToLower() == normCode, cancellationToken);
                if (product != null) prodId = product.Id.Value;
            }

            if (prodId.HasValue && prodId.Value != Guid.Empty)
            {
                var stock = await _dbContext.StockItems.FirstOrDefaultAsync(s => s.ProductId == prodId.Value && s.TenantId == tenantId && (warehouse == null || s.WarehouseId == warehouse.Id || s.WarehouseId == null), cancellationToken);
                if (stock == null)
                {
                    stock = StockItem.Create(tenantId, prodId.Value, 0, 0, "Depósito Central", warehouse?.Id, warehouse?.Name);
                    _dbContext.StockItems.Add(stock);
                }

                var previous = stock.PhysicalStock;
                stock.AdjustStock(previous - item.Quantity, stock.MinimumStock, warehouse?.Name ?? "Depósito Central");

                if (product != null && product.TrackStock)
                {
                    product.AdjustStock(-item.Quantity);
                }

                _dbContext.StockMovements.Add(StockMovement.Create(
                    tenantId,
                    prodId.Value,
                    "SaleDelivery",
                    -item.Quantity,
                    previous,
                    stock.PhysicalStock,
                    warehouse?.Id,
                    warehouse?.Name,
                    null,
                    null,
                    null,
                    null,
                    remito.Id,
                    "Remito",
                    remito.RemitoNumber,
                    "Despacho",
                    $"Salida por remito {remito.RemitoNumber} para {remito.CustomerName}"));
            }
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
        return Result<RemitoDto>.Success(MapToDto(remito));
    }

    private static RemitoDto MapToDto(Remito r)
    {
        return new RemitoDto(
            r.Id,
            r.RemitoNumber,
            r.OrderId,
            r.InvoiceId,
            r.InvoiceNumber,
            r.CustomerId,
            r.CustomerName,
            r.CustomerDocument,
            r.DeliveryAddress,
            r.IssueDate,
            r.DeliveryDate,
            r.CarrierName,
            r.DriverLicense,
            r.Status,
            r.Notes,
            r.Items.Select(i => new RemitoItemDto(
                i.Id,
                i.ProductId,
                i.Code,
                i.Description,
                i.Quantity,
                i.UnitMeasure)).ToList(),
            r.CreatedAtUtc);
    }
}
