using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using LealControl.Api.Security;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>
/// Permisos P3: los datos sensibles no salen del servidor sin el permiso, y quien no los ve no
/// puede borrarlos al guardar.
/// </summary>
public sealed class SensitiveDataApiTests : IAsyncLifetime
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

    /// <summary>Crea un perfil propio y un usuario con él; devuelve el cliente de ese usuario.</summary>
    private async Task<HttpClient> UserAsync(HttpClient admin, string name, Dictionary<string, string> matrix, bool amounts, bool costs, bool salaries)
    {
        var profile = await Json(await admin.PostAsJsonAsync("/api/v1/company/permission-profiles", new
        {
            name, matrix, seeAmounts = amounts, seeCosts = costs, seeSalaries = salaries
        }));
        var email = $"{name.Replace(" ", "").ToLowerInvariant()}@example.com";
        var user = await Json(await admin.PostAsJsonAsync("/api/v1/company/users", new
        {
            fullName = name, email, role = "Comercial", password = "Clave-1234", profileId = profile.GetProperty("id").GetGuid()
        }));
        return _factory.CreateClientForUser(user.GetProperty("id").GetGuid(), email);
    }

    private static object Product(decimal cost) => new
    {
        code = "BAL-1", name = "Balanza", type = "Product", saleCurrency = "ARS", basePrice = 500m, purchaseCurrency = "ARS",
        costPrice = cost, taxRate = 21m, trackStock = false, minStock = 0m, baseUnit = "u", hasSerialNumber = false, trackLot = false
    };

    [Fact]
    public async Task Costs_are_not_sent_and_cannot_be_wiped_by_who_does_not_see_them()
    {
        using var admin = _factory.CreateAuthenticatedClient();
        var product = await Json(await admin.PostAsJsonAsync("/api/v1/sales/products", Product(100m)));
        var id = product.GetProperty("id").GetGuid();

        using var stockKeeper = await UserAsync(admin, "Deposito",
            new Dictionary<string, string> { ["inventory"] = "Edit", ["sales"] = "View" }, amounts: true, costs: false, salaries: false);

        // No recibe el costo ni en el listado ni en el detalle.
        var list = await stockKeeper.GetStringAsync("/api/v1/sales/products");
        Assert.DoesNotContain("costPrice", list);
        Assert.Contains("basePrice", list);
        var detail = await stockKeeper.GetStringAsync($"/api/v1/sales/products/{id}");
        Assert.DoesNotContain("costPrice", detail);

        // Edita el producto (el costo le llega vacío): el costo guardado no se pierde.
        using (var edit = await stockKeeper.PutAsJsonAsync($"/api/v1/sales/products/{id}", Product(0m)))
            Assert.True(edit.IsSuccessStatusCode, await edit.Content.ReadAsStringAsync());
        var saved = await Json(await admin.GetAsync($"/api/v1/sales/products/{id}"));
        Assert.Equal(100m, saved.GetProperty("costPrice").GetDecimal());

        // Producción (costos) y Compras (precios de compra) están cerradas sin el permiso.
        using (var costs = await stockKeeper.GetAsync($"/api/v1/sales/production/costs/{id}"))
        {
            Assert.Equal(HttpStatusCode.Forbidden, costs.StatusCode);
            Assert.Contains("costos", await costs.Content.ReadAsStringAsync());
        }
    }

    [Fact]
    public async Task Without_amounts_finance_accounting_and_current_accounts_are_closed()
    {
        using var admin = _factory.CreateAuthenticatedClient();
        using var reader = await UserAsync(admin, "Consulta",
            new Dictionary<string, string> { ["sales"] = "View", ["finance"] = "View", ["accounting"] = "View", ["purchases"] = "View" },
            amounts: false, costs: false, salaries: false);

        Assert.Equal(HttpStatusCode.OK, (await reader.GetAsync("/api/v1/sales/invoices")).StatusCode);
        foreach (var path in new[] { "/api/v1/finance/accounts", "/api/v1/accounting/accounts", "/api/v1/sales/current-accounts" })
        {
            using var response = await reader.GetAsync(path);
            Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
            Assert.Contains("importes", await response.Content.ReadAsStringAsync());
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await reader.GetAsync("/api/v1/purchases/orders")).StatusCode);
    }

    [Fact]
    public async Task Salaries_are_hidden_from_hr_staff_without_the_permission_and_kept_on_save()
    {
        using var admin = _factory.CreateAuthenticatedClient();
        var employee = await Json(await admin.PostAsJsonAsync("/api/v1/hr/employees", new
        {
            firstName = "Ana", lastName = "Pérez", documentNumber = "30111222", cuil = "27301112223", baseSalary = 900000m, hourlyRate = 5000m
        }));
        var id = employee.GetProperty("id").GetGuid();

        using var clerk = await UserAsync(admin, "Legajos", new Dictionary<string, string> { ["hr"] = "Edit" },
            amounts: false, costs: false, salaries: false);

        var list = await clerk.GetStringAsync("/api/v1/hr/employees");
        Assert.Contains("Ana", list);
        Assert.DoesNotContain("baseSalary", list);
        Assert.DoesNotContain("hourlyRate", list);
        Assert.Equal(HttpStatusCode.Forbidden, (await clerk.GetAsync("/api/v1/hr/payroll/periods")).StatusCode);
        // La liquidación anterior se retiró (nota 68, S0): ni el cálculo ni el Libro de Sueldos falso responden.
        Assert.Equal(HttpStatusCode.NotFound, (await admin.PostAsync($"/api/v1/hr/payroll/periods/{Guid.NewGuid()}/calculate", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/v1/hr/payroll/export-lsd/{Guid.NewGuid()}")).StatusCode);

        var body = JsonNode.Parse(await clerk.GetStringAsync($"/api/v1/hr/employees/{id}"))!.AsObject();
        body["notes"] = "Actualizado por legajos";
        using (var edit = await clerk.PutAsJsonAsync($"/api/v1/hr/employees/{id}", body))
            Assert.True(edit.IsSuccessStatusCode, await edit.Content.ReadAsStringAsync());
        var saved = await Json(await admin.GetAsync($"/api/v1/hr/employees/{id}"));
        Assert.Equal(900000m, saved.GetProperty("baseSalary").GetDecimal());
        Assert.Equal("Actualizado por legajos", saved.GetProperty("notes").GetString());
    }

    [Fact]
    public void Masking_removes_fields_at_any_depth()
    {
        var node = JsonNode.Parse("""{"items":[{"name":"a","costPrice":1,"lines":[{"unitCost":2,"qty":1}]}],"costPrice":3}""");
        SensitiveFieldFilter.Strip(node, new HashSet<string>(["costPrice", "unitCost"], StringComparer.OrdinalIgnoreCase));
        Assert.Equal("""{"items":[{"name":"a","lines":[{"qty":1}]}]}""", node!.ToJsonString());
    }
}
