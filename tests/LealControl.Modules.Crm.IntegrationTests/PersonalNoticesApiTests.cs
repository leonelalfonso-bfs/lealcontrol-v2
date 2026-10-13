using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LealControl.Api.Notices;
using LealControl.BuildingBlocks.Notices;
using Npgsql;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>
/// Avisos personales: cada usuario ve solo los avisos que su perfil le permite y eligió; el
/// resumen diario sale de la casilla del sistema. Reloj de pruebas: 2/10/2026.
/// </summary>
public sealed class PersonalNoticesApiTests : IAsyncLifetime
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

    private async Task<HttpClient> UserAsync(HttpClient admin, string name, Dictionary<string, string> matrix, bool amounts)
    {
        var profile = await Json(await admin.PostAsJsonAsync("/api/v1/company/permission-profiles", new
        {
            name, matrix, seeAmounts = amounts, seeCosts = false, seeSalaries = false
        }));
        var email = $"{name.Replace(" ", "").ToLowerInvariant()}@example.com";
        var user = await Json(await admin.PostAsJsonAsync("/api/v1/company/users", new
        {
            fullName = name, email, role = "Comercial", password = "Clave-1234", profileId = profile.GetProperty("id").GetGuid()
        }));
        return _factory.CreateClientForUser(user.GetProperty("id").GetGuid(), email);
    }

    private static string[] Codes(JsonElement settings) =>
        settings.GetProperty("notices").EnumerateArray().Select(n => n.GetProperty("code").GetString()!).OrderBy(c => c).ToArray();

    [Fact]
    public async Task Each_user_only_gets_the_notices_their_profile_allows()
    {
        using var admin = _factory.CreateAuthenticatedClient();
        Assert.Equal(["finance.cheques-to-deposit", "fleet.expirations", "fleet.people-credentials", "fleet.service-orders", "fleet.services", "sales.overdue-invoices", "sales.quotes-expiring"],
            Codes(await Json(await admin.GetAsync("/api/v1/notices/settings"))));

        using var seller = await UserAsync(admin, "Vendedor", new Dictionary<string, string> { ["sales"] = "Edit" }, amounts: true);
        Assert.Equal(["sales.overdue-invoices", "sales.quotes-expiring"], Codes(await Json(await seller.GetAsync("/api/v1/notices/settings"))));

        // Sin "importes", tampoco las facturas vencidas (muestran saldos).
        using var clerk = await UserAsync(admin, "Recepcion", new Dictionary<string, string> { ["sales"] = "View" }, amounts: false);
        Assert.Equal(["sales.quotes-expiring"], Codes(await Json(await clerk.GetAsync("/api/v1/notices/settings"))));
        using (var forbidden = await clerk.PutAsJsonAsync("/api/v1/notices/settings", new { code = "fleet.expirations", enabled = true }))
            Assert.Equal(HttpStatusCode.BadRequest, forbidden.StatusCode);
    }

    [Fact]
    public async Task Overdue_invoice_shows_up_and_can_be_turned_off()
    {
        using var admin = _factory.CreateAuthenticatedClient();
        var customer = Guid.NewGuid();
        var invoice = await Json(await admin.PostAsJsonAsync("/api/v1/sales/invoices", new
        {
            invoiceType = "A", pointOfSale = 3, customerId = customer, customerName = "Cliente Moroso", customerDocument = "20123456786",
            customerTaxCondition = "ResponsableInscripto", issueDate = "2026-08-01", dueDate = "2026-08-31", fiscalConcept = 1,
            currency = "ARS", exchangeRate = 1m, restockItems = false,
            items = new[] { new { code = "X", description = "Servicio", quantity = 1m, unitPrice = 1000m, vatRate = 21m } }
        }));
        await using (var db = new NpgsqlConnection(_factory.DatabaseConnectionString))
        {
            await db.OpenAsync();
            await using var cmd = new NpgsqlCommand("""UPDATE sales.invoices SET "Status" = 'Authorized' WHERE "Id" = @id""", db);
            cmd.Parameters.AddWithValue("id", invoice.GetProperty("id").GetGuid());
            await cmd.ExecuteNonQueryAsync();
        }

        var mine = await Json(await admin.GetAsync("/api/v1/notices/mine"));
        var overdue = mine.GetProperty("groups").EnumerateArray().Single(g => g.GetProperty("code").GetString() == "sales.overdue-invoices");
        var item = overdue.GetProperty("items")[0];
        Assert.Contains("Cliente Moroso", item.GetProperty("title").GetString());
        Assert.Contains("Venció hace 32 días", item.GetProperty("detail").GetString());
        Assert.Contains("1.210,00", item.GetProperty("detail").GetString());

        await Json(await admin.PutAsJsonAsync("/api/v1/notices/settings", new { code = "sales.overdue-invoices", enabled = false }));
        var after = await Json(await admin.GetAsync("/api/v1/notices/mine"));
        Assert.DoesNotContain(after.GetProperty("groups").EnumerateArray(), g => g.GetProperty("code").GetString() == "sales.overdue-invoices");
    }

    [Fact]
    public async Task Cheques_and_fleet_notices_come_from_their_modules()
    {
        using var admin = _factory.CreateAuthenticatedClient();
        using (var cheque = await admin.PostAsJsonAsync("/api/v1/finance/echeqs", new
        {
            checkNumber = "12345678", amount = 250000m, currency = "ARS", issueDateUtc = "2026-09-01T12:00:00Z",
            dueDateUtc = "2026-10-03T12:00:00Z", issuerName = "Cliente SA", direction = "Received"
        }))
            Assert.True(cheque.IsSuccessStatusCode, await cheque.Content.ReadAsStringAsync());
        using (var unit = await admin.PostAsJsonAsync("/api/v1/fleet/vehicles", new
        {
            type = "Pickup", plate = "AB123CD", brand = "Toyota", model = "Hilux", year = 2022, meterType = "Kilometers", status = "Active"
        }))
            Assert.Equal(HttpStatusCode.Created, unit.StatusCode);

        var groups = (await Json(await admin.GetAsync("/api/v1/notices/mine"))).GetProperty("groups").EnumerateArray().ToList();
        var cheques = groups.Single(g => g.GetProperty("code").GetString() == "finance.cheques-to-deposit");
        Assert.Contains("Cliente SA", cheques.GetProperty("items")[0].GetProperty("title").GetString());
        Assert.Contains("250.000,00", cheques.GetProperty("items")[0].GetProperty("detail").GetString());
        var fleet = groups.Single(g => g.GetProperty("code").GetString() == "fleet.expirations");
        Assert.Equal(2, fleet.GetProperty("items").GetArrayLength()); // falta VTV y seguro
    }

    [Fact]
    public async Task Digest_needs_the_system_mailbox()
    {
        using var admin = _factory.CreateAuthenticatedClient();
        var settings = await Json(await admin.GetAsync("/api/v1/notices/settings"));
        Assert.False(settings.GetProperty("systemMailConfigured").GetBoolean());
        var result = await Json(await admin.PostAsync("/api/v1/notices/send-me-now", null));
        Assert.False(result.GetProperty("sent").GetBoolean());
        Assert.Contains("casilla del sistema", result.GetProperty("detail").GetString());
    }

    [Fact]
    public void Digest_email_groups_notices_and_links_to_each_one()
    {
        var groups = new List<NoticeGroup>
        {
            new("fleet.expirations", "fleet", "Vencimientos de flota", [new NoticeItem("AB123CD — Seguro", "Venció el 30/09/2026", "/flota/vehiculos/1", NoticeSeverity.Critical)]),
            new("sales.quotes-expiring", "sales", "Presupuestos por vencer", [new NoticeItem("Presupuesto P-1 (rev. 0)", "Vence hoy", "/presupuestos/2", NoticeSeverity.Info)])
        };
        var (subject, html, text) = NoticeCenter.DigestEmail(groups, new DateOnly(2026, 10, 2), "BFS", "Leonel Alfonso", "https://erp.example.com");
        Assert.Equal("Tus avisos de hoy en BFS: 2 — 02/10/2026", subject);
        Assert.Contains("Hola Leonel", html);
        Assert.Contains("https://erp.example.com/flota/vehiculos/1", html);
        Assert.Contains("- Presupuesto P-1 (rev. 0) — Vence hoy", text);
    }
}
