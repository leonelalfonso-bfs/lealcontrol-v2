using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LealControl.Api.Security;
using LealControl.Modules.Crm.Domain.Settings;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>
/// Permisos P2: cada pedido se controla contra el nivel de su ruta, con los permisos leídos de la
/// base (un cambio de perfil aplica sin volver a iniciar sesión).
/// </summary>
public sealed class PermissionLevelsApiTests : IAsyncLifetime
{
    private readonly CrmWebApplicationFactory _factory = new();
    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, body);
        using var doc = JsonDocument.Parse(body);
        return doc.RootElement.Clone();
    }

    private async Task<(Guid ProfileId, HttpClient Client)> UserWithProfileAsync(HttpClient admin, string systemKey, string email)
    {
        var profiles = await Json(await admin.GetAsync("/api/v1/company/permission-profiles"));
        var profileId = profiles.EnumerateArray().Single(p => p.TryGetProperty("systemKey", out var k) && k.GetString() == systemKey).GetProperty("id").GetGuid();
        var user = await Json(await admin.PostAsJsonAsync("/api/v1/company/users", new
        {
            fullName = email, email, role = "Comercial", password = "Clave-1234", profileId
        }));
        return (profileId, _factory.CreateClientForUser(user.GetProperty("id").GetGuid(), email));
    }

    private static object Invoice() => new
    {
        invoiceType = "A", pointOfSale = 3, customerId = Guid.NewGuid(), customerName = "Cliente", customerDocument = "20123456786",
        customerTaxCondition = "ResponsableInscripto", issueDate = "2026-10-02", dueDate = "2026-10-02", fiscalConcept = 1,
        currency = "ARS", exchangeRate = 1m, restockItems = false,
        items = new[] { new { code = "X", description = "Ítem", quantity = 1m, unitPrice = 100m, vatRate = 21m } }
    };

    [Fact]
    public async Task Levels_are_enforced_per_route_and_changes_apply_without_logging_in_again()
    {
        using var admin = _factory.CreateAuthenticatedClient();
        var (salesProfile, seller) = await UserWithProfileAsync(admin, "sales", "vendedor@example.com");

        // Ventas (Cargar): crea borradores, consulta productos, no ve finanzas ni configura.
        var invoice = await Json(await seller.PostAsJsonAsync("/api/v1/sales/invoices", Invoice()));
        Assert.Equal(HttpStatusCode.OK, (await seller.GetAsync("/api/v1/sales/products")).StatusCode);
        using (var finance = await seller.GetAsync("/api/v1/finance/accounts"))
        {
            Assert.Equal(HttpStatusCode.Forbidden, finance.StatusCode);
            Assert.Contains("Finanzas", await finance.Content.ReadAsStringAsync());
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await seller.GetAsync("/api/v1/company/permission-profiles")).StatusCode);
        using (var product = await seller.PostAsJsonAsync("/api/v1/sales/products", new { code = "P1", name = "Producto" }))
            Assert.Equal(HttpStatusCode.Forbidden, product.StatusCode);

        // Autorizar en ARCA pide Aprobar.
        var authorize = $"/api/v1/sales/invoices/{invoice.GetProperty("id").GetGuid()}/authorize-arca";
        using (var denied = await seller.PostAsync(authorize, null))
        {
            Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
            Assert.Contains("aprobar", await denied.Content.ReadAsStringAsync());
        }

        // Se le da Aprobar en Ventas: aplica en el pedido siguiente, sin re-login.
        var profiles = await Json(await admin.GetAsync("/api/v1/company/permission-profiles"));
        var sales = profiles.EnumerateArray().Single(p => p.GetProperty("id").GetGuid() == salesProfile);
        var matrix = sales.GetProperty("matrix").EnumerateObject().ToDictionary(p => p.Name, p => p.Value.GetString()!);
        matrix["sales"] = "Approve";
        await Json(await admin.PutAsJsonAsync($"/api/v1/company/permission-profiles/{salesProfile}", new
        {
            name = "Ventas", matrix, seeAmounts = true, seeCosts = false, seeSalaries = false
        }));
        using (var allowed = await seller.PostAsync(authorize, null))
            Assert.NotEqual(HttpStatusCode.Forbidden, allowed.StatusCode);

        var mine = await Json(await seller.GetAsync("/api/v1/auth/permissions"));
        Assert.Equal("Approve", mine.GetProperty("modules").GetProperty("sales").GetString());
        Assert.Equal("None", mine.GetProperty("modules").GetProperty("finance").GetString());
    }

    [Fact]
    public async Task Purchases_profile_manages_products_even_though_they_live_under_sales()
    {
        using var admin = _factory.CreateAuthenticatedClient();
        var (_, buyer) = await UserWithProfileAsync(admin, "purchases", "compras@example.com");
        using var product = await buyer.PostAsJsonAsync("/api/v1/sales/products", new { code = "P2", name = "Repuesto" });
        Assert.NotEqual(HttpStatusCode.Forbidden, product.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await buyer.PostAsJsonAsync("/api/v1/sales/invoices", Invoice())).StatusCode);
    }

    [Fact]
    public async Task Inactive_user_loses_access_immediately()
    {
        using var admin = _factory.CreateAuthenticatedClient();
        var (_, seller) = await UserWithProfileAsync(admin, "sales", "baja@example.com");
        Assert.Equal(HttpStatusCode.OK, (await seller.GetAsync("/api/v1/sales/invoices")).StatusCode);

        var created = (await Json(await admin.GetAsync("/api/v1/company/users"))).EnumerateArray()
            .Single(u => u.GetProperty("email").GetString() == "baja@example.com");
        var id = created.GetProperty("id").GetGuid();
        await Json(await admin.PutAsJsonAsync($"/api/v1/company/users/{id}", new
        {
            id, fullName = "baja", role = "Comercial", isActive = false, profileId = created.GetProperty("profileId").GetGuid()
        }));
        Assert.Equal(HttpStatusCode.Forbidden, (await seller.GetAsync("/api/v1/sales/invoices")).StatusCode);
    }

    [Theory]
    [InlineData("GET", "/api/v1/sales/invoices", "sales", PermissionLevel.View)]
    [InlineData("POST", "/api/v1/sales/invoices", "sales", PermissionLevel.Edit)]
    [InlineData("POST", "/api/v1/sales/invoices/1/authorize-arca", "sales", PermissionLevel.Approve)]
    [InlineData("POST", "/api/v1/finance/collections/1/void", "finance", PermissionLevel.Approve)]
    [InlineData("POST", "/api/v1/accounting/periods/lock", "accounting", PermissionLevel.Approve)]
    [InlineData("POST", "/api/v1/accounting/auto-post/invoice", "accounting", PermissionLevel.Approve)]
    [InlineData("PUT", "/api/v1/sales/products/1", "inventory", PermissionLevel.Edit)]
    [InlineData("PATCH", "/api/v1/sales/production/orders/1/status", "inventory", PermissionLevel.Edit)]
    [InlineData("PUT", "/api/v1/hr/settings", "hr", PermissionLevel.Admin)]
    [InlineData("GET", "/api/v1/crm/opportunities", "sales", PermissionLevel.View)]
    public void Route_rules(string method, string path, string module, PermissionLevel level)
    {
        var requirement = PermissionRules.Resolve(method, path);
        Assert.NotNull(requirement);
        Assert.Equal(module, requirement!.Module);
        Assert.Equal(level, requirement.Level);
    }

    [Theory]
    [InlineData("/api/v1/crm/customers")]
    [InlineData("/api/v1/company/settings")]
    [InlineData("/api/v1/communications/accounts")]
    [InlineData("/api/v1/auth/me")]
    public void Base_routes_are_not_subject_to_module_levels(string path) =>
        Assert.Null(PermissionRules.Resolve("POST", path));
}
