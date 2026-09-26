using System;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using LealControl.Modules.Communications.Infrastructure.Domain;
using LealControl.Modules.Communications.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace LealControl.Modules.Communications.Infrastructure.Services;

public static class ConversationTagService
{
    public static string Normalize(string name) => Regex.Replace(name.Trim(), @"\s+", " ");

    public static async Task<ConversationTag> AddAsync(
        CommunicationsDbContext db, Guid tenantId, Guid conversationId, string name, CancellationToken ct = default)
    {
        var cleanName = Normalize(name);
        if (cleanName.Length is < 1 or > 32)
            throw new ArgumentException("La etiqueta debe tener entre 1 y 32 caracteres.", nameof(name));
        var normalizedName = cleanName.ToLowerInvariant();
        if (!await db.Conversations.AnyAsync(x => x.Id == conversationId && x.TenantId == tenantId, ct))
            throw new InvalidOperationException("La conversación no pertenece a la empresa.");
        var existing = await db.ConversationTags.FirstOrDefaultAsync(x =>
            x.TenantId == tenantId && x.ConversationId == conversationId && x.NormalizedName == normalizedName, ct);
        if (existing is not null) return existing;

        var tag = ConversationTag.Create(tenantId, conversationId, cleanName, normalizedName);
        db.ConversationTags.Add(tag);
        try
        {
            await db.SaveChangesAsync(ct);
            return tag;
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            db.ChangeTracker.Clear();
            var saved = await db.ConversationTags.FirstOrDefaultAsync(x =>
                x.TenantId == tenantId && x.ConversationId == conversationId && x.NormalizedName == normalizedName, ct);
            if (saved is null) throw;
            return saved;
        }
    }
}
