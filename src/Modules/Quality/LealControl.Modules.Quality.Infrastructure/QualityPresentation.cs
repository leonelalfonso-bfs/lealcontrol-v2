using System.Security.Claims;
using System.Security.Cryptography;
using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Quality.Infrastructure;

/// <summary>Sesión de modo presentación (auditor externo sin usuario propio).</summary>
public sealed class QualityPresentationSession : Entity<Guid>
{
    public QualityPresentationSession() : base(Guid.NewGuid()) { }
    public QualityPresentationSession(Guid id) : base(id) { }

    public TenantId TenantId { get; set; }
    public Guid StartedByUserId { get; set; }
    public string StartedByName { get; set; } = string.Empty;
    public DateTime StartedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? EndedAtUtc { get; set; }
    public string ClientIp { get; set; } = string.Empty;
    public string UserAgent { get; set; } = string.Empty;
}

public static class QualityPresentationEndpoints
{
    public static RouteGroupBuilder MapPresentationMode(this RouteGroupBuilder group)
    {
        group.MapGet("/presentation/status", async (
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            await db.EnsureQualityTablesAsync(ct);
            var userId = ResolveUserId(http);
            if (userId is null)
                return Results.Ok(new { active = false });

            var open = await db.PresentationSessions.AsNoTracking()
                .Where(s => s.TenantId == tenant.TenantId
                    && s.StartedByUserId == userId.Value
                    && s.EndedAtUtc == null)
                .OrderByDescending(s => s.StartedAtUtc)
                .FirstOrDefaultAsync(ct);

            return Results.Ok(new
            {
                active = open is not null,
                sessionId = open?.Id,
                startedAtUtc = open?.StartedAtUtc,
                startedByName = open?.StartedByName
            });
        });

        group.MapPost("/presentation/start", async (
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            await db.EnsureQualityTablesAsync(ct);
            var userId = ResolveUserId(http);
            if (userId is null)
                return Results.Unauthorized();

            var name = ResolveUserName(http);
            var open = await db.PresentationSessions
                .Where(s => s.TenantId == tenant.TenantId
                    && s.StartedByUserId == userId.Value
                    && s.EndedAtUtc == null)
                .OrderByDescending(s => s.StartedAtUtc)
                .FirstOrDefaultAsync(ct);

            if (open is not null)
            {
                return Results.Ok(new
                {
                    active = true,
                    sessionId = open.Id,
                    startedAtUtc = open.StartedAtUtc,
                    startedByName = open.StartedByName,
                    resumed = true
                });
            }

            var ua = http.Request.Headers.UserAgent.ToString() ?? "";
            if (ua.Length > 400) ua = ua[..400];

            var session = new QualityPresentationSession
            {
                TenantId = tenant.TenantId,
                StartedByUserId = userId.Value,
                StartedByName = name,
                StartedAtUtc = DateTime.UtcNow,
                ClientIp = http.Connection.RemoteIpAddress?.ToString() ?? "",
                UserAgent = ua
            };
            db.PresentationSessions.Add(session);
            await db.SaveChangesAsync(ct);

            return Results.Ok(new
            {
                active = true,
                sessionId = session.Id,
                startedAtUtc = session.StartedAtUtc,
                startedByName = session.StartedByName,
                resumed = false
            });
        });

        group.MapPost("/presentation/end", async (
            EndPresentationRequest? body,
            ITenantContext tenant,
            QualityDbContext db,
            HttpContext http,
            CancellationToken ct) =>
        {
            await db.EnsureQualityTablesAsync(ct);
            var userId = ResolveUserId(http);
            if (userId is null)
                return Results.Unauthorized();

            if (body is null || string.IsNullOrWhiteSpace(body.Password))
                return Results.BadRequest(new { message = "Ingresá tu contraseña para salir del modo presentación." });

            var ok = await VerifyTenantUserPasswordAsync(db, tenant.TenantId.Value, userId.Value, body.Password, ct);
            if (!ok)
                return Results.Json(new { message = "Contraseña incorrecta." }, statusCode: StatusCodes.Status403Forbidden);

            var openSessions = await db.PresentationSessions
                .Where(s => s.TenantId == tenant.TenantId
                    && s.StartedByUserId == userId.Value
                    && s.EndedAtUtc == null)
                .ToListAsync(ct);

            foreach (var s in openSessions)
                s.EndedAtUtc = DateTime.UtcNow;

            await db.SaveChangesAsync(ct);
            return Results.Ok(new { active = false, closed = openSessions.Count });
        });

        return group;
    }

    private static Guid? ResolveUserId(HttpContext http)
    {
        var claim = http.User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? http.User.FindFirstValue("sub")
            ?? http.Request.Headers["X-User-Id"].FirstOrDefault();
        return Guid.TryParse(claim, out var id) ? id : null;
    }

    private static string ResolveUserName(HttpContext http) =>
        http.User.FindFirstValue(ClaimTypes.Name)
        ?? http.User.FindFirstValue("name")
        ?? http.User.Identity?.Name
        ?? "Usuario";

    private static async Task<bool> VerifyTenantUserPasswordAsync(
        QualityDbContext db,
        Guid tenantId,
        Guid userId,
        string password,
        CancellationToken ct)
    {
        var conn = db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open)
            await conn.OpenAsync(ct);

        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"SELECT ""PasswordHash"" FROM public.tenant_users WHERE ""Id"" = @id AND ""TenantId"" = @tid AND ""IsActive"" = TRUE LIMIT 1;";
        var pId = cmd.CreateParameter();
        pId.ParameterName = "id";
        pId.Value = userId;
        cmd.Parameters.Add(pId);
        var pTid = cmd.CreateParameter();
        pTid.ParameterName = "tid";
        pTid.Value = tenantId;
        cmd.Parameters.Add(pTid);

        var hashObj = await cmd.ExecuteScalarAsync(ct);
        if (hashObj is not string hash || string.IsNullOrWhiteSpace(hash))
            return false;

        return QualityPasswordVerifier.Verify(password, hash);
    }
}

public sealed record EndPresentationRequest(string Password);

internal static class QualityPasswordVerifier
{
    public static bool Verify(string password, string storedHash)
    {
        if (string.IsNullOrWhiteSpace(storedHash) || !storedHash.Contains('.'))
            return false;

        var parts = storedHash.Split('.');
        if (parts.Length != 2) return false;

        try
        {
            var salt = Convert.FromBase64String(parts[0]);
            var expected = Convert.FromBase64String(parts[1]);
            var actual = Rfc2898DeriveBytes.Pbkdf2(
                password, salt, 100_000, HashAlgorithmName.SHA256, 32);
            return CryptographicOperations.FixedTimeEquals(actual, expected);
        }
        catch
        {
            return false;
        }
    }
}
