using System;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Sales.Domain.Invoices;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class InvoiceFiscalConceptTests
{
    private static readonly DateTime Issue = new(2026, 10, 2, 0, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime From = new(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime To = new(2026, 10, 2, 0, 0, 0, DateTimeKind.Utc);

    private static Invoice Draft(int concept, DateTime? from = null, DateTime? to = null, DateTime? due = null) =>
        Invoice.Create(new TenantId(Guid.NewGuid()), "A", 1, 1, null, null,
            Guid.NewGuid(), "Cliente de prueba", "20123456789", "ResponsableInscripto",
            null, due ?? Issue.AddDays(10), "ARS", 1m, null, Issue, concept, from, to);

    [Fact]
    public void Service_keeps_concept_and_period()
    {
        var invoice = Draft(2, From, To);
        Assert.Equal(2, invoice.FiscalConcept);
        Assert.Equal(From, invoice.ServiceFrom);
        Assert.Equal(To, invoice.ServiceTo);
        Assert.Equal("Draft", invoice.Status);
    }

    [Fact]
    public void Product_does_not_require_service_period()
    {
        var invoice = Draft(1);
        Assert.Equal(1, invoice.FiscalConcept);
        Assert.Null(invoice.ServiceFrom);
        Assert.Null(invoice.ServiceTo);
    }

    [Fact]
    public void Legacy_draft_remains_unclassified()
    {
        Assert.Equal(0, Draft(0).FiscalConcept);
    }

    [Fact]
    public void Service_requires_both_dates()
    {
        Assert.Throws<ArgumentException>(() => Draft(2));
        Assert.Throws<ArgumentException>(() => Draft(2, From));
    }

    [Fact]
    public void Service_rejects_reversed_dates_and_early_payment_due()
    {
        Assert.Throws<ArgumentException>(() => Draft(2, To, From));
        Assert.Throws<ArgumentException>(() => Draft(2, From, To, Issue.AddDays(-1)));
    }

    [Fact]
    public void Product_rejects_service_dates_and_unknown_concept()
    {
        Assert.Throws<ArgumentException>(() => Draft(1, From, To));
        Assert.Throws<ArgumentOutOfRangeException>(() => Draft(4));
    }
}
