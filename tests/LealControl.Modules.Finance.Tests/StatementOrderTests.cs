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

    private static FinancialMovement Credit(int day, decimal amount, decimal? balance, int loadedSecond) => new()
    {
        Id = Guid.NewGuid(), Kind = FinancialMovementKind.Credit, Amount = amount, ReportedBalance = balance,
        OperationDateUtc = new DateTime(2026, 11, day, 0, 0, 0, DateTimeKind.Utc), Description = $"+{amount}",
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

    [Fact]
    public void Intra_day_zero_sum_cycle_does_not_break_chain_or_cascade_to_next_day()
    {
        // Día 16: llega a 100.000, luego ciclo (+300k, -200k, -100k) vuelve a 100.000, y luego +500k cierra en 600.000.
        // Día 17: arranca en 600.000, -150k -> 450.000, -50k -> 400.000.
        // Cargados desordenados con el mismo CreatedAtUtc (como ocurre cuando Postgres redondea ticks).
        var d16_1 = Credit(16, 100_000m, 100_000m, 0);
        var d16_c1 = Credit(16, 300_000m, 400_000m, 0);
        var d16_c2 = Debit(16, 200_000m, 200_000m, 0);
        var d16_c3 = Debit(16, 100_000m, 100_000m, 0);
        var d16_end = Credit(16, 500_000m, 600_000m, 0);
        var d17_1 = Debit(17, 150_000m, 450_000m, 0);
        var d17_2 = Debit(17, 50_000m, 400_000m, 0);

        // Ponemos d16_end ANTES del ciclo para forzar que un algoritmo greedy se equivoque.
        var ordered = FinanceImport.StatementOrder([d17_2, d16_end, d16_c2, d16_1, d16_c3, d16_c1, d17_1]);

        ordered.Should().Equal(d16_1, d16_c1, d16_c2, d16_c3, d16_end, d17_1, d17_2);

        // Verificar que el saldo corrido coincide exactamente con ReportedBalance en TODOS los renglones.
        var running = 0m;
        foreach (var m in ordered)
        {
            running += m.Kind == FinancialMovementKind.Credit ? m.Amount : -m.Amount;
            running.Should().Be(m.ReportedBalance);
        }
    }
}
