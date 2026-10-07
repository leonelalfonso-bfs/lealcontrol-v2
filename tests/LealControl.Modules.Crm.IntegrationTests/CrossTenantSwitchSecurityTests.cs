using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using FluentAssertions;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>
/// Un administrador de una empresa no debe poder saltar a otra empresa creando en la suya
/// un usuario con el email de alguien de la otra empresa. Solo valen las empresas cuya
/// contraseña se verificó al iniciar sesión.
/// </summary>
public sealed class CrossTenantSwitchSecurityTests : IAsyncLifetime
{
    private const string SuperAdminEmail = "superadmin.crosstenant@lealcontrol.local";
    private const string SuperAdminPassword = "CrossTenantSuperAdmin!2026";
    private const string VictimPassword = "VictimTenant!2026";
    private const string AttackerPassword = "AttackerTenant!2026";
    private const string SharedPassword = "SharedOwner!2026";

    private readonly CrmWebApplicationFactory _factory = CrmWebApplicationFactory.WithSettings(
        "Development",
        new Dictionary<string, string>
        {
            ["SUPERADMIN_BOOTSTRAP_EMAIL"] = SuperAdminEmail,
            ["SUPERADMIN_BOOTSTRAP_PASSWORD"] = SuperAdminPassword
        });

    public Task InitializeAsync() => _factory.InitializeAsync();

    public Task DisposeAsync() => _factory.DisposeAsync();

    [Fact]
    public async Task Admin_cannot_switch_into_other_tenant_by_cloning_its_admin_email()
    {
        var stamp = Guid.NewGuid().ToString("N")[..8];
        var victimEmail = $"victima-{stamp}@integration.local";
        var attackerEmail = $"atacante-{stamp}@integration.local";

        var victimTenant = await ProvisionTenantAsync($"victima-{stamp}", victimEmail, VictimPassword);
        await ProvisionTenantAsync($"atacante-{stamp}", attackerEmail, AttackerPassword);

        var attacker = await LoginAsync(attackerEmail, AttackerPassword);
        await CreateUserAsync(attacker.Token!, victimEmail, AttackerPassword);

        var impersonation = await LoginAsync(victimEmail, AttackerPassword);
        impersonation.Tenant!.Id.Should().NotBe(victimTenant);

        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", impersonation.Token);

        var me = await client.GetFromJsonAsync<MeEnvelope>("/api/v1/auth/me");
        me!.AvailableTenants.Select(t => t.Id).Should().NotContain(victimTenant);

        var switchResponse = await client.PostAsJsonAsync("/api/v1/auth/switch-tenant", new { tenantId = victimTenant });
        switchResponse.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Same_email_and_password_in_two_tenants_can_still_switch()
    {
        var stamp = Guid.NewGuid().ToString("N")[..8];
        var ownerEmail = $"duenio-{stamp}@integration.local";

        var first = await ProvisionTenantAsync($"primera-{stamp}", ownerEmail, SharedPassword);
        var second = await ProvisionTenantAsync($"segunda-{stamp}", ownerEmail, SharedPassword);

        var client = _factory.CreateClient();
        var selection = await client.PostAsJsonAsync("/api/v1/auth/login", new { email = ownerEmail, password = SharedPassword });
        selection.StatusCode.Should().Be(HttpStatusCode.OK);

        var session = await LoginAsync(ownerEmail, SharedPassword, first);
        session.AvailableTenants.Select(t => t.Id).Should().Contain([first, second]);

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.Token);
        var switchResponse = await client.PostAsJsonAsync("/api/v1/auth/switch-tenant", new { tenantId = second });
        switchResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var switched = await switchResponse.Content.ReadFromJsonAsync<AuthEnvelope>();
        switched!.Tenant!.Id.Should().Be(second);

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", switched.Token);
        var back = await client.PostAsJsonAsync("/api/v1/auth/switch-tenant", new { tenantId = first });
        back.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Legacy_password_hash_is_upgraded_to_pbkdf2_on_login()
    {
        var stamp = Guid.NewGuid().ToString("N")[..8];
        var email = $"legacy-{stamp}@integration.local";
        const string password = "LegacyUser!2026";

        await CreateUserAsync(
            _factory.CreateAuthenticatedClientToken(),
            email,
            password);

        var legacyHash = Convert.ToBase64String(System.Security.Cryptography.SHA256.HashData(
            System.Text.Encoding.UTF8.GetBytes(password + "LealControlSalt2026")));
        await using (var conn = new Npgsql.NpgsqlConnection(_factory.DatabaseConnectionString))
        {
            await conn.OpenAsync();
            await using var cmd = new Npgsql.NpgsqlCommand(
                @"UPDATE public.tenant_users SET ""PasswordHash"" = @hash WHERE lower(""Email"") = @email", conn);
            cmd.Parameters.AddWithValue("hash", legacyHash);
            cmd.Parameters.AddWithValue("email", email);
            (await cmd.ExecuteNonQueryAsync()).Should().Be(1);
        }

        await LoginAsync(email, password);

        await using (var conn = new Npgsql.NpgsqlConnection(_factory.DatabaseConnectionString))
        {
            await conn.OpenAsync();
            await using var cmd = new Npgsql.NpgsqlCommand(
                @"SELECT ""PasswordHash"" FROM public.tenant_users WHERE lower(""Email"") = @email", conn);
            cmd.Parameters.AddWithValue("email", email);
            var stored = (string?)await cmd.ExecuteScalarAsync();
            stored.Should().Contain(".").And.NotBe(legacyHash);
        }

        await LoginAsync(email, password);
    }

    private async Task<Guid> ProvisionTenantAsync(string slug, string adminEmail, string adminPassword)
    {
        var client = _factory.CreateClient();
        var superLogin = await client.PostAsJsonAsync("/api/v1/superadmin/auth/login", new
        {
            email = SuperAdminEmail,
            password = SuperAdminPassword
        });
        superLogin.StatusCode.Should().Be(HttpStatusCode.OK);
        var superAuth = await superLogin.Content.ReadFromJsonAsync<AuthEnvelope>();

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", superAuth!.Token);
        var provision = await client.PostAsJsonAsync("/api/v1/superadmin/tenants", new
        {
            name = $"Empresa {slug}",
            slug,
            planCode = "pyme",
            adminFullName = "Administrador",
            adminEmail,
            adminPassword,
            adminPhone = "+5491100000000",
            monthlyPriceArs = 95000m,
            monthlyPriceUsd = 95m
        });
        provision.StatusCode.Should().Be(HttpStatusCode.Created);

        var session = await LoginAsync(adminEmail, adminPassword, preferredSlug: slug);
        return session.Tenant!.Id;
    }

    private async Task<AuthEnvelope> LoginAsync(string email, string password, Guid? tenantId = null, string? preferredSlug = null)
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/v1/auth/login", new { email, password, tenantId });
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var auth = await response.Content.ReadFromJsonAsync<AuthEnvelope>();

        if (auth!.Token is null && auth.AvailableTenants.Count > 0)
        {
            // Varias empresas: elegir la recién aprovisionada por nombre.
            var chosen = auth.AvailableTenants.First(t =>
                preferredSlug is null || t.LegalName.Contains(preferredSlug, StringComparison.OrdinalIgnoreCase));
            return await LoginAsync(email, password, chosen.Id);
        }

        auth.Token.Should().NotBeNullOrWhiteSpace();
        return auth;
    }

    private async Task CreateUserAsync(string adminToken, string email, string password)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminToken);
        var response = await client.PostAsJsonAsync("/api/v1/company/users", new
        {
            fullName = "Usuario clonado",
            email,
            role = "Admin",
            password
        });
        response.IsSuccessStatusCode.Should().BeTrue(await response.Content.ReadAsStringAsync());
    }

    private sealed record AuthEnvelope(string? Token, TenantEnvelope? Tenant, List<TenantEnvelope> AvailableTenants);
    private sealed record MeEnvelope(List<TenantEnvelope> AvailableTenants);
    private sealed record TenantEnvelope(Guid Id, string LegalName, string? TradeName, string DocumentNumber);
}
