using FluentAssertions;
using LealControl.Modules.Finance.Application;
using LealControl.Modules.Finance.Application.Payments;
using Xunit;

namespace LealControl.Modules.Finance.Tests;

public sealed class CreatePaymentOrderValidatorTests
{
    [Fact]
    public void Rejects_missing_supplier_name()
    {
        var result = CreatePaymentOrderValidator.Validate(Order(supplierName: " ", amount: 100));

        result.IsFailure.Should().BeTrue();
        result.Error.Should().Be(FinanceErrors.PaymentSupplierNameRequired);
    }

    [Fact]
    public void Rejects_non_positive_amount()
    {
        var result = CreatePaymentOrderValidator.Validate(Order(supplierName: "Proveedor SA", amount: 0));

        result.IsFailure.Should().BeTrue();
        result.Error.Should().Be(FinanceErrors.PaymentAmountMustBePositive);
    }

    [Fact]
    public void Rejects_amount_that_does_not_match_lines()
    {
        var result = CreatePaymentOrderValidator.Validate(Order(
            supplierName: "Proveedor SA",
            amount: 50,
            lines: [new PaymentOrderLineInput("Cash", 100, "ARS", null, null, null, null, null, null, null)]));

        result.IsFailure.Should().BeTrue();
        result.Error.Should().Be(FinanceErrors.PaymentAmountMustMatchLines);
    }

    [Fact]
    public void Accepts_valid_payment_order()
    {
        var result = CreatePaymentOrderValidator.Validate(Order(supplierName: "Proveedor SA", amount: 2500));

        result.IsSuccess.Should().BeTrue();
        result.Value.SupplierName.Should().Be("Proveedor SA");
        result.Value.TotalLinesAmount.Should().Be(2500);
    }

    private static CreatePaymentOrderCommand Order(
        string supplierName,
        decimal amount,
        IReadOnlyList<PaymentOrderLineInput>? lines = null) =>
        new(
            SupplierId: null,
            SupplierName: supplierName,
            SupplierTaxId: null,
            PaymentDateUtc: DateTime.UtcNow,
            Currency: "ARS",
            Amount: amount,
            Notes: null,
            Lines: lines);
}
