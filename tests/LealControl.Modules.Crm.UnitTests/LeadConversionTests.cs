using FluentAssertions;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Domain.Customers;
using LealControl.Modules.Crm.Domain.Leads;
using LealControl.Modules.Crm.Domain.Shared;
using LealControl.Modules.Crm.Domain.ValueObjects;
using Xunit;

namespace LealControl.Modules.Crm.UnitTests;

public sealed class LeadConversionTests
{
    private static readonly DateTime Now = new(2026, 8, 11, 15, 0, 0, DateTimeKind.Utc);
    private static readonly TenantId Tenant = new(Guid.Parse("11111111-1111-1111-1111-111111111111"));

    [Fact]
    public void Convert_open_lead_links_new_customer()
    {
        var lead = Lead.Capture(Tenant, "Consulta web", "Pedro", null, PhoneNumber.Create("3414445566").Value, null, LeadSource.Catalog, null, Now).Value;
        var customerId = CustomerId.New();

        var result = lead.MarkConverted(customerId, Now);

        result.IsSuccess.Should().BeTrue();
        lead.Status.Should().Be(LeadStatus.Converted);
        lead.ConvertedCustomerId.Should().Be(customerId);
        lead.DomainEvents.Should().Contain(e => e is LeadConvertedDomainEvent);
    }

    [Fact]
    public void Cannot_convert_twice()
    {
        var lead = Lead.Capture(Tenant, "Consulta", null, null, PhoneNumber.Create("3414445566").Value, null, LeadSource.Phone, null, Now).Value;
        lead.MarkConverted(CustomerId.New(), Now);

        var second = lead.MarkConverted(CustomerId.New(), Now);

        second.IsFailure.Should().BeTrue();
        second.Error.Code.Should().Be("Crm.Lead.AlreadyConverted");
    }

    [Fact]
    public void Cannot_convert_archived_lead()
    {
        var lead = Lead.Capture(Tenant, "Consulta", null, null, PhoneNumber.Create("3414445566").Value, null, LeadSource.WalkIn, null, Now).Value;
        lead.Archive(Now);

        var result = lead.MarkConverted(CustomerId.New(), Now);

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("Crm.Lead.Archived");
    }
}
