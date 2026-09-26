using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace LealControl.Api.SuperAdmin;

public interface ICommunicationsInboxSettings
{
    Task<bool> IsEnabledAsync(CancellationToken cancellationToken = default);
    Task SetEnabledAsync(bool enabled, CancellationToken cancellationToken = default);
}

public sealed class CommunicationsInboxSettings(MasterDbContext masterDb) : ICommunicationsInboxSettings
{
    public async Task<bool> IsEnabledAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            return await masterDb.PlatformFeatures.AsNoTracking()
                .Where(x => x.Key == "communications_inbox")
                .Select(x => x.Enabled)
                .SingleOrDefaultAsync(cancellationToken);
        }
        catch (PostgresException ex) when (ex.SqlState == PostgresErrorCodes.UndefinedTable)
        {
            // The master schema is created during startup; keep the inbox closed until it exists.
            return false;
        }
    }

    public async Task SetEnabledAsync(bool enabled, CancellationToken cancellationToken = default)
    {
        await masterDb.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO public.platform_feature_flags ("Key", "Enabled", "UpdatedAtUtc")
            VALUES ({"communications_inbox"}, {enabled}, now())
            ON CONFLICT ("Key") DO UPDATE
            SET "Enabled" = EXCLUDED."Enabled", "UpdatedAtUtc" = now()
            """, cancellationToken);
    }
}
