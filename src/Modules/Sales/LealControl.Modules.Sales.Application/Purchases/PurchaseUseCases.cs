using System;
using System.Collections.Generic;
using LealControl.BuildingBlocks.Results;
using MediatR;

namespace LealControl.Modules.Sales.Application.Purchases;

// DTOs
public sealed record PurchaseOrderItemDto(
    Guid Id,
    Guid? ProductId,
    string Code,
    string Description,
    decimal Quantity,
    decimal ReceivedQuantity,
    decimal UnitPrice,
    decimal DiscountPercent,
    decimal TaxRate,
    decimal NetSubtotal,
    decimal Total);

public sealed record PurchaseOrderDto(
    Guid Id,
    string OrderNumber,
    Guid SupplierId,
    string SupplierName,
    string SupplierDocument,
    DateTime IssueDate,
    DateTime? ExpectedDeliveryDate,
    string Currency,
    decimal ExchangeRate,
    string? PaymentTerms,
    string? PaymentMethod,
    string? DeliveryAddress,
    decimal Subtotal,
    decimal TaxAmount,
    decimal Total,
    string Status,
    string? Notes,
    DateTime CreatedAtUtc,
    IReadOnlyList<PurchaseOrderItemDto> Items);

public sealed record PurchaseReceptionItemDto(
    Guid Id,
    Guid? ProductId,
    string Code,
    string Description,
    decimal Quantity,
    string UnitMeasure,
    string? SerialNumber);

public sealed record PurchaseReceptionDto(
    Guid Id,
    string ReceptionNumber,
    Guid? PurchaseOrderId,
    Guid SupplierId,
    string SupplierName,
    string? SupplierRemitoNumber,
    DateTime ReceptionDate,
    string WarehouseLocation,
    string? ReceivedBy,
    string? Notes,
    string Status,
    DateTime CreatedAtUtc,
    IReadOnlyList<PurchaseReceptionItemDto> Items);

public sealed record PurchaseInvoiceItemDto(
    Guid Id,
    Guid? ProductId,
    string Code,
    string Description,
    decimal Quantity,
    decimal UnitPrice,
    decimal VatRate,
    decimal NetSubtotal,
    decimal VatAmount,
    decimal Total);

public sealed record PurchaseInvoiceDto(
    Guid Id,
    string InvoiceType,
    int PointOfSale,
    long InvoiceNumber,
    string FormattedNumber,
    Guid? PurchaseOrderId,
    Guid? PurchaseReceptionId,
    Guid SupplierId,
    string SupplierName,
    string SupplierDocument,
    string SupplierTaxCondition,
    DateTime IssueDate,
    DateTime DueDate,
    string Currency,
    decimal ExchangeRate,
    decimal Subtotal,
    decimal Iva21,
    decimal Iva105,
    decimal Iva27,
    decimal ExemptAmount,
    decimal IibbPerception,
    decimal IvaPerception,
    decimal OtherTaxes,
    decimal Total,
    string? Cae,
    DateTime? CaeDueDate,
    string Status,
    string? Notes,
    DateTime CreatedAtUtc,
    IReadOnlyList<PurchaseInvoiceItemDto> Items);

public sealed record PurchaseArcaVoucherDto(
    Guid Id,
    DateTime IssueDate,
    string VoucherType,
    int VoucherTypeCode,
    string InvoiceLetter,
    int PointOfSale,
    long VoucherNumber,
    string FormattedNumber,
    string? Cae,
    string IssuerDocType,
    string IssuerCuit,
    string IssuerName,
    string CurrencyCode,
    decimal ExchangeRate,
    decimal NetAmount,
    decimal ExemptAmount,
    decimal VatAmount,
    decimal OtherTaxes,
    decimal TotalAmount,
    Guid? SupplierId,
    Guid? PurchaseInvoiceId,
    string ImportBatch,
    string Status,
    DateTime CreatedAtUtc);

// Write Models
public sealed record PurchaseOrderItemWrite(
    Guid? ProductId,
    string Code,
    string Description,
    decimal Quantity,
    decimal UnitPrice,
    decimal DiscountPercent,
    decimal TaxRate);

public sealed record CreatePurchaseOrderCommand(
    Guid SupplierId,
    string SupplierName,
    string SupplierDocument,
    DateTime? ExpectedDeliveryDate,
    string Currency,
    decimal ExchangeRate,
    string? PaymentTerms,
    string? PaymentMethod,
    string? DeliveryAddress,
    string? Notes,
    IReadOnlyList<PurchaseOrderItemWrite> Items) : IRequest<Result<PurchaseOrderDto>>;

public sealed record UpdatePurchaseOrderStatusCommand(
    Guid Id,
    string Status) : IRequest<Result<PurchaseOrderDto>>;

public sealed record ListPurchaseOrdersQuery(
    string? Search = null,
    string? Status = null) : IRequest<Result<IReadOnlyList<PurchaseOrderDto>>>;

public sealed record GetPurchaseOrderQuery(
    Guid Id) : IRequest<Result<PurchaseOrderDto>>;

// Receptions Write Models
public sealed record PurchaseReceptionItemWrite(
    Guid? ProductId,
    string Code,
    string Description,
    decimal Quantity,
    string UnitMeasure = "u",
    string? SerialNumber = null);

public sealed record CreatePurchaseReceptionCommand(
    Guid? PurchaseOrderId,
    Guid? PurchaseInvoiceId,
    Guid SupplierId,
    string SupplierName,
    string? SupplierRemitoNumber,
    DateTime ReceptionDate,
    string WarehouseLocation,
    string? ReceivedBy,
    string? Notes,
    IReadOnlyList<PurchaseReceptionItemWrite> Items) : IRequest<Result<PurchaseReceptionDto>>;

public sealed record ListPurchaseReceptionsQuery(
    string? Search = null) : IRequest<Result<IReadOnlyList<PurchaseReceptionDto>>>;

public sealed record GetPurchaseReceptionQuery(
    Guid Id) : IRequest<Result<PurchaseReceptionDto>>;

public sealed record CancelPurchaseReceptionCommand(
    Guid Id,
    string? Reason) : IRequest<Result<PurchaseReceptionDto>>;

// Invoices Write Models
public sealed record PurchaseInvoiceItemWrite(
    Guid? ProductId,
    string Code,
    string Description,
    decimal Quantity,
    decimal UnitPrice,
    decimal VatRate);

public sealed record CreatePurchaseInvoiceCommand(
    string InvoiceType,
    int PointOfSale,
    long InvoiceNumber,
    Guid? PurchaseOrderId,
    Guid? PurchaseReceptionId,
    Guid SupplierId,
    string SupplierName,
    string SupplierDocument,
    string SupplierTaxCondition,
    DateTime IssueDate,
    DateTime DueDate,
    string Currency,
    decimal ExchangeRate,
    decimal IibbPerception,
    decimal IvaPerception,
    decimal OtherTaxes,
    string? Cae,
    DateTime? CaeDueDate,
    string? Notes,
    Guid? ArcaVoucherId,
    IReadOnlyList<PurchaseInvoiceItemWrite> Items) : IRequest<Result<PurchaseInvoiceDto>>;

public sealed record ListPurchaseInvoicesQuery(
    string? Search = null,
    string? Status = null) : IRequest<Result<IReadOnlyList<PurchaseInvoiceDto>>>;

public sealed record GetPurchaseInvoiceQuery(
    Guid Id) : IRequest<Result<PurchaseInvoiceDto>>;

public sealed record CancelPurchaseInvoiceCommand(
    Guid Id,
    string? Reason) : IRequest<Result<PurchaseInvoiceDto>>;

// ARCA Import Commands
public sealed record ImportArcaCsvCommand(
    string CsvContent) : IRequest<Result<ImportArcaCsvResult>>;

public sealed record ImportArcaCsvResult(
    string BatchId,
    int TotalProcessed,
    int Imported,
    int Skipped,
    int Linked,
    string Message);

public sealed record ListArcaVouchersQuery(
    string? Status = "Pending",
    string? Search = null) : IRequest<Result<IReadOnlyList<PurchaseArcaVoucherDto>>>;

public sealed record IgnoreArcaVoucherCommand(
    Guid Id) : IRequest<Result<bool>>;

// Purchase Requests (Requisiciones Internas)
public sealed record PurchaseRequestItemDto(
    Guid Id,
    Guid? ProductId,
    string Code,
    string Description,
    decimal Quantity,
    string UnitMeasure,
    decimal EstimatedUnitPrice,
    string? Notes);

public sealed record PurchaseQuotationDto(
    Guid Id,
    Guid PurchaseRequestId,
    Guid SupplierId,
    string SupplierName,
    string? SupplierQuoteRef,
    DateTime IssueDate,
    string Currency,
    decimal ExchangeRate,
    decimal NetAmount,
    decimal TaxPercent,
    decimal TaxAmount,
    decimal TotalAmount,
    string? DeliveryTime,
    string? PaymentTerms,
    string? Notes,
    string? AttachmentBase64,
    string? AttachmentFileName,
    bool IsSelected,
    DateTime CreatedAtUtc);

public sealed record PurchaseRequestDto(
    Guid Id,
    string RequestNumber,
    string RequestedBy,
    string Department,
    string Priority,
    DateTime? RequiredDate,
    string Reason,
    string Status,
    string? RejectionReason,
    Guid? PurchaseOrderId,
    DateTime CreatedAtUtc,
    DateTime UpdatedAtUtc,
    IReadOnlyList<PurchaseRequestItemDto> Items,
    IReadOnlyList<PurchaseQuotationDto> Quotations);

public sealed record PurchaseRequestItemWrite(
    Guid? ProductId,
    string Code,
    string Description,
    decimal Quantity,
    string UnitMeasure = "u",
    decimal EstimatedUnitPrice = 0,
    string? Notes = null);

public sealed record CreatePurchaseRequestCommand(
    string RequestedBy,
    string Department,
    string Priority,
    DateTime? RequiredDate,
    string Reason,
    IReadOnlyList<PurchaseRequestItemWrite> Items) : IRequest<Result<PurchaseRequestDto>>;

public sealed record ListPurchaseRequestsQuery(
    string? Search = null,
    string? Status = null) : IRequest<Result<IReadOnlyList<PurchaseRequestDto>>>;

public sealed record GetPurchaseRequestQuery(
    Guid Id) : IRequest<Result<PurchaseRequestDto>>;

public sealed record ApprovePurchaseRequestCommand(
    Guid Id) : IRequest<Result<PurchaseRequestDto>>;

public sealed record RejectPurchaseRequestCommand(
    Guid Id,
    string Reason) : IRequest<Result<PurchaseRequestDto>>;

public sealed record AddPurchaseQuotationCommand(
    Guid PurchaseRequestId,
    Guid SupplierId,
    string SupplierName,
    string? SupplierQuoteRef,
    DateTime IssueDate,
    string Currency,
    decimal ExchangeRate,
    decimal NetAmount,
    decimal TaxPercent,
    decimal TaxAmount,
    decimal TotalAmount,
    string? DeliveryTime,
    string? PaymentTerms,
    string? Notes,
    string? AttachmentBase64,
    string? AttachmentFileName) : IRequest<Result<PurchaseRequestDto>>;

public sealed record SelectPurchaseQuotationCommand(
    Guid PurchaseRequestId,
    Guid QuotationId) : IRequest<Result<PurchaseRequestDto>>;

public sealed record DeletePurchaseQuotationCommand(
    Guid PurchaseRequestId,
    Guid QuotationId) : IRequest<Result<PurchaseRequestDto>>;
