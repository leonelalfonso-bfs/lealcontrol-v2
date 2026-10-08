using LealControl.BuildingBlocks.Persistence;
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
using LealControl.Modules.Sales.Infrastructure.Fiscal;
using Microsoft.Extensions.Configuration;
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
        builder.Property(i => i.FiscalConcept).HasDefaultValue(0);
        builder.Property(i => i.ExchangeRateType).HasMaxLength(16);
        builder.Property(i => i.FceCbu).HasMaxLength(22);
        builder.Property(i => i.FceAlias).HasMaxLength(20);
        builder.Property(i => i.FceTransferMode).HasMaxLength(3);
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

    private readonly FiscalAuthorizationService _fiscalAuthorization;
    private readonly IConfiguration _configuration;

    public InvoiceQueryHandlers(SalesDbContext dbContext, ITenantContext tenantContext,
        FiscalAuthorizationService fiscalAuthorization, IConfiguration configuration)
    {
        _dbContext = dbContext;
        _tenantContext = tenantContext;
        _fiscalAuthorization = fiscalAuthorization;
        _configuration = configuration;
    }

    public async Task<Result<IReadOnlyList<InvoiceDto>>> Handle(ListInvoicesQuery request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var query = _dbContext.Invoices
            .Include(i => i.Items)
            .AsNoTracking()
            .Where(i => i.TenantId == tenantId);

        foreach (var token in SearchText.Parse(request.Search))
        {
            var text = token.Text;
            var digits = token.HasDigits ? token.Digits : null;
            query = query.Where(i => SearchText.Fold(i.FormattedNumber).Contains(text)
                                  || SearchText.Fold(i.CustomerName).Contains(text)
                                  || (digits != null && (i.CustomerDocument.Replace("-", "").Replace(" ", "").Contains(digits)
                                                         || i.FormattedNumber.Replace("-", "").Replace(" ", "").Contains(digits))));
        }

        if (!string.IsNullOrWhiteSpace(request.Status) && request.Status != "All")
        {
            query = query.Where(i => i.Status == request.Status);
        }

        if (!string.IsNullOrWhiteSpace(request.Type) && request.Type != "All")
        {
            query = query.Where(i => i.InvoiceType == request.Type);
        }

        // Mismo día: lo último cargado primero.
        var list = await query.OrderByDescending(i => i.IssueDate).ThenByDescending(i => i.CreatedAtUtc)
            .ToListAsync(cancellationToken);
        var balances = await ReceivableBalances.ComputeAsync(_dbContext, tenantId, cancellationToken);
        IReadOnlyList<InvoiceDto> dtos = list.Select(i => WithBalance(MapToDto(i), balances)).ToList();
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

        var balances = await ReceivableBalances.ComputeAsync(_dbContext, tenantId, cancellationToken);
        return Result<InvoiceDto>.Success(WithBalance(MapToDto(invoice), balances));
    }

    private static InvoiceDto WithBalance(InvoiceDto dto, IReadOnlyDictionary<Guid, ReceivableBalance> balances) =>
        balances.TryGetValue(dto.Id, out var b)
            ? dto with { Collected = b.Collected, Credited = b.Credited, Pending = b.Pending }
            : dto;

    public async Task<Result<InvoiceDto>> Handle(CreateInvoiceCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        if (request.Items is null || request.Items.Count == 0)
            return Result<InvoiceDto>.Failure(Error.Validation("Sales.Invoice.Empty", "La factura debe tener al menos un ítem."));
        if (request.FiscalConcept is < 0 or > 3 ||
            (request.FiscalConcept is 2 or 3 &&
                (!request.ServiceFrom.HasValue || !request.ServiceTo.HasValue ||
                 request.ServiceTo.Value.Date < request.ServiceFrom.Value.Date ||
                 request.DueDate.Date < (request.IssueDate ?? DateTime.UtcNow).Date)) ||
            (request.FiscalConcept is 0 or 1 &&
                (request.ServiceFrom.HasValue || request.ServiceTo.HasValue)))
            return Result<InvoiceDto>.Failure(Error.Validation("Sales.Invoice.FiscalConcept",
                "Revisá el concepto, el período del servicio y el vencimiento de pago."));

        var isNote = request.InvoiceType is "NC_A" or "NC_B" or "ND_A" or "ND_B"
            or "NC_FCE_A" or "NC_FCE_B" or "ND_FCE_A" or "ND_FCE_B";
        var isCreditNoteType = request.InvoiceType.StartsWith("NC_", StringComparison.Ordinal);
        if (!isNote && request.AssociatedInvoiceId.HasValue)
            return Result<InvoiceDto>.Failure(Error.Validation("Sales.Invoice.UnexpectedAssociation",
                "Solo las notas de crédito o débito se asocian a una factura."));
        if (isNote && (request.AssociatedInvoiceId is null || request.RemitoId.HasValue || request.OrderId.HasValue))
            return Result<InvoiceDto>.Failure(Error.Validation("Sales.Invoice.AssociationRequired",
                "Una nota de crédito o débito se genera desde la factura original autorizada."));

        var exchangeDifference = request.ExchangeDifferenceImputationId.HasValue;
        if (exchangeDifference && !isNote)
            return Result<InvoiceDto>.Failure(Error.Validation("Sales.Invoice.ExchangeDifference",
                "La diferencia de cambio se documenta con una nota de crédito o débito."));

        await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);
        Invoice? replaced = null;
        if (request.ReplacesInvoiceId is Guid replacedId)
        {
            // Solo se reemplaza un borrador cuyo envío ARCA rechazó (o que nunca se envió).
            replaced = await _dbContext.Invoices
                .FirstOrDefaultAsync(i => i.Id == replacedId && i.TenantId == tenantId, cancellationToken);
            var replacedAttempt = await _dbContext.FiscalAuthorizationAttempts.AsNoTracking()
                .FirstOrDefaultAsync(a => a.TenantId == tenantId && a.InvoiceId == replacedId, cancellationToken);
            if (replaced is null || replaced.Status != "Draft" || replaced.Cae is not null ||
                (replacedAttempt is not null && replacedAttempt.Status != "Rejected"))
                return Result<InvoiceDto>.Failure(Error.Validation("Sales.Invoice.NotReplaceable",
                    "Solo se puede corregir un borrador sin CAE cuyo envío ARCA haya sido rechazado."));
            replaced.Cancel();
            // Se guarda antes: libera el saldo a acreditar, la diferencia de cambio y el remito.
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        Invoice? original = null;
        if (isNote)
        {
            var originalId = request.AssociatedInvoiceId!.Value;
            // Serializa las notas de una misma factura para no acreditar dos veces el mismo saldo.
            await _dbContext.Database.ExecuteSqlInterpolatedAsync(
                $@"SELECT 1 FROM sales.invoices WHERE ""Id"" = {originalId} AND ""TenantId"" = {tenantId.Value} FOR UPDATE",
                cancellationToken);
            original = await _dbContext.Invoices.AsNoTracking()
                .FirstOrDefaultAsync(i => i.Id == originalId && i.TenantId == tenantId, cancellationToken);
            // La nota corresponde a su factura: NC_A/ND_A → A o ND_A; NC_FCE_A → FCE_A o ND_FCE_A.
            var letter = FiscalVoucherCodes.BaseType(request.InvoiceType);
            // La diferencia de cambio de una factura en dólares se documenta con una nota en pesos.
            var currencyOk = original?.Currency == request.Currency ||
                (exchangeDifference && original?.Currency == "USD" && request.Currency == "ARS");
            // Sin emisión ARCA las facturas quedan en borrador: la nota se asocia igual, pero solo
            // puede autorizarse en ARCA si la original tiene CAE (ver FiscalAssociation).
            if (original is null || original.Status is not ("Authorized" or "Draft") ||
                original.CustomerId != request.CustomerId || !currencyOk ||
                (original.InvoiceType != letter && original.InvoiceType != "ND_" + letter))
                return Result<InvoiceDto>.Failure(Error.Validation("Sales.Invoice.InvalidAssociation",
                    "La nota debe asociarse a una factura vigente del mismo cliente, moneda y letra."));
        }
        LealControl.Modules.Sales.Domain.Remitos.Remito? linkedRemito = null;
        if (request.RemitoId is Guid remitoId)
        {
            await _dbContext.Database.ExecuteSqlInterpolatedAsync(
                $@"SELECT 1 FROM sales.remitos WHERE ""Id"" = {remitoId} AND ""TenantId"" = {tenantId.Value} FOR UPDATE",
                cancellationToken);
            linkedRemito = await _dbContext.Remitos.Include(r => r.Items)
                .FirstOrDefaultAsync(r => r.Id == remitoId && r.TenantId == tenantId, cancellationToken);
            if (linkedRemito is null || linkedRemito.Status != "Delivered" ||
                (linkedRemito.InvoiceId.HasValue && linkedRemito.InvoiceId != replaced?.Id) ||
                linkedRemito.CustomerId != request.CustomerId ||
                (request.OrderId.HasValue && request.OrderId != linkedRemito.OrderId) ||
                await _dbContext.Invoices.AnyAsync(i => i.TenantId == tenantId && i.RemitoId == remitoId &&
                    i.Status != "Cancelled", cancellationToken))
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
            // Una nota repite el receptor de la factura original tal como se informó a ARCA.
            original?.CustomerName ?? request.CustomerName,
            original?.CustomerDocument ?? request.CustomerDocument,
            original?.CustomerTaxCondition ?? request.CustomerTaxCondition,
            original?.CustomerAddress ?? request.CustomerAddress,
            request.DueDate,
            request.Currency,
            request.ExchangeRate,
            request.Notes,
            request.IssueDate,
            request.FiscalConcept,
            request.ServiceFrom,
            request.ServiceTo,
            original?.Id,
            request.PaidInForeignCurrency,
            request.ExchangeRateType,
            request.ExchangeDifferenceImputationId,
            request.FceCbu,
            request.FceAlias,
            request.FceTransferMode,
            request.FceCancellation);

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

        if (exchangeDifference)
        {
            var imputationId = request.ExchangeDifferenceImputationId!.Value;
            var imputation = await _dbContext.Database.SqlQuery<ExchangeDifferenceRow>($"""
                SELECT i."InvoiceId", i."ExchangeDifferenceArs"
                FROM finance."CollectionReceiptImputations" i
                JOIN finance."CollectionReceipts" r ON r."Id" = i."ReceiptId" AND r."TenantId" = i."TenantId"
                WHERE i."Id" = {imputationId} AND i."TenantId" = {tenantId.Value}
                  AND i."Status" = 'Active' AND r."Status" <> 'Voided'
                """).ToListAsync(cancellationToken);
            var difference = imputation.Count == 1 ? imputation[0].ExchangeDifferenceArs ?? 0m : 0m;
            var expectedType = difference > 0m ? "ND_" : "NC_";
            if (imputation.Count != 1 || imputation[0].InvoiceId != original?.Id || difference == 0m ||
                !request.InvoiceType.StartsWith(expectedType, StringComparison.Ordinal) ||
                invoice.Total != Math.Abs(difference))
                return Result<InvoiceDto>.Failure(Error.Validation("Sales.Invoice.ExchangeDifference",
                    "La nota no coincide con la diferencia de cambio del cobro (tipo, factura o importe)."));
            if (await _dbContext.Invoices.AnyAsync(i => i.TenantId == tenantId &&
                    i.ExchangeDifferenceImputationId == imputationId &&
                    i.Status != "Cancelled" && i.Status != "Rejected", cancellationToken))
                return Result<InvoiceDto>.Failure(Error.Validation("Sales.Invoice.ExchangeDifferenceDocumented",
                    "Esa diferencia de cambio ya tiene su nota emitida."));
        }
        else if (original is not null && isCreditNoteType)
        {
            var notes = await _dbContext.Invoices.AsNoTracking()
                .Where(i => i.TenantId == tenantId && i.AssociatedInvoiceId == original.Id &&
                            i.Status != "Cancelled" && i.Status != "Rejected")
                .Select(i => new { i.InvoiceType, i.Status, i.Total })
                .ToListAsync(cancellationToken);
            var credited = notes.Where(n => n.InvoiceType.StartsWith("NC")).Sum(n => n.Total);
            var debited = notes.Where(n => n.InvoiceType.StartsWith("ND") && n.Status == "Authorized").Sum(n => n.Total);
            var available = original.Total + debited - credited;
            if (invoice.Total > available)
                return Result<InvoiceDto>.Failure(Error.Validation("Sales.Invoice.CreditExceeded",
                    $"La nota de crédito supera lo disponible para acreditar en la factura original ($ {ArsAmount(available)})."));
        }

        _dbContext.Invoices.Add(invoice);

        // 1. Si la factura proviene de un Remito existente (request.RemitoId != null):
        // Vincula el Remito y lo marca como facturado. NO descuenta stock (el remito ya lo egresó).
        if (linkedRemito is not null)
        {
            linkedRemito.MarkAsInvoiced(invoice.Id, invoice.FormattedNumber);
        }
        // Las notas de débito no mueven mercadería; una nota de crédito solo reingresa stock si es devolución.
        // Un comprobante que reemplaza a un borrador rechazado no vuelve a mover stock: ya lo movió el original.
        else if (replaced is null && !request.InvoiceType.StartsWith("ND", StringComparison.OrdinalIgnoreCase) &&
                 !exchangeDifference && (!isCreditNoteType || request.RestockItems))
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

        if (!_configuration.GetValue<bool>("Arca:EnableInvoiceAuthorization"))
        {
            return Result<InvoiceDto>.Failure(
                Error.Validation("Sales.Invoice.ArcaUnavailable",
                    "La autorización de ARCA está deshabilitada. No se generó CAE ni se modificó la factura."));
        }

        var result = await _fiscalAuthorization.AuthorizeAsync(request.Id, cancellationToken);
        if (!result.Confirmed)
        {
            return Result<InvoiceDto>.Failure(
                Error.Validation("Sales.Invoice.ArcaNotConfirmed", result.Detail));
        }
        var authorized = await _dbContext.Invoices.Include(i => i.Items).AsNoTracking()
            .FirstOrDefaultAsync(i => i.Id == request.Id && i.TenantId == tenantId, cancellationToken);
        if (authorized is null || authorized.Status != "Authorized" || string.IsNullOrEmpty(authorized.Cae))
            return Result<InvoiceDto>.Failure(
                Error.Validation("Sales.Invoice.ArcaNotConfirmed", "No se pudo verificar la factura autorizada."));
        return Result<InvoiceDto>.Success(MapToDto(authorized));
    }

    // 1234.5 → "1.234,50", sin depender de la cultura instalada en el servidor.
    private static string ArsAmount(decimal value) =>
        value.ToString("#,0.00", System.Globalization.CultureInfo.InvariantCulture)
            .Replace(",", "\u0001").Replace(".", ",").Replace("\u0001", ".");

    internal static InvoiceDto ToDto(Invoice i) => MapToDto(i);

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
            i.CreatedAtUtc,
            i.FiscalConcept,
            i.ServiceFrom,
            i.ServiceTo,
            i.AssociatedInvoiceId,
            i.PaidInForeignCurrency,
            i.ExchangeRateType,
            i.ExchangeDifferenceImputationId,
            i.FceCbu,
            i.FceAlias,
            i.FceTransferMode,
            i.FceCancellation);
    }

}

internal sealed record ExchangeDifferenceRow(Guid InvoiceId, decimal? ExchangeDifferenceArs);
