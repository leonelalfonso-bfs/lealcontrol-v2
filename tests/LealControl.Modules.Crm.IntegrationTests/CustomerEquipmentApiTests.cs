using System.Net.Http.Json;
using System.Text.Json;
using Xunit;
using Xunit.Abstractions;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>Parque de equipos de la ficha del cliente: se guarda y se vuelve a ver.</summary>
public sealed class CustomerEquipmentApiTests(ITestOutputHelper output) : IAsyncLifetime
{
    private readonly CrmWebApplicationFactory _factory = new();
    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    [Fact]
    public async Task Equipment_added_from_the_customer_file_is_saved()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var dni = Random.Shared.Next(10_000_000, 99_999_999).ToString();
        var created = await client.PostAsJsonAsync("/api/v1/crm/customers", new
        {
            legalName = $"Equipos {dni}", documentType = "Dni", documentNumber = dni, taxCondition = "ConsumidorFinal",
            iibbRegime = "NoInscripto", isCustomer = true, isSupplier = false
        });
        Assert.True(created.IsSuccessStatusCode, await created.Content.ReadAsStringAsync());
        var customerId = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        // Lo que manda la pantalla: código, tipo, marca/modelo vacíos, intervalo 12, sin fecha.
        var response = await client.PostAsJsonAsync($"/api/v1/crm/customers/{customerId}/equipments", new
        {
            internalCode = "BAL-001", equipmentType = "Balanza Camionera", brand = "", model = "", serialNumber = "",
            status = "Active", calibrationIntervalMonths = 12
        });
        var body = await response.Content.ReadAsStringAsync();
        output.WriteLine($"{(int)response.StatusCode} {body}");
        Assert.True(response.IsSuccessStatusCode, body);

        var detail = await client.GetFromJsonAsync<JsonElement>($"/api/v1/crm/customers/{customerId}");
        Assert.Equal("BAL-001", Assert.Single(detail.GetProperty("equipments").EnumerateArray()).GetProperty("internalCode").GetString());
    }
}
