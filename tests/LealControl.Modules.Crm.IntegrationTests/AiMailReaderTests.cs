using System.Net.Http.Json;
using System.Text.Json;
using LealControl.Api.Ai;
using LealControl.BuildingBlocks.Results;
using LealControl.Modules.Communications.Infrastructure.Domain;
using LealControl.Modules.Communications.Infrastructure.Persistence;
using LealControl.Modules.Crm.Application.Customers;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

/// <summary>
/// Lectura de mails con IA (con un proveedor falso): clasifica cada conversación con mail nuevo, abre la oportunidad de
/// los pedidos comerciales (con el cliente si el CUIT ya existe, si no con un lead), respeta el tope mensual y no
/// vuelve a leer lo ya leído.
/// </summary>
public sealed class AiMailReaderTests : IAsyncLifetime
{
    private readonly CrmWebApplicationFactory _factory = new();
    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    private sealed class FakeAi : IAiClient
    {
        public int Calls;
        public Task<AiCompletion> CompleteJsonAsync(string apiKey, string model, string system, string user,
            IReadOnlyDictionary<string, JsonElement> schema, int maxTokens, CancellationToken ct, bool deeper = false, bool webSearch = false)
        {
            Calls++;
            Assert.Equal("sk-ant-prueba-1234", apiKey);
            object reading = user.Contains("Oferta imperdible")
                ? new { category = "spam", urgency = 1, summary = "Publicidad.", is_new_business = false, opportunity_title = "", company = "", contact_name = "", position = "", cuit = "", phone = "", email = "", location = "", product = "" }
                : user.Contains("Areneras")
                    ? new { category = "pedido_cotizacion", urgency = 2, summary = "Areneras pide cotizar una báscula de 21 m.", is_new_business = true, opportunity_title = "Báscula 21 m", company = "Areneras del Sur SA", contact_name = "Ana", position = "Jefa de Compras", cuit = "20-12345678-6", phone = "", email = "", location = "San Nicolás", product = "Báscula 21 m" }
                    : new { category = "consulta_comercial", urgency = 3, summary = "Quieren saber si calibran balanzas en Rosario.", is_new_business = true, opportunity_title = "Calibración en Rosario", company = "Molino Nuevo", contact_name = "Pedro", position = "", cuit = "", phone = "341 555-1234", email = "", location = "Rosario", product = "Calibración" };
            return Task.FromResult(new AiCompletion(JsonSerializer.Serialize(reading), 1500, 200, "end_turn"));
        }
    }

    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, body);
        return JsonDocument.Parse(body).RootElement.Clone();
    }

    private static async Task Ok(HttpResponseMessage response) =>
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());

    [Fact]
    public async Task Reads_new_mails_opens_opportunities_and_respects_the_budget()
    {
        var tenantId = CrmWebApplicationFactory.DemoTenantId;
        var cs = _factory.DatabaseConnectionString;
        var now = _factory.Services.GetRequiredService<TimeProvider>().GetUtcNow().UtcDateTime; // reloj de pruebas
        using (var scope = _factory.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<LealControl.Api.SuperAdmin.ICommunicationsInboxSettings>().SetEnabledAsync(true);
        using var admin = _factory.CreateAuthenticatedClient();
        // La configuración de la IA vive en Comunicaciones: hace falta tener el módulo.
        using var inbox = _factory.CreateClientForUser(Guid.NewGuid(), "it@lealcontrol.com", "Admin", "[\"communications\"]");
        var customer = (await Json(await admin.PostAsJsonAsync("/api/v1/crm/customers", new
        {
            legalName = "Areneras del Sur SA", documentType = "Cuit", documentNumber = "20123456786",
            taxCondition = "ResponsableInscripto", iibbRegime = "Local", isCustomer = true, isSupplier = false
        }))).GetProperty("id").GetGuid();

        // Clave y activación desde la pantalla.
        await Ok(await inbox.PutAsJsonAsync("/api/v1/communications/ai/settings", new
        {
            apiKey = "sk-ant-prueba-1234", monthlyBudgetUsd = 10m, mailReadingEnabled = true, autoOpportunities = true, businessDescription = "Básculas y calibraciones"
        }));
        var settings = await Json(await inbox.GetAsync("/api/v1/communications/ai/settings"));
        Assert.True(settings.GetProperty("hasKey").GetBoolean());
        Assert.Equal("1234", settings.GetProperty("keyHint").GetString());
        Assert.False(settings.TryGetProperty("protectedApiKey", out _));

        Conversation Mail(string from, string subject, string body, DateTime at) =>
            Conversation.Create(tenantId, "email", Guid.NewGuid().ToString("N"), from, from, from, null, body, at, EmailDirection.Incoming);
        var quote = Mail("ana@areneras.com", "Cotización", "Areneras: necesitamos una báscula", now.AddMinutes(-20));
        var question = Mail("pedro@molino.com", "Consulta", "¿Calibran en Rosario?", now.AddMinutes(-15));
        var spam = Mail("promo@ofertas.com", "Oferta", "Oferta imperdible", now.AddMinutes(-10));
        var old = Mail("viejo@cliente.com", "Viejo", "Mail de hace un mes", now.AddDays(-30));
        await using (var comms = new CommunicationsDbContext(new DbContextOptionsBuilder<CommunicationsDbContext>().UseNpgsql(cs).Options))
        {
            await comms.EnsureTablesCreatedAsync();
            comms.Conversations.AddRange(quote, question, spam, old);
            foreach (var c in new[] { quote, question, spam, old })
            {
                var message = EmailMessage.Create(tenantId, Guid.NewGuid(), Guid.NewGuid().ToString("N"), null, c.ThreadKey, EmailDirection.Incoming,
                    "Asunto", c.ParticipantEmail!, "ventas@empresa.com", c.LastMessagePreview ?? "", c.LastMessageAtUtc);
                message.SetConversationId(c.Id);
                comms.EmailMessages.Add(message);
            }
            await comms.SaveChangesAsync();
        }

        var ai = new FakeAi();
        var reader = new AiMailReader(ai, _factory.Services.GetRequiredService<AiKeyProtector>(), NullLogger<AiMailReader>.Instance);
        Assert.Equal(3, await reader.ReadPendingAsync(cs, tenantId, now, default)); // el de hace un mes no
        Assert.Equal(0, await reader.ReadPendingAsync(cs, tenantId, now, default));
        Assert.Equal(3, ai.Calls);

        await using (var comms = new CommunicationsDbContext(new DbContextOptionsBuilder<CommunicationsDbContext>().UseNpgsql(cs).Options))
        {
            var read = await comms.Conversations.AsNoTracking().Where(c => c.TenantId == tenantId).ToDictionaryAsync(c => c.Id);
            Assert.Equal("pedido_cotizacion", read[quote.Id].AiCategory);
            Assert.Equal(customer, read[quote.Id].RelatedCustomerId); // por el CUIT
            Assert.NotNull(read[quote.Id].RelatedOpportunityId);
            Assert.NotNull(read[question.Id].RelatedLeadId); // cliente nuevo: lead
            Assert.NotNull(read[question.Id].RelatedOpportunityId);
            Assert.Equal(3, read[question.Id].AiUrgency);
            Assert.Equal("Pedro · Molino Nuevo", read[question.Id].ParticipantName); // antes se veía la dirección de mail
            Assert.Equal("spam", read[spam.Id].AiCategory);
            Assert.Null(read[spam.Id].RelatedOpportunityId);
            Assert.Null(read[old.Id].AiCategory);
        }

        var opportunities = (await Json(await admin.GetAsync($"/api/v1/crm/customers/{customer}/opportunities"))).EnumerateArray().ToList();
        Assert.Equal("Báscula 21 m", Assert.Single(opportunities).GetProperty("title").GetString());

        // Ana se guardó automáticamente como contacto de Areneras con su puesto y marca sutil.
        var customerDetail = await Json(await admin.GetAsync($"/api/v1/crm/customers/{customer}"));
        var autoContact = Assert.Single(customerDetail.GetProperty("contacts").EnumerateArray());
        Assert.Equal("Ana", autoContact.GetProperty("name").GetString());
        Assert.Equal("Jefa de Compras", autoContact.GetProperty("position").GetString());
        Assert.True(autoContact.GetProperty("addedAutomatically").GetBoolean());

        var month = await Json(await inbox.GetAsync("/api/v1/communications/ai/settings"));
        Assert.Equal(3, month.GetProperty("monthCalls").GetInt32());
        Assert.Equal(0.0008m, month.GetProperty("monthSpentUsd").GetDecimal()); // 3 × (1500 × 0,10 + 200 × 0,50) / 1M = 0,00075

        // Tope alcanzado: un mail nuevo no se lee.
        await Ok(await inbox.PutAsJsonAsync("/api/v1/communications/ai/settings", new
        {
            apiKey = (string?)null, monthlyBudgetUsd = 0m, mailReadingEnabled = true, autoOpportunities = true, businessDescription = "Básculas"
        }));
        await using (var db = new NpgsqlConnection(cs))
        {
            await db.OpenAsync();
            await using var cmd = new NpgsqlCommand("""UPDATE communications.conversations SET "LastIncomingAtUtc" = @at WHERE "Id" = @id""", db);
            cmd.Parameters.AddWithValue("id", spam.Id);
            cmd.Parameters.AddWithValue("at", now.AddMinutes(5));
            await cmd.ExecuteNonQueryAsync();
        }
        Assert.Equal(0, await reader.ReadPendingAsync(cs, tenantId, now.AddMinutes(10), default));
        Assert.Equal(3, ai.Calls);
        Assert.Contains("tope mensual", (await Json(await inbox.GetAsync("/api/v1/communications/ai/settings"))).GetProperty("lastError").GetString());
    }

    private sealed class ScenarioAi : IAiClient
    {
        public Task<AiCompletion> CompleteJsonAsync(string apiKey, string model, string system, string user,
            IReadOnlyDictionary<string, JsonElement> schema, int maxTokens, CancellationToken ct, bool deeper = false, bool webSearch = false)
        {
            object reading = user switch
            {
                _ when user.Contains("carlos@metalurgica.com.ar") => new
                {
                    category = "seguimiento_cliente", urgency = 2, summary = "Carlos consulta fecha de visita.",
                    is_new_business = false, opportunity_title = "", company = "Metalurgica del Litoral",
                    contact_name = "Carlos Ruiz", position = "Jefe de Compras", cuit = "", phone = "", email = "", location = "", product = ""
                },
                _ when user.Contains("laura@metalurgica.com.ar") => new
                {
                    category = "reclamo", urgency = 3, summary = "Laura reporta falla en celda de carga.",
                    is_new_business = false, opportunity_title = "", company = "",
                    contact_name = "Laura Gomez", position = "Jefa de Planta", cuit = "", phone = "3415559988", email = "", location = "", product = ""
                },
                _ when user.Contains("facturacion@metalurgica.com.ar") => new
                {
                    category = "administrativo", urgency = 1, summary = "Envían comprobante de retención.",
                    is_new_business = false, opportunity_title = "", company = "Metalurgica del Litoral",
                    contact_name = "", position = "", cuit = "", phone = "", email = "", location = "", product = ""
                },
                _ when user.Contains("nuevo@grupoindustrial.com.ar") => new
                {
                    category = "consulta_comercial", urgency = 2, summary = "Consulta por calibración.",
                    is_new_business = true, opportunity_title = "Calibración planta", company = "Grupo Industrial",
                    contact_name = "Martín Sosa", position = "Supervisor", cuit = "", phone = "", email = "", location = "", product = "Calibración"
                },
                _ when user.Contains("maria@metalurgica.com.ar") => new
                {
                    category = "pedido_cotizacion", urgency = 2, summary = "Pide cotizar balanza.",
                    is_new_business = true, opportunity_title = "Balanza conflicto", company = "",
                    contact_name = "María Díaz", position = "Compradora", cuit = "30712345671", phone = "", email = "", location = "", product = "Balanza"
                },
                _ when user.Contains("jorge.perez@gmail.com") => new
                {
                    category = "seguimiento_cliente", urgency = 2, summary = "Jorge consulta por remito.",
                    is_new_business = false, opportunity_title = "", company = "Metalúrgica del Litoral S.R.L.",
                    contact_name = "Jorge Perez", position = "Encargado de Depósito", cuit = "", phone = "", email = "", location = "", product = ""
                },
                _ => new
                {
                    category = "pedido_cotizacion", urgency = 2, summary = "Piden presupuesto de báscula.",
                    is_new_business = true, opportunity_title = "Báscula nueva planta", company = "Nueva Planta SA",
                    contact_name = "Sofía Vega", position = "Ingeniera", cuit = "", phone = "", email = "", location = "", product = "Báscula"
                }
            };
            return Task.FromResult(new AiCompletion(JsonSerializer.Serialize(reading), 1000, 150, "end_turn"));
        }
    }

    [Fact]
    public async Task Matches_existing_customer_safely_adds_real_contacts_and_avoids_conflicts_and_generics()
    {
        var tenantId = CrmWebApplicationFactory.DemoTenantId;
        var cs = _factory.DatabaseConnectionString;
        var now = _factory.Services.GetRequiredService<TimeProvider>().GetUtcNow().UtcDateTime;
        using (var scope = _factory.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<LealControl.Api.SuperAdmin.ICommunicationsInboxSettings>().SetEnabledAsync(true);
        using var admin = _factory.CreateAuthenticatedClient();
        using var inbox = _factory.CreateClientForUser(Guid.NewGuid(), "it2@lealcontrol.com", "Admin", "[\"communications\"]");

        // Cliente 1: Metalurgica del Litoral (con contacto existente carlos@metalurgica.com.ar)
        var metalurgica = (await Json(await admin.PostAsJsonAsync("/api/v1/crm/customers", new
        {
            legalName = "Metalurgica del Litoral", documentType = "Cuit", documentNumber = "20304050609",
            taxCondition = "ResponsableInscripto", iibbRegime = "Local", isCustomer = true, isSupplier = false
        }))).GetProperty("id").GetGuid();
        await Ok(await admin.PostAsJsonAsync($"/api/v1/crm/customers/{metalurgica}/contacts", new
        {
            name = "Carlos Ruiz", role = "Commercial", position = "Jefe de Compras", email = "carlos@metalurgica.com.ar", isPrimary = true
        }));

        // Cliente 2: Otra empresa con CUIT 30712345671 (para probar conflicto CUIT vs dominio)
        var otraEmpresa = (await Json(await admin.PostAsJsonAsync("/api/v1/crm/customers", new
        {
            legalName = "Cereales del Norte SA", documentType = "Cuit", documentNumber = "30712345671",
            taxCondition = "ResponsableInscripto", iibbRegime = "Local", isCustomer = true, isSupplier = false
        }))).GetProperty("id").GetGuid();
        Assert.NotEqual(Guid.Empty, otraEmpresa);

        // Clientes 3 y 4: dos empresas distintas que comparten el mismo dominio @grupoindustrial.com.ar (ambiguo)
        var grupoA = (await Json(await admin.PostAsJsonAsync("/api/v1/crm/customers", new
        {
            legalName = "Grupo Industrial Norte SA", documentType = "Cuit", documentNumber = "20123456786",
            taxCondition = "ResponsableInscripto", iibbRegime = "Local", isCustomer = true, isSupplier = false,
            email = "norte@grupoindustrial.com.ar"
        }))).GetProperty("id").GetGuid();
        var grupoB = (await Json(await admin.PostAsJsonAsync("/api/v1/crm/customers", new
        {
            legalName = "Grupo Industrial Sur SA", documentType = "Cuit", documentNumber = "27234567891",
            taxCondition = "ResponsableInscripto", iibbRegime = "Local", isCustomer = true, isSupplier = false,
            email = "sur@grupoindustrial.com.ar"
        }))).GetProperty("id").GetGuid();

        await Ok(await inbox.PutAsJsonAsync("/api/v1/communications/ai/settings", new
        {
            apiKey = "sk-ant-prueba-5678", monthlyBudgetUsd = 10m, mailReadingEnabled = true, autoOpportunities = true, businessDescription = "Básculas"
        }));

        Conversation Mail(string from, string body, DateTime at) =>
            Conversation.Create(tenantId, "email", Guid.NewGuid().ToString("N"), from, from, from, null, body, at, EmailDirection.Incoming);

        var cExistingContact = Mail("carlos@metalurgica.com.ar", "Seguimiento visita", now.AddMinutes(-35));
        var cNewPersonDomain = Mail("laura@metalurgica.com.ar", "Falla celda de carga", now.AddMinutes(-30));
        var cGenericAddr = Mail("facturacion@metalurgica.com.ar", "Retención", now.AddMinutes(-25));
        var cAmbiguousDomain = Mail("nuevo@grupoindustrial.com.ar", "Consulta calibración", now.AddMinutes(-20));
        var cConflictCuit = Mail("maria@metalurgica.com.ar", "Cotizar balanza", now.AddMinutes(-15));
        var cByName = Mail("jorge.perez@gmail.com", "Consulta remito", now.AddMinutes(-10));
        var cLead1 = Mail("pedro@nuevaplanta.com.ar", "Presupuesto 1", now.AddMinutes(-8));
        var cLead2 = Mail("sofia@nuevaplanta.com.ar", "Presupuesto 2", now.AddMinutes(-5));

        var all = new[] { cExistingContact, cNewPersonDomain, cGenericAddr, cAmbiguousDomain, cConflictCuit, cByName, cLead1, cLead2 };
        await using (var comms = new CommunicationsDbContext(new DbContextOptionsBuilder<CommunicationsDbContext>().UseNpgsql(cs).Options))
        {
            await comms.EnsureTablesCreatedAsync();
            comms.Conversations.AddRange(all);
            foreach (var c in all)
            {
                var msg = EmailMessage.Create(tenantId, Guid.NewGuid(), Guid.NewGuid().ToString("N"), null, c.ThreadKey, EmailDirection.Incoming,
                    "Asunto", c.ParticipantEmail!, "ventas@empresa.com", c.LastMessagePreview ?? "", c.LastMessageAtUtc);
                msg.SetConversationId(c.Id);
                comms.EmailMessages.Add(msg);
            }
            await comms.SaveChangesAsync();
        }

        var reader = new AiMailReader(new ScenarioAi(), _factory.Services.GetRequiredService<AiKeyProtector>(), NullLogger<AiMailReader>.Instance);
        Assert.Equal(8, await reader.ReadPendingAsync(cs, tenantId, now, default));

        await using (var comms = new CommunicationsDbContext(new DbContextOptionsBuilder<CommunicationsDbContext>().UseNpgsql(cs).Options))
        {
            var read = await comms.Conversations.AsNoTracking().Where(c => c.TenantId == tenantId).ToDictionaryAsync(c => c.Id);
            Assert.Equal(metalurgica, read[cExistingContact.Id].RelatedCustomerId);
            Assert.Equal(metalurgica, read[cNewPersonDomain.Id].RelatedCustomerId);
            Assert.Equal(metalurgica, read[cGenericAddr.Id].RelatedCustomerId);
            Assert.Equal(metalurgica, read[cByName.Id].RelatedCustomerId); // nombre único normalizado

            // Ambiguo (2 clientes con @grupoindustrial.com.ar) y conflicto (CUIT != dominio): NO auto-vincular
            Assert.Null(read[cAmbiguousDomain.Id].RelatedCustomerId);
            Assert.Null(read[cConflictCuit.Id].RelatedCustomerId);

            // Deduplicación de leads por dominio corporativo
            Assert.NotNull(read[cLead1.Id].RelatedLeadId);
            Assert.Equal(read[cLead1.Id].RelatedLeadId, read[cLead2.Id].RelatedLeadId);
        }

        // Contactos de Metalurgica: Carlos (manual) + Laura (auto, Technical, Jefa de Planta) + Jorge (auto, Encargado de Depósito);
        // NO duplicó Carlos, NO creó facturacion@ ni maria@ (conflicto).
        var detail = await Json(await admin.GetAsync($"/api/v1/crm/customers/{metalurgica}"));
        var contacts = detail.GetProperty("contacts").EnumerateArray().ToList();
        Assert.Equal(3, contacts.Count);
        var laura = contacts.Single(c => c.GetProperty("email").GetString() == "laura@metalurgica.com.ar");
        Assert.Equal("Jefa de Planta", laura.GetProperty("position").GetString());
        Assert.Equal("Technical", laura.GetProperty("role").GetString());
        Assert.True(laura.GetProperty("addedAutomatically").GetBoolean());
        Assert.DoesNotContain(contacts, c => c.GetProperty("email").GetString() == "facturacion@metalurgica.com.ar");

        // Editar el contacto a mano conserva el puesto y quita la marca "Cargado automáticamente".
        var lauraId = laura.GetProperty("id").GetGuid();
        var updated = await Json(await admin.PutAsJsonAsync($"/api/v1/crm/customers/{metalurgica}/contacts/{lauraId}", new
        {
            name = "Laura Gomez", role = "Technical", position = "Gerente de Planta", email = "laura@metalurgica.com.ar", phone = "3415559988", isPrimary = false
        }));
        var lauraUpdated = updated.GetProperty("contacts").EnumerateArray().Single(c => c.GetProperty("id").GetGuid() == lauraId);
        Assert.Equal("Gerente de Planta", lauraUpdated.GetProperty("position").GetString());
        Assert.False(lauraUpdated.GetProperty("addedAutomatically").GetBoolean());

        // En el hilo ambiguo, suggested-matches devuelve los dos candidatos para que el usuario elija en la bandeja.
        var suggestions = (await Json(await inbox.GetAsync($"/api/v1/communications/conversations/{cAmbiguousDomain.Id}/suggested-matches"))).EnumerateArray().ToList();
        var suggestedIds = suggestions.Select(s => s.GetProperty("id").GetGuid()).ToHashSet();
        Assert.Contains(grupoA, suggestedIds);
        Assert.Contains(grupoB, suggestedIds);
    }

    private sealed class WebAndArcaAi : IAiClient
    {
        public int WebSearchCalls;
        public Task<AiCompletion> CompleteJsonAsync(string apiKey, string model, string system, string user,
            IReadOnlyDictionary<string, JsonElement> schema, int maxTokens, CancellationToken ct, bool deeper = false, bool webSearch = false)
        {
            if (webSearch)
            {
                WebSearchCalls++;
                if (user.Contains("Agropecuaria Pampa"))
                    return Task.FromResult(new AiCompletion("""{"cuit":"30654321090","confident":true}""", 800, 100, "end_turn", WebSearchRequests: 1));
                if (user.Contains("Homonimo Falso"))
                    return Task.FromResult(new AiCompletion("""{"cuit":"30555555578","confident":true}""", 800, 100, "end_turn", WebSearchRequests: 1));
                return Task.FromResult(new AiCompletion("""{"cuit":"","confident":false}""", 500, 50, "end_turn", WebSearchRequests: 1));
            }

            object reading = user switch
            {
                _ when user.Contains("cuitdirecto@acopio.com.ar") => new
                {
                    category = "pedido_cotizacion", urgency = 2, summary = "Acopio Sur pide cotizar báscula.",
                    is_new_business = true, opportunity_title = "Báscula Acopio Sur", company = "Acopio Sur SA",
                    contact_name = "Luciano Paz", position = "Gerente Operativo", cuit = "30709876542", phone = "3415550001", email = "", location = "Rosario", product = "Báscula"
                },
                _ when user.Contains("web@agropampa.com.ar") => new
                {
                    category = "pedido_cotizacion", urgency = 2, summary = "Agropecuaria Pampa pide cotizar balanza.",
                    is_new_business = true, opportunity_title = "Balanza Agropecuaria Pampa", company = "Agropecuaria Pampa SRL",
                    contact_name = "Valeria Rossi", position = "Compradora", cuit = "", phone = "", email = "", location = "Pergamino", product = "Balanza"
                },
                _ when user.Contains("pendiente@siniva.com.ar") => new
                {
                    category = "pedido_cotizacion", urgency = 2, summary = "Empresa con IVA desconocido.",
                    is_new_business = true, opportunity_title = "Consulta Sin IVA", company = "Sin IVA SA",
                    contact_name = "Diego", position = "", cuit = "30711111138", phone = "", email = "", location = "", product = "Balanza"
                },
                _ => new
                {
                    category = "pedido_cotizacion", urgency = 2, summary = "Homonimo Falso pide precio.",
                    is_new_business = true, opportunity_title = "Consulta Homonimo", company = "Homonimo Falso SA",
                    contact_name = "Esteban", position = "", cuit = "", phone = "", email = "", location = "", product = "Balanza"
                }
            };
            return Task.FromResult(new AiCompletion(JsonSerializer.Serialize(reading), 1000, 150, "end_turn"));
        }
    }

    private sealed class FakeArcaLookup : IAiArcaCuitLookup
    {
        public Task<Result<ArcaCuitLookupResult>> LookupCuitAsync(string connectionString, Guid tenantId, string cuit, CancellationToken ct) =>
            Task.FromResult(cuit switch
            {
                "30709876542" => Result<ArcaCuitLookupResult>.Success(new ArcaCuitLookupResult(
                    "30709876542", "ACOPIO SUR S.A.", "Acopio Sur", "ResponsableInscripto",
                    "Av. Pellegrini 1234", "Rosario", "SantaFe", "2000", true)),
                "30654321090" => Result<ArcaCuitLookupResult>.Success(new ArcaCuitLookupResult(
                    "30654321090", "AGROPECUARIA PAMPA S.R.L.", null, "ResponsableInscripto",
                    "Ruta 8 Km 220", "Pergamino", "BuenosAires", "2700", true)),
                "30711111138" => Result<ArcaCuitLookupResult>.Success(new ArcaCuitLookupResult(
                    "30711111138", "SIN IVA S.A.", null, "Pendiente",
                    null, null, null, null, true)),
                "30555555578" => Result<ArcaCuitLookupResult>.Success(new ArcaCuitLookupResult(
                    "30555555578", "CONSTRUCTORA COMPLETAMENTE DISTINTA S.A.", null, "ResponsableInscripto",
                    null, null, null, null, true)),
                _ => Result<ArcaCuitLookupResult>.Failure(Error.NotFound("Arca.NotFound", "No encontrado"))
            });
    }

    [Fact]
    public async Task Creates_customer_from_arca_with_review_flag_uses_web_cuit_search_and_blocks_invalid_cases()
    {
        var tenantId = CrmWebApplicationFactory.DemoTenantId;
        var cs = _factory.DatabaseConnectionString;
        var now = _factory.Services.GetRequiredService<TimeProvider>().GetUtcNow().UtcDateTime;
        using (var scope = _factory.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<LealControl.Api.SuperAdmin.ICommunicationsInboxSettings>().SetEnabledAsync(true);
        using var admin = _factory.CreateAuthenticatedClient();
        using var inbox = _factory.CreateClientForUser(Guid.NewGuid(), "it3@lealcontrol.com", "Admin", "[\"communications\"]");

        await Ok(await inbox.PutAsJsonAsync("/api/v1/communications/ai/settings", new
        {
            apiKey = "sk-ant-prueba-9999", monthlyBudgetUsd = 10m, mailReadingEnabled = true,
            autoOpportunities = true, webCuitLookupEnabled = true, businessDescription = "Básculas"
        }));

        Conversation Mail(string from, string body, DateTime at) =>
            Conversation.Create(tenantId, "email", Guid.NewGuid().ToString("N"), from, from, from, null, body, at, EmailDirection.Incoming);

        var cDirectCuit = Mail("cuitdirecto@acopio.com.ar", "Acopio Sur CUIT 30-70987654-3", now.AddMinutes(-20));
        var cWebCuit = Mail("web@agropampa.com.ar", "Agropecuaria Pampa SRL pide balanza", now.AddMinutes(-15));
        var cPendingTax = Mail("pendiente@siniva.com.ar", "Sin IVA SA", now.AddMinutes(-10));
        var cWrongHomonym = Mail("esteban@homonimo.com.ar", "Homonimo Falso SA", now.AddMinutes(-5));

        var all = new[] { cDirectCuit, cWebCuit, cPendingTax, cWrongHomonym };
        await using (var comms = new CommunicationsDbContext(new DbContextOptionsBuilder<CommunicationsDbContext>().UseNpgsql(cs).Options))
        {
            await comms.EnsureTablesCreatedAsync();
            comms.Conversations.AddRange(all);
            foreach (var c in all)
            {
                var msg = EmailMessage.Create(tenantId, Guid.NewGuid(), Guid.NewGuid().ToString("N"), null, c.ThreadKey, EmailDirection.Incoming,
                    "Asunto", c.ParticipantEmail!, "ventas@empresa.com", c.LastMessagePreview ?? "", c.LastMessageAtUtc);
                msg.SetConversationId(c.Id);
                comms.EmailMessages.Add(msg);
            }
            await comms.SaveChangesAsync();
        }

        var fakeAi = new WebAndArcaAi();
        var reader = new AiMailReader(fakeAi, _factory.Services.GetRequiredService<AiKeyProtector>(), NullLogger<AiMailReader>.Instance, new FakeArcaLookup());
        Assert.Equal(4, await reader.ReadPendingAsync(cs, tenantId, now, default));
        Assert.Equal(2, fakeAi.WebSearchCalls); // solo para las 2 sin CUIT

        Guid acopioCustomerId;
        Guid agroCustomerId;
        await using (var comms = new CommunicationsDbContext(new DbContextOptionsBuilder<CommunicationsDbContext>().UseNpgsql(cs).Options))
        {
            var read = await comms.Conversations.AsNoTracking().Where(c => c.TenantId == tenantId).ToDictionaryAsync(c => c.Id);

            // 1) CUIT en el mail → validado en ARCA → cliente + contacto + oportunidad creados
            Assert.NotNull(read[cDirectCuit.Id].RelatedCustomerId);
            Assert.NotNull(read[cDirectCuit.Id].RelatedOpportunityId);
            acopioCustomerId = read[cDirectCuit.Id].RelatedCustomerId!.Value;

            // 2) Sin CUIT → búsqueda web → validado en ARCA → cliente + contacto + oportunidad creados
            Assert.NotNull(read[cWebCuit.Id].RelatedCustomerId);
            Assert.NotNull(read[cWebCuit.Id].RelatedOpportunityId);
            agroCustomerId = read[cWebCuit.Id].RelatedCustomerId!.Value;

            // 3) ARCA con condición fiscal Pendiente → NO crea cliente, cae a Lead
            Assert.Null(read[cPendingTax.Id].RelatedCustomerId);
            Assert.NotNull(read[cPendingTax.Id].RelatedLeadId);

            // 4) Búsqueda web devuelve CUIT de razón social distinta → bloqueado, cae a Lead
            Assert.Null(read[cWrongHomonym.Id].RelatedCustomerId);
            Assert.NotNull(read[cWrongHomonym.Id].RelatedLeadId);
        }

        // Ambos clientes nuevos están marcados AddedAutomatically = true y tienen sus contactos guardados.
        var acopio = await Json(await admin.GetAsync($"/api/v1/crm/customers/{acopioCustomerId}"));
        Assert.Equal("ACOPIO SUR S.A.", acopio.GetProperty("legalName").GetString());
        Assert.True(acopio.GetProperty("addedAutomatically").GetBoolean());
        var luciano = Assert.Single(acopio.GetProperty("contacts").EnumerateArray());
        Assert.Equal("Luciano Paz", luciano.GetProperty("name").GetString());
        Assert.Equal("Gerente Operativo", luciano.GetProperty("position").GetString());
        Assert.True(luciano.GetProperty("addedAutomatically").GetBoolean());

        var agro = await Json(await admin.GetAsync($"/api/v1/crm/customers/{agroCustomerId}"));
        Assert.Equal("AGROPECUARIA PAMPA S.R.L.", agro.GetProperty("legalName").GetString());
        Assert.True(agro.GetProperty("addedAutomatically").GetBoolean());

        // Marcar como revisado quita la marca "Cargado automáticamente".
        var reviewed = await Json(await admin.PostAsync($"/api/v1/crm/customers/{acopioCustomerId}/mark-reviewed", null));
        Assert.False(reviewed.GetProperty("addedAutomatically").GetBoolean());

        // El gasto mensual incluye las 2 búsquedas web ($0,01 c/u = $0,02 + tokens).
        var aiSettings = await Json(await inbox.GetAsync("/api/v1/communications/ai/settings"));
        Assert.True(aiSettings.GetProperty("monthSpentUsd").GetDecimal() >= 0.02m);
    }
}
