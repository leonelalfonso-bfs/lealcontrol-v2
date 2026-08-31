using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Results;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Sales.Application.Purchases;
using LealControl.Modules.Sales.Domain.Inventory;
using LealControl.Modules.Sales.Domain.Purchases;
using LealControl.Modules.Sales.Domain.Products;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LealControl.Modules.Sales.Infrastructure.Persistence.Purchases;

// EF Core Configurations
public sealed class PurchaseOrderConfiguration : IEntityTypeConfiguration<PurchaseOrder>
{
    public void Configure(EntityTypeBuilder<PurchaseOrder> builder)
    {
        builder.ToTable("purchase_orders", "purchases");
        builder.HasKey(o => o.Id);
        builder.Property(o => o.TenantId).HasConversion(id => id.Value, value => new TenantId(value));
        builder.HasMany(o => o.Items).WithOne().HasForeignKey(i => i.PurchaseOrderId).OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class PurchaseOrderItemConfiguration : IEntityTypeConfiguration<PurchaseOrderItem>
{
    public void Configure(EntityTypeBuilder<PurchaseOrderItem> builder)
    {
        builder.ToTable("purchase_order_items", "purchases");
        builder.HasKey(i => i.Id);
    }
}

public sealed class PurchaseReceptionConfiguration : IEntityTypeConfiguration<PurchaseReception>
{
    public void Configure(EntityTypeBuilder<PurchaseReception> builder)
    {
        builder.ToTable("purchase_receptions", "purchases");
        builder.HasKey(r => r.Id);
        builder.Property(r => r.TenantId).HasConversion(id => id.Value, value => new TenantId(value));
        builder.HasMany(r => r.Items).WithOne().HasForeignKey(i => i.PurchaseReceptionId).OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class PurchaseReceptionItemConfiguration : IEntityTypeConfiguration<PurchaseReceptionItem>
{
    public void Configure(EntityTypeBuilder<PurchaseReceptionItem> builder)
    {
        builder.ToTable("purchase_reception_items", "purchases");
        builder.HasKey(i => i.Id);
    }
}

public sealed class PurchaseInvoiceConfiguration : IEntityTypeConfiguration<PurchaseInvoice>
{
    public void Configure(EntityTypeBuilder<PurchaseInvoice> builder)
    {
        builder.ToTable("purchase_invoices", "purchases");
        builder.HasKey(i => i.Id);
        builder.Property(i => i.TenantId).HasConversion(id => id.Value, value => new TenantId(value));
        builder.HasMany(i => i.Items).WithOne().HasForeignKey(it => it.PurchaseInvoiceId).OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class PurchaseInvoiceItemConfiguration : IEntityTypeConfiguration<PurchaseInvoiceItem>
{
    public void Configure(EntityTypeBuilder<PurchaseInvoiceItem> builder)
    {
        builder.ToTable("purchase_invoice_items", "purchases");
        builder.HasKey(i => i.Id);
    }
}

public sealed class PurchaseArcaVoucherConfiguration : IEntityTypeConfiguration<PurchaseArcaVoucher>
{
    public void Configure(EntityTypeBuilder<PurchaseArcaVoucher> builder)
    {
        builder.ToTable("purchase_arca_vouchers", "purchases");
        builder.HasKey(v => v.Id);
        builder.Property(v => v.TenantId).HasConversion(id => id.Value, value => new TenantId(value));
    }
}

public sealed class PurchaseRequestConfiguration : IEntityTypeConfiguration<PurchaseRequest>
{
    public void Configure(EntityTypeBuilder<PurchaseRequest> builder)
    {
        builder.ToTable("purchase_requests", "purchases");
        builder.HasKey(r => r.Id);
        builder.Property(r => r.TenantId).HasConversion(id => id.Value, value => new TenantId(value));
        builder.HasMany(r => r.Items).WithOne().HasForeignKey(i => i.PurchaseRequestId).OnDelete(DeleteBehavior.Cascade);
        builder.HasMany(r => r.Quotations).WithOne().HasForeignKey(q => q.PurchaseRequestId).OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class PurchaseRequestItemConfiguration : IEntityTypeConfiguration<PurchaseRequestItem>
{
    public void Configure(EntityTypeBuilder<PurchaseRequestItem> builder)
    {
        builder.ToTable("purchase_request_items", "purchases");
        builder.HasKey(i => i.Id);
    }
}

public sealed class PurchaseQuotationConfiguration : IEntityTypeConfiguration<PurchaseQuotation>
{
    public void Configure(EntityTypeBuilder<PurchaseQuotation> builder)
    {
        builder.ToTable("purchase_quotations", "purchases");
        builder.HasKey(q => q.Id);
        builder.Property(q => q.TenantId).HasConversion(id => id.Value, value => new TenantId(value));
    }
}

// Handlers Implementation
public sealed class PurchaseQueryHandlers :
    IRequestHandler<ListPurchaseOrdersQuery, Result<IReadOnlyList<PurchaseOrderDto>>>,
    IRequestHandler<GetPurchaseOrderQuery, Result<PurchaseOrderDto>>,
    IRequestHandler<CreatePurchaseOrderCommand, Result<PurchaseOrderDto>>,
    IRequestHandler<UpdatePurchaseOrderStatusCommand, Result<PurchaseOrderDto>>,
    IRequestHandler<ListPurchaseReceptionsQuery, Result<IReadOnlyList<PurchaseReceptionDto>>>,
    IRequestHandler<GetPurchaseReceptionQuery, Result<PurchaseReceptionDto>>,
    IRequestHandler<CreatePurchaseReceptionCommand, Result<PurchaseReceptionDto>>,
    IRequestHandler<ListPurchaseInvoicesQuery, Result<IReadOnlyList<PurchaseInvoiceDto>>>,
    IRequestHandler<GetPurchaseInvoiceQuery, Result<PurchaseInvoiceDto>>,
    IRequestHandler<CreatePurchaseInvoiceCommand, Result<PurchaseInvoiceDto>>,
    IRequestHandler<ListArcaVouchersQuery, Result<IReadOnlyList<PurchaseArcaVoucherDto>>>,
    IRequestHandler<ImportArcaCsvCommand, Result<ImportArcaCsvResult>>,
    IRequestHandler<IgnoreArcaVoucherCommand, Result<bool>>,
    IRequestHandler<ListPurchaseRequestsQuery, Result<IReadOnlyList<PurchaseRequestDto>>>,
    IRequestHandler<GetPurchaseRequestQuery, Result<PurchaseRequestDto>>,
    IRequestHandler<CreatePurchaseRequestCommand, Result<PurchaseRequestDto>>,
    IRequestHandler<ApprovePurchaseRequestCommand, Result<PurchaseRequestDto>>,
    IRequestHandler<RejectPurchaseRequestCommand, Result<PurchaseRequestDto>>,
    IRequestHandler<AddPurchaseQuotationCommand, Result<PurchaseRequestDto>>,
    IRequestHandler<SelectPurchaseQuotationCommand, Result<PurchaseRequestDto>>,
    IRequestHandler<DeletePurchaseQuotationCommand, Result<PurchaseRequestDto>>
{
    private readonly SalesDbContext _dbContext;
    private readonly ITenantContext _tenantContext;

    public PurchaseQueryHandlers(SalesDbContext dbContext, ITenantContext tenantContext)
    {
        _dbContext = dbContext;
        _tenantContext = tenantContext;
    }

    // Purchase Orders Handlers
    public async Task<Result<IReadOnlyList<PurchaseOrderDto>>> Handle(ListPurchaseOrdersQuery request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var query = _dbContext.Set<PurchaseOrder>()
            .Include(o => o.Items)
            .Where(o => o.TenantId == tenantId);

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var s = request.Search.ToLower();
            query = query.Where(o => o.OrderNumber.ToLower().Contains(s) || o.SupplierName.ToLower().Contains(s) || o.SupplierDocument.Contains(s));
        }

        if (!string.IsNullOrWhiteSpace(request.Status))
        {
            query = query.Where(o => o.Status == request.Status);
        }

        var list = await query.OrderByDescending(o => o.CreatedAtUtc).ToListAsync(cancellationToken);
        return Result<IReadOnlyList<PurchaseOrderDto>>.Success(list.Select(MapOrderToDto).ToList());
    }

    public async Task<Result<PurchaseOrderDto>> Handle(GetPurchaseOrderQuery request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var order = await _dbContext.Set<PurchaseOrder>()
            .Include(o => o.Items)
            .FirstOrDefaultAsync(o => o.Id == request.Id && o.TenantId == tenantId, cancellationToken);

        if (order == null)
            return Result<PurchaseOrderDto>.Failure(Error.NotFound("Purchases.Order.NotFound", $"Orden de compra {request.Id} no encontrada."));

        return Result<PurchaseOrderDto>.Success(MapOrderToDto(order));
    }

    public async Task<Result<PurchaseOrderDto>> Handle(CreatePurchaseOrderCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var count = await _dbContext.Set<PurchaseOrder>().CountAsync(o => o.TenantId == tenantId, cancellationToken);
        var orderNum = $"OC-{(count + 1):D4}";

        var order = PurchaseOrder.Create(
            tenantId,
            orderNum,
            request.SupplierId,
            request.SupplierName,
            request.SupplierDocument,
            request.ExpectedDeliveryDate,
            request.Currency,
            request.ExchangeRate,
            request.PaymentTerms,
            request.PaymentMethod,
            request.DeliveryAddress,
            request.Notes);

        foreach (var item in request.Items)
        {
            order.AddItem(
                item.ProductId,
                item.Code,
                item.Description,
                item.Quantity,
                item.UnitPrice,
                item.DiscountPercent,
                item.TaxRate);
        }

        _dbContext.Set<PurchaseOrder>().Add(order);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return Result<PurchaseOrderDto>.Success(MapOrderToDto(order));
    }

    public async Task<Result<PurchaseOrderDto>> Handle(UpdatePurchaseOrderStatusCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var order = await _dbContext.Set<PurchaseOrder>()
            .Include(o => o.Items)
            .FirstOrDefaultAsync(o => o.Id == request.Id && o.TenantId == tenantId, cancellationToken);

        if (order == null)
            return Result<PurchaseOrderDto>.Failure(Error.NotFound("Purchases.Order.NotFound", $"Orden de compra {request.Id} no encontrada."));

        if (!order.CanChangeStatus(request.Status))
            return Result<PurchaseOrderDto>.Failure(Error.Validation("Purchases.Order.InvalidTransition", $"No se puede pasar una orden de {order.Status} a {request.Status}."));

        order.ChangeStatus(request.Status);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return Result<PurchaseOrderDto>.Success(MapOrderToDto(order));
    }

    // Purchase Receptions Handlers
    public async Task<Result<IReadOnlyList<PurchaseReceptionDto>>> Handle(ListPurchaseReceptionsQuery request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var query = _dbContext.Set<PurchaseReception>()
            .Include(r => r.Items)
            .Where(r => r.TenantId == tenantId);

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var s = request.Search.ToLower();
            query = query.Where(r => r.ReceptionNumber.ToLower().Contains(s) || r.SupplierName.ToLower().Contains(s) || (r.SupplierRemitoNumber != null && r.SupplierRemitoNumber.ToLower().Contains(s)));
        }

        var list = await query.OrderByDescending(r => r.CreatedAtUtc).ToListAsync(cancellationToken);
        return Result<IReadOnlyList<PurchaseReceptionDto>>.Success(list.Select(MapReceptionToDto).ToList());
    }

    public async Task<Result<PurchaseReceptionDto>> Handle(GetPurchaseReceptionQuery request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var rec = await _dbContext.Set<PurchaseReception>()
            .Include(r => r.Items)
            .FirstOrDefaultAsync(r => r.Id == request.Id && r.TenantId == tenantId, cancellationToken);

        if (rec == null)
            return Result<PurchaseReceptionDto>.Failure(Error.NotFound("Purchases.Reception.NotFound", $"Recepción {request.Id} no encontrada."));

        return Result<PurchaseReceptionDto>.Success(MapReceptionToDto(rec));
    }

    public async Task<Result<PurchaseReceptionDto>> Handle(CreatePurchaseReceptionCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        if (!request.Items.Any() || request.Items.Any(x => x.Quantity <= 0))
            return Result<PurchaseReceptionDto>.Failure(Error.Validation("Purchases.Reception.InvalidQuantity", "La recepción debe contener cantidades mayores a cero."));
        PurchaseOrder? order = null;
        if (request.PurchaseOrderId.HasValue)
        {
            order = await _dbContext.Set<PurchaseOrder>()
                .Include(o => o.Items)
                .FirstOrDefaultAsync(x => x.Id == request.PurchaseOrderId.Value && x.TenantId == tenantId, cancellationToken);
            if (order == null) return Result<PurchaseReceptionDto>.Failure(Error.NotFound("Purchases.Order.NotFound", "La orden vinculada no existe."));
            if (order.Status is "Cancelled") return Result<PurchaseReceptionDto>.Failure(Error.Validation("Purchases.Reception.OrderNotReceivable", "La orden de compra vinculada se encuentra anulada."));
            if (order.SupplierId != request.SupplierId) return Result<PurchaseReceptionDto>.Failure(Error.Validation("Purchases.Reception.SupplierMismatch", "El proveedor de la recepción no coincide con la orden."));
        }

        PurchaseInvoice? invoice = null;
        if (request.PurchaseInvoiceId.HasValue)
        {
            invoice = await _dbContext.Set<PurchaseInvoice>()
                .Include(i => i.Items)
                .FirstOrDefaultAsync(x => x.Id == request.PurchaseInvoiceId.Value && x.TenantId == tenantId, cancellationToken);
        }

        var count = await _dbContext.Set<PurchaseReception>().CountAsync(r => r.TenantId == tenantId, cancellationToken);
        var recNum = $"REC-{(count + 1):D4}";

        var reception = PurchaseReception.Create(
            tenantId,
            recNum,
            request.PurchaseOrderId,
            request.SupplierId,
            request.SupplierName,
            request.SupplierRemitoNumber,
            request.ReceptionDate,
            request.WarehouseLocation,
            request.ReceivedBy,
            request.Notes);

        foreach (var it in request.Items)
        {
            reception.AddItem(
                it.ProductId,
                it.Code,
                it.Description,
                it.Quantity,
                it.UnitMeasure,
                it.SerialNumber);
        }

        _dbContext.Set<PurchaseReception>().Add(reception);

        if (order != null)
        {
            foreach (var item in request.Items)
            {
                var ordItem = order.Items.FirstOrDefault(i => (item.ProductId.HasValue && i.ProductId == item.ProductId.Value) || (!string.IsNullOrWhiteSpace(item.Code) && i.Code.ToLower() == item.Code.Trim().ToLower()));
                if (ordItem != null)
                {
                    ordItem.RecordReceived(item.Quantity);
                }
            }

            var totalOrdered = order.Items.Sum(i => i.Quantity);
            var totalReceived = order.Items.Sum(i => i.ReceivedQuantity);
            if (totalReceived >= totalOrdered && totalOrdered > 0)
            {
                order.ChangeStatus("Received");
            }
            else if (totalReceived > 0)
            {
                order.ChangeStatus("PartiallyReceived");
            }
            else if (order.Status == "Draft")
            {
                order.ChangeStatus("Sent");
            }
        }

        if (invoice == null && order != null)
        {
            invoice = await _dbContext.Set<PurchaseInvoice>()
                .FirstOrDefaultAsync(i => i.PurchaseOrderId == order.Id && i.TenantId == tenantId, cancellationToken);
        }

        if (invoice != null)
        {
            invoice.LinkReception(reception.Id);
        }

        // Buscar depósito destino según ubicación indicada o principal
        var warehouse = await _dbContext.Warehouses.FirstOrDefaultAsync(w => w.TenantId == tenantId && (w.Name == request.WarehouseLocation || w.Code == request.WarehouseLocation), cancellationToken)
            ?? await _dbContext.Warehouses.FirstOrDefaultAsync(w => w.TenantId == tenantId && w.Type == WarehouseType.MainWarehouse, cancellationToken)
            ?? await _dbContext.Warehouses.FirstOrDefaultAsync(w => w.TenantId == tenantId, cancellationToken);

        // Incrementar stock físico en inventario con costeo exacto
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
                var stock = await _dbContext.StockItems
                    .FirstOrDefaultAsync(s => s.ProductId == prodId.Value && (warehouse == null || s.WarehouseId == warehouse.Id || s.WarehouseId == null) && s.TenantId == tenantId, cancellationToken);

                if (stock != null)
                {
                    stock.AdjustStock(stock.PhysicalStock + item.Quantity, stock.MinimumStock, request.WarehouseLocation, warehouse?.Id, warehouse?.Name);
                }
                else
                {
                    stock = StockItem.Create(tenantId, prodId.Value, item.Quantity, 0, request.WarehouseLocation, warehouse?.Id, warehouse?.Name);
                    _dbContext.StockItems.Add(stock);
                }

                if (product != null && product.TrackStock)
                {
                    product.AdjustStock(+item.Quantity);
                }

                decimal? unitCost = null;
                if (invoice != null)
                {
                    var invItem = invoice.Items.FirstOrDefault(i => i.ProductId == prodId.Value || (!string.IsNullOrWhiteSpace(item.Code) && i.Code.ToLower() == item.Code.Trim().ToLower()));
                    if (invItem != null)
                    {
                        unitCost = invItem.UnitPrice;
                    }
                }

                var mov = StockMovement.Create(
                    tenantId,
                    prodId.Value,
                    "PurchaseReception",
                    item.Quantity,
                    (stock.PhysicalStock - item.Quantity),
                    stock.PhysicalStock,
                    warehouse?.Id,
                    warehouse?.Name,
                    unitCost,
                    null,
                    item.SerialNumber,
                    null,
                    reception.Id,
                    "PurchaseReception",
                    reception.ReceptionNumber,
                    request.ReceivedBy,
                    string.IsNullOrWhiteSpace(request.SupplierRemitoNumber)
                        ? $"Recepción directa #{reception.ReceptionNumber} ({request.SupplierName})"
                        : $"Remito Proveedor #{request.SupplierRemitoNumber} ({request.SupplierName})");

                _dbContext.StockMovements.Add(mov);
            }
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
        return Result<PurchaseReceptionDto>.Success(MapReceptionToDto(reception));
    }

    // Purchase Invoices Handlers
    public async Task<Result<IReadOnlyList<PurchaseInvoiceDto>>> Handle(ListPurchaseInvoicesQuery request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var query = _dbContext.Set<PurchaseInvoice>()
            .Include(i => i.Items)
            .Where(i => i.TenantId == tenantId);

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var s = request.Search.ToLower();
            query = query.Where(i => i.FormattedNumber.Contains(s) || i.SupplierName.ToLower().Contains(s) || i.SupplierDocument.Contains(s));
        }

        if (!string.IsNullOrWhiteSpace(request.Status) && !string.Equals(request.Status, "all", StringComparison.OrdinalIgnoreCase))
        {
            query = query.Where(i => i.Status == request.Status);
        }

        var list = await query.OrderByDescending(i => i.CreatedAtUtc).ToListAsync(cancellationToken);

        // Auto-heal / sync invoices that have a PurchaseOrderId with an existing reception
        var orderIds = list.Where(i => i.PurchaseReceptionId == null && i.PurchaseOrderId != null)
            .Select(i => i.PurchaseOrderId!.Value)
            .Distinct()
            .ToList();

        if (orderIds.Any())
        {
            var recs = await _dbContext.Set<PurchaseReception>()
                .Where(r => r.TenantId == tenantId && r.PurchaseOrderId != null && orderIds.Contains(r.PurchaseOrderId.Value))
                .Select(r => new { OrderId = r.PurchaseOrderId!.Value, ReceptionId = r.Id })
                .ToListAsync(cancellationToken);

            var recDict = recs.GroupBy(x => x.OrderId).ToDictionary(g => g.Key, g => g.First().ReceptionId);
            bool modified = false;

            foreach (var inv in list)
            {
                if (inv.PurchaseReceptionId == null && inv.PurchaseOrderId.HasValue && recDict.TryGetValue(inv.PurchaseOrderId.Value, out var recId))
                {
                    inv.LinkReception(recId);
                    modified = true;
                }
            }

            if (modified)
            {
                await _dbContext.SaveChangesAsync(cancellationToken);
            }
        }

        return Result<IReadOnlyList<PurchaseInvoiceDto>>.Success(list.Select(MapInvoiceToDto).ToList());
    }

    public async Task<Result<PurchaseInvoiceDto>> Handle(GetPurchaseInvoiceQuery request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var inv = await _dbContext.Set<PurchaseInvoice>()
            .Include(i => i.Items)
            .FirstOrDefaultAsync(i => i.Id == request.Id && i.TenantId == tenantId, cancellationToken);

        if (inv == null)
            return Result<PurchaseInvoiceDto>.Failure(Error.NotFound("Purchases.Invoice.NotFound", $"Factura {request.Id} no encontrada."));

        return Result<PurchaseInvoiceDto>.Success(MapInvoiceToDto(inv));
    }

    public async Task<Result<PurchaseInvoiceDto>> Handle(CreatePurchaseInvoiceCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        if (!request.Items.Any() || request.Items.Any(x => x.Quantity <= 0 || x.UnitPrice < 0))
            return Result<PurchaseInvoiceDto>.Failure(Error.Validation("Purchases.Invoice.InvalidLines", "La factura debe contener líneas válidas."));
        var duplicate = await _dbContext.Set<PurchaseInvoice>().AnyAsync(x => x.TenantId == tenantId && x.SupplierId == request.SupplierId && x.PointOfSale == request.PointOfSale && x.InvoiceNumber == request.InvoiceNumber && x.InvoiceType == request.InvoiceType, cancellationToken);
        if (duplicate) return Result<PurchaseInvoiceDto>.Failure(Error.Validation("Purchases.Invoice.Duplicate", "Ya existe una factura con el mismo tipo, punto de venta y número para este proveedor."));
        
        var receptionId = request.PurchaseReceptionId;
        if (request.PurchaseOrderId.HasValue)
        {
            var order = await _dbContext.Set<PurchaseOrder>().FirstOrDefaultAsync(x => x.Id == request.PurchaseOrderId.Value && x.TenantId == tenantId, cancellationToken);
            if (order == null) return Result<PurchaseInvoiceDto>.Failure(Error.NotFound("Purchases.Order.NotFound", "La orden vinculada no existe."));
            if (order.SupplierId != request.SupplierId) return Result<PurchaseInvoiceDto>.Failure(Error.Validation("Purchases.Invoice.SupplierMismatch", "El proveedor de la factura no coincide con la orden."));

            if (!receptionId.HasValue)
            {
                var existingRec = await _dbContext.Set<PurchaseReception>()
                    .FirstOrDefaultAsync(r => r.PurchaseOrderId == request.PurchaseOrderId.Value && r.TenantId == tenantId, cancellationToken);
                if (existingRec != null)
                {
                    receptionId = existingRec.Id;
                }
            }
        }

        var invoice = PurchaseInvoice.Create(
            tenantId,
            request.InvoiceType,
            request.PointOfSale,
            request.InvoiceNumber,
            request.PurchaseOrderId,
            receptionId,
            request.SupplierId,
            request.SupplierName,
            request.SupplierDocument,
            request.SupplierTaxCondition,
            request.IssueDate,
            request.DueDate,
            request.Currency,
            request.ExchangeRate,
            request.IibbPerception,
            request.IvaPerception,
            request.OtherTaxes,
            request.Cae,
            request.CaeDueDate,
            request.Notes);

        foreach (var it in request.Items)
        {
            invoice.AddItem(
                it.ProductId,
                it.Code,
                it.Description,
                it.Quantity,
                it.UnitPrice,
                it.VatRate);
        }

        _dbContext.Set<PurchaseInvoice>().Add(invoice);

        // Si viene vinculada a un voucher importado de ARCA, marcarlo como registrado
        if (request.ArcaVoucherId.HasValue)
        {
            var voucher = await _dbContext.Set<PurchaseArcaVoucher>()
                .FirstOrDefaultAsync(v => v.Id == request.ArcaVoucherId.Value && v.TenantId == tenantId, cancellationToken);

            voucher?.LinkPurchase(invoice.Id);
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
        return Result<PurchaseInvoiceDto>.Success(MapInvoiceToDto(invoice));
    }

    // ARCA Mis Comprobantes Handlers
    public async Task<Result<IReadOnlyList<PurchaseArcaVoucherDto>>> Handle(ListArcaVouchersQuery request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var query = _dbContext.Set<PurchaseArcaVoucher>()
            .Where(v => v.TenantId == tenantId);

        if (!string.IsNullOrWhiteSpace(request.Status) && request.Status != "All")
        {
            query = query.Where(v => v.Status == request.Status);
        }

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var s = request.Search.ToLower();
            query = query.Where(v => v.IssuerName.ToLower().Contains(s) || v.IssuerCuit.Contains(s) || v.FormattedNumber.Contains(s));
        }

        var list = await query.OrderByDescending(v => v.IssueDate).ThenByDescending(v => v.CreatedAtUtc).ToListAsync(cancellationToken);
        return Result<IReadOnlyList<PurchaseArcaVoucherDto>>.Success(list.Select(MapVoucherToDto).ToList());
    }

    public async Task<Result<bool>> Handle(IgnoreArcaVoucherCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var voucher = await _dbContext.Set<PurchaseArcaVoucher>()
            .FirstOrDefaultAsync(v => v.Id == request.Id && v.TenantId == tenantId, cancellationToken);

        if (voucher == null)
            return Result<bool>.Failure(Error.NotFound("Purchases.Arca.NotFound", $"Comprobante {request.Id} no encontrado."));

        voucher.Ignore();
        await _dbContext.SaveChangesAsync(cancellationToken);
        return Result<bool>.Success(true);
    }

    public async Task<Result<ImportArcaCsvResult>> Handle(ImportArcaCsvCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        if (string.IsNullOrWhiteSpace(request.CsvContent))
            return Result<ImportArcaCsvResult>.Failure(Error.Validation("Purchases.Arca.Empty", "El archivo CSV está vacío."));

        var lines = request.CsvContent.Split(new[] { "\r\n", "\r", "\n" }, StringSplitOptions.RemoveEmptyEntries);
        if (lines.Length < 2)
            return Result<ImportArcaCsvResult>.Failure(Error.Validation("Purchases.Arca.Invalid", "El archivo CSV no contiene filas de datos."));

        char delimiter = lines[0].Contains(';') ? ';' : ',';
        var headers = lines[0].Split(delimiter).Select(h => h.Trim().Trim('"').ToLowerInvariant()).ToList();

        // Exact & Priority Column Detection for ARCA "Mis Comprobantes Emitidos / Recibidos"
        int idxDate = FindHeader(headers, "fecha de emisión", "fecha de emision", "fecha emision", "fecha");
        int idxType = FindHeader(headers, "tipo de comprobante", "tipo comprobante", "tipo de cbte", "tipo cbte", "tipo");
        int idxPtoVta = FindHeader(headers, "punto de venta", "pto vta", "pto. vta.", "pv");
        int idxNum = FindHeader(headers, "número desde", "numero desde", "nro desde", "nro. desde", "numero", "número", "nro");
        int idxCae = FindHeader(headers, "cód. autorización", "cod. autorizacion", "cod autorizacion", "autorizacion", "autorización", "cae");
        int idxCuit = FindHeader(headers, "nro. doc. emisor", "nro doc emisor", "nro. doc emisor", "doc. emisor", "cuit emisor", "cuit");
        int idxName = FindHeader(headers, "denominación emisor", "denominacion emisor", "denominación", "denominacion", "razón social", "razon social", "nombre emisor", "emisor");
        int idxNet = FindHeader(headers, "imp. neto gravado total", "neto gravado total", "imp neto gravado total", "neto total", "imp. neto gravado", "neto gravado", "neto");
        int idxExempt = FindHeader(headers, "imp. op. exentas", "op. exentas", "exentas", "imp exentas", "exento");
        int idxVat = FindHeader(headers, "total iva", "iva total", "imp. iva", "imp iva", "iva");
        int idxOther = FindHeader(headers, "otros tributos", "tributos", "percepciones");
        int idxTotal = FindHeader(headers, "imp. total", "importe total", "total");
        int idxCurr = FindHeader(headers, "moneda");
        int idxRate = FindHeader(headers, "tipo cambio", "tipo de cambio", "cotizacion", "cambio");

        var batchId = $"ARCA-{DateTime.UtcNow:yyyyMMddHHmmss}";
        int imported = 0;
        int updated = 0;
        int skipped = 0;
        int linked = 0;

        for (int i = 1; i < lines.Length; i++)
        {
            var rawLine = lines[i].Trim();
            if (string.IsNullOrWhiteSpace(rawLine)) continue;

            var cols = ParseCsvLine(rawLine, delimiter);
            if (cols.Count <= Math.Max(idxDate, Math.Max(idxCuit, idxNum)))
            {
                skipped++;
                continue;
            }

            string dateStr = GetCol(cols, idxDate);
            string cuit = Regex.Replace(GetCol(cols, idxCuit), @"\D", "");
            string name = GetCol(cols, idxName);
            string typeRaw = GetCol(cols, idxType);
            string cae = GetCol(cols, idxCae);

            if (string.IsNullOrWhiteSpace(cuit) || cuit.Length < 10)
            {
                skipped++;
                continue;
            }

            int ptoVta = int.TryParse(GetCol(cols, idxPtoVta), out var pv) ? pv : 1;
            long num = long.TryParse(GetCol(cols, idxNum), out var n) ? n : 0;
            decimal net = ParseDecimal(GetCol(cols, idxNet));
            decimal exempt = ParseDecimal(GetCol(cols, idxExempt));
            decimal vat = ParseDecimal(GetCol(cols, idxVat));
            decimal other = ParseDecimal(GetCol(cols, idxOther));
            decimal total = ParseDecimal(GetCol(cols, idxTotal));
            if (total == 0 && (net > 0 || vat > 0)) total = net + exempt + vat + other;

            string curr = GetCol(cols, idxCurr);
            if (string.IsNullOrWhiteSpace(curr) || curr.Contains("PES") || curr.Contains("$")) curr = "ARS";
            else if (curr.Contains("DOL") || curr.Contains("USD")) curr = "USD";

            decimal rate = ParseDecimal(GetCol(cols, idxRate));
            if (rate <= 0) rate = 1;

            DateTime issueDate = DateTime.UtcNow;
            if (!string.IsNullOrWhiteSpace(dateStr))
            {
                if (DateTime.TryParseExact(dateStr, new[] { "dd/MM/yyyy", "d/M/yyyy", "yyyy-MM-dd", "dd-MM-yyyy" }, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsedDt))
                {
                    issueDate = DateTime.SpecifyKind(parsedDt, DateTimeKind.Utc);
                }
            }

            var (typeDisplayName, typeCode, letter) = ResolveVoucherTypeInfo(typeRaw);

            // Verificar si ya existe en purchase_arca_vouchers
            var existing = await _dbContext.Set<PurchaseArcaVoucher>()
                .FirstOrDefaultAsync(v => v.TenantId == tenantId && v.IssuerCuit == cuit && v.PointOfSale == ptoVta && v.VoucherNumber == num, cancellationToken);

            if (existing != null)
            {
                // Si el comprobante existente tenía la razón social dañada o importes en 0, actualizarlo
                if (existing.IssuerName == "80" || string.IsNullOrWhiteSpace(existing.IssuerName) || (existing.NetAmount == 0 && net > 0))
                {
                    existing.UpdateImportedData(name, typeDisplayName, typeCode, letter, curr, rate, net, exempt, vat, other, total);
                    updated++;
                }
                else
                {
                    skipped++;
                }
                continue;
            }

            // Buscar si ya está registrada la factura en purchase_invoices
            var matchedInv = await _dbContext.Set<PurchaseInvoice>()
                .FirstOrDefaultAsync(inv => inv.TenantId == tenantId && inv.SupplierDocument == cuit && inv.PointOfSale == ptoVta && inv.InvoiceNumber == num, cancellationToken);

            var voucher = PurchaseArcaVoucher.Create(
                tenantId,
                issueDate,
                typeDisplayName,
                typeCode,
                letter,
                ptoVta,
                num,
                cae,
                "80",
                cuit,
                name,
                curr,
                rate,
                net,
                exempt,
                vat,
                other,
                total,
                null,
                batchId);

            if (matchedInv != null)
            {
                voucher.LinkPurchase(matchedInv.Id);
                linked++;
            }
            else
            {
                imported++;
            }

            _dbContext.Set<PurchaseArcaVoucher>().Add(voucher);
        }

        await _dbContext.SaveChangesAsync(cancellationToken);

        return Result<ImportArcaCsvResult>.Success(new ImportArcaCsvResult(
            batchId,
            imported + updated + skipped + linked,
            imported + updated,
            skipped,
            linked,
            $"Importación ARCA procesada con éxito: {imported} comprobantes nuevos, {updated} actualizados con datos oficiales, {linked} conciliados con facturas existentes, {skipped} omitidos/duplicados."));
    }

    private static int FindHeader(List<string> headers, params string[] patterns)
    {
        // 1. Pass 1: exact match
        foreach (var pattern in patterns)
        {
            for (int i = 0; i < headers.Count; i++)
            {
                if (string.Equals(headers[i], pattern, StringComparison.OrdinalIgnoreCase))
                    return i;
            }
        }

        // 2. Pass 2: substring match
        foreach (var pattern in patterns)
        {
            for (int i = 0; i < headers.Count; i++)
            {
                if (headers[i].Contains(pattern, StringComparison.OrdinalIgnoreCase))
                    return i;
            }
        }

        return -1;
    }

    private static (string DisplayName, int TypeCode, string Letter) ResolveVoucherTypeInfo(string typeStr)
    {
        var clean = typeStr.Trim();
        if (int.TryParse(clean, out var code))
        {
            return code switch
            {
                1 => ("01 - FACTURA A", 1, "A"),
                2 => ("02 - NOTA DE DÉBITO A", 2, "A"),
                3 => ("03 - NOTA DE CRÉDITO A", 3, "A"),
                4 => ("04 - RECIBO A", 4, "A"),
                6 => ("06 - FACTURA B", 6, "B"),
                7 => ("07 - NOTA DE DÉBITO B", 7, "B"),
                8 => ("08 - NOTA DE CRÉDITO B", 8, "B"),
                9 => ("09 - RECIBO B", 9, "B"),
                11 => ("11 - FACTURA C", 11, "C"),
                12 => ("12 - NOTA DE DÉBITO C", 12, "C"),
                13 => ("13 - NOTA DE CRÉDITO C", 13, "C"),
                15 => ("15 - RECIBO C", 15, "C"),
                51 => ("51 - FACTURA M", 51, "M"),
                52 => ("52 - NOTA DE DÉBITO M", 52, "M"),
                53 => ("53 - NOTA DE CRÉDITO M", 53, "M"),
                81 => ("81 - TIQUE FACTURA A", 81, "A"),
                82 => ("82 - TIQUE FACTURA B", 82, "B"),
                111 => ("111 - TIQUE FACTURA C", 111, "C"),
                _ => ($"COMPROBANTE {code}", code, "A")
            };
        }

        var t = clean.ToLowerInvariant();
        int resolvedCode = 1;
        string resolvedLetter = "A";
        string resolvedName = clean.ToUpperInvariant();

        if (t.Contains("factura a") || t.Contains("01 -")) { resolvedCode = 1; resolvedLetter = "A"; resolvedName = "01 - FACTURA A"; }
        else if (t.Contains("nota de débito a") || t.Contains("02 -")) { resolvedCode = 2; resolvedLetter = "A"; resolvedName = "02 - NOTA DE DÉBITO A"; }
        else if (t.Contains("nota de crédito a") || t.Contains("03 -")) { resolvedCode = 3; resolvedLetter = "A"; resolvedName = "03 - NOTA DE CRÉDITO A"; }
        else if (t.Contains("factura b") || t.Contains("06 -")) { resolvedCode = 6; resolvedLetter = "B"; resolvedName = "06 - FACTURA B"; }
        else if (t.Contains("nota de crédito b") || t.Contains("08 -")) { resolvedCode = 8; resolvedLetter = "B"; resolvedName = "08 - NOTA DE CRÉDITO B"; }
        else if (t.Contains("factura c") || t.Contains("11 -")) { resolvedCode = 11; resolvedLetter = "C"; resolvedName = "11 - FACTURA C"; }
        else if (t.Contains("nota de crédito c") || t.Contains("13 -")) { resolvedCode = 13; resolvedLetter = "C"; resolvedName = "13 - NOTA DE CRÉDITO C"; }
        else if (t.Contains("factura m") || t.Contains("51 -")) { resolvedCode = 51; resolvedLetter = "M"; resolvedName = "51 - FACTURA M"; }

        return (resolvedName, resolvedCode, resolvedLetter);
    }

    private static string GetCol(List<string> cols, int idx)
    {
        if (idx >= 0 && idx < cols.Count) return cols[idx].Trim().Trim('"');
        return string.Empty;
    }

    private static List<string> ParseCsvLine(string line, char delimiter)
    {
        var result = new List<string>();
        bool inQuotes = false;
        var cur = new System.Text.StringBuilder();

        foreach (char c in line)
        {
            if (c == '"')
            {
                inQuotes = !inQuotes;
            }
            else if (c == delimiter && !inQuotes)
            {
                result.Add(cur.ToString());
                cur.Clear();
            }
            else
            {
                cur.Append(c);
            }
        }
        result.Add(cur.ToString());
        return result;
    }

    private static decimal ParseDecimal(string val)
    {
        if (string.IsNullOrWhiteSpace(val)) return 0;
        val = val.Replace("$", "").Replace(" ", "").Trim();
        if (val.Contains(',') && val.Contains('.'))
        {
            val = val.Replace(".", "").Replace(',', '.');
        }
        else if (val.Contains(','))
        {
            val = val.Replace(',', '.');
        }
        return decimal.TryParse(val, NumberStyles.Any, CultureInfo.InvariantCulture, out var d) ? d : 0;
    }

    // Mapping Helpers
    private static PurchaseOrderDto MapOrderToDto(PurchaseOrder o) =>
        new(
            o.Id,
            o.OrderNumber,
            o.SupplierId,
            o.SupplierName,
            o.SupplierDocument,
            o.IssueDate,
            o.ExpectedDeliveryDate,
            o.Currency,
            o.ExchangeRate,
            o.PaymentTerms,
            o.PaymentMethod,
            o.DeliveryAddress,
            o.Subtotal,
            o.TaxAmount,
            o.Total,
            o.Status,
            o.Notes,
            o.CreatedAtUtc,
            o.Items.Select(i => new PurchaseOrderItemDto(
                i.Id,
                i.ProductId,
                i.Code,
                i.Description,
                i.Quantity,
                i.ReceivedQuantity,
                i.UnitPrice,
                i.DiscountPercent,
                i.TaxRate,
                i.NetSubtotal,
                i.Total)).ToList());

    private static PurchaseReceptionDto MapReceptionToDto(PurchaseReception r) =>
        new(
            r.Id,
            r.ReceptionNumber,
            r.PurchaseOrderId,
            r.SupplierId,
            r.SupplierName,
            r.SupplierRemitoNumber,
            r.ReceptionDate,
            r.WarehouseLocation,
            r.ReceivedBy,
            r.Notes,
            r.CreatedAtUtc,
            r.Items.Select(i => new PurchaseReceptionItemDto(
                i.Id,
                i.ProductId,
                i.Code,
                i.Description,
                i.Quantity,
                i.UnitMeasure,
                i.SerialNumber)).ToList());

    private static PurchaseInvoiceDto MapInvoiceToDto(PurchaseInvoice i) =>
        new(
            i.Id,
            i.InvoiceType,
            i.PointOfSale,
            i.InvoiceNumber,
            i.FormattedNumber,
            i.PurchaseOrderId,
            i.PurchaseReceptionId,
            i.SupplierId,
            i.SupplierName,
            i.SupplierDocument,
            i.SupplierTaxCondition,
            i.IssueDate,
            i.DueDate,
            i.Currency,
            i.ExchangeRate,
            i.Subtotal,
            i.Iva21,
            i.Iva105,
            i.Iva27,
            i.ExemptAmount,
            i.IibbPerception,
            i.IvaPerception,
            i.OtherTaxes,
            i.Total,
            i.Cae,
            i.CaeDueDate,
            i.Status,
            i.Notes,
            i.CreatedAtUtc,
            i.Items.Select(it => new PurchaseInvoiceItemDto(
                it.Id,
                it.ProductId,
                it.Code,
                it.Description,
                it.Quantity,
                it.UnitPrice,
                it.VatRate,
                it.NetSubtotal,
                it.VatAmount,
                it.Total)).ToList());

    // Purchase Requests Handlers
    public async Task<Result<IReadOnlyList<PurchaseRequestDto>>> Handle(ListPurchaseRequestsQuery request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var query = _dbContext.Set<PurchaseRequest>()
            .Include(r => r.Items)
            .Include(r => r.Quotations)
            .Where(r => r.TenantId == tenantId);

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var s = request.Search.ToLower();
            query = query.Where(r => r.RequestNumber.ToLower().Contains(s) || r.RequestedBy.ToLower().Contains(s) || r.Reason.ToLower().Contains(s));
        }

        if (!string.IsNullOrWhiteSpace(request.Status))
        {
            query = query.Where(r => r.Status == request.Status);
        }

        var list = await query.OrderByDescending(r => r.CreatedAtUtc).ToListAsync(cancellationToken);
        return Result<IReadOnlyList<PurchaseRequestDto>>.Success(list.Select(MapRequestToDto).ToList());
    }

    public async Task<Result<PurchaseRequestDto>> Handle(GetPurchaseRequestQuery request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var req = await _dbContext.Set<PurchaseRequest>()
            .Include(r => r.Items)
            .Include(r => r.Quotations)
            .FirstOrDefaultAsync(r => r.Id == request.Id && r.TenantId == tenantId, cancellationToken);

        if (req == null)
            return Result<PurchaseRequestDto>.Failure(Error.NotFound("Purchases.Request.NotFound", $"Solicitud de compra {request.Id} no encontrada."));

        return Result<PurchaseRequestDto>.Success(MapRequestToDto(req));
    }

    public async Task<Result<PurchaseRequestDto>> Handle(CreatePurchaseRequestCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var count = await _dbContext.Set<PurchaseRequest>().CountAsync(r => r.TenantId == tenantId, cancellationToken);
        var reqNum = $"SOL-{(count + 1):D4}";

        var purReq = PurchaseRequest.Create(
            tenantId,
            reqNum,
            request.RequestedBy,
            request.Department,
            request.Priority,
            request.RequiredDate,
            request.Reason);

        foreach (var item in request.Items)
        {
            purReq.AddItem(
                item.ProductId,
                item.Code,
                item.Description,
                item.Quantity,
                item.UnitMeasure,
                item.EstimatedUnitPrice,
                item.Notes);
        }

        _dbContext.Set<PurchaseRequest>().Add(purReq);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return Result<PurchaseRequestDto>.Success(MapRequestToDto(purReq));
    }

    public async Task<Result<PurchaseRequestDto>> Handle(ApprovePurchaseRequestCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var req = await _dbContext.Set<PurchaseRequest>()
            .Include(r => r.Items)
            .Include(r => r.Quotations)
            .FirstOrDefaultAsync(r => r.Id == request.Id && r.TenantId == tenantId, cancellationToken);

        if (req == null)
            return Result<PurchaseRequestDto>.Failure(Error.NotFound("Purchases.Request.NotFound", $"Solicitud {request.Id} no encontrada."));

        req.Approve();
        await _dbContext.SaveChangesAsync(cancellationToken);
        return Result<PurchaseRequestDto>.Success(MapRequestToDto(req));
    }

    public async Task<Result<PurchaseRequestDto>> Handle(RejectPurchaseRequestCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var req = await _dbContext.Set<PurchaseRequest>()
            .Include(r => r.Items)
            .Include(r => r.Quotations)
            .FirstOrDefaultAsync(r => r.Id == request.Id && r.TenantId == tenantId, cancellationToken);

        if (req == null)
            return Result<PurchaseRequestDto>.Failure(Error.NotFound("Purchases.Request.NotFound", $"Solicitud {request.Id} no encontrada."));

        req.Reject(request.Reason);
        await _dbContext.SaveChangesAsync(cancellationToken);
        return Result<PurchaseRequestDto>.Success(MapRequestToDto(req));
    }

    public async Task<Result<PurchaseRequestDto>> Handle(AddPurchaseQuotationCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var req = await _dbContext.Set<PurchaseRequest>()
            .FirstOrDefaultAsync(r => r.Id == request.PurchaseRequestId && r.TenantId == tenantId, cancellationToken);

        if (req == null)
            return Result<PurchaseRequestDto>.Failure(Error.NotFound("Purchases.Request.NotFound", $"Solicitud {request.PurchaseRequestId} no encontrada."));

        if (req.Status != "Approved")
            return Result<PurchaseRequestDto>.Failure(Error.Validation("Purchases.Request.NotApproved", "La solicitud debe estar aprobada antes de cargar cotizaciones."));

        var utcIssue = request.IssueDate.Kind == DateTimeKind.Unspecified
            ? DateTime.SpecifyKind(request.IssueDate, DateTimeKind.Utc)
            : request.IssueDate.ToUniversalTime();

        var q = new PurchaseQuotation(
            Guid.NewGuid(),
            tenantId,
            req.Id,
            request.SupplierId,
            request.SupplierName,
            request.SupplierQuoteRef,
            utcIssue,
            request.Currency,
            request.ExchangeRate,
            request.NetAmount,
            request.TaxPercent,
            request.TaxAmount,
            request.TotalAmount,
            request.DeliveryTime,
            request.PaymentTerms,
            request.Notes,
            request.AttachmentBase64,
            request.AttachmentFileName,
            false,
            DateTime.UtcNow);

        _dbContext.Set<PurchaseQuotation>().Add(q);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return await Handle(new GetPurchaseRequestQuery(req.Id), cancellationToken);
    }

    public async Task<Result<PurchaseRequestDto>> Handle(SelectPurchaseQuotationCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var quotes = await _dbContext.Set<PurchaseQuotation>()
            .Where(q => q.PurchaseRequestId == request.PurchaseRequestId && q.TenantId == tenantId)
            .ToListAsync(cancellationToken);

        foreach (var q in quotes)
        {
            q.MarkSelected(q.Id == request.QuotationId);
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
        return await Handle(new GetPurchaseRequestQuery(request.PurchaseRequestId), cancellationToken);
    }

    public async Task<Result<PurchaseRequestDto>> Handle(DeletePurchaseQuotationCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var q = await _dbContext.Set<PurchaseQuotation>()
            .FirstOrDefaultAsync(qt => qt.Id == request.QuotationId && qt.PurchaseRequestId == request.PurchaseRequestId && qt.TenantId == tenantId, cancellationToken);

        if (q != null)
        {
            _dbContext.Set<PurchaseQuotation>().Remove(q);
            await _dbContext.SaveChangesAsync(cancellationToken);
        }

        var req = await _dbContext.Set<PurchaseRequest>()
            .Include(r => r.Items)
            .Include(r => r.Quotations)
            .FirstOrDefaultAsync(r => r.Id == request.PurchaseRequestId && r.TenantId == tenantId, cancellationToken);

        if (req == null)
            return Result<PurchaseRequestDto>.Failure(Error.NotFound("Purchases.Request.NotFound", "Solicitud no encontrada."));

        return Result<PurchaseRequestDto>.Success(MapRequestToDto(req));
    }

    private static PurchaseRequestDto MapRequestToDto(PurchaseRequest r) =>
        new(
            r.Id,
            r.RequestNumber,
            r.RequestedBy,
            r.Department,
            r.Priority,
            r.RequiredDate,
            r.Reason,
            r.Status,
            r.RejectionReason,
            r.PurchaseOrderId,
            r.CreatedAtUtc,
            r.UpdatedAtUtc,
            r.Items.Select(i => new PurchaseRequestItemDto(
                i.Id,
                i.ProductId,
                i.Code,
                i.Description,
                i.Quantity,
                i.UnitMeasure,
                i.EstimatedUnitPrice,
                i.Notes)).ToList(),
            r.Quotations.Select(q => new PurchaseQuotationDto(
                q.Id,
                q.PurchaseRequestId,
                q.SupplierId,
                q.SupplierName,
                q.SupplierQuoteRef,
                q.IssueDate,
                q.Currency,
                q.ExchangeRate,
                q.NetAmount,
                q.TaxPercent,
                q.TaxAmount,
                q.TotalAmount,
                q.DeliveryTime,
                q.PaymentTerms,
                q.Notes,
                q.AttachmentBase64,
                q.AttachmentFileName,
                q.IsSelected,
                q.CreatedAtUtc)).ToList());

    private static PurchaseArcaVoucherDto MapVoucherToDto(PurchaseArcaVoucher v) =>
        new(
            v.Id,
            v.IssueDate,
            v.VoucherType,
            v.VoucherTypeCode,
            v.InvoiceLetter,
            v.PointOfSale,
            v.VoucherNumber,
            v.FormattedNumber,
            v.Cae,
            v.IssuerDocType,
            v.IssuerCuit,
            v.IssuerName,
            v.CurrencyCode,
            v.ExchangeRate,
            v.NetAmount,
            v.ExemptAmount,
            v.VatAmount,
            v.OtherTaxes,
            v.TotalAmount,
            v.SupplierId,
            v.PurchaseInvoiceId,
            v.ImportBatch,
            v.Status,
            v.CreatedAtUtc);
}
