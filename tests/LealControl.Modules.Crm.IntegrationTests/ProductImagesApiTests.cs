using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>El listado de productos viaja sin las fotos embebidas; se piden aparte solo donde se muestran.</summary>
public sealed class ProductImagesApiTests : IAsyncLifetime
{
    private readonly CrmWebApplicationFactory _factory = new();
    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    [Fact]
    public async Task Product_list_omits_inline_images_and_images_endpoint_returns_them()
    {
        using var client = _factory.CreateAuthenticatedClient();
        const string photo = "data:image/png;base64,iVBORw0KGgo=";
        var created = await client.PostAsJsonAsync("/api/v1/sales/products", new
        {
            code = "FOTO-1", name = "Con foto", type = "Product", imagePath = photo, saleCurrency = "ARS", basePrice = 1000m,
            purchaseCurrency = "ARS", costPrice = 500m, taxRate = 21m, trackStock = false, minStock = 0m, baseUnit = "UN",
            hasSerialNumber = false, trackLot = false
        });
        Assert.True(created.IsSuccessStatusCode, await created.Content.ReadAsStringAsync());
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        var listed = (await client.GetFromJsonAsync<JsonElement>("/api/v1/sales/products")).EnumerateArray()
            .Single(p => p.GetProperty("id").GetGuid() == id);
        Assert.Equal(JsonValueKind.Null, listed.GetProperty("imagePath").ValueKind);
        Assert.True(listed.GetProperty("hasImage").GetBoolean());

        var detail = await client.GetFromJsonAsync<JsonElement>($"/api/v1/sales/products/{id}");
        Assert.Equal(photo, detail.GetProperty("imagePath").GetString());

        var images = await client.GetFromJsonAsync<Dictionary<Guid, string>>($"/api/v1/sales/products/images?ids={id},{Guid.NewGuid()}");
        Assert.Equal(photo, Assert.Single(images!).Value);
    }
}
