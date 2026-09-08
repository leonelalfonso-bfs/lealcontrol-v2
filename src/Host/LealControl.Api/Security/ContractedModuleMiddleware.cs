using System.Text.Json;
using LealControl.BuildingBlocks.Security;

namespace LealControl.Api.Security;

public sealed class ContractedModuleMiddleware(RequestDelegate next)
{
    private static readonly HashSet<string> BypassRoles = new(StringComparer.OrdinalIgnoreCase)
    {
        "SuperAdmin"
    };

    public async Task InvokeAsync(HttpContext context)
    {
        var path = context.Request.Path;
        if (IsExempt(path))
        {
            await next(context);
            return;
        }

        var moduleKey = ContractedModuleMap.ResolveModuleKey(path);
        if (moduleKey is null)
        {
            await next(context);
            return;
        }

        var role = context.User.FindFirst("role")?.Value;
        if (!string.IsNullOrWhiteSpace(role) && BypassRoles.Contains(role))
        {
            await next(context);
            return;
        }

        var allowedModules = ReadAllowedModules(context.User);
        if (allowedModules.Count == 0)
        {
            await next(context);
            return;
        }

        if (!IsModuleAllowed(allowedModules, moduleKey))
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsJsonAsync(new
            {
                message = $"El módulo '{moduleKey}' no está incluido en tu plan o perfil de usuario."
            });
            return;
        }

        await next(context);
    }

    /// <summary>
    /// Directorio (clientes/proveedores) es base del ERP; CRM pipeline y Communications siguen bloqueados si no están contratados.
    /// </summary>
    private static bool IsModuleAllowed(HashSet<string> allowed, string moduleKey)
    {
        if (moduleKey.Equals("directory", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (allowed.Contains(moduleKey))
        {
            return true;
        }

        if (moduleKey.Equals("communications", StringComparison.OrdinalIgnoreCase)
            && allowed.Contains("crm"))
        {
            return true;
        }

        if (moduleKey.Equals("crm", StringComparison.OrdinalIgnoreCase)
            && allowed.Contains("communications"))
        {
            return true;
        }

        return false;
    }

    private static bool IsExempt(PathString path)
    {
        var value = path.Value ?? string.Empty;
        return value.StartsWith("/api/v1/auth", StringComparison.OrdinalIgnoreCase)
            || value.StartsWith("/api/v1/public", StringComparison.OrdinalIgnoreCase)
            || value.StartsWith("/api/v1/superadmin", StringComparison.OrdinalIgnoreCase)
            || value.StartsWith("/health", StringComparison.OrdinalIgnoreCase)
            || value.StartsWith("/swagger", StringComparison.OrdinalIgnoreCase)
            || value == "/";
    }

    private static HashSet<string> ReadAllowedModules(System.Security.Claims.ClaimsPrincipal user)
    {
        var claimValues = user.FindAll("allowed_modules")
            .Select(c => c.Value)
            .Where(v => !string.IsNullOrWhiteSpace(v))
            .ToList();

        if (claimValues.Count == 0)
        {
            return [];
        }

        if (claimValues.Count == 1 && claimValues[0].StartsWith("[", StringComparison.Ordinal))
        {
            try
            {
                var modules = JsonSerializer.Deserialize<string[]>(claimValues[0]);
                return modules?.Where(m => !string.IsNullOrWhiteSpace(m))
                    .ToHashSet(StringComparer.OrdinalIgnoreCase)
                    ?? [];
            }
            catch
            {
                return [];
            }
        }

        return claimValues.ToHashSet(StringComparer.OrdinalIgnoreCase);
    }
}
