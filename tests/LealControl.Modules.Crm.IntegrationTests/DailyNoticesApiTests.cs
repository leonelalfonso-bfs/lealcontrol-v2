using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LealControl.Api.Notices;
using LealControl.Modules.Fleet.Infrastructure;
using Npgsql;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>Resumen diario de vencimientos de Flota por correo (reloj de pruebas: 2/10/2026).</summary>
public sealed class DailyNoticesApiTests : IAsyncLifetime
{
    private readonly CrmWebApplicationFactory _factory = new();
    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.RootElement.Clone();
    }

    [Fact]
    public void Email_lists_expired_missing_and_due_soon_in_that_order()
    {
        var today = new DateOnly(2026, 10, 2);
        var items = new List<ExpirationItem>
        {
            new(Guid.NewGuid(), "AB123CD", "Toyota Hilux", VehicleType.Pickup, FleetDocType.VtvRto, Guid.NewGuid(), "2026-10-10", 8, ExpirationState.DueSoon),
            new(Guid.NewGuid(), "AE-01", "Toyota 8FG", VehicleType.Forklift, FleetDocType.ForkliftCertification, null, null, null, ExpirationState.Missing),
            new(Guid.NewGuid(), "AA111AA", "Scania", VehicleType.Truck, FleetDocType.InsurancePolicy, Guid.NewGuid(), "2026-09-30", -2, ExpirationState.Expired)
        };

        var (subject, html, text) = DailyNoticeSender.FleetEmail(items, today, "https://erp.example.com");

        Assert.Equal("Flota: 1 vencido(s), 1 sin cargar, 1 por vencer — 02/10/2026", subject);
        Assert.True(html.IndexOf("Vencidos", StringComparison.Ordinal) < html.IndexOf("Sin cargar", StringComparison.Ordinal));
        Assert.True(html.IndexOf("Sin cargar", StringComparison.Ordinal) < html.IndexOf("Por vencer", StringComparison.Ordinal));
        Assert.Contains("AA111AA (Scania) — Seguro: venció el 30/09/2026 (hace 2 días)", text);
        Assert.Contains("AE-01 (Toyota 8FG) — Habilitación autoelevador: sin cargar", text);
        Assert.Contains("AB123CD (Toyota Hilux) — VTV / RTO: vence el 10/10/2026 (en 8 días)", text);
        Assert.Contains("https://erp.example.com/flota", html);
    }

    [Fact]
    public async Task Send_now_reports_why_nothing_was_sent()
    {
        using var client = _factory.CreateAuthenticatedClient();

        // Sin unidades: no hay nada que avisar.
        var empty = await Json(await client.PostAsync("/api/v1/notices/daily/fleet/send-now", null));
        Assert.False(empty.GetProperty("sent").GetBoolean());
        Assert.Contains("Sin novedades", empty.GetProperty("detail").GetString());

        // Una camioneta sin VTV ni seguro: hay avisos, pero falta a quién y desde dónde mandarlos.
        using (var unit = await client.PostAsJsonAsync("/api/v1/fleet/vehicles", new
        {
            type = "Pickup", plate = "AB123CD", brand = "Toyota", model = "Hilux", year = 2022, meterType = "Kilometers", status = "Active"
        }))
            Assert.Equal(HttpStatusCode.Created, unit.StatusCode);

        await using (var db = new NpgsqlConnection(_factory.DatabaseConnectionString))
        {
            await db.OpenAsync();
            await using var cmd = new NpgsqlCommand("""UPDATE public.tenant_users SET "IsActive" = false""", db);
            await cmd.ExecuteNonQueryAsync();
        }
        var noAdmins = await Json(await client.PostAsync("/api/v1/notices/daily/fleet/send-now", null));
        Assert.False(noAdmins.GetProperty("sent").GetBoolean());
        Assert.Contains("administradores", noAdmins.GetProperty("detail").GetString());

        await using (var db = new NpgsqlConnection(_factory.DatabaseConnectionString))
        {
            await db.OpenAsync();
            await using var cmd = new NpgsqlCommand("""
                INSERT INTO public.tenant_users ("Id","TenantId","FullName","Email","Role","IsActive","CreatedAtUtc")
                VALUES (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'Dueño', 'duenio@example.com', 'Admin', true, now())
                """, db);
            await cmd.ExecuteNonQueryAsync();
        }
        var noMailbox = await Json(await client.PostAsync("/api/v1/notices/daily/fleet/send-now", null));
        Assert.False(noMailbox.GetProperty("sent").GetBoolean());
        Assert.Contains("casilla", noMailbox.GetProperty("detail").GetString());

        // La vista previa muestra destinatarios, cantidades y el último resultado.
        var preview = await Json(await client.GetAsync("/api/v1/notices/daily/fleet"));
        Assert.Equal(2, preview.GetProperty("missing").GetInt32());
        Assert.Contains(preview.GetProperty("recipients").EnumerateArray(), r => r.GetProperty("email").GetString() == "duenio@example.com");
        Assert.Equal("2026-10-02", preview.GetProperty("lastDay").GetString());
        Assert.Contains("casilla", preview.GetProperty("lastResult").GetString());
    }

    [Fact]
    public async Task Only_admins_can_send_or_preview()
    {
        using var client = _factory.CreateAuthenticatedClient(role: "Comercial");
        using var preview = await client.GetAsync("/api/v1/notices/daily/fleet");
        Assert.Equal(HttpStatusCode.Forbidden, preview.StatusCode);
        using var send = await client.PostAsync("/api/v1/notices/daily/fleet/send-now", null);
        Assert.Equal(HttpStatusCode.Forbidden, send.StatusCode);
    }
}
