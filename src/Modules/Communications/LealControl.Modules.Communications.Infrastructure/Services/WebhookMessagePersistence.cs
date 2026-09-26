using System;
using System.Threading;
using System.Threading.Tasks;
using LealControl.Modules.Communications.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace LealControl.Modules.Communications.Infrastructure.Services;

public static class WebhookMessagePersistence
{
    // SaveChanges is atomic: a racing delivery may fail on either the message or
    // conversation unique index. Only acknowledge it as a duplicate once the
    // provider message ID can actually be found in the database.
    public static async Task<bool> SaveAsync(
        CommunicationsDbContext db,
        Guid tenantId,
        string internetMessageId,
        CancellationToken ct = default)
    {
        try
        {
            await db.SaveChangesAsync(ct);
            return true;
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            db.ChangeTracker.Clear();
            if (await db.EmailMessages.AsNoTracking().AnyAsync(
                x => x.TenantId == tenantId && x.InternetMessageId == internetMessageId, ct))
                return false;
            throw;
        }
    }
}
