using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Results;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Sales.Application.Invoices;
using LealControl.Modules.Sales.Domain.Invoices;
using LealControl.Modules.Sales.Domain.Inventory;
using LealControl.Modules.Sales.Domain.Products;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LealControl.Modules.Sales.Infrastructure.Persistence;

internal sealed class InvoiceConfiguration : IEntityTypeConfiguration<Invoice>
{
    public void Configure(EntityTypeBuilder<Invoice> builder)
    {
        builder.ToTable("invoices", "sales");
        builder.HasKey(i => i.Id);
        builder.Property(i => i.TenantId).HasConversion(id => id.Value, value => new TenantId(value));
        builder.Property(i => i.InvoiceType).HasMaxLength(20).IsRequired();
        builder.Property(i => i.FormattedNumber).HasMaxLength(32).IsRequired();
        builder.Property(i => i.CustomerName).HasMaxLength(256).IsRequired();
        builder.Property(i => i.CustomerDocument).HasMaxLength(32).IsRequired();
        builder.Property(i => i.CustomerTaxCondition).HasMaxLength(64).IsRequired();
        builder.Property(i => i.CustomerAddress).HasMaxLength(512);
        builder.Property(i => i.Currency).HasMaxLength(10).IsRequired();
        builder.Property(i => i.Cae).HasMaxLength(32);
        builder.Property(i => i.Status).HasMaxLength(32).IsRequired();
        builder.HasIndex(i => new { i.TenantId, i.PointOfSale, i.InvoiceType, i.InvoiceNumber })
            .HasDatabaseName("UX_invoice_authorized_number").IsUnique()
            .HasFilter("\"Status\" = 'Authorized'");

        builder.HasMany(i => i.Items)
            .WithOne()
            .HasForeignKey(item => item.InvoiceId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class InvoiceItemConfiguration : IEntityTypeConfiguration<InvoiceItem>
{
    public void Configure(EntityTypeBuilder<InvoiceItem> builder)
    {
        builder.ToTable("invoice_items", "sales");
        builder.HasKey(i => i.Id);
        builder.Property(i => i.Code).HasMaxLength(80).IsRequired();
        builder.Property(i => i.Description).HasMaxLength(512).IsRequired();
        builder.HasIndex(i => i.RemitoItemId);
    }
}

internal sealed class InvoiceQueryHandlers
    : IRequestHandler<ListInvoicesQuery, Result<IReadOnlyList<InvoiceDto>>>,
      IRequestHandler<GetInvoiceByIdQuery, Result<InvoiceDto>>,
      IRequestHandler<CreateInvoiceCommand, Result<InvoiceDto>>,
      IRequestHandler<AuthorizeInvoiceArcaCommand, Result<InvoiceDto>>
{
    private readonly SalesDbContext _dbContext;
    private readonly ITenantContext _tenantContext;

    public InvoiceQueryHandlers(SalesDbContext dbContext, ITenantContext tenantContext)
    {
        _dbContext = dbContext;
        _tenantContext = tenantContext;
    }

    public async Task<Result<IReadOnlyList<InvoiceDto>>> Handle(ListInvoicesQuery request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var query = _dbContext.Invoices
            .Include(i => i.Items)
            .AsNoTracking()
            .Where(i => i.TenantId == tenantId);

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var s = request.Search.Trim().ToLower();
            query = query.Where(i => i.FormattedNumber.ToLower().Contains(s)
                                  || i.CustomerName.ToLower().Contains(s)
                                  || i.CustomerDocument.Contains(s));
        }

        if (!string.IsNullOrWhiteSpace(request.Status) && request.Status != "All")
        {
            query = query.Where(i => i.Status == request.Status);
        }

        if (!string.IsNullOrWhiteSpace(request.Type) && request.Type != "All")
        {
            query = query.Where(i => i.InvoiceType == request.Type);
        }

        var list = await query.OrderByDescending(i => i.IssueDate).ToListAsync(cancellationToken);
        IReadOnlyList<InvoiceDto> dtos = list.Select(MapToDto).ToList();
        return Result<IReadOnlyList<InvoiceDto>>.Success(dtos);
    }

    public async Task<Result<InvoiceDto>> Handle(GetInvoiceByIdQuery request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var invoice = await _dbContext.Invoices
            .Include(i => i.Items)
            .AsNoTracking()
            .FirstOrDefaultAsync(i => i.Id == request.Id && i.TenantId == tenantId, cancellationToken);

        if (invoice == null)
        {
            return Result<InvoiceDto>.Failure(Error.NotFound("Sales.Invoice.NotFound", $"Factura {request.Id} no encontrada."));
        }

        return Result<InvoiceDto>.Success(MapToDto(invoice));
    }

    public async Task<Result<InvoiceDto>> Handle(CreateInvoiceCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        if (request.Items is null || request.Items.Count == 0)
            return Result<InvoiceDto>.Failure(Error.Validation("Sales.Invoice.Empty", "La factura debe tener al menos un ítem."));

        await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);
        LealControl.Modules.Sales.Domain.Remitos.Remito? linkedRemito = null;
        if (request.RemitoId is Guid remitoId)
        {
            await _dbContext.Database.ExecuteSqlInterpolatedAsync(
                $@"SELECT 1 FROM sales.remitos WHERE ""Id"" = {remitoId} AND ""TenantId"" = {tenantId.Value} FOR UPDATE",
                cancellationToken);
            linkedRemito = await _dbContext.Remitos.Include(r => r.Items)
                .FirstOrDefaultAsync(r => r.Id == remitoId && r.TenantId == tenantId, cancellationToken);
            if (linkedRemito is null || linkedRemito.Status != "Delivered" ||
                linkedRemito.InvoiceId.HasValue || linkedRemito.CustomerId != request.CustomerId ||
                (request.OrderId.HasValue && request.OrderId != linkedRemito.OrderId) ||
                await _dbContext.Invoices.AnyAsync(i => i.TenantId == tenantId && i.RemitoId == remitoId, cancellationToken))
                return Result<InvoiceDto>.Failure(
                    Error.Validation("Sales.Invoice.InvalidRemito", "El remito no existe, ya fue facturado o no corresponde al cliente y pedido."));

            var returns = await _dbContext.RemitoReturns.Include(r => r.Items)
                .Where(r => r.TenantId == tenantId && r.RemitoId == remitoId)
                .ToListAsync(cancellationToken);
            var returned = returns.SelectMany(r => r.Items).GroupBy(i => i.RemitoItemId)
                .ToDictionary(g => g.Key, g => g.Sum(i => i.Quantity));
            if (request.Items.Any(i => i.RemitoItemId is null || i.Quantity <= 0))
                return Result<InvoiceDto>.Failure(
                    Error.Validation("Sales.Invoice.RemitoItems", "Cada ítem a facturar debe provenir del remito y tener cantidad positiva."));
            var invoiced = request.Items.GroupBy(i => i.RemitoItemId!.Value)
                .ToDictionary(g => g.Key, g => g.Sum(i => i.Quantity));
            if (linkedRemito.Items.Any(line =>
                    line.Quantity - returned.GetValueOrDefault(line.Id) != invoiced.GetValueOrDefault(line.Id)) ||
                invoiced.Keys.Any(id => linkedRemito.Items.All(line => line.Id != id)))
                return Result<InvoiceDto>.Failure(
                    Error.Validation("Sales.Invoice.RemitoBalance", "La factura debe contener exactamente lo enviado menos lo devuelto en cada renglón del remito."));
        }
        else if (request.OrderId is Guid directOrderId &&
            await _dbContext.Remitos.AnyAsync(r => r.TenantId == tenantId &&
                r.OrderId == directOrderId && r.Status == "Delivered", cancellationToken))
        {
            return Result<InvoiceDto>.Failure(
                Error.Validation("Sales.Invoice.UseRemito", "El pedido tiene remitos entregados. Facturá desde el remito para respetar las devoluciones."));
        }

        // Auto calculate next sequential invoice number for PointOfSale & InvoiceType
        var lastInvoice = await _dbContext.Invoices
            .Where(i => i.TenantId == tenantId && i.PointOfSale == request.PointOfSale && i.InvoiceType == request.InvoiceType)
            .OrderByDescending(i => i.InvoiceNumber)
            .FirstOrDefaultAsync(cancellationToken);

        int nextNum = (lastInvoice?.InvoiceNumber ?? 0) + 1;

        var invoice = Invoice.Create(
            tenantId,
            request.InvoiceType,
            request.PointOfSale,
            nextNum,
            request.OrderId,
            request.RemitoId,
            request.CustomerId,
            request.CustomerName,
            request.CustomerDocument,
            request.CustomerTaxCondition,
            request.CustomerAddress,
            request.DueDate,
            request.Currency,
            request.ExchangeRate,
            request.Notes,
            request.IssueDate);

        foreach (var item in request.Items)
        {
            invoice.AddItem(
                item.ProductId,
                item.Code,
                item.Description,
                item.Quantity,
                item.UnitPrice,
                item.VatRate,
                item.RemitoItemId);
        }

        _dbContext.Invoices.Add(invoice);

        // 1. Si la factura proviene de un Remito existente (request.RemitoId != null):
        // Vincula el Remito y lo marca como facturado. NO descuenta stock (el remito ya lo egresó).
        if (linkedRemito is not null)
        {
            linkedRemito.MarkAsInvoiced(invoice.Id, invoice.FormattedNumber);
        }
        else
        {
            // 2. Si es una Factura Directa / Venta de Mostrador (sin remito previo):
            // Descuenta stock físico de los productos inventariables para que no quede la mercadería sin descontar.
            var warehouse = await _dbContext.Warehouses
                .FirstOrDefaultAsync(w => w.TenantId == tenantId && w.Type == WarehouseType.MainWarehouse, cancellationToken)
                ?? await _dbContext.Warehouses.FirstOrDefaultAsync(w => w.TenantId == tenantId, cancellationToken);

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
                        .FirstOrDefaultAsync(s => s.ProductId == prodId.Value && s.TenantId == tenantId && (warehouse == null || s.WarehouseId == warehouse.Id || s.WarehouseId == null), cancellationToken);
                    if (stock == null)
                    {
                        stock = StockItem.Create(tenantId, prodId.Value, 0, 0, "Depósito Central", warehouse?.Id, warehouse?.Name);
                        _dbContext.StockItems.Add(stock);
                    }

                    var isCreditNote = request.InvoiceType.StartsWith("NC", StringComparison.OrdinalIgnoreCase);
                    var stockDelta = isCreditNote ? item.Quantity : -item.Quantity;

                    var previous = stock.PhysicalStock;
                    stock.AdjustStock(previous + stockDelta, stock.MinimumStock, warehouse?.Name ?? "Depósito Central");

                    if (product != null && product.TrackStock)
                    {
                        product.AdjustStock(stockDelta);
                    }

                    _dbContext.StockMovements.Add(StockMovement.Create(
                        tenantId,
                        prodId.Value,
                        isCreditNote ? "CreditNoteReturn" : "SaleInvoiceDirect",
                        stockDelta,
                        previous,
                        stock.PhysicalStock,
                        warehouse?.Id,
                        warehouse?.Name,
                        null,
                        null,
                        null,
                        null,
                        invoice.Id,
                        isCreditNote ? "CreditNote" : "Invoice",
                        invoice.FormattedNumber,
                        isCreditNote ? "Devolución Nota de Crédito" : "Venta Directa",
                        isCreditNote
                            ? $"Ingreso por nota de crédito {invoice.FormattedNumber} de {invoice.CustomerName}"
                            : $"Salida por factura directa {invoice.FormattedNumber} a {invoice.CustomerName}"));
                }
            }
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Result<InvoiceDto>.Success(MapToDto(invoice));
    }

    public async Task<Result<InvoiceDto>> Handle(AuthorizeInvoiceArcaCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var exists = await _dbContext.Invoices.AsNoTracking()
            .AnyAsync(i => i.Id == request.Id && i.TenantId == tenantId, cancellationToken);
        if (!exists)
        {
            return Result<InvoiceDto>.Failure(
                Error.NotFound("Sales.Invoice.NotFound", $"Factura {request.Id} no encontrada."));
        }

        // A CAE is assigned by ARCA, never generated locally. Until WSFE is
        // integrated, keep every invoice unchanged and make the limitation explicit.
        return Result<InvoiceDto>.Failure(
            Error.Validation("Sales.Invoice.ArcaUnavailable",
                "La autorización de ARCA no está conectada en este módulo. No se generó CAE ni se modificó la factura."));
    }

    private static InvoiceDto MapToDto(Invoice i)
    {
        return new InvoiceDto(
            i.Id,
            i.InvoiceType,
            i.PointOfSale,
            i.InvoiceNumber,
            i.FormattedNumber,
            i.OrderId,
            i.RemitoId,
            i.CustomerId,
            i.CustomerName,
            i.CustomerDocument,
            i.CustomerTaxCondition,
            i.CustomerAddress,
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
            i.Total,
            i.Cae,
            i.CaeDueDate,
            i.QrUrl,
            i.Status,
            i.AfipRawResponse,
            i.Notes,
            i.Items.Select(item => new InvoiceItemDto(
                item.Id,
                item.ProductId,
                item.Code,
                item.Description,
                item.Quantity,
                item.UnitPrice,
                item.VatRate,
                item.NetSubtotal,
                item.VatAmount,
                item.Total,
                item.RemitoItemId)).ToList(),
            i.CreatedAtUtc);
    }

}
