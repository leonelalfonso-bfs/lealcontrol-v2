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
        if (!configuration.GetValue<bool>("Communications:InboxEnabled") && IsInboxRoute(context.Request.Path))
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            return;
        }

        await next(context);
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
