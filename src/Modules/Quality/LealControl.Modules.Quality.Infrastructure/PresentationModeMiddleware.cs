using Microsoft.AspNetCore.Http;

namespace LealControl.Modules.Quality.Infrastructure;

/// <summary>
/// Bloquea escrituras en Calidad y Metrología mientras la petición envía X-Presentation-Mode: 1.
/// Las rutas /api/v1/quality/presentation/* quedan permitidas (activar / salir).
/// </summary>
public sealed class PresentationModeMiddleware(RequestDelegate next)
{
    public const string HeaderName = "X-Presentation-Mode";

    public async Task InvokeAsync(HttpContext context)
    {
        var path = context.Request.Path.Value ?? "";
        var method = context.Request.Method;

        var isSafe =
            HttpMethods.IsGet(method)
            || HttpMethods.IsHead(method)
            || HttpMethods.IsOptions(method);

        var isPresentationApi = path.StartsWith("/api/v1/quality/presentation", StringComparison.OrdinalIgnoreCase);

        if (!isSafe
            && !isPresentationApi
            && IsPresentationHeaderOn(context)
            && (path.StartsWith("/api/v1/quality", StringComparison.OrdinalIgnoreCase)
                || path.StartsWith("/api/v1/metrology", StringComparison.OrdinalIgnoreCase)))
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsJsonAsync(new
            {
                message = "Modo presentación activo: solo lectura. Salí del modo (con contraseña) para editar."
            });
            return;
        }

        await next(context);
    }

    private static bool IsPresentationHeaderOn(HttpContext context)
    {
        if (!context.Request.Headers.TryGetValue(HeaderName, out var values))
            return false;
        var raw = values.ToString().Trim();
        return raw is "1" or "true" or "True" or "yes";
    }
}
