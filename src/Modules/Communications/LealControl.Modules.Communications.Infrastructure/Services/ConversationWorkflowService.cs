using System;
using System.Threading;
using System.Threading.Tasks;
using LealControl.Modules.Communications.Infrastructure.Domain;
using LealControl.Modules.Communications.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Communications.Infrastructure.Services;

public static class ConversationWorkflowService
{
    public static async Task<Conversation?> SetStatusAsync(CommunicationsDbContext db, Guid tenantId,
        Guid conversationId, Guid actorUserId, string status, CancellationToken ct = default)
    {
        var normalized = status?.Trim().ToLowerInvariant();
        if (normalized is not ("open" or "pending" or "resolved" or "archived"))
            throw new ArgumentException("Estado de conversación inválido.", nameof(status));

        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var conversation = await LockConversationAsync(db, tenantId, conversationId, ct);
        if (conversation is null) return null;
        if (conversation.Status != normalized)
        {
            db.ConversationActivities.Add(ConversationActivity.Create(tenantId, conversationId, actorUserId,
                "status", conversation.Status, normalized));
            conversation.SetStatus(normalized);
            await db.SaveChangesAsync(ct);
        }
        await transaction.CommitAsync(ct);
        return conversation;
    }

    public static async Task<Conversation?> AssignAsync(CommunicationsDbContext db, Guid tenantId,
        Guid conversationId, Guid actorUserId, Guid? assigneeUserId, CancellationToken ct = default)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var conversation = await LockConversationAsync(db, tenantId, conversationId, ct);
        if (conversation is null) return null;
        if (conversation.AssignedToUserId != assigneeUserId)
        {
            db.ConversationActivities.Add(ConversationActivity.Create(tenantId, conversationId, actorUserId,
                "assignment", conversation.AssignedToUserId?.ToString(), assigneeUserId?.ToString()));
            conversation.AssignTo(assigneeUserId);
            await db.SaveChangesAsync(ct);
        }
        await transaction.CommitAsync(ct);
        return conversation;
    }

    private static Task<Conversation?> LockConversationAsync(CommunicationsDbContext db,
        Guid tenantId, Guid conversationId, CancellationToken ct) =>
        db.Conversations.FromSqlInterpolated(
            $@"SELECT * FROM communications.conversations WHERE ""Id"" = {conversationId} AND ""TenantId"" = {tenantId} FOR UPDATE")
            .FirstOrDefaultAsync(ct);
}
