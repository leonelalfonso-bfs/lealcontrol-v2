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

    /// <summary>
    /// Descartar: sale de la bandeja (no del teléfono), se borran el contenido, los adjuntos y las
    /// notas. Quedan las marcas de cada mensaje para que la sincronización no los vuelva a traer.
    /// Devuelve la cantidad de mensajes borrados, o null si la conversación no existe.
    /// </summary>
    public static async Task<int?> DiscardAsync(CommunicationsDbContext db, Guid tenantId,
        Guid conversationId, Guid actorUserId, bool ignoreContact, CancellationToken ct = default)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var conversation = await LockConversationAsync(db, tenantId, conversationId, ct);
        if (conversation is null) return null;

        var messages = await db.EmailMessages.Include(x => x.Attachments)
            .Where(x => x.TenantId == tenantId && x.ConversationId == conversationId).ToListAsync(ct);
        foreach (var message in messages)
        {
            db.EmailAttachments.RemoveRange(message.Attachments);
            message.Redact();
        }
        db.ConversationNotes.RemoveRange(db.ConversationNotes.Where(x => x.TenantId == tenantId && x.ConversationId == conversationId));
        db.ConversationActivities.Add(ConversationActivity.Create(tenantId, conversationId, actorUserId, "status",
            conversation.Status, ignoreContact ? "discarded+ignore" : Conversation.DiscardedStatus));
        conversation.Discard(ignoreContact);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return messages.Count;
    }

    private static Task<Conversation?> LockConversationAsync(CommunicationsDbContext db,
        Guid tenantId, Guid conversationId, CancellationToken ct) =>
        db.Conversations.FromSqlInterpolated(
            $@"SELECT * FROM communications.conversations WHERE ""Id"" = {conversationId} AND ""TenantId"" = {tenantId} FOR UPDATE")
            .FirstOrDefaultAsync(ct);
}
