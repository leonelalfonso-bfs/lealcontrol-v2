using FluentAssertions;
using LealControl.Modules.Crm.Domain.ValueObjects;
using Xunit;

namespace LealControl.Modules.Crm.UnitTests;

public sealed class CuitTests
{
    [Theory]
    [InlineData("20-12345678-6")]
    [InlineData("20123456786")]
    public void Accepts_valid_cuit(string raw)
    {
        var result = Cuit.Create(raw);

        result.IsSuccess.Should().BeTrue();
        result.Value.Value.Should().Be("20123456786");
        result.Value.Formatted.Should().Be("20-12345678-6");
    }

    [Fact]
    public void Rejects_wrong_checksum()
    {
        var result = Cuit.Create("20123456787");

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("Crm.Document.InvalidCuitChecksum");
    }

    [Fact]
    public void Rejects_short_number()
    {
        var result = Cuit.Create("20123456");

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("Crm.Document.InvalidCuit");
    }
}
