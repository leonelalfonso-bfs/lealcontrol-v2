using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LealControl.Modules.Crm.Contracts.Fiscal;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class CreditNoteApiTests : IAsyncLifetime
{
    // Mismo día que FiscalTestClock: las ventanas de fecha de ARCA se miden contra ese reloj.
    private const string Today = "2026-10-02";
    private readonly CrmWebApplicationFactory _factory = new();
    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    [Fact]
    public async Task Credit_note_is_linked_limited_and_sent_with_the_associated_invoice()
    {
        var gateway = new MultiGateway();
        using var app = _factory.WithWebHostBuilder(builder =>
        {
            builder.UseSetting("Arca:EnableInvoiceAuthorization", "true");
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<IArcaFiscalGateway>();
                services.AddSingleton<IArcaFiscalGateway>(gateway);
            });
        });
        using var client = app.CreateClient();
        using var identity = _factory.CreateAuthenticatedClient();
        client.DefaultRequestHeaders.Authorization = identity.DefaultRequestHeaders.Authorization;
        var customer = Guid.NewGuid();

        // Una nota sin factura original autorizada no se puede crear.
        using (var orphan = await Create(client, "NC_A", customer, null, 100m))
            Assert.Equal(HttpStatusCode.BadRequest, orphan.StatusCode);
        var invoice = await Id(await Create(client, "A", customer, null, 100m));

        // Contra un borrador (emisión apagada) la nota se crea, pero no puede ir a ARCA.
        var draftInvoice = await Id(await Create(client, "A", customer, null, 100m));
        var internalNote = await Id(await Create(client, "NC_A", customer, draftInvoice, 50m));
        using (var blocked = await client.PostAsync($"/api/v1/sales/invoices/{internalNote}/authorize-arca", null))
            Assert.Equal(HttpStatusCode.BadRequest, blocked.StatusCode);
        Assert.False(gateway.Submitted.ContainsKey(3));

        using (var authorized = await client.PostAsync($"/api/v1/sales/invoices/{invoice}/authorize-arca", null))
            Assert.Equal(HttpStatusCode.OK, authorized.StatusCode);

        using (var otherCustomer = await Create(client, "NC_A", Guid.NewGuid(), invoice, 50m))
            Assert.Equal(HttpStatusCode.BadRequest, otherCustomer.StatusCode);
        using (var wrongLetter = await Create(client, "NC_B", customer, invoice, 50m))
            Assert.Equal(HttpStatusCode.BadRequest, wrongLetter.StatusCode);

        // Factura de 121: una nota parcial de 60,50 deja 60,50 disponibles; otra de 72,60 se rechaza.
        var note = await Id(await Create(client, "NC_A", customer, invoice, 50m));
        using (var exceeded = await Create(client, "NC_A", customer, invoice, 60m))
            Assert.Equal(HttpStatusCode.BadRequest, exceeded.StatusCode);

        using (var sent = await client.PostAsync($"/api/v1/sales/invoices/{note}/authorize-arca", null))
            Assert.Equal(HttpStatusCode.OK, sent.StatusCode);
        var noteData = gateway.Submitted[3];
        var associated = Assert.Single(noteData.AssociatedVouchers);
        Assert.Equal(1, associated.Type);
        Assert.Equal(3, associated.PointOfSale);
        Assert.Equal(42, associated.Number);
        Assert.Equal("30715489629", associated.IssuerCuit);

        using var stored = await client.GetAsync($"/api/v1/sales/invoices/{note}");
        using var body = JsonDocument.Parse(await stored.Content.ReadAsStringAsync());
        Assert.Equal("Authorized", body.RootElement.GetProperty("status").GetString());
        Assert.Equal(invoice, body.RootElement.GetProperty("associatedInvoiceId").GetGuid());
    }

    private static Task<HttpResponseMessage> Create(
        HttpClient client, string type, Guid customer, Guid? associated, decimal price) =>
        client.PostAsJsonAsync("/api/v1/sales/invoices", new
        {
            invoiceType = type, pointOfSale = 3, customerId = customer,
            customerName = "Cliente de prueba", customerDocument = "20123456786",
            customerTaxCondition = "ResponsableInscripto", issueDate = Today,
            dueDate = Today, fiscalConcept = 1, currency = "ARS", exchangeRate = 1m,
            associatedInvoiceId = associated, restockItems = false,
            items = new[] { new { code = "SERV", description = "Ítem de prueba",
                quantity = 1m, unitPrice = price, vatRate = 21m } }
        });

    private static async Task<Guid> Id(HttpResponseMessage response)
    {
        using (response)
        {
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
            using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
            return doc.RootElement.GetProperty("id").GetGuid();
        }
    }

    private sealed class MultiGateway : IArcaFiscalGateway
    {
        public Dictionary<int, WsfeVoucherData> Submitted { get; } = [];
        private readonly Dictionary<int, ArcaFiscalVoucherObservation> _observations = [];

        public Task<ArcaFiscalNumbering> GetLastAuthorizedAsync(int point, int type, CancellationToken ct) =>
            Task.FromResult(new ArcaFiscalNumbering(true, 41, "30715489629", false, "prueba"));

        public Task<WsfeCaeReply> SubmitCaeAsync(WsfeVoucherData data, int point,
            long number, string issuer, bool production, CancellationToken ct)
        {
            Submitted[data.VoucherType] = data;
            var due = new DateTime(2026, 10, 25, 0, 0, 0, DateTimeKind.Utc);
            _observations[data.VoucherType] = new(true, number, data.ReceiverDocumentNumber,
                data.TotalAmount, "12345678901234", due, "prueba", data);
            return Task.FromResult(new WsfeCaeReply(
                WsfeCaeOutcome.ApprovedPendingConsultation, "12345678901234", due, "prueba"));
        }

        public Task<ArcaFiscalVoucherObservation> GetVoucherAsync(int point, int type,
            long number, string issuer, bool production, CancellationToken ct) =>
            Task.FromResult(_observations[type]);
    }
}
