using LealControl.Modules.Communications.Infrastructure.Domain;
using LealControl.Modules.Communications.Infrastructure.Http;
using LealControl.Modules.Communications.Infrastructure.Persistence;
using LealControl.Modules.Communications.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Testcontainers.PostgreSql;
using Xunit;

namespace LealControl.Modules.Communications.Tests;

/// <summary>
/// "Descartar" saca la conversación de la bandeja, borra el contenido y no deja que la
/// sincronización la reviva; si el contacto vuelve a escribir, reaparece (salvo "ignorar").
/// </summary>
public sealed class ConversationDiscardTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:16-alpine")
        .WithDatabase("communications_discard").WithUsername("leal").WithPassword("leal").Build();
    private DbContextOptions<CommunicationsDbContext> _options = null!;
    private readonly Guid _tenant = Guid.NewGuid();
    private const string Thread = "wa_5493410000000";

    public async Task InitializeAsync()
    {
        await _postgres.StartAsync();
        _options = new DbContextOptionsBuilder<CommunicationsDbContext>().UseNpgsql(_postgres.GetConnectionString()).Options;
        await using var setup = new CommunicationsDbContext(_options);
        await setup.EnsureTablesCreatedAsync();
    }

    public Task DisposeAsync() => _postgres.DisposeAsync().AsTask();

    private async Task<EmailMessage> DeliverAsync(string externalId, string text, EmailDirection direction = EmailDirection.Incoming, bool withAttachment = false)
    {
        await using var db = new CommunicationsDbContext(_options);
        var message = EmailMessage.Create(_tenant, Guid.Empty, externalId, null, Thread, direction,
            "WhatsApp: Juan", "5493410000000", "WhatsApp", text, DateTime.UtcNow, channelType: "whatsapp");
        await CommunicationsEndpointHelpers.AddTrackedMessageAsync(db, new ConversationService(), message, "Juan");
        if (withAttachment)
            db.EmailAttachments.Add(EmailAttachment.Create(_tenant, message.Id, "foto.jpg", "image/jpeg", 3, new byte[] { 1, 2, 3 }));
        await db.SaveChangesAsync();
        return message;
    }

    private async Task DiscardAsync(bool ignore)
    {
        await using var db = new CommunicationsDbContext(_options);
        var conversation = await db.Conversations.AsNoTracking().SingleAsync(x => x.TenantId == _tenant);
        Assert.NotNull(await ConversationWorkflowService.DiscardAsync(db, _tenant, conversation.Id, Guid.NewGuid(), ignore));
    }

    [Fact]
    public async Task Discard_hides_and_erases_content_and_a_new_message_brings_it_back()
    {
        await DeliverAsync("wa_1", "Hola, ¿precio de la balanza?", withAttachment: true);
        await DiscardAsync(ignore: false);

        await using (var db = new CommunicationsDbContext(_options))
        {
            var conversation = await db.Conversations.SingleAsync(x => x.TenantId == _tenant);
            Assert.Equal(Conversation.DiscardedStatus, conversation.Status);
            Assert.Null(conversation.LastMessagePreview);
            var stored = await db.EmailMessages.SingleAsync(x => x.InternetMessageId == "wa_1");
            Assert.True(stored.Redacted);
            Assert.Equal(string.Empty, stored.BodyPreview);
            Assert.Equal(0, await db.EmailAttachments.CountAsync(x => x.TenantId == _tenant));
        }

        await DeliverAsync("wa_2", "¿Me pasás el presupuesto?");

        await using (var db = new CommunicationsDbContext(_options))
        {
            var conversation = await db.Conversations.SingleAsync(x => x.TenantId == _tenant);
            Assert.Equal("open", conversation.Status);
            Assert.Equal(1, conversation.UnreadCount);
            Assert.Equal("¿Me pasás el presupuesto?", conversation.LastMessagePreview);
            Assert.False((await db.EmailMessages.SingleAsync(x => x.InternetMessageId == "wa_2")).Redacted);
            Assert.True((await db.EmailMessages.SingleAsync(x => x.InternetMessageId == "wa_1")).Redacted);
        }
    }

    [Fact]
    public async Task Ignored_contact_stays_discarded_and_new_messages_are_stored_without_content()
    {
        await DeliverAsync("wa_1", "Promo imperdible");
        await DiscardAsync(ignore: true);

        await DeliverAsync("wa_2", "Otra promo", withAttachment: true);

        await using var db = new CommunicationsDbContext(_options);
        var conversation = await db.Conversations.SingleAsync(x => x.TenantId == _tenant);
        Assert.Equal(Conversation.DiscardedStatus, conversation.Status);
        Assert.Equal(0, conversation.UnreadCount);
        Assert.Null(conversation.LastMessagePreview);
        var second = await db.EmailMessages.SingleAsync(x => x.InternetMessageId == "wa_2");
        Assert.True(second.Redacted);
        Assert.Equal(string.Empty, second.BodyPreview);
        Assert.Equal(0, await db.EmailAttachments.CountAsync(x => x.TenantId == _tenant));
    }

    [Fact]
    public async Task Link_to_opportunity_is_stored()
    {
        await DeliverAsync("wa_1", "Necesito calibrar 3 balanzas");
        var opportunityId = Guid.NewGuid();
        await using (var db = new CommunicationsDbContext(_options))
        {
            var conversation = await db.Conversations.SingleAsync(x => x.TenantId == _tenant);
            conversation.LinkOpportunity(opportunityId);
            await db.SaveChangesAsync();
        }
        await using var check = new CommunicationsDbContext(_options);
        Assert.Equal(1, await check.Conversations.CountAsync(x => x.TenantId == _tenant && x.RelatedOpportunityId == opportunityId));
    }
}
