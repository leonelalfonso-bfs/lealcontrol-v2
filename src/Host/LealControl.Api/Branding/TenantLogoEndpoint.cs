using LealControl.BuildingBlocks.Tenancy;
using Npgsql;

namespace LealControl.Api.Branding;

/// <summary>
/// Logo de una empresa como imagen aparte (para el selector del login). Antes viajaba en base64 dentro de
/// auth/login y auth/me (MB por respuesta); así baja una sola vez y el navegador lo guarda en caché.
/// </summary>
public static class TenantLogoEndpoint
{
    public static void MapTenantLogo(this WebApplication app) =>
        app.MapGet("/api/v1/public/tenants/{tenantId:guid}/logo", async (Guid tenantId, ITenantConnectionProvider connections, HttpContext http, CancellationToken ct) =>
        {
            string? logo;
            try
            {
                await using var conn = new NpgsqlConnection(await connections.GetConnectionStringAsync(new TenantId(tenantId), ct));
                await conn.OpenAsync(ct);
                await using var cmd = new NpgsqlCommand(@"SELECT ""LogoUrl"" FROM public.tenant_settings WHERE ""TenantId"" = @id LIMIT 1", conn);
                cmd.Parameters.AddWithValue("id", tenantId);
                logo = await cmd.ExecuteScalarAsync(ct) as string;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                return Results.NotFound();
            }

            // Solo logos embebidos (data:image/...;base64,...); una URL externa la resuelve el navegador.
            if (string.IsNullOrWhiteSpace(logo) || !logo.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase)) return Results.NotFound();
            var comma = logo.IndexOf(',');
            var header = comma > 0 ? logo[5..comma] : "";
            if (!header.EndsWith(";base64", StringComparison.OrdinalIgnoreCase)) return Results.NotFound();
            byte[] bytes;
            try { bytes = Convert.FromBase64String(logo[(comma + 1)..]); }
            catch (FormatException) { return Results.NotFound(); }

            http.Response.Headers.CacheControl = "public, max-age=3600";
            return Results.Bytes(bytes, header[..^";base64".Length]);
        }).AllowAnonymous();
}
