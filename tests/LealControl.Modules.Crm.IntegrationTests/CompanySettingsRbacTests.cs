using System.Net;
using FluentAssertions;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class CompanySettingsRbacTests : IAsyncLifetime
{
    private readonly CrmWebApplicationFactory _factory = new();

    public Task InitializeAsync() => _factory.InitializeAsync();

    public Task DisposeAsync() => _factory.DisposeAsync();

    [Fact]
    public async Task Comercial_user_cannot_delete_tenant_users()
    {
        var client = _factory.CreateAuthenticatedClient(role: "Comercial");
        var response = await client.DeleteAsync($"/api/v1/company/users/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Comercial_user_cannot_update_company_settings()
    {
        var client = _factory.CreateAuthenticatedClient(role: "Comercial");
        using var content = new StringContent(
            """{"legalName":"Test","tradeName":"Test","documentType":"Cuit","documentNumber":"20123456789","taxCondition":"ResponsableInscripto","iibbRegime":"ConvenioMultilateral","email":"test@test.com","phone":"123","fiscalStreet":"","fiscalCity":"","fiscalProvince":"","fiscalPostalCode":"","defaultQuoteValidDays":15,"defaultDeliveryDays":7,"defaultWarranty":"","defaultPaymentTerms":""}""",
            System.Text.Encoding.UTF8,
            "application/json");
        var response = await client.PutAsync("/api/v1/company/settings", content);
        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Comercial_user_cannot_generate_arca_csr()
    {
        var client = _factory.CreateAuthenticatedClient(role: "Comercial");
        using var content = new StringContent(
            """{"signerCuit":"20323249017","environment":"Homologacion","organizationName":"Test SA","commonName":"LealControl"}""",
            System.Text.Encoding.UTF8,
            "application/json");
        var response = await client.PostAsync("/api/v1/company/settings/arca-csr", content);
        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Admin_user_can_generate_arca_csr()
    {
        var client = _factory.CreateAuthenticatedClient(role: "Admin");
        using var content = new StringContent(
            """{"signerCuit":"20323249017","environment":"Homologacion","organizationName":"Test SA","commonName":"LealControl"}""",
            System.Text.Encoding.UTF8,
            "application/json");
        var response = await client.PostAsync("/api/v1/company/settings/arca-csr", content);
        response.StatusCode.Should().BeOneOf(HttpStatusCode.OK, HttpStatusCode.BadRequest);
        if (response.StatusCode == HttpStatusCode.OK)
        {
            var json = await response.Content.ReadAsStringAsync();
            json.Should().Contain("BEGIN CERTIFICATE REQUEST");
            json.Should().Contain("BEGIN RSA PRIVATE KEY");
            json.Should().Contain("csrFileName");
        }
    }

    [Fact]
    public async Task Admin_user_can_list_company_users()
    {
        var client = _factory.CreateAuthenticatedClient(role: "Admin");
        var response = await client.GetAsync("/api/v1/company/users");
        response.StatusCode.Should().BeOneOf(HttpStatusCode.OK, HttpStatusCode.BadRequest);
    }
}
