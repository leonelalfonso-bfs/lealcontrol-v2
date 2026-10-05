using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Sales.Domain.Invoices;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class InvoiceIssueDateTests
{
    [Fact]
    public void Keeps_the_selected_calendar_date_in_the_draft()
    {
        var selected = new DateTime(2026, 10, 1);
        var invoice = Invoice.Create(new TenantId(Guid.NewGuid()), "A", 1, 1,
            null, null, Guid.NewGuid(), "Cliente", "20123456786", "ResponsableInscripto",
            null, selected.AddDays(30), "ARS", 1m, null, selected);
        Assert.Equal(new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc), invoice.IssueDate);
    }
}
