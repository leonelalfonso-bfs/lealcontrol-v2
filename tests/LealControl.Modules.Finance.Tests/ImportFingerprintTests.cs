using FluentAssertions;
using LealControl.Modules.Finance.Infrastructure;
using Xunit;

namespace LealControl.Modules.Finance.Tests;

public sealed class ImportFingerprintTests
{
    [Fact]
    public void BuildFingerprint_is_stable_for_same_row()
    {
        var accountId = Guid.Parse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
        var date = new DateTime(2026, 3, 15, 0, 0, 0, DateTimeKind.Utc);

        var a = FinanceImport.BuildFingerprint(accountId, date, 1000m, FinancialMovementKind.Credit, "op-1", "Transferencia");
        var b = FinanceImport.BuildFingerprint(accountId, date, 1000m, FinancialMovementKind.Credit, "OP-1", "  transferencia  ");

        a.Should().Be(b);
        a.Should().Contain(accountId.ToString("N"));
        a.Should().Contain("2026-03-15");
    }

    [Fact]
    public void BuildFingerprint_differs_when_amount_or_kind_changes()
    {
        var accountId = Guid.NewGuid();
        var date = DateTime.UtcNow.Date;
        var baseFp = FinanceImport.BuildFingerprint(accountId, date, 100m, FinancialMovementKind.Credit, null, "x");

        FinanceImport.BuildFingerprint(accountId, date, 101m, FinancialMovementKind.Credit, null, "x")
            .Should().NotBe(baseFp);
        FinanceImport.BuildFingerprint(accountId, date, 100m, FinancialMovementKind.Debit, null, "x")
            .Should().NotBe(baseFp);
    }

    [Fact]
    public void ComputeFileHash_is_deterministic()
    {
        const string csv = "Fecha;Créditos\n01/01/2026;10";
        FinanceImport.ComputeFileHash(csv).Should().Be(FinanceImport.ComputeFileHash(csv));
        FinanceImport.ComputeFileHash(csv).Should().NotBe(FinanceImport.ComputeFileHash(csv + "\n"));
    }

    [Fact]
    public void CountsTowardBankBalance_excludes_pending_and_matched_system()
    {
        var pending = new FinancialMovement
        {
            Origin = FinancialMovementOrigin.System,
            ReconciliationStatus = FinancialReconciliationStatus.PendingBank
        };
        var matched = new FinancialMovement
        {
            Origin = FinancialMovementOrigin.System,
            ReconciliationStatus = FinancialReconciliationStatus.MatchedToImport
        };
        var imported = new FinancialMovement
        {
            Origin = FinancialMovementOrigin.Imported,
            ReconciliationStatus = FinancialReconciliationStatus.Available
        };

        FinanceImport.CountsTowardBankBalance(pending).Should().BeFalse();
        FinanceImport.CountsTowardBankBalance(matched).Should().BeFalse();
        FinanceImport.CountsTowardBankBalance(imported).Should().BeTrue();
    }

    [Fact]
    public void FindSystemCandidates_prioritizes_external_reference()
    {
        var accountId = Guid.NewGuid();
        var date = new DateTime(2026, 3, 15, 12, 0, 0, DateTimeKind.Utc);
        var pending = new List<FinancialMovement>
        {
            new()
            {
                Id = Guid.NewGuid(),
                AccountId = accountId,
                Kind = FinancialMovementKind.Credit,
                Amount = 1000m,
                OperationDateUtc = date,
                ExternalReference = "OTRA",
                Origin = FinancialMovementOrigin.System,
                ReconciliationStatus = FinancialReconciliationStatus.PendingBank
            },
            new()
            {
                Id = Guid.NewGuid(),
                AccountId = accountId,
                Kind = FinancialMovementKind.Credit,
                Amount = 1000m,
                OperationDateUtc = date.AddDays(1),
                ExternalReference = "OP-1",
                Origin = FinancialMovementOrigin.System,
                ReconciliationStatus = FinancialReconciliationStatus.PendingBank
            }
        };

        var hits = FinanceImport.FindSystemCandidates(
            pending, FinancialMovementKind.Credit, 1000m, date, "op-1", new HashSet<Guid>());

        hits.Should().ContainSingle();
        hits[0].ExternalReference.Should().Be("OP-1");
    }
}
