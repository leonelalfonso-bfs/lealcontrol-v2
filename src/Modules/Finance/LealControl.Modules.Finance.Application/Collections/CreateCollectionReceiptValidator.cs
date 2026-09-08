using LealControl.BuildingBlocks.Results;

namespace LealControl.Modules.Finance.Application.Collections;

public static class CreateCollectionReceiptValidator
{
    public static Result<ValidatedCollectionReceipt> Validate(CreateCollectionReceiptCommand body)
    {
        var currency = string.IsNullOrWhiteSpace(body.Currency) ? "ARS" : body.Currency.Trim().ToUpperInvariant();
        var lines = body.Lines ?? Array.Empty<CollectionReceiptLineInput>();
        var imputations = body.Imputations ?? Array.Empty<CollectionReceiptImputationInput>();

        var totalLinesAmount = lines.Count > 0 ? lines.Sum(x => x.Amount) : body.Amount;
        if (totalLinesAmount <= 0)
        {
            return Result.Failure<ValidatedCollectionReceipt>(FinanceErrors.ReceiptAmountMustBePositive);
        }

        if (string.IsNullOrWhiteSpace(body.Description))
        {
            return Result.Failure<ValidatedCollectionReceipt>(FinanceErrors.ReceiptDescriptionRequired);
        }

        var totalImputedAmount = imputations.Count > 0
            ? imputations.Sum(x => x.AmountImputed)
            : (body.InvoiceAmount ?? (body.InvoiceId.HasValue ? totalLinesAmount : 0));

        if (imputations.Count > 0 && totalImputedAmount > totalLinesAmount + 0.01m)
        {
            return Result.Failure<ValidatedCollectionReceipt>(
                FinanceErrors.ReceiptImputationExceedsCollection(totalImputedAmount, totalLinesAmount));
        }

        if (body.InvoiceCurrency is not null
            && body.InvoiceCurrency.Trim().ToUpperInvariant() != currency
            && (!body.InvoiceAmount.HasValue
                || !body.InvoiceExchangeRate.HasValue
                || !body.PaymentExchangeRate.HasValue
                || body.InvoiceAmount <= 0
                || body.InvoiceExchangeRate <= 0
                || body.PaymentExchangeRate <= 0))
        {
            return Result.Failure<ValidatedCollectionReceipt>(FinanceErrors.ReceiptForeignInvoiceRatesRequired);
        }

        return Result.Success(new ValidatedCollectionReceipt(
            body,
            lines,
            imputations,
            totalLinesAmount,
            totalImputedAmount,
            Math.Max(0, totalLinesAmount - totalImputedAmount),
            currency,
            body.Description.Trim()));
    }
}
