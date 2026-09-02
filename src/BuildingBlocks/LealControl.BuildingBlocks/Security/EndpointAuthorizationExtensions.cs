using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

namespace LealControl.BuildingBlocks.Security;

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
        group.AddEndpointFilter(new RequirePolicyOnWriteFilter(policyName));
        return group;
    }
}
