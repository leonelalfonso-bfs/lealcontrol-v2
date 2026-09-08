using FluentAssertions;
using LealControl.Modules.Finance.Application;
using LealControl.Modules.Finance.Application.Collections;
using Xunit;

namespace LealControl.Modules.Finance.Tests;

public sealed class CreateCollectionReceiptValidatorTests
{
    [Fact]
    public void Rejects_non_positive_amount()
    {
        var result = CreateCollectionReceiptValidator.Validate(Receipt(amount: 0, description: "Cobro"));

        result.IsFailure.Should().BeTrue();
        result.Error.Should().Be(FinanceErrors.ReceiptAmountMustBePositive);
    }

    [Fact]
    public void Rejects_missing_description()
    {
        var result = CreateCollectionReceiptValidator.Validate(Receipt(amount: 100, description: "  "));

        result.IsFailure.Should().BeTrue();
        result.Error.Should().Be(FinanceErrors.ReceiptDescriptionRequired);
    }

    [Fact]
    public void Rejects_imputation_greater_than_collected()
    {
        var result = CreateCollectionReceiptValidator.Validate(Receipt(
            amount: 100,
            description: "Cobro",
            lines: [new CollectionReceiptLineInput("Cash", 100, "ARS", null, null, null, null, null, null, null)],
            imputations: [new CollectionReceiptImputationInput(Guid.NewGuid(), "FC-1", 200, 200)]));

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("Finance.Receipt.ImputationExceedsCollection");
    }

    [Fact]
    public void Accepts_valid_receipt()
    {
        var result = CreateCollectionReceiptValidator.Validate(Receipt(amount: 1500, description: "Cobro cliente"));

        result.IsSuccess.Should().BeTrue();
        result.Value.TotalLinesAmount.Should().Be(1500);
        result.Value.Currency.Should().Be("ARS");
        result.Value.Description.Should().Be("Cobro cliente");
    }

    private static CreateCollectionReceiptCommand Receipt(
        decimal amount,
        string description,
        IReadOnlyList<CollectionReceiptLineInput>? lines = null,
        IReadOnlyList<CollectionReceiptImputationInput>? imputations = null) =>
        new(
            AccountId: null,
            CustomerId: null,
            InvoiceId: null,
            MovementId: null,
            ChequeId: null,
            Amount: amount,
            Currency: "ARS",
            InvoiceAmount: null,
            InvoiceCurrency: null,
            InvoiceExchangeRate: null,
            PaymentExchangeRate: null,
            SuggestedAdjustmentArs: null,
            SuggestedAdjustmentType: null,
            ReceiptDateUtc: DateTime.UtcNow,
            Description: description,
            Lines: lines,
            Imputations: imputations);
}
