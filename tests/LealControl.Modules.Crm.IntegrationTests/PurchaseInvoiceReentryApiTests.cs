using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>Una factura de proveedor anulada por un error de carga no impide cargarla de nuevo.</summary>
public sealed class PurchaseInvoiceReentryApiTests : IAsyncLifetime
{
    private readonly CrmWebApplicationFactory _factory = new();
    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    private static object Invoice(Guid supplier, string issueDate) => new
    {
        invoiceType = "A", pointOfSale = 5, invoiceNumber = 1234L, supplierId = supplier, supplierName = "Proveedor",
        supplierDocument = "30111222333", supplierTaxCondition = "ResponsableInscripto",
        issueDate, dueDate = issueDate, currency = "ARS", exchangeRate = 1m,
        iibbPerception = 0m, ivaPerception = 0m, otherTaxes = 0m,
        items = new[] { new { code = "X", description = "Insumo", quantity = 1.5m, unitPrice = 1234567.89m, vatRate = 21m } }
    };

    [Fact]
    public async Task Cancelled_invoice_can_be_entered_again_but_an_active_one_cannot()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var supplier = Guid.NewGuid();

        using var first = await client.PostAsJsonAsync("/api/v1/purchases/invoices", Invoice(supplier, "2026-09-01"));
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        using var doc = JsonDocument.Parse(await first.Content.ReadAsStringAsync());
        var id = doc.RootElement.GetProperty("id").GetGuid();

        // Mientras está vigente, el mismo número es un duplicado.
        using (var duplicate = await client.PostAsJsonAsync("/api/v1/purchases/invoices", Invoice(supplier, "2026-10-01")))
            Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);

        using (var cancel = await client.PostAsJsonAsync($"/api/v1/purchases/invoices/{id}/cancel", new { reason = "Fecha mal cargada" }))
            Assert.True(cancel.IsSuccessStatusCode, await cancel.Content.ReadAsStringAsync());

        // Anulada: se vuelve a cargar con la fecha correcta (cantidad con decimales e importe grande).
        using var again = await client.PostAsJsonAsync("/api/v1/purchases/invoices", Invoice(supplier, "2026-10-01"));
        Assert.True(again.StatusCode == HttpStatusCode.Created, await again.Content.ReadAsStringAsync());
    }
}
