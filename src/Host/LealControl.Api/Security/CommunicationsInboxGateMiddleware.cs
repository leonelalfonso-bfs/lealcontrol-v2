using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;

namespace LealControl.Api.Security;

/// <summary>
/// The inbox and interactive channel routes are still under development. Mail
/// flows remain available to sales/directory. Existing provider webhooks and
/// public media URLs remain untouched to preserve deliveries and attachments.
/// </summary>
public sealed class CommunicationsInboxGateMiddleware(RequestDelegate next, IConfiguration configuration)
{
    public async Task InvokeAsync(HttpContext context)
    {
        if (!IsInboxRoute(context.Request.Path))
        {
            await next(context);
            return;
        }

        if (!configuration.GetValue<bool>("Communications:InboxEnabled"))
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            return;
        }

        if (context.User.Identity?.IsAuthenticated != true)
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return;
        }

        var isSuperAdmin = string.Equals(context.User.FindFirst("role")?.Value,
            "SuperAdmin", StringComparison.OrdinalIgnoreCase);
        if (!isSuperAdmin && !HasCommunications(context.User))
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            return;
        }

        await next(context);
    }

    private static bool HasCommunications(ClaimsPrincipal user)
    {
        var values = user.FindAll("allowed_modules")
            .Select(claim => claim.Value)
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .ToArray();
        if (values.Length == 0) return false;
        if (values.Length == 1 && values[0].StartsWith("[", StringComparison.Ordinal))
        {
            try
            {
                return JsonSerializer.Deserialize<string[]>(values[0])?
                    .Any(module => string.Equals(module, "communications", StringComparison.OrdinalIgnoreCase)) == true;
            }
            catch (JsonException)
            {
                return false;
            }
        }

        return values.Any(value => string.Equals(value, "communications", StringComparison.OrdinalIgnoreCase));
    }

    internal static bool IsInboxRoute(PathString path)
    {
        if (!path.StartsWithSegments("/api/v1/communications", StringComparison.OrdinalIgnoreCase))
            return false;

        // Shared email flows used outside the inbox.
        return !path.StartsWithSegments("/api/v1/communications/accounts", StringComparison.OrdinalIgnoreCase)
            && !path.StartsWithSegments("/api/v1/communications/messages", StringComparison.OrdinalIgnoreCase);
    }
}
