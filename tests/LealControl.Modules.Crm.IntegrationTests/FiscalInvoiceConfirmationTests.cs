using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Sales.Domain.Invoices;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class FiscalInvoiceConfirmationTests
{
    private static (Invoice Invoice, FiscalAuthorizationAttempt Attempt) CreatePair()
    {
        var tenant = new TenantId(Guid.NewGuid());
        var invoice = Invoice.Create(tenant, "A", 3, 1, null, null, Guid.NewGuid(),
            "Cliente de prueba", "20-12345678-6", "ResponsableInscripto", null,
            DateTime.UtcNow.AddDays(30), "ARS", 1m, null);
        invoice.AddItem(null, "SERV", "Servicio", 1m, 1m, 21m);
        var attempt = FiscalAuthorizationAttempt.Reserve(tenant, invoice.Id, 3, 1, 42,
            "30715489629", true, new string('a', 64), "20123456786", invoice.Total);
        return (invoice, attempt);
    }

    [Fact]
    public void Confirmed_reservation_assigns_official_number_and_cae()
    {
        var (invoice, attempt) = CreatePair();
        attempt.Confirm("12345678901234", DateTime.UtcNow.AddDays(10));
        invoice.ConfirmFiscalAuthorization(attempt, new string('a', 64), "https://www.afip.gob.ar/fe/qr/?p=test");
        Assert.Equal("Authorized", invoice.Status);
        Assert.Equal(42, invoice.InvoiceNumber);
        Assert.Equal("0003-00000042", invoice.FormattedNumber);
        Assert.Equal("12345678901234", invoice.Cae);
    }

    [Fact]
    public void Pending_or_unrelated_reservation_cannot_authorize()
    {
        var (invoice, pending) = CreatePair();
        Assert.Throws<InvalidOperationException>(() =>
            invoice.ConfirmFiscalAuthorization(pending, new string('a', 64), "https://www.afip.gob.ar/fe/qr/?p=test"));
        pending.Confirm("12345678901234", DateTime.UtcNow.AddDays(10));
        var other = Invoice.Create(invoice.TenantId, "A", 3, 2, null, null, Guid.NewGuid(),
            "Otro", "20-12345678-6", "ResponsableInscripto", null,
            DateTime.UtcNow.AddDays(30), "ARS", 1m, null);
        other.AddItem(null, "SERV", "Servicio", 1m, 1m, 21m);
        Assert.Throws<InvalidOperationException>(() =>
            other.ConfirmFiscalAuthorization(pending, new string('a', 64), "https://www.afip.gob.ar/fe/qr/?p=test"));
        Assert.Throws<InvalidOperationException>(() =>
            invoice.ConfirmFiscalAuthorization(pending, new string('b', 64), "https://www.afip.gob.ar/fe/qr/?p=test"));
        Assert.Throws<InvalidOperationException>(() =>
            invoice.ConfirmFiscalAuthorization(pending, new string('a', 64), "https://example.com/fe/qr/?p=test"));
        Assert.Equal("Draft", invoice.Status);
        Assert.Equal(1, invoice.InvoiceNumber);
    }

    [Fact]
    public void Confirmed_reservation_cannot_authorize_twice()
    {
        var (invoice, attempt) = CreatePair();
        attempt.Confirm("12345678901234", DateTime.UtcNow.AddDays(10));
        invoice.ConfirmFiscalAuthorization(attempt, new string('a', 64), "https://www.afip.gob.ar/fe/qr/?p=test");
        Assert.Throws<InvalidOperationException>(() =>
            invoice.ConfirmFiscalAuthorization(attempt, new string('a', 64), "https://www.afip.gob.ar/fe/qr/?p=test"));
    }
}
