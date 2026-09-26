using LealControl.Api.SuperAdmin;
using LealControl.BuildingBlocks.Tenancy;
using Microsoft.EntityFrameworkCore;
using Testcontainers.PostgreSql;
using Xunit;

namespace LealControl.Modules.Communications.Tests;

public sealed class CommunicationsTenantCatalogTests
{
    [Fact]
    public async Task SelectsOnlyActiveTenantsWithCommunicationsExplicitlyEnabled()
    {
        await using var postgres = new PostgreSqlBuilder()
            .WithImage("postgres:16-alpine")
            .WithDatabase("communications_catalog_tests")
            .WithUsername("leal")
            .WithPassword("leal")
            .Build();
        await postgres.StartAsync();
        var options = new DbContextOptionsBuilder<MasterDbContext>()
            .UseNpgsql(postgres.GetConnectionString()).Options;
        await using var db = new MasterDbContext(options);
        await db.Database.EnsureCreatedAsync();

        MasterTenant Tenant(string slug, string status, bool active, string modules) => new()
        {
            Name = slug, Slug = slug, DbName = "db_" + slug,
            Status = status, IsActive = active, EnabledModulesJson = modules
        };
        var enabled = Tenant("enabled", "Active", true, "[\"communications\"]");
        db.Tenants.AddRange(
            enabled,
            Tenant("crm-only", "Active", true, "[\"crm\"]"),
            Tenant("disabled", "Active", false, "[\"communications\"]"),
            Tenant("suspended", "Suspended", true, "[\"communications\"]"),
            Tenant("malformed", "Active", true, "invalid"));
        await db.SaveChangesAsync();

        var settings = new CommunicationsInboxSettings(db);
        var catalog = new CommunicationsTenantCatalog(db, settings);
        Assert.Empty(await catalog.ListEnabledTenantIdsAsync());

        await settings.SetEnabledAsync(true);
        var selected = await catalog.ListEnabledTenantIdsAsync();
        Assert.Equal(new[] { enabled.Id }, selected);
    }
}
