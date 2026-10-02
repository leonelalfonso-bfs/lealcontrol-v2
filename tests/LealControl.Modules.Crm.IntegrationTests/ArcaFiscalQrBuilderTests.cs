using System.Text;
using System.Text.Json;
using LealControl.Modules.Sales.Infrastructure.Fiscal;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class ArcaFiscalQrBuilderTests
{
    private static readonly WsfeInvoiceAServicePreparation.Data Data = new(
        "20123456786", 80, 1, 1, 2, "20261002", "20261001", "20261002",
        "20261010", 0.83m, 0.17m, 1.00m, 5, "PES", 1m);

    [Fact]
    public void Qr_contains_official_invoice_and_authorization_data()
    {
        var url = ArcaFiscalQrBuilder.Build(Data, "30715489629", 3, 42,
            "12345678901234");
        var uri = new Uri(url);
        Assert.Equal("www.arca.gob.ar", uri.Host);
        Assert.Equal("/fe/qr/", uri.AbsolutePath);
        Assert.StartsWith("?p=", uri.Query);
        var json = Encoding.UTF8.GetString(Convert.FromBase64String(
            Uri.UnescapeDataString(uri.Query[3..])));
        using var doc = JsonDocument.Parse(json);
        var payload = doc.RootElement;
        Assert.Equal(1, payload.GetProperty("ver").GetInt32());
        Assert.Equal("2026-10-02", payload.GetProperty("fecha").GetString());
        Assert.Equal(30715489629L, payload.GetProperty("cuit").GetInt64());
        Assert.Equal(3, payload.GetProperty("ptoVta").GetInt32());
        Assert.Equal(1, payload.GetProperty("tipoCmp").GetInt32());
        Assert.Equal(42, payload.GetProperty("nroCmp").GetInt64());
        Assert.Equal(1.00m, payload.GetProperty("importe").GetDecimal());
        Assert.Equal("PES", payload.GetProperty("moneda").GetString());
        Assert.Equal(1m, payload.GetProperty("ctz").GetDecimal());
        Assert.Equal(80, payload.GetProperty("tipoDocRec").GetInt32());
        Assert.Equal(20123456786L, payload.GetProperty("nroDocRec").GetInt64());
        Assert.Equal("E", payload.GetProperty("tipoCodAut").GetString());
        Assert.Equal(12345678901234L, payload.GetProperty("codAut").GetInt64());
    }

    [Theory]
    [InlineData("", 3, 42, "12345678901234")]
    [InlineData("30715489629", 0, 42, "12345678901234")]
    [InlineData("30715489629", 3, 0, "12345678901234")]
    [InlineData("30715489629", 3, 42, "not-a-cae")]
    public void Invalid_data_cannot_create_qr(
        string issuer, int point, long number, string cae)
    {
        Assert.Throws<ArgumentException>(() =>
            ArcaFiscalQrBuilder.Build(Data, issuer, point, number, cae));
    }
}
