using LealControl.BuildingBlocks.Results;
using MediatR;

namespace LealControl.Modules.Finance.Application.Collections;

public sealed record CollectionReceiptLineInput(
    string Method,
    decimal Amount,
    string Currency,
    Guid? AccountId,
    Guid? MovementId,
    Guid? ChequeId,
    Guid? ConceptId,
    string? RetentionType,
    string? RetentionCertificate,
    string? Notes);

public sealed record CollectionReceiptImputationInput(
    Guid InvoiceId,
    string InvoiceNumber,
    decimal InvoiceTotal,
    decimal AmountImputed);

public sealed record CreateCollectionReceiptCommand(
    Guid? AccountId,
    Guid? CustomerId,
    Guid? InvoiceId,
    Guid? MovementId,
    Guid? ChequeId,
    decimal Amount,
    string Currency,
    decimal? InvoiceAmount,
    string? InvoiceCurrency,
    decimal? InvoiceExchangeRate,
    decimal? PaymentExchangeRate,
    decimal? SuggestedAdjustmentArs,
    string? SuggestedAdjustmentType,
    DateTime ReceiptDateUtc,
    string Description,
    IReadOnlyList<CollectionReceiptLineInput>? Lines = null,
    IReadOnlyList<CollectionReceiptImputationInput>? Imputations = null)
    : IRequest<Result<CreatedCollectionReceiptDto>>;

public sealed record CreatedCollectionReceiptDto(
    Guid Id,
    string ReceiptNumber,
    string Status,
    decimal AdvanceAmount);

public sealed record ValidatedCollectionReceipt(
    CreateCollectionReceiptCommand Request,
    IReadOnlyList<CollectionReceiptLineInput> Lines,
    IReadOnlyList<CollectionReceiptImputationInput> Imputations,
    decimal TotalLinesAmount,
    decimal TotalImputedAmount,
    decimal AdvanceAmount,
    string Currency,
    string Description);
