using LealControl.Modules.Crm.Contracts.Fiscal;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Sales.Domain.Invoices;
using LealControl.Modules.Sales.Infrastructure.Fiscal;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class WsfeVoucherReconciliationTests
{
    private const string Issuer = "20123456786";
    private const string Cae = "12345678901234";
    private const string Qr = "https://www.afip.gob.ar/fe/qr/?p=test";

    private static (Invoice Invoice, FiscalAuthorizationAttempt Attempt,
        WsfeVoucherReconciliation.Observation Observation) Setup()
    {
        var tenant = new TenantId(Guid.NewGuid());
        var now = DateTime.UtcNow;
        var invoice = Invoice.Create(tenant, "A", 3, 1, null, null, Guid.NewGuid(),
            "Cliente de prueba", "20-12345678-6", "ResponsableInscripto", null,
            now.AddDays(30), "ARS", 1m, null, now);
        invoice.SetFiscalDetails(2, now.AddDays(-2), now);
        invoice.AddItem(null, "SERV", "Servicio", 1m, 1m, 21m);
        Assert.True(WsfeInvoiceAServicePreparation.TryBuild(invoice, out var data, out var error), error);
        Assert.NotNull(data);
        var hash = WsfeCaeRequestBuilder.Fingerprint(data, 3, 42, Issuer);
        var attempt = FiscalAuthorizationAttempt.Reserve(tenant, invoice.Id, 3, 1, 42,
            Issuer, true, hash, data.ReceiverCuit, data.TotalAmount);
        var observation = new WsfeVoucherReconciliation.Observation(true, 42,
            data.ReceiverCuit, data.TotalAmount, Cae, now.AddDays(10));
        return (invoice, attempt, observation);
    }

    [Fact]
    public void Confirmed_lookup_recovers_unknown_submission_without_resending()
    {
        var (invoice, attempt, observation) = Setup();
        attempt.MarkUnknown();
        Assert.True(WsfeVoucherReconciliation.TryConfirm(invoice, attempt, Issuer,
            observation, null, Qr, out var reason), reason);
        Assert.Equal("Confirmed", attempt.Status);
        Assert.Equal("Authorized", invoice.Status);
        Assert.Equal(42, invoice.InvoiceNumber);
    }

    [Theory]
    [InlineData("recipient")]
    [InlineData("amount")]
    [InlineData("number")]
    [InlineData("cae")]
    [InlineData("hash")]
    public void Mismatch_never_confirms(string mismatch)
    {
        var (invoice, attempt, observation) = Setup();
        if (mismatch == "recipient") observation = observation with { RecipientDocument = "20999999999" };
        if (mismatch == "amount") observation = observation with { Total = observation.Total + 1m };
        if (mismatch == "number") observation = observation with { Number = 43 };
        if (mismatch == "cae") observation = observation with { Cae = "00000000000000" };
        var submission = new WsfeCaeReply(WsfeCaeOutcome.ApprovedPendingConsultation,
            Cae, observation.CaeDueDate, "");
        var issuer = mismatch == "hash" ? "20999999999" : Issuer;
        Assert.False(WsfeVoucherReconciliation.TryConfirm(invoice, attempt, issuer,
            observation, submission, Qr, out _));
        Assert.Equal("Pending", attempt.Status);
        Assert.Equal("Draft", invoice.Status);
    }

    [Fact]
    public void Unconfirmed_lookup_never_confirms()
    {
        var (invoice, attempt, observation) = Setup();
        observation = observation with { Confirmed = false };
        Assert.False(WsfeVoucherReconciliation.TryConfirm(invoice, attempt, Issuer,
            observation, null, Qr, out _));
        Assert.Equal("Draft", invoice.Status);
    }
}
