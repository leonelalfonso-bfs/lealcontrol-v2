using LealControl.Modules.Communications.Infrastructure.Domain;
using LealControl.Modules.Communications.Infrastructure.Persistence;
using LealControl.Modules.Communications.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Testcontainers.PostgreSql;
using Xunit;

namespace LealControl.Modules.Communications.Tests;

public sealed class ConversationTagServiceTests
{
    [Fact]
    public async Task ConcurrentAddsKeepOneTagPerConversationAndTenant()
    {
        await using var postgres = new PostgreSqlBuilder()
            .WithImage("postgres:16-alpine")
            .WithDatabase("communications_tags_tests")
            .WithUsername("leal")
            .WithPassword("leal")
            .Build();
        await postgres.StartAsync();
        var options = new DbContextOptionsBuilder<CommunicationsDbContext>()
            .UseNpgsql(postgres.GetConnectionString()).Options;
        var tenantA = Guid.NewGuid();
        var tenantB = Guid.NewGuid();
        var conversationA = Conversation.Create(tenantA, "email", "email_a", "a@example.com", "A", "a@example.com", null, "hola", DateTime.UtcNow, EmailDirection.Incoming);
        var conversationB = Conversation.Create(tenantB, "email", "email_b", "b@example.com", "B", "b@example.com", null, "hola", DateTime.UtcNow, EmailDirection.Incoming);
        await using (var setup = new CommunicationsDbContext(options))
        {
            await setup.EnsureTablesCreatedAsync();
            setup.Conversations.AddRange(conversationA, conversationB);
            await setup.SaveChangesAsync();
        }

        async Task<ConversationTag> AddAsync(string name)
        {
            await using var db = new CommunicationsDbContext(options);
            return await ConversationTagService.AddAsync(db, tenantA, conversationA.Id, name);
        }

        var tags = await Task.WhenAll(
            Task.Run(() => AddAsync(" Urgente ")),
            Task.Run(() => AddAsync("urgente")));
        Assert.Equal(tags[0].Id, tags[1].Id);

        await using (var otherTenant = new CommunicationsDbContext(options))
            await ConversationTagService.AddAsync(otherTenant, tenantB, conversationB.Id, "Urgente");
        await using var check = new CommunicationsDbContext(options);
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            ConversationTagService.AddAsync(check, tenantB, conversationA.Id, "No permitido"));
        Assert.Equal(0, await check.ConversationTags.CountAsync(x => x.Name == "No permitido"));
        Assert.Equal(1, await check.ConversationTags.CountAsync(x => x.TenantId == tenantA && x.ConversationId == conversationA.Id));
        Assert.Equal(1, await check.ConversationTags.CountAsync(x => x.TenantId == tenantB && x.ConversationId == conversationB.Id));
    }
}
