using LealControl.BuildingBlocks.Storage;
using LealControl.BuildingBlocks.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Fleet.Infrastructure;

/// <summary>
/// Archivos escaneados de los vencimientos de las unidades y de las credenciales de las personas. El legajo para ingreso a
/// planta, que los junta con los de RRHH, está en RRHH.
/// </summary>
public static class FleetFiles
{
    private const long MaxBytes = 15 * 1024 * 1024;
    private static readonly string[] Allowed = ["application/pdf", "image/jpeg", "image/png"];

    internal static async Task<IResult> SaveFileAsync(IFormFile? file, Guid tenantId, IFileStorage storage, Action<string, string, string> assign, CancellationToken ct)
    {
        if (file is null || file.Length == 0) return Results.BadRequest(new { detail = "Elegí un archivo." });
        if (file.Length > MaxBytes) return Results.BadRequest(new { detail = "El archivo supera los 15 MB." });
        var type = file.ContentType?.ToLowerInvariant() ?? "";
        if (!Allowed.Contains(type)) return Results.BadRequest(new { detail = "Solo PDF, JPG o PNG." });
        await using var stream = file.OpenReadStream();
        var stored = await storage.SaveAsync("fleet", tenantId, file.FileName, type, stream, ct);
        assign(stored.StorageKey, Path.GetFileName(file.FileName), type);
        return Results.Ok(new { fileName = Path.GetFileName(file.FileName) });
    }

    internal static async Task<IResult> OpenAsync(string? key, string? name, string? type, IFileStorage storage, CancellationToken ct)
    {
        if (key is null) return Results.NotFound(new { detail = "No tiene archivo cargado." });
        var content = await storage.OpenReadAsync(key, ct);
        return content is null ? Results.NotFound(new { detail = "No se encontró el archivo." }) : Results.File(content.Stream, type ?? content.ContentType, name ?? content.FileName);
    }

    public static void MapFleetFiles(this RouteGroupBuilder group)
    {
        group.MapPost("/documents/{id:guid}/file", async (Guid id, IFormFile? file, FleetDbContext db, ITenantContext tenant, IFileStorage storage, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var doc = await db.VehicleDocuments.FirstOrDefaultAsync(d => d.Id == id && d.TenantId == t, ct);
            if (doc is null) return Results.NotFound(new { detail = "Vencimiento no encontrado." });
            var result = await SaveFileAsync(file, t, storage, (k, n, c) => (doc.FileStorageKey, doc.FileName, doc.FileContentType) = (k, n, c), ct);
            await db.SaveChangesAsync(ct);
            return result;
        }).DisableAntiforgery();
        group.MapGet("/documents/{id:guid}/file", async (Guid id, FleetDbContext db, ITenantContext tenant, IFileStorage storage, CancellationToken ct) =>
        {
            var doc = await db.VehicleDocuments.AsNoTracking().FirstOrDefaultAsync(d => d.Id == id && d.TenantId == tenant.TenantId.Value, ct);
            return doc is null ? Results.NotFound() : await OpenAsync(doc.FileStorageKey, doc.FileName, doc.FileContentType, storage, ct);
        });
        group.MapPost("/credentials/{id:guid}/file", async (Guid id, IFormFile? file, FleetDbContext db, ITenantContext tenant, IFileStorage storage, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var credential = await db.PersonCredentials.FirstOrDefaultAsync(c => c.Id == id && c.TenantId == t, ct);
            if (credential is null) return Results.NotFound(new { detail = "Credencial no encontrada." });
            var result = await SaveFileAsync(file, t, storage, (k, n, c) => (credential.FileStorageKey, credential.FileName, credential.FileContentType) = (k, n, c), ct);
            await db.SaveChangesAsync(ct);
            return result;
        }).DisableAntiforgery();
        group.MapGet("/credentials/{id:guid}/file", async (Guid id, FleetDbContext db, ITenantContext tenant, IFileStorage storage, CancellationToken ct) =>
        {
            var c = await db.PersonCredentials.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenant.TenantId.Value, ct);
            return c is null ? Results.NotFound() : await OpenAsync(c.FileStorageKey, c.FileName, c.FileContentType, storage, ct);
        });
    }
}
