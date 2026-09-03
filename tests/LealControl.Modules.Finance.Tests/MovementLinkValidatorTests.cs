using FluentAssertions;
using LealControl.Modules.Finance.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace LealControl.Modules.Finance.Tests;

public sealed class MovementLinkValidatorTests : IClassFixture<FinanceWebApplicationFactory>
{
    private readonly FinanceWebApplicationFactory _factory;

    public MovementLinkValidatorTests(FinanceWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task ValidateForCollection_accepts_confirmed_credit_receipt_concept()
    {
        var tenantId = Guid.NewGuid();
        var conceptId = Guid.NewGuid();
        var movementId = Guid.NewGuid();

        await _factory.WithDbAsync(async db =>
        {
            db.FinancialConcepts.Add(new FinancialConcept
            {
                Id = conceptId,
                TenantId = tenantId,
                Code = "COBRO_CLIENTE",
                Name = "Cobro",
                Direction = FinancialConceptDirection.Income,
                UsableIn = FinancialConceptUsableIn.Receipt,
                IsActive = true,
                CreatedAtUtc = DateTime.UtcNow
            });
            db.Movements.Add(new FinancialMovement
            {
                Id = movementId,
                TenantId = tenantId,
                AccountId = Guid.NewGuid(),
                Kind = FinancialMovementKind.Credit,
                Amount = 1000m,
                ConceptId = conceptId,
                ClassificationStatus = FinancialClassificationStatus.Confirmed,
                ReconciliationStatus = FinancialReconciliationStatus.Available,
                OperationDateUtc = DateTime.UtcNow,
                Description = "Cobro",
                CreatedAtUtc = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
        });

        await _factory.WithDbAsync(async db =>
        {
            var (ok, error, movement) = await FinanceMovementLinkValidator.ValidateForCollectionAsync(
                db, tenantId, movementId, conceptId, CancellationToken.None);
            ok.Should().BeTrue(error);
            movement.Should().NotBeNull();
        });
    }

    [Fact]
    public async Task ValidateForCollection_rejects_debit_and_unconfirmed()
    {
        var tenantId = Guid.NewGuid();
        var conceptId = Guid.NewGuid();
        var debitId = Guid.NewGuid();
        var pendingId = Guid.NewGuid();

        await _factory.WithDbAsync(async db =>
        {
            db.FinancialConcepts.Add(new FinancialConcept
            {
                Id = conceptId,
                TenantId = tenantId,
                Code = "COBRO_CLIENTE",
                Name = "Cobro",
                Direction = FinancialConceptDirection.Income,
                UsableIn = FinancialConceptUsableIn.Receipt,
                IsActive = true,
                CreatedAtUtc = DateTime.UtcNow
            });
            db.Movements.AddRange(
                new FinancialMovement
                {
                    Id = debitId,
                    TenantId = tenantId,
                    AccountId = Guid.NewGuid(),
                    Kind = FinancialMovementKind.Debit,
                    Amount = 100m,
                    ConceptId = conceptId,
                    ClassificationStatus = FinancialClassificationStatus.Confirmed,
                    OperationDateUtc = DateTime.UtcNow,
                    Description = "x",
                    CreatedAtUtc = DateTime.UtcNow
                },
                new FinancialMovement
                {
                    Id = pendingId,
                    TenantId = tenantId,
                    AccountId = Guid.NewGuid(),
                    Kind = FinancialMovementKind.Credit,
                    Amount = 100m,
                    ConceptId = conceptId,
                    ClassificationStatus = FinancialClassificationStatus.Suggested,
                    OperationDateUtc = DateTime.UtcNow,
                    Description = "y",
                    CreatedAtUtc = DateTime.UtcNow
                });
            await db.SaveChangesAsync();
        });

        await _factory.WithDbAsync(async db =>
        {
            var debit = await FinanceMovementLinkValidator.ValidateForCollectionAsync(
                db, tenantId, debitId, conceptId, CancellationToken.None);
            debit.Ok.Should().BeFalse();
            debit.Error.Should().Contain("ingreso");

            var pending = await FinanceMovementLinkValidator.ValidateForCollectionAsync(
                db, tenantId, pendingId, conceptId, CancellationToken.None);
            pending.Ok.Should().BeFalse();
            pending.Error.Should().Contain("confirmado");
        });
    }

    [Fact]
    public async Task ValidateForPayment_requires_expense_payment_order_concept()
    {
        var tenantId = Guid.NewGuid();
        var conceptId = Guid.NewGuid();
        var movementId = Guid.NewGuid();

        await _factory.WithDbAsync(async db =>
        {
            db.FinancialConcepts.Add(new FinancialConcept
            {
                Id = conceptId,
                TenantId = tenantId,
                Code = "PAGO_PROVEEDOR",
                Name = "Pago",
                Direction = FinancialConceptDirection.Expense,
                UsableIn = FinancialConceptUsableIn.PaymentOrder,
                IsActive = true,
                CreatedAtUtc = DateTime.UtcNow
            });
            db.Movements.Add(new FinancialMovement
            {
                Id = movementId,
                TenantId = tenantId,
                AccountId = Guid.NewGuid(),
                Kind = FinancialMovementKind.Debit,
                Amount = 500m,
                ConceptId = conceptId,
                ClassificationStatus = FinancialClassificationStatus.Confirmed,
                OperationDateUtc = DateTime.UtcNow,
                Description = "Pago",
                CreatedAtUtc = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
        });

        await _factory.WithDbAsync(async db =>
        {
            var (ok, error, _) = await FinanceMovementLinkValidator.ValidateForPaymentAsync(
                db, tenantId, movementId, conceptId, CancellationToken.None);
            ok.Should().BeTrue(error);
        });
    }
}
