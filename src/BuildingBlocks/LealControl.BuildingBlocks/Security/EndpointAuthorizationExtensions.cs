using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

namespace LealControl.BuildingBlocks.Security;

/// <summary>
/// Runs as early as possible in the endpoint filter pipeline so forbidden writes
/// return 403 even when the JSON body would otherwise fail model binding (400).
/// </summary>
public sealed class RequirePolicyOnWriteFilter(string policyName) : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var method = context.HttpContext.Request.Method;
        if (HttpMethods.IsGet(method) || HttpMethods.IsHead(method) || HttpMethods.IsOptions(method))
        {
            return await next(context);
        }

        var authorization = context.HttpContext.RequestServices.GetRequiredService<IAuthorizationService>();
        var result = await authorization.AuthorizeAsync(context.HttpContext.User, policyName);
        if (!result.Succeeded)
        {
            return Microsoft.AspNetCore.Http.Results.Json(
                new { message = "No tenés permisos para realizar esta operación." },
                statusCode: StatusCodes.Status403Forbidden);
        }

        return await next(context);
    }
}

public static class EndpointAuthorizationExtensions
{
    public static RouteGroupBuilder RequirePolicyOnWrites(this RouteGroupBuilder group, string policyName)
    {
        // Order = int.MinValue: run before other filters; binding for [FromBody] still
        // happens before filters, so tests should also send bindable payloads.
        group.AddEndpointFilterFactory((routeHandlerContext, next) =>
        {
            var filter = new RequirePolicyOnWriteFilter(policyName);
            return invocationContext => filter.InvokeAsync(invocationContext, next);
        });
        return group;
    }
}
