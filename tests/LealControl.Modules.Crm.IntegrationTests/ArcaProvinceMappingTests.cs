using LealControl.Modules.Crm.Infrastructure.Arca;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class ArcaProvinceMappingTests
{
    [Theory]
    [InlineData("Córdoba", "Cordoba")]
    [InlineData("PROVINCIA DE CÓRDOBA", "Cordoba")]
    [InlineData("SANTA FE", "SantaFe")]
    [InlineData("Entre Ríos", "EntreRios")]
    [InlineData("Ciudad Autónoma de Buenos Aires", "CapitalFederal")]
    [InlineData("Tierra del Fuego, Antártida e Islas del Atlántico Sur", "TierraDelFuego")]
    [InlineData("24", "TierraDelFuego")]
    [InlineData("12", "SantaFe")]
    [InlineData("Desconocida", null)]
    public void Maps_province_without_defaulting_to_Santa_Fe(string raw, string? expected)
    {
        Assert.Equal(expected, ArcaPadronClient.MapProvince(raw));
    }
}
