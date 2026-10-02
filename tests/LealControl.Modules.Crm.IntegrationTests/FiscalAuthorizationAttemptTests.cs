using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Sales.Domain.Invoices;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class FiscalAuthorizationAttemptTests
{
    [Fact]
    public void Unknown_attempt_keeps_its_number_and_can_only_be_confirmed()
    {
        var attempt = FiscalAuthorizationAttempt.Reserve(new TenantId(Guid.NewGuid()), Guid.NewGuid(),
            5, 1, 44, "30715489629", true, new string('a', 64), "20123456786", 1m);
        attempt.MarkUnknown();
        Assert.Equal("Unknown", attempt.Status);
        Assert.Equal(44, attempt.VoucherNumber);
        Assert.Equal("30715489629", attempt.IssuerCuit);
        Assert.True(attempt.Production);
        Assert.Throws<InvalidOperationException>(() => attempt.Reject());
        attempt.Confirm("12345678901234", new DateTime(2026, 10, 15));
        Assert.Equal("Confirmed", attempt.Status);
        Assert.Equal("12345678901234", attempt.Cae);
    }

    [Fact]
    public void Invalid_or_duplicate_confirmation_is_rejected()
    {
        var attempt = FiscalAuthorizationAttempt.Reserve(new TenantId(Guid.NewGuid()), Guid.NewGuid(),
            5, 1, 44, "30715489629", true, new string('b', 64), "20123456786", 1m);
        Assert.Throws<InvalidOperationException>(() => attempt.Confirm("1", DateTime.UtcNow));
        attempt.Confirm("12345678901234", DateTime.UtcNow);
        Assert.Throws<InvalidOperationException>(() => attempt.Confirm("12345678901234", DateTime.UtcNow));
    }
}
