using LealControl.BuildingBlocks.Results;
using MediatR;

namespace LealControl.Modules.Finance.Application.Payments;

public sealed record PaymentOrderLineInput(
    string Method,
    decimal Amount,
    string Currency,
    Guid? AccountId,
    Guid? BankMovementId,
    Guid? ChequeId,
    Guid? ConceptId,
    string? RetentionType,
    string? RetentionCertificate,
    string? Notes);

public sealed record PaymentOrderImputationInput(
    Guid PurchaseInvoiceId,
    string InvoiceNumber,
    decimal InvoiceTotal,
    decimal AmountImputed);

public sealed record CreatePaymentOrderCommand(
    Guid? SupplierId,
    string SupplierName,
    string? SupplierTaxId,
    DateTime PaymentDateUtc,
    string Currency,
    decimal Amount,
    string? Notes,
    IReadOnlyList<PaymentOrderLineInput>? Lines = null,
    IReadOnlyList<PaymentOrderImputationInput>? Imputations = null)
    : IRequest<Result<CreatedPaymentOrderDto>>;

public sealed record CreatedPaymentOrderDto(
    Guid Id,
    string OrderNumber,
    string Status,
    decimal AdvanceAmount);

public sealed record ValidatedPaymentOrder(
    CreatePaymentOrderCommand Request,
    IReadOnlyList<PaymentOrderLineInput> Lines,
    IReadOnlyList<PaymentOrderImputationInput> Imputations,
    decimal TotalLinesAmount,
    decimal TotalImputedAmount,
    decimal AdvanceAmount,
    string Currency,
    string SupplierName);
