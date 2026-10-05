using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Contracts.Fiscal;
using LealControl.Modules.Sales.Domain.Invoices;
using LealControl.Modules.Sales.Infrastructure.Fiscal;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class FiscalVoucherNumberBoundaryTests
{
    private static readonly WsfeInvoiceAServicePreparation.Data Data = new(
        "20123456786", 80, 1, 1, 2, "20261002", "20261001", "20261002",
        "20261012", 100m, 21m, 121m, 5, "PES", 1m);

    [Theory]
    [InlineData(1L)]
    [InlineData(99_999_999L)]
    public void Official_boundary_numbers_are_accepted(long number)
    {
        var attempt = FiscalAuthorizationAttempt.Reserve(new TenantId(Guid.NewGuid()),
            Guid.NewGuid(), 3, 1, number, "30715489629", false, new string('a', 64),
            Data.ReceiverCuit, Data.TotalAmount);
        Assert.Equal(number, attempt.VoucherNumber);
        var xml = WsfeCaeRequestBuilder.Build(Data, 3, number, "30715489629", "fake-token", "fake-sign");
        Assert.Contains($"<ar:CbteDesde>{number}</ar:CbteDesde>", xml);
    }

    [Theory]
    [InlineData(0L)]
    [InlineData(-1L)]
    [InlineData(100_000_000L)]
    [InlineData(long.MaxValue)]
    public void Number_outside_official_range_cannot_be_reserved_or_sent(long number)
    {
        Assert.Throws<ArgumentException>(() => FiscalAuthorizationAttempt.Reserve(
            new TenantId(Guid.NewGuid()), Guid.NewGuid(), 3, 1, number,
            "30715489629", false, new string('a', 64), Data.ReceiverCuit, Data.TotalAmount));
        Assert.Throws<ArgumentException>(() => WsfeCaeRequestBuilder.Build(
            Data, 3, number, "30715489629", "fake-token", "fake-sign"));
    }
}
