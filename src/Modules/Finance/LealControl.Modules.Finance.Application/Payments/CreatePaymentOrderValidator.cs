using LealControl.BuildingBlocks.Results;

namespace LealControl.Modules.Finance.Application.Payments;

public static class CreatePaymentOrderValidator
{
    public static Result<ValidatedPaymentOrder> Validate(CreatePaymentOrderCommand body)
    {
        if (string.IsNullOrWhiteSpace(body.SupplierName))
        {
            return Result.Failure<ValidatedPaymentOrder>(FinanceErrors.PaymentSupplierNameRequired);
        }

        var currency = string.IsNullOrWhiteSpace(body.Currency) ? "ARS" : body.Currency.Trim().ToUpperInvariant();
        var lines = body.Lines ?? Array.Empty<PaymentOrderLineInput>();
        var imputations = body.Imputations ?? Array.Empty<PaymentOrderImputationInput>();
        var totalLinesAmount = lines.Count > 0 ? lines.Sum(x => x.Amount) : body.Amount;

        if (totalLinesAmount <= 0)
        {
            return Result.Failure<ValidatedPaymentOrder>(FinanceErrors.PaymentAmountMustBePositive);
        }

        if (lines.Count > 0 && Math.Abs(totalLinesAmount - body.Amount) > 0.01m)
        {
            return Result.Failure<ValidatedPaymentOrder>(FinanceErrors.PaymentAmountMustMatchLines);
        }

        var totalImputedAmount = imputations.Sum(x => x.AmountImputed);
        if (imputations.Count > 0 && totalImputedAmount > totalLinesAmount + 0.01m)
        {
            return Result.Failure<ValidatedPaymentOrder>(
                FinanceErrors.PaymentImputationExceedsPaid(totalImputedAmount, totalLinesAmount));
        }

        return Result.Success(new ValidatedPaymentOrder(
            body,
            lines,
            imputations,
            totalLinesAmount,
            totalImputedAmount,
            Math.Max(0, totalLinesAmount - totalImputedAmount),
            currency,
            body.SupplierName.Trim()));
    }
}
