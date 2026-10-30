using System.Security.Claims;
using LealControl.BuildingBlocks.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Metrology.Infrastructure;

/// <summary>Responsable técnico que firma los informes: su aclaración y la imagen de su firma (queda en la base de la empresa).</summary>
public sealed class MetrologySignatory
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid UserId { get; set; }
    public string FullName { get; set; } = "";
    public string? Title { get; set; }
    public string? License { get; set; }
    public string? SignatureContentType { get; set; }
    public byte[]? Signature { get; set; }
    public DateTime UpdatedAtUtc { get; set; }
}

public sealed record SignatoryRequest(string FullName, string? Title, string? License, string? SignatureBase64);

/// <summary>Cada director técnico carga su propia firma; el informe muestra la de quien lo emitió.</summary>
public static class MetrologySignatories
{
    private const int MaxSignatureBytes = 400_000;

    public static Guid? UserId(ClaimsPrincipal user) =>
        Guid.TryParse(user.FindFirst("sub")?.Value ?? user.FindFirst(ClaimTypes.NameIdentifier)?.Value, out var id) ? id : null;

    private static object View(MetrologySignatory s) => new { s.UserId, s.FullName, s.Title, s.License, HasSignature = s.Signature is { Length: > 0 }, s.UpdatedAtUtc };

    public static void MapSignatoryEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("/signatories", async (ITenantContext tenant, MetrologyDbContext db, CancellationToken ct) =>
        {
            await db.EnsureMetrologyTablesAsync(ct);
            var rows = await db.Signatories.AsNoTracking().Where(s => s.TenantId == tenant.TenantId.Value).OrderBy(s => s.FullName).ToListAsync(ct);
            return Results.Ok(rows.Select(View));
        });

        group.MapGet("/signatories/me", async (HttpContext http, ITenantContext tenant, MetrologyDbContext db, CancellationToken ct) =>
        {
            await db.EnsureMetrologyTablesAsync(ct);
            var userId = UserId(http.User);
            var row = userId is null ? null : await db.Signatories.AsNoTracking().FirstOrDefaultAsync(s => s.TenantId == tenant.TenantId.Value && s.UserId == userId, ct);
            return row is null ? Results.NoContent() : Results.Ok(View(row));
        });

        group.MapPut("/signatories/me", async (SignatoryRequest req, HttpContext http, ITenantContext tenant, MetrologyDbContext db, CancellationToken ct) =>
        {
            await db.EnsureMetrologyTablesAsync(ct);
            if (UserId(http.User) is not { } userId) return Results.Unauthorized();
            if (string.IsNullOrWhiteSpace(req.FullName)) return Results.BadRequest(new { message = "Falta la aclaración (nombre y apellido)." });
            var t = tenant.TenantId.Value;
            var row = await db.Signatories.FirstOrDefaultAsync(s => s.TenantId == t && s.UserId == userId, ct)
                ?? db.Signatories.Add(new MetrologySignatory { Id = Guid.NewGuid(), TenantId = t, UserId = userId }).Entity;
            row.FullName = req.FullName.Trim();
            row.Title = string.IsNullOrWhiteSpace(req.Title) ? null : req.Title.Trim();
            row.License = string.IsNullOrWhiteSpace(req.License) ? null : req.License.Trim();
            if (!string.IsNullOrWhiteSpace(req.SignatureBase64))
            {
                var raw = req.SignatureBase64;
                var contentType = raw.StartsWith("data:image/jpeg", StringComparison.OrdinalIgnoreCase) ? "image/jpeg" : "image/png";
                var comma = raw.IndexOf(',');
                byte[] bytes;
                try { bytes = Convert.FromBase64String(comma >= 0 ? raw[(comma + 1)..] : raw); }
                catch (FormatException) { return Results.BadRequest(new { message = "La imagen de la firma no es válida." }); }
                if (bytes.Length > MaxSignatureBytes) return Results.BadRequest(new { message = "La imagen de la firma supera los 400 KB." });
                (row.Signature, row.SignatureContentType) = (bytes, contentType);
            }
            row.UpdatedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return Results.Ok(View(row));
        }).RequireAuthorization("RequireTechnicalDirector");

        group.MapGet("/signatories/{userId:guid}/signature", async (Guid userId, ITenantContext tenant, MetrologyDbContext db, CancellationToken ct) =>
        {
            await db.EnsureMetrologyTablesAsync(ct);
            var row = await db.Signatories.AsNoTracking().FirstOrDefaultAsync(s => s.TenantId == tenant.TenantId.Value && s.UserId == userId, ct);
            return row?.Signature is { Length: > 0 } bytes ? Results.File(bytes, row.SignatureContentType ?? "image/png") : Results.NotFound();
        });
    }
}
