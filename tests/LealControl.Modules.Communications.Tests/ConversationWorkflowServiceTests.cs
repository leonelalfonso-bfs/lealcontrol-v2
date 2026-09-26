using LealControl.Modules.Communications.Infrastructure.Domain;
using LealControl.Modules.Communications.Infrastructure.Persistence;
using LealControl.Modules.Communications.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Testcontainers.PostgreSql;
using Xunit;

namespace LealControl.Modules.Communications.Tests;

public sealed class ConversationWorkflowServiceTests
{
    [Fact]
    public async Task StatusAndAssignmentChangesAreRecordedOnceForOwningTenant()
    {
        await using var postgres = new PostgreSqlBuilder()
            .WithImage("postgres:16-alpine")
            .WithDatabase("communications_workflow_tests")
            .WithUsername("leal")
            .WithPassword("leal")
            .Build();
        await postgres.StartAsync();
        var options = new DbContextOptionsBuilder<CommunicationsDbContext>()
            .UseNpgsql(postgres.GetConnectionString()).Options;
        var tenantId = Guid.NewGuid();
        var actorId = Guid.NewGuid();
        var assigneeId = Guid.NewGuid();
        var conversation = Conversation.Create(tenantId, "email", "workflow_thread", "a@example.com", "A", "a@example.com", null, "hola", DateTime.UtcNow, EmailDirection.Incoming);
        await using (var setup = new CommunicationsDbContext(options))
        {
            await setup.EnsureTablesCreatedAsync();
            setup.Conversations.Add(conversation);
            await setup.SaveChangesAsync();
        }

        await using (var db = new CommunicationsDbContext(options))
        {
            Assert.NotNull(await ConversationWorkflowService.SetStatusAsync(db, tenantId, conversation.Id, actorId, "pending"));
            Assert.NotNull(await ConversationWorkflowService.SetStatusAsync(db, tenantId, conversation.Id, actorId, "pending"));
            Assert.NotNull(await ConversationWorkflowService.AssignAsync(db, tenantId, conversation.Id, actorId, assigneeId));
            Assert.NotNull(await ConversationWorkflowService.AssignAsync(db, tenantId, conversation.Id, actorId, assigneeId));
            Assert.Null(await ConversationWorkflowService.SetStatusAsync(db, Guid.NewGuid(), conversation.Id, actorId, "resolved"));
            Assert.Null(await ConversationWorkflowService.AssignAsync(db, Guid.NewGuid(), conversation.Id, actorId, null));
        }

        await using var check = new CommunicationsDbContext(options);
        var events = await check.ConversationActivities
            .Where(x => x.TenantId == tenantId && x.ConversationId == conversation.Id)
            .OrderBy(x => x.OccurredAtUtc)
            .ToListAsync();
        Assert.Equal(2, events.Count);
        Assert.All(events, x => Assert.Equal(actorId, x.ActorUserId));
        Assert.Contains(events, x => x.Kind == "status" && x.PreviousValue == "open" && x.CurrentValue == "pending");
        Assert.Contains(events, x => x.Kind == "assignment" && x.PreviousValue == null && x.CurrentValue == assigneeId.ToString());
        var saved = await check.Conversations.SingleAsync(x => x.Id == conversation.Id);
        Assert.Equal("pending", saved.Status);
        Assert.Equal(assigneeId, saved.AssignedToUserId);

        async Task ChangeStatusAsync(string status)
        {
            await using var concurrent = new CommunicationsDbContext(options);
            await ConversationWorkflowService.SetStatusAsync(concurrent, tenantId, conversation.Id, actorId, status);
        }
        await Task.WhenAll(
            Task.Run(() => ChangeStatusAsync("resolved")),
            Task.Run(() => ChangeStatusAsync("archived")));
        await using var finalCheck = new CommunicationsDbContext(options);
        var statusEvents = await finalCheck.ConversationActivities
            .Where(x => x.TenantId == tenantId && x.ConversationId == conversation.Id && x.Kind == "status")
            .OrderBy(x => x.OccurredAtUtc)
            .ToListAsync();
        Assert.Equal(3, statusEvents.Count);
        Assert.Equal("pending", statusEvents[1].PreviousValue);
        Assert.Equal(statusEvents[1].CurrentValue, statusEvents[2].PreviousValue);
        Assert.Equal(statusEvents[2].CurrentValue,
            (await finalCheck.Conversations.SingleAsync(x => x.Id == conversation.Id)).Status);
    }
}
