using FluentAssertions;
using LealControl.Modules.Finance.Infrastructure;
using Xunit;

namespace LealControl.Modules.Finance.Tests;

public sealed class StatementOrderTests
{
    private static FinancialMovement Debit(int day, decimal amount, decimal? balance, int loadedSecond) => new()
    {
        Id = Guid.NewGuid(), Kind = FinancialMovementKind.Debit, Amount = amount, ReportedBalance = balance,
        OperationDateUtc = new DateTime(2026, 11, day, 0, 0, 0, DateTimeKind.Utc), Description = $"{amount}",
        CreatedAtUtc = new DateTime(2026, 11, 25, 10, 0, loadedSecond, DateTimeKind.Utc)
    };

    [Fact]
    public void Same_day_follows_the_bank_balance_chain_not_the_load_order()
    {
        // El 685.000 vino en un extracto; el 5.310 y el 200.000 en el siguiente, cargados en otro orden.
        var earlier = Debit(20, 11_616m, 1_825_254.49m, 0);
        var first = Debit(24, 685_000m, 1_140_254.49m, 1);
        var tax = Debit(24, 5_310m, 934_944.49m, 2);
        var transfer = Debit(24, 200_000m, 940_254.49m, 3);
        var manual = Debit(24, 50m, null, 0);

        var ordered = FinanceImport.StatementOrder([tax, manual, transfer, earlier, first]);

        ordered.Should().Equal(earlier, first, transfer, tax, manual);
    }
}
