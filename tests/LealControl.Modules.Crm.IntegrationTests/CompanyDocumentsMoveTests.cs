using System.Net.Http.Json;
using System.Text.Json;
using Npgsql;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>La documentación de la empresa cargada cuando estaba en Flota pasa a RRHH al actualizar, con su archivo.</summary>
public sealed class CompanyDocumentsMoveTests : IAsyncLifetime
{
    private readonly CrmWebApplicationFactory _factory = new();
    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    [Fact]
    public async Task Documents_loaded_in_fleet_move_to_hr()
    {
        var id = Guid.NewGuid();
        await using (var conn = new NpgsqlConnection(_factory.DatabaseConnectionString))
        {
            await conn.OpenAsync();
            await using var cmd = new NpgsqlCommand("""
                CREATE SCHEMA IF NOT EXISTS fleet;
                CREATE TABLE fleet."CompanyDocuments" (
                    "Id" uuid PRIMARY KEY, "TenantId" uuid NOT NULL, "Category" character varying(30) NOT NULL, "Title" character varying(160) NOT NULL,
                    "Number" character varying(80) NOT NULL, "Issuer" character varying(160), "IssueDateUtc" timestamp with time zone,
                    "ExpirationDateUtc" timestamp with time zone, "AlertDaysBefore" integer NOT NULL DEFAULT 30, "FileStorageKey" character varying(300),
                    "FileName" character varying(200), "FileContentType" character varying(100), "IsActive" boolean NOT NULL DEFAULT true,
                    "CreatedAtUtc" timestamp with time zone NOT NULL);
                INSERT INTO fleet."CompanyDocuments" VALUES (@id, '11111111-1111-1111-1111-111111111111', 'Art', '', '123', 'ART SA', NULL,
                    '2026-12-31 12:00:00+00', 30, 'hr/clave-archivo', 'art.pdf', 'application/pdf', true, now());
                """, conn);
            cmd.Parameters.AddWithValue("id", id);
            await cmd.ExecuteNonQueryAsync();
        }

        using var client = _factory.CreateAuthenticatedClient();
        var response = await client.GetAsync("/api/v1/hr/company-documents");
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, body);
        var doc = Assert.Single(JsonDocument.Parse(body).RootElement.EnumerateArray());
        Assert.Equal(id, doc.GetProperty("id").GetGuid());
        Assert.Equal("ART – certificado de cobertura", doc.GetProperty("title").GetString());
        Assert.Equal("art.pdf", doc.GetProperty("fileName").GetString());
        Assert.Equal("2026-12-31", doc.GetProperty("expirationDate").GetString());

        await using var check = new NpgsqlConnection(_factory.DatabaseConnectionString);
        await check.OpenAsync();
        await using var exists = new NpgsqlCommand("""SELECT to_regclass('fleet."CompanyDocuments"') IS NULL""", check);
        Assert.True((bool)(await exists.ExecuteScalarAsync())!);
    }
}
