using FluentAssertions;
using LealControl.Modules.Crm.Domain.Shared;
using LealControl.Modules.Crm.Domain.ValueObjects;
using Xunit;

namespace LealControl.Modules.Crm.UnitTests;

public sealed class PostalAddressTests
{
    [Fact]
    public void Address_without_province_is_rejected()
    {
        PostalAddress.CreateOptional("Mitre 800", "Córdoba", null, "5000")
            .IsFailure.Should().BeTrue();
    }

    [Fact]
    public void Empty_address_remains_optional()
    {
        PostalAddress.CreateOptional(null, null, null, null)
            .Value.Should().BeNull();
    }

    [Fact]
    public void Explicit_province_is_preserved()
    {
        PostalAddress.CreateOptional("Mitre 800", "Córdoba", ArgentineProvince.Cordoba, "5000")
            .Value!.Province.Should().Be(ArgentineProvince.Cordoba);
    }
}
