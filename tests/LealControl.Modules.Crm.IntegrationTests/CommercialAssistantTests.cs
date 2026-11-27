using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using LealControl.Api.Ai;
using LealControl.Modules.Communications.Infrastructure.Domain;
using LealControl.Modules.Communications.Infrastructure.Persistence;
using LealControl.Modules.Sales.Domain.Invoices;
using LealControl.Modules.Sales.Domain.Quotes;
using LealControl.Modules.Sales.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>
/// Etapa 4: revisión determinística del circuito comercial (costo $0), borrador de respuesta con IA usando ese contexto
/// (nunca se envía solo) y generación a demanda del informe del Supervisor comercial.
/// </summary>
public sealed class CommercialAssistantTests : IAsyncLifetime
{
    private readonly CrmWebApplicationFactory _factory = new();
    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    private sealed class FakeDraftAi : IAiClient
    {
        public string? LastUserPrompt;
        public Task<AiCompletion> CompleteJsonAsync(string apiKey, string model, string system, string user,
            IReadOnlyDictionary<string, JsonElement> schema, int maxTokens, CancellationToken ct, bool deeper = false, bool webSearch = false)
        {
            LastUserPrompt = user;
            return Task.FromResult(new AiCompletion(
                """{"body":"Hola Ana, te escribo en seguimiento del presupuesto P-00042 (Rev. 2) que te enviamos. Quedamos a disposición."}""",
                900, 120, "end_turn"));
        }
    }

    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, body);
        return JsonDocument.Parse(body).RootElement.Clone();
    }

    [Fact]
    public async Task Commercial_check_reports_quotes_revisions_and_missing_items_and_ai_draft_uses_real_circuit()
    {
        var tenantId = CrmWebApplicationFactory.DemoTenantId;
        var cs = _factory.DatabaseConnectionString;
        var now = _factory.Services.GetRequiredService<TimeProvider>().GetUtcNow().UtcDateTime;
        using (var scope = _factory.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<LealControl.Api.SuperAdmin.ICommunicationsInboxSettings>().SetEnabledAsync(true);
        using var admin = _factory.CreateAuthenticatedClient();
        using var inbox = _factory.CreateClientForUser(Guid.NewGuid(), "comercial@lealcontrol.com", "Admin", "[\"communications\"]");

        // Cliente + oportunidad + presupuesto enviado (Rev. 2) hace 7 días
        var customerId = (await Json(await admin.PostAsJsonAsync("/api/v1/crm/customers", new
        {
            legalName = "Frigorifico del Litoral SA",
            documentType = "Cuit",
            documentNumber = "30709876542",
            taxCondition = "ResponsableInscripto",
            iibbRegime = "Local",
            isCustomer = true,
            isSupplier = false
        }))).GetProperty("id").GetGuid();

        var oppId = (await Json(await admin.PostAsJsonAsync("/api/v1/crm/opportunities", new
        {
            title = "Báscula 21m Frigorifico",
            customerId
        }))).GetProperty("id").GetGuid();

        await using (var sales = new SalesDbContext(new DbContextOptionsBuilder<SalesDbContext>().UseNpgsql(cs).Options))
        {
            await sales.EnsureTablesCreatedAsync();
            var quote = Quote.Draft(new LealControl.BuildingBlocks.Tenancy.TenantId(tenantId), "P-00042", customerId, oppId,
                "ARS", null, "Leonel", 15, now.AddDays(-10)).Value;
            quote.AddLine("Báscula 21m", 1, 35_000_000m, now.AddDays(-10));
            quote.NextRevision(now.AddDays(-8));
            quote.MarkSent(now.AddDays(-7));
            sales.Quotes.Add(quote);
            await sales.SaveChangesAsync();
        }

        // Conversación vinculada al cliente y oportunidad
        var conv = Conversation.Create(tenantId, "email", Guid.NewGuid().ToString("N"),
            "ana@frigorifico.com.ar", "Ana", "ana@frigorifico.com.ar", null, "¿Tienen novedades de la cotización?", now.AddMinutes(-10), EmailDirection.Incoming);
        conv.LinkCustomer(customerId);
        conv.LinkOpportunity(oppId);
        await using (var comms = new CommunicationsDbContext(new DbContextOptionsBuilder<CommunicationsDbContext>().UseNpgsql(cs).Options))
        {
            await comms.EnsureTablesCreatedAsync();
            comms.Conversations.Add(conv);
            var msg = EmailMessage.Create(tenantId, Guid.NewGuid(), Guid.NewGuid().ToString("N"), null, conv.ThreadKey, EmailDirection.Incoming,
                "Consulta báscula", "ana@frigorifico.com.ar", "ventas@empresa.com", "¿Tienen novedades de la cotización?", now.AddMinutes(-10));
            msg.SetConversationId(conv.Id);
            comms.EmailMessages.Add(msg);
            await comms.SaveChangesAsync();
        }

        // 1. Revisión del circuito comercial (sin IA, costo $0)
        var check = await Json(await inbox.GetAsync($"/api/v1/communications/conversations/{conv.Id}/commercial-check"));
        Assert.Equal("Frigorifico del Litoral SA", check.GetProperty("customer").GetProperty("name").GetString());
        Assert.Equal("Por cotizar", check.GetProperty("opportunity").GetProperty("stageLabel").GetString());
        var quoteDto = Assert.Single(check.GetProperty("quotes").EnumerateArray());
        Assert.Equal("P-00042", quoteDto.GetProperty("number").GetString());
        Assert.Equal(2, quoteDto.GetProperty("revision").GetInt32());
        Assert.Equal("Enviado", quoteDto.GetProperty("statusLabel").GetString());
        Assert.True(quoteDto.GetProperty("daysSinceSent").GetInt32() >= 6);

        var codes = check.GetProperty("missingItems").EnumerateArray().Select(x => x.GetProperty("code").GetString()).ToHashSet();
        Assert.Contains("quote.followup", codes);
        Assert.Contains("contact.missing", codes);
        Assert.Contains("opportunity.no-next-action", codes);

        // 2. Borrador con IA (usando doble falso) recibe el contexto real del presupuesto P-00042 Rev. 2
        var putRes = await inbox.PutAsJsonAsync("/api/v1/communications/ai/settings", new
        {
            apiKey = "sk-ant-prueba-draft", monthlyBudgetUsd = 10m, mailReadingEnabled = true,
            autoOpportunities = true, supervisorEnabled = true, businessDescription = "Básculas"
        });
        Assert.True(putRes.IsSuccessStatusCode);

        var fakeAi = new FakeDraftAi();
        var drafter = new AiReplyDrafter(fakeAi, _factory.Services.GetRequiredService<AiKeyProtector>(), NullLogger<AiReplyDrafter>.Instance);
        var draft = await drafter.DraftAsync(cs, tenantId, conv.Id, seesAmounts: true, now, default);
        Assert.True(draft.Ok);
        Assert.Contains("P-00042", draft.Body);
        Assert.NotNull(fakeAi.LastUserPrompt);
        Assert.Contains("P-00042 (Rev. 2)", fakeAi.LastUserPrompt);
        Assert.Contains("Enviado", fakeAi.LastUserPrompt);
    }

    private sealed class FakeAttachmentAndReadinessAi : IAiClient
    {
        public string? LastPrompt;
        public Task<AiCompletion> CompleteJsonAsync(string apiKey, string model, string system, string user,
            IReadOnlyDictionary<string, JsonElement> schema, int maxTokens, CancellationToken ct, bool deeper = false, bool webSearch = false)
        {
            LastPrompt = user;
            if (schema.TryGetValue("properties", out var props) && props.TryGetProperty("body", out _))
            {
                return Task.FromResult(new AiCompletion(
                    """{"body":"Hola, para cotizar la báscula necesitamos confirmar la localidad y si incluye obra civil."}""",
                    500, 90, "end_turn"));
            }

            var deadline = DateTime.UtcNow.AddDays(1).ToString("yyyy-MM-dd");
            var json = JsonSerializer.Serialize(new
            {
                category = "pedido_cotizacion",
                urgency = 3,
                summary = "Cerealera pide cotizar báscula 80t según pliego adjunto.",
                is_new_business = true,
                opportunity_title = "Báscula 80t según pliego",
                company = "Cerealera Norte SA",
                contact_name = "Martín Gómez",
                position = "Compras",
                cuit = "30709876542",
                phone = "",
                email = "",
                location = "",
                product = "Báscula 80t",
                quote_deadline = deadline,
                missing_info = "Localidad de instalación; si incluye obra civil"
            });
            return Task.FromResult(new AiCompletion(json, 1100, 180, "end_turn"));
        }
    }

    [Fact]
    public async Task Reads_attachment_extracts_deadline_missing_info_and_shows_customer_overdue_history()
    {
        var tenantId = CrmWebApplicationFactory.DemoTenantId;
        var cs = _factory.DatabaseConnectionString;
        var now = _factory.Services.GetRequiredService<TimeProvider>().GetUtcNow().UtcDateTime;

        using (var scope = _factory.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<LealControl.Api.SuperAdmin.ICommunicationsInboxSettings>().SetEnabledAsync(true);

        using var admin = _factory.CreateAuthenticatedClient();
        using var inbox = _factory.CreateClientForUser(Guid.NewGuid(), "readiness@lealcontrol.com", "Admin", "[\"communications\"]");

        // Cliente existente con CUIT sintético y una factura vencida autorizada.
        var customer = await Json(await admin.PostAsJsonAsync("/api/v1/crm/customers", new
        {
            legalName = "Cerealera Norte SA",
            documentType = "Cuit",
            documentNumber = "30709876542",
            taxCondition = "ResponsableInscripto",
            email = "compras@cerealeranorte.com.ar",
            isCustomer = true
        }));
        var customerId = customer.GetProperty("id").GetGuid();

        await using (var sales = new SalesDbContext(new DbContextOptionsBuilder<SalesDbContext>().UseNpgsql(cs).Options))
        {
            await sales.EnsureTablesCreatedAsync();
            var inv = new Invoice(
                Guid.NewGuid(),
                new LealControl.BuildingBlocks.Tenancy.TenantId(tenantId),
                "A", 1, 777, "0001-00000777", null, null,
                customerId, "Cerealera Norte SA", "30709876542", "ResponsableInscripto", null,
                now.AddDays(-45), now.AddDays(-15), "ARS", 1m,
                150000m, 31500m, 0m, 0m, 0m, 0m, 181500m,
                "12345678901234", now.AddDays(10), null, "Authorized", null, null, now.AddDays(-45));
            sales.Invoices.Add(inv);
            await sales.SaveChangesAsync();
        }

        var putRes = await inbox.PutAsJsonAsync("/api/v1/communications/ai/settings", new
        {
            apiKey = "sk-ant-prueba-readiness", monthlyBudgetUsd = 10m, mailReadingEnabled = true,
            autoOpportunities = true, supervisorEnabled = false, businessDescription = "Básculas"
        });
        Assert.True(putRes.IsSuccessStatusCode);

        var conv = Conversation.Create(tenantId, "email", Guid.NewGuid().ToString("N"),
            "martin@cerealeranorte.com.ar", "Martín Gómez", "martin@cerealeranorte.com.ar", null,
            "Adjunto pliego de solicitud de cotización.", now.AddMinutes(-5), EmailDirection.Incoming);
        await using (var comms = new CommunicationsDbContext(new DbContextOptionsBuilder<CommunicationsDbContext>().UseNpgsql(cs).Options))
        {
            await comms.EnsureTablesCreatedAsync();
            comms.Conversations.Add(conv);
            var msg = EmailMessage.Create(tenantId, Guid.NewGuid(), Guid.NewGuid().ToString("N"), null, conv.ThreadKey, EmailDirection.Incoming,
                "Solicitud de cotización", "martin@cerealeranorte.com.ar", "ventas@empresa.com",
                "Adjunto pliego con especificaciones.", now.AddMinutes(-5));
            msg.SetConversationId(conv.Id);
            comms.EmailMessages.Add(msg);
            var csvBytes = Encoding.UTF8.GetBytes("Item,Descripcion,Cantidad\n1,Bascula camiones 80t,1\nCierre oferta,Manana 18hs\n");
            comms.EmailAttachments.Add(EmailAttachment.Create(tenantId, msg.Id, "pliego.csv", "text/csv", csvBytes.Length, csvBytes));
            await comms.SaveChangesAsync();
        }

        var fakeAi = new FakeAttachmentAndReadinessAi();
        var reader = new AiMailReader(fakeAi, _factory.Services.GetRequiredService<AiKeyProtector>(), NullLogger<AiMailReader>.Instance);
        Assert.Equal(1, await reader.ReadPendingAsync(cs, tenantId, now, default));

        // El texto del adjunto llegó al prompt de la IA.
        Assert.NotNull(fakeAi.LastPrompt);
        Assert.Contains("pliego.csv", fakeAi.LastPrompt);
        Assert.Contains("Bascula camiones 80t", fakeAi.LastPrompt);

        // El circuito comercial expone traza con adjunto, deadline (que creó próxima acción), missingInfo e historial con deuda vencida.
        var report = await CommercialCircuitChecker.CheckAsync(cs, tenantId, conv.Id, seesAmounts: true, now, default);
        Assert.NotNull(report);
        Assert.Contains("pliego.csv", report.AiLastTrace ?? "");
        Assert.Contains("Localidad de instalación", report.AiMissingInfo ?? "");
        Assert.NotNull(report.AiQuoteDeadlineUtc);
        Assert.NotNull(report.Opportunity);
        Assert.True(report.Opportunity.HasNextAction);
        Assert.NotNull(report.CustomerHistory);
        Assert.Equal(1, report.CustomerHistory.OverdueInvoicesCount);
        Assert.True(report.CustomerHistory.OverdueAmountArs > 0);
        Assert.Contains(report.MissingItems, m => m.Code == "customer.overdue" && m.Severity == "danger");
        Assert.Contains(report.MissingItems, m => m.Code == "quote.missing-info");

        // Sin permiso de montos, oculta el monto vencido pero mantiene la alerta de cantidad.
        var reportNoAmounts = await CommercialCircuitChecker.CheckAsync(cs, tenantId, conv.Id, seesAmounts: false, now, default);
        Assert.NotNull(reportNoAmounts?.CustomerHistory);
        Assert.Equal(1, reportNoAmounts.CustomerHistory.OverdueInvoicesCount);
        Assert.Null(reportNoAmounts.CustomerHistory.OverdueAmountArs);

        // El borrador con focus=missing_info incluye el objetivo explícito en el prompt.
        var drafter = new AiReplyDrafter(fakeAi, _factory.Services.GetRequiredService<AiKeyProtector>(), NullLogger<AiReplyDrafter>.Instance);
        var draft = await drafter.DraftAsync(cs, tenantId, conv.Id, seesAmounts: true, now, default, focus: "missing_info");
        Assert.True(draft.Ok);
        Assert.Contains("OBJETIVO DE ESTE BORRADOR", fakeAi.LastPrompt);
    }

    private sealed class FakePartialConfirmationAi : IAiClient
    {
        public string? LastPrompt;
        public Task<AiCompletion> CompleteJsonAsync(string apiKey, string model, string system, string user,
            IReadOnlyDictionary<string, JsonElement> schema, int maxTokens, CancellationToken ct, bool deeper = false, bool webSearch = false)
        {
            LastPrompt = user;
            var matchedLineIndex = 1;
            foreach (var rawLine in user.Split('\n'))
            {
                if (rawLine.Contains("Placa principal indicador", StringComparison.OrdinalIgnoreCase))
                {
                    var m = System.Text.RegularExpressions.Regex.Match(rawLine, @"\[(\d+)\]");
                    if (m.Success && int.TryParse(m.Groups[1].Value, out var idx))
                    {
                        matchedLineIndex = idx;
                        break;
                    }
                }
            }

            var json = JsonSerializer.Serialize(new
            {
                category = "seguimiento_cliente",
                urgency = 3,
                summary = "Metalúrgica Sur confirma la Placa principal del presupuesto P-2026-8801 con OC-9941.",
                is_new_business = true, // aunque la IA marque true, al matchear presupuesto existente NO debe duplicar oportunidad
                opportunity_title = "Confirmación duplicada que no debe crearse",
                company = "Metalúrgica Sur SA",
                contact_name = "Laura Díaz",
                position = "Compras",
                cuit = "30712345671",
                phone = "",
                email = "",
                location = "",
                product = "Placa principal",
                quote_deadline = "",
                missing_info = "",
                confirmed_quote_number = "P-2026-8801",
                purchase_order_number = "OC-9941",
                confirmed_line_numbers = new[] { matchedLineIndex }
            });
            return Task.FromResult(new AiCompletion(json, 1000, 160, "end_turn"));
        }
    }

    [Fact]
    public async Task Detects_partial_purchase_confirmation_links_existing_quote_without_duplicate_opportunity_and_converts_selected_line()
    {
        var tenantId = CrmWebApplicationFactory.DemoTenantId;
        var cs = _factory.DatabaseConnectionString;
        var now = _factory.Services.GetRequiredService<TimeProvider>().GetUtcNow().UtcDateTime;

        using (var scope = _factory.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<LealControl.Api.SuperAdmin.ICommunicationsInboxSettings>().SetEnabledAsync(true);

        using var admin = _factory.CreateAuthenticatedClient();
        using var inbox = _factory.CreateClientForUser(Guid.NewGuid(), "partial@lealcontrol.com", "Admin", "[\"communications\"]");

        // Cliente existente + presupuesto previo a la IA con 3 ítems obligatorios.
        var customer = await Json(await admin.PostAsJsonAsync("/api/v1/crm/customers", new
        {
            legalName = "Metalúrgica Sur SA",
            documentType = "Cuit",
            documentNumber = "30712345671",
            taxCondition = "ResponsableInscripto",
            email = "compras@metalurgicasur.com.ar",
            isCustomer = true
        }));
        var customerId = customer.GetProperty("id").GetGuid();

        Guid quoteId;
        Guid line2Id;
        await using (var sales = new SalesDbContext(new DbContextOptionsBuilder<SalesDbContext>().UseNpgsql(cs).Options))
        {
            await sales.EnsureTablesCreatedAsync();
            var qRes = Quote.Draft(new LealControl.BuildingBlocks.Tenancy.TenantId(tenantId), "P-2026-8801", customerId, null, "ARS", null, null, 15, now.AddDays(-10));
            Assert.True(qRes.IsSuccess);
            var quote = qRes.Value;
            quote.AddLine("Calibración general", 1m, 80000m, now.AddDays(-10));
            quote.AddLine("Placa principal indicador", 2m, 120000m, now.AddDays(-10));
            quote.AddLine("Pintura epoxi", 1m, 50000m, now.AddDays(-10));
            quote.MarkSent(now.AddDays(-9));
            sales.Quotes.Add(quote);
            await sales.SaveChangesAsync();
            quoteId = quote.Id.Value;
            line2Id = quote.Lines.ElementAt(1).Id.Value;
        }

        var putRes = await inbox.PutAsJsonAsync("/api/v1/communications/ai/settings", new
        {
            apiKey = "sk-ant-prueba-partial", monthlyBudgetUsd = 10m, mailReadingEnabled = true,
            autoOpportunities = true, supervisorEnabled = false, businessDescription = "Básculas"
        });
        Assert.True(putRes.IsSuccessStatusCode);

        // Mail de confirmación parcial de compra (sin haber vinculado el hilo al presupuesto).
        var conv = Conversation.Create(tenantId, "email", Guid.NewGuid().ToString("N"),
            "laura@metalurgicasur.com.ar", "Laura Díaz", "laura@metalurgicasur.com.ar", null,
            "Confirmamos compra del ítem 2 (Placa principal) con OC-9941.", now.AddMinutes(-3), EmailDirection.Incoming);
        await using (var comms = new CommunicationsDbContext(new DbContextOptionsBuilder<CommunicationsDbContext>().UseNpgsql(cs).Options))
        {
            await comms.EnsureTablesCreatedAsync();
            comms.Conversations.Add(conv);
            var msg = EmailMessage.Create(tenantId, Guid.NewGuid(), Guid.NewGuid().ToString("N"), null, conv.ThreadKey, EmailDirection.Incoming,
                "Confirmación OC-9941", "laura@metalurgicasur.com.ar", "ventas@empresa.com",
                "Confirmamos compra del ítem 2 (Placa principal) del presupuesto P-2026-8801. OC-9941.", now.AddMinutes(-3));
            msg.SetConversationId(conv.Id);
            comms.EmailMessages.Add(msg);
            await comms.SaveChangesAsync();
        }

        var fakeAi = new FakePartialConfirmationAi();
        var reader = new AiMailReader(fakeAi, _factory.Services.GetRequiredService<AiKeyProtector>(), NullLogger<AiMailReader>.Instance);
        Assert.Equal(1, await reader.ReadPendingAsync(cs, tenantId, now, default));

        // El prompt recibió el presupuesto previo abierto y sus 3 ítems.
        Assert.NotNull(fakeAi.LastPrompt);
        Assert.Contains("Presupuestos abiertos de este cliente en el ERP", fakeAi.LastPrompt);
        Assert.Contains("P-2026-8801", fakeAi.LastPrompt);
        Assert.Contains("Placa principal indicador", fakeAi.LastPrompt);

        // La conversación quedó vinculada al presupuesto previo y NO abrió oportunidad duplicada.
        await using (var comms = new CommunicationsDbContext(new DbContextOptionsBuilder<CommunicationsDbContext>().UseNpgsql(cs).Options))
        {
            var updated = await comms.Conversations.AsNoTracking().FirstAsync(c => c.Id == conv.Id);
            Assert.Equal(quoteId, updated.RelatedQuoteId);
            Assert.Equal(customerId, updated.RelatedCustomerId);
            Assert.Null(updated.RelatedOpportunityId);
            Assert.Contains("Confirmación parcial", updated.AiLastTrace ?? "");
        }

        // El circuito comercial expone la señal de confirmación parcial con el ID exacto de la línea 2.
        var report = await CommercialCircuitChecker.CheckAsync(cs, tenantId, conv.Id, seesAmounts: true, now, default);
        Assert.NotNull(report?.PurchaseConfirmation);
        Assert.True(report.PurchaseConfirmation.IsPartial);
        Assert.Equal("P-2026-8801", report.PurchaseConfirmation.QuoteNumber);
        Assert.Equal("OC-9941", report.PurchaseConfirmation.PurchaseOrderNumber);
        Assert.Equal(1, report.PurchaseConfirmation.ConfirmedCount);
        Assert.Equal(3, report.PurchaseConfirmation.TotalLineCount);
        Assert.Equal(line2Id, Assert.Single(report.PurchaseConfirmation.ConfirmedLineIds));

        // Convertir el presupuesto a pedido seleccionando SOLO esa línea y guardando el N° de OC + SourceQuoteLineId.
        var order = await Json(await admin.PostAsJsonAsync($"/api/v1/sales/orders/from-quote/{quoteId}", new
        {
            selectedLineIds = new[] { line2Id },
            customerPurchaseOrder = "OC-9941"
        }));
        Assert.Equal("OC-9941", order.GetProperty("customerPurchaseOrder").GetString());
        var orderLine = Assert.Single(order.GetProperty("lines").EnumerateArray());
        Assert.Equal("Placa principal indicador", orderLine.GetProperty("description").GetString());
        Assert.Equal(line2Id, orderLine.GetProperty("sourceQuoteLineId").GetGuid());

        // Una vez convertido en pedido, el circuito comercial deja de mostrar la confirmación como pendiente.
        var afterOrder = await CommercialCircuitChecker.CheckAsync(cs, tenantId, conv.Id, seesAmounts: true, now, default);
        Assert.NotNull(afterOrder);
        Assert.Null(afterOrder.PurchaseConfirmation);
    }
}
