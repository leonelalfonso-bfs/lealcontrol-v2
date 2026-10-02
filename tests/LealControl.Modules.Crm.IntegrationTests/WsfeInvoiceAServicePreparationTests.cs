using System;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Sales.Domain.Invoices;
using LealControl.Modules.Sales.Infrastructure.Fiscal;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class WsfeInvoiceAServicePreparationTests
{
    private static Invoice Draft(
        string type = "A", string taxCondition = "ResponsableInscripto",
        string cuit = "20123456786", string currency = "ARS", decimal vat = 21m)
    {
        var issue = new DateTime(2026, 10, 2, 0, 0, 0, DateTimeKind.Utc);
        var invoice = Invoice.Create(new TenantId(Guid.NewGuid()), type, 1, 1, null, null,
            Guid.NewGuid(), "Cliente de prueba", cuit, taxCondition, null,
            issue.AddDays(10), currency, 1m, null, issue, 2, issue.AddDays(-1), issue);
        invoice.AddItem(null, "SERV", "Servicio de prueba", 1m, 0.83m, vat);
        return invoice;
    }

    [Fact]
    public void One_peso_service_maps_to_arca_fields()
    {
        var valid = WsfeInvoiceAServicePreparation.TryBuild(Draft(), out var data, out var error);
        Assert.True(valid, error);
        Assert.NotNull(data);
        Assert.Equal("20123456786", data.ReceiverCuit);
        Assert.Equal(80, data.ReceiverDocumentType);
        Assert.Equal(1, data.ReceiverVatCondition);
        Assert.Equal(1, data.VoucherType);
        Assert.Equal(2, data.Concept);
        Assert.Equal("20261002", data.IssueDate);
        Assert.Equal("20261001", data.ServiceFrom);
        Assert.Equal("20261002", data.ServiceTo);
        Assert.Equal("20261012", data.PaymentDue);
        Assert.Equal(0.83m, data.NetAmount);
        Assert.Equal(0.17m, data.VatAmount);
        Assert.Equal(1.00m, data.TotalAmount);
        Assert.Equal(5, data.VatRateCode);
        Assert.Equal("PES", data.CurrencyCode);
    }

    [Theory]
    [InlineData("B", "ResponsableInscripto", "20123456786", "ARS", 21)]
    [InlineData("A", "ConsumidorFinal", "20123456786", "ARS", 21)]
    [InlineData("A", "ResponsableInscripto", "20123456789", "ARS", 21)]
    [InlineData("A", "ResponsableInscripto", "20123456786", "USD", 21)]
    [InlineData("A", "ResponsableInscripto", "20123456786", "ARS", 10)]
    public void Unsupported_or_invalid_data_is_rejected(
        string type, string condition, string cuit, string currency, int vat)
    {
        var valid = WsfeInvoiceAServicePreparation.TryBuild(
            Draft(type, condition, cuit, currency, vat), out var data, out var error);
        Assert.False(valid);
        Assert.Null(data);
        Assert.NotEmpty(error);
    }
}
