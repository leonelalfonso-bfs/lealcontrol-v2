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
}
