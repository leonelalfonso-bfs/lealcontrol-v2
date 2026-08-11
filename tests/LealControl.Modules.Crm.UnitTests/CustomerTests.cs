using FluentAssertions;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Domain.Customers;
using LealControl.Modules.Crm.Domain.Shared;
using LealControl.Modules.Crm.Domain.ValueObjects;
using Xunit;

namespace LealControl.Modules.Crm.UnitTests;

public sealed class CustomerTests
{
    private static readonly DateTime Now = new(2026, 8, 11, 12, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void Register_creates_active_customer_and_domain_event()
    {
        var customer = RegisterValid();

        customer.Status.Should().Be(CustomerStatus.Active);
        customer.LegalName.Should().Be("Acme SA");
        customer.Document.Number.Should().Be("20123456786");
        customer.DomainEvents.Should().ContainSingle(e => e is CustomerRegisteredDomainEvent);
    }

    [Fact]
    public void Register_requires_legal_name()
    {
        var document = PartyDocument.Create(DocumentType.Cuit, "20123456786").Value;
        var result = Customer.Register(ValidRegistration() with { LegalName = "  " });

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("Crm.Customer.LegalNameRequired");
        _ = document;
    }

    [Fact]
    public void Responsable_inscripto_cannot_use_dni()
    {
        var document = PartyDocument.ForTaxCondition(TaxCondition.ResponsableInscripto, DocumentType.Dni, "30111222");

        document.IsFailure.Should().BeTrue();
        document.Error.Code.Should().Be("Crm.Customer.CuitRequired");
    }

    [Fact]
    public void Consumidor_final_can_use_dni()
    {
        var document = PartyDocument.ForTaxCondition(TaxCondition.ConsumidorFinal, DocumentType.Dni, "30111222");

        document.IsSuccess.Should().BeTrue();
        document.Value.Type.Should().Be(DocumentType.Dni);
    }

    [Fact]
    public void Add_contact_requires_a_channel()
    {
        var customer = RegisterValid();
        var result = customer.AddContact(
            "Juan",
            ContactRole.Commercial,
            null,
            null,
            null,
            null,
            true,
            null,
            Now);

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("Crm.Contact.ChannelRequired");
    }

    [Fact]
    public void Add_location_and_contact_linked_to_plant()
    {
        var customer = RegisterValid();
        var address = PostalAddress.Create("San Martín 100", "Rosario", ArgentineProvince.SantaFe, "2000").Value;

        customer.AddLocation("Planta Rosario", address, null, null, Now).IsSuccess.Should().BeTrue();
        var locationId = customer.Locations.Single().Id;
        var email = EmailAddress.Create("planta@acme.com").Value;

        customer.AddContact("Ana", ContactRole.Technical, locationId, email, null, null, true, null, Now)
            .IsSuccess.Should().BeTrue();

        customer.Locations.Should().HaveCount(1);
        customer.Contacts.Single().LocationId.Should().Be(locationId);
        customer.Contacts.Single().IsPrimary.Should().BeTrue();
    }

    [Fact]
    public void Only_one_primary_contact()
    {
        var customer = RegisterValid();
        var first = EmailAddress.Create("a@acme.com").Value;
        var second = EmailAddress.Create("b@acme.com").Value;

        customer.AddContact("A", ContactRole.Commercial, null, first, null, null, true, null, Now);
        customer.AddContact("B", ContactRole.Administrative, null, second, null, null, true, null, Now);

        customer.Contacts.Count(c => c.IsPrimary).Should().Be(1);
        customer.Contacts.Single(c => c.IsPrimary).Name.Should().Be("B");
    }

    [Fact]
    public void Fiscal_rate_exclusion_respects_expiry()
    {
        var customer = RegisterValid();
        customer.UpsertFiscalRate(
            FiscalJurisdiction.Arba,
            3.5m,
            0m,
            true,
            new DateOnly(2026, 8, 1),
            false,
            null,
            "EX-1",
            Now).IsSuccess.Should().BeTrue();

        var rate = customer.FiscalRates.Single();
        rate.PerceptionExclusionIsActive(new DateOnly(2026, 7, 31)).Should().BeTrue();
        rate.PerceptionExclusionIsActive(new DateOnly(2026, 8, 2)).Should().BeFalse();
    }

    [Fact]
    public void Deactivate_raises_event()
    {
        var customer = RegisterValid();
        customer.ClearDomainEvents();

        customer.Deactivate(Now).IsSuccess.Should().BeTrue();

        customer.Status.Should().Be(CustomerStatus.Inactive);
        customer.DomainEvents.Should().ContainSingle(e => e is CustomerDeactivatedDomainEvent);
    }

    private static Customer RegisterValid()
    {
        var result = Customer.Register(ValidRegistration());
        result.IsSuccess.Should().BeTrue();
        return result.Value;
    }

    private static CustomerRegistration ValidRegistration()
    {
        var document = PartyDocument.Create(DocumentType.Cuit, "20-12345678-6").Value;
        return new CustomerRegistration(
            new TenantId(Guid.Parse("11111111-1111-1111-1111-111111111111")),
            "Acme SA",
            "Acme",
            document,
            TaxCondition.ResponsableInscripto,
            IibbRegime.ConvenioMultilateral,
            true,
            false,
            EmailAddress.Create("ventas@acme.com").Value,
            PhoneNumber.Create("3415551234").Value,
            null,
            PostalAddress.Create("Mitre 800", "Rosario", ArgentineProvince.SantaFe, "2000").Value,
            1_000_000m,
            30,
            null,
            null,
            Now);
    }
}
