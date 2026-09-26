using LealControl.Modules.Communications.Infrastructure.Domain;
using LealControl.Modules.Communications.Infrastructure.Persistence;
using LealControl.Modules.Communications.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Testcontainers.PostgreSql;
using Xunit;

namespace LealControl.Modules.Communications.Tests;

public sealed class WebhookMessagePersistenceTests
{
    [Fact]
    public async Task ConcurrentDeliveryStoresOneMessageAndOneUnreadConversation()
    {
        await using var postgres = new PostgreSqlBuilder()
            .WithImage("postgres:16-alpine")
            .WithDatabase("communications_tests")
            .WithUsername("leal")
            .WithPassword("leal")
            .Build();
        await postgres.StartAsync();
        var options = new DbContextOptionsBuilder<CommunicationsDbContext>()
            .UseNpgsql(postgres.GetConnectionString()).Options;
        await using (var setup = new CommunicationsDbContext(options))
            await setup.EnsureTablesCreatedAsync();

        var tenantId = Guid.NewGuid();
        const string externalId = "wa_delivery_1";
        var start = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        async Task<bool> DeliverAsync()
        {
            await using var db = new CommunicationsDbContext(options);
            var conversation = Conversation.Create(tenantId, "whatsapp", "wa_contact_1", "contact_1", "Contacto", null, null, "hola", DateTime.UtcNow, EmailDirection.Incoming);
            var message = EmailMessage.Create(tenantId, Guid.Empty, externalId, null, "wa_contact_1", EmailDirection.Incoming,
                "WhatsApp: Contacto", "contact_1", "WhatsApp", "hola", DateTime.UtcNow, channelType: "whatsapp");
            message.SetConversationId(conversation.Id);
            db.Conversations.Add(conversation);
            db.EmailMessages.Add(message);
            await start.Task;
            return await WebhookMessagePersistence.SaveAsync(db, tenantId, externalId);
        }

        var first = Task.Run(DeliverAsync);
        var second = Task.Run(DeliverAsync);
        start.SetResult();
        var results = await Task.WhenAll(first, second);
        Assert.Contains(true, results);
        Assert.Contains(false, results);
        await using var check = new CommunicationsDbContext(options);
        Assert.Equal(1, await check.EmailMessages.CountAsync(x => x.TenantId == tenantId && x.InternetMessageId == externalId));
        var stored = await check.Conversations.SingleAsync(x => x.TenantId == tenantId);
        Assert.Equal(1, stored.UnreadCount);
    }
}
