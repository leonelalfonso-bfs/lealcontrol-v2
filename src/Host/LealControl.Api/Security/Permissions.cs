using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Security;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Domain.Settings;
using LealControl.Modules.Crm.Infrastructure.Persistence;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace LealControl.Api.Security;

/// <summary>Permisos efectivos del usuario del pedido.</summary>
public sealed record UserPermissions(IReadOnlyDictionary<string, PermissionLevel> Modules, SensitivePermissions Sensitive, bool IsSuperAdmin)
{
    public PermissionLevel LevelOf(string module) =>
        IsSuperAdmin ? PermissionLevel.Admin : Modules.TryGetValue(module, out var level) ? level : PermissionLevel.None;

    public bool Allows(string module, PermissionLevel level) => LevelOf(module) >= level;

    public static readonly UserPermissions Everything = new(
        PermissionCatalog.Modules.ToDictionary(m => m.Key, _ => PermissionLevel.Admin, StringComparer.OrdinalIgnoreCase),
        SensitivePermissions.All, false);
}

/// <summary>Qué módulo y qué nivel pide cada ruta. Sin base de datos: se prueba aparte.</summary>
public static class PermissionRules
{
    public sealed record Requirement(string Module, PermissionLevel Level, string[]? AlsoReadableWith = null);

    private static readonly (string Prefix, string Module)[] Prefixes =
    [
        // Stock y producción viven bajo /sales pero son su propio módulo.
        ("/api/v1/sales/products", "inventory"),
        ("/api/v1/sales/warehouses", "inventory"),
        ("/api/v1/sales/inventory", "inventory"),
        ("/api/v1/sales/production", "inventory"),
        ("/api/v1/sales", "sales"),
        ("/api/v1/crm", "sales"),
        ("/api/v1/communications", "communications"),
        ("/api/v1/finance", "finance"),
        ("/api/v1/accounting", "accounting"),
        ("/api/v1/purchases", "purchases"),
        ("/api/v1/hr", "hr"),
        ("/api/v1/fleet", "fleet"),
        ("/api/v1/metrology", "metrology"),
        ("/api/v1/quality", "quality"),
        ("/api/v1/grains", "grains")
    ];

    /// <summary>Rutas que no pasan por niveles: base del sistema o controladas de otra forma.</summary>
    private static readonly string[] Exempt =
    [
        // Directorio (clientes y proveedores) es base del ERP.
        "/api/v1/crm/customers", "/api/v1/crm/suppliers", "/api/v1/automation/bcra",
        // El correo se usa desde Ventas y Directorio, sin contratar la bandeja.
        "/api/v1/communications/accounts", "/api/v1/communications/messages"
    ];

    /// <summary>Acciones que comprometen: autorizar, anular, confirmar, cerrar, asentar.</summary>
    private static readonly HashSet<string> ApproveSegments = new(StringComparer.OrdinalIgnoreCase)
    {
        "authorize-arca", "recover-arca", "apply-arca-rate", "authorize", "approve", "void", "cancel", "reject", "deposit", "reconcile",
        "lock", "unlock", "revert", "confirm", "quick-post", "execute"
    };

    private static readonly HashSet<string> AdminSegments = new(StringComparer.OrdinalIgnoreCase) { "settings", "config", "configuration" };

    public static Requirement? Resolve(string method, string? path)
    {
        if (string.IsNullOrWhiteSpace(path)) return null;
        if (Exempt.Any(e => path.StartsWith(e, StringComparison.OrdinalIgnoreCase))) return null;
        var module = Prefixes.FirstOrDefault(p => path.StartsWith(p.Prefix, StringComparison.OrdinalIgnoreCase)).Module;
        if (module is null) return null;

        var read = HttpMethods.IsGet(method) || HttpMethods.IsHead(method) || HttpMethods.IsOptions(method);
        if (read)
        {
            // Productos y depósitos se consultan para vender y comprar.
            var catalogRead = path.StartsWith("/api/v1/sales/products", StringComparison.OrdinalIgnoreCase)
                || path.StartsWith("/api/v1/sales/warehouses", StringComparison.OrdinalIgnoreCase);
            return new Requirement(module, PermissionLevel.View, catalogRead ? ["sales", "purchases"] : null);
        }

        var segments = path.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (segments.Any(s => AdminSegments.Contains(s))) return new Requirement(module, PermissionLevel.Admin);
        if (segments.Any(s => ApproveSegments.Contains(s) || s.StartsWith("auto-post", StringComparison.OrdinalIgnoreCase)
                || s.StartsWith("batch-post", StringComparison.OrdinalIgnoreCase)))
            return new Requirement(module, PermissionLevel.Approve);
        return new Requirement(module, PermissionLevel.Edit);
    }

    public static bool Satisfies(UserPermissions permissions, Requirement requirement) =>
        permissions.Allows(requirement.Module, requirement.Level)
        || (requirement.AlsoReadableWith?.Any(m => permissions.Allows(m, PermissionLevel.View)) ?? false);

    public static string LevelText(PermissionLevel level) => level switch
    {
        PermissionLevel.View => "ver",
        PermissionLevel.Edit => "cargar o modificar",
        PermissionLevel.Approve => "aprobar, anular o confirmar",
        PermissionLevel.Admin => "configurar",
        _ => "usar"
    };

    public static string ModuleLabel(string key) => PermissionCatalog.Modules.FirstOrDefault(m => m.Key == key)?.Label ?? key;
}

/// <summary>
/// Lee los permisos efectivos de la base (perfil + excepciones) con una caché corta por usuario.
/// Un cambio en perfiles o usuarios invalida la caché de la empresa: aplica en el próximo pedido.
/// </summary>
public sealed class PermissionResolver : IPermissionChangeNotifier
{
    private static readonly TimeSpan Ttl = TimeSpan.FromSeconds(60);
    private readonly ConcurrentDictionary<Guid, long> _versions = new();
    private readonly ConcurrentDictionary<(Guid Tenant, Guid User), (UserPermissions Permissions, long Version, DateTime Expires)> _cache = new();

    public void PermissionsChanged(Guid tenantId) => _versions.AddOrUpdate(tenantId, 1, (_, v) => v + 1);

    public const string ItemKey = "leal.permissions";

    public static UserPermissions? FromContext(HttpContext context) => context.Items[ItemKey] as UserPermissions;

    public async Task<UserPermissions> ResolveAsync(HttpContext context, CancellationToken ct)
    {
        if (FromContext(context) is { } cached) return cached;
        var user = context.User;
        var role = user.FindFirst("role")?.Value ?? user.FindFirst(ClaimTypes.Role)?.Value;
        if (string.Equals(role, "SuperAdmin", StringComparison.OrdinalIgnoreCase))
            return Store(context, UserPermissions.Everything with { IsSuperAdmin = true });

        var tenantId = context.RequestServices.GetRequiredService<ITenantContext>().TenantId.Value;
        Guid.TryParse(user.FindFirst("sub")?.Value ?? user.FindFirst(ClaimTypes.NameIdentifier)?.Value, out var userId);
        var version = _versions.GetValueOrDefault(tenantId);
        if (userId != Guid.Empty && _cache.TryGetValue((tenantId, userId), out var entry) && entry.Version == version && entry.Expires > DateTime.UtcNow)
            return Store(context, entry.Permissions);

        UserPermissions? resolved = null;
        var lookupFailed = false;
        if (userId != Guid.Empty && tenantId != Guid.Empty)
        {
            try
            {
                resolved = await FromDatabaseAsync(context, tenantId, userId, ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                // Empresa inexistente o base no disponible: se usa lo que dice el token, y el control
                // de empresa que corre después rechaza el pedido como antes.
                lookupFailed = true;
            }
        }

        resolved ??= FromLegacyClaims(user, role);
        if (userId != Guid.Empty && !lookupFailed) _cache[(tenantId, userId)] = (resolved, version, DateTime.UtcNow.Add(Ttl));
        return Store(context, resolved);
    }

    private static async Task<UserPermissions?> FromDatabaseAsync(HttpContext context, Guid tenantId, Guid userId, CancellationToken ct)
    {
        UserPermissions? resolved = null;
        {
            var db = context.RequestServices.GetRequiredService<CrmDbContext>();
            var tenant = new TenantId(tenantId);
            var row = await db.TenantUsers.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId && u.TenantId == tenant, ct);
            if (row is not null && !row.IsActive)
            {
                resolved = new UserPermissions(new Dictionary<string, PermissionLevel>(), SensitivePermissions.None, false);
            }
            else if (row?.ProfileId is { } profileId)
            {
                var profile = await db.PermissionProfiles.AsNoTracking().FirstOrDefaultAsync(p => p.Id == profileId, ct);
                var effective = row.EffectivePermissions(profile);
                resolved = new UserPermissions(effective.Modules, effective.Sensitive, false);
            }
        }
        return resolved;
    }

    /// <summary>Usuarios sin perfil (tokens anteriores o de integración): como antes de los perfiles.</summary>
    private static UserPermissions FromLegacyClaims(ClaimsPrincipal user, string? role)
    {
        if (string.Equals(role, "Admin", StringComparison.OrdinalIgnoreCase) || string.Equals(role, "Administrador", StringComparison.OrdinalIgnoreCase))
            return UserPermissions.Everything;
        var modules = new Dictionary<string, PermissionLevel>(StringComparer.OrdinalIgnoreCase);
        var raw = user.FindFirst("allowed_modules")?.Value;
        try
        {
            foreach (var key in JsonSerializer.Deserialize<string[]>(string.IsNullOrWhiteSpace(raw) ? "[]" : raw) ?? [])
            {
                var normalized = key.Equals("crm", StringComparison.OrdinalIgnoreCase) ? "sales" : key;
                if (PermissionCatalog.Keys.Contains(normalized)) modules[normalized] = PermissionLevel.Approve;
            }
        }
        catch (JsonException)
        {
        }
        return new UserPermissions(modules, SensitivePermissions.All, false);
    }

    private static UserPermissions Store(HttpContext context, UserPermissions permissions)
    {
        context.Items[ItemKey] = permissions;
        return permissions;
    }
}

/// <summary>
/// Controla cada pedido contra el nivel que pide su ruta (Ver, Cargar, Aprobar, Administrar),
/// con los permisos leídos de la base. Reemplaza al control por lista de módulos del token.
/// </summary>
public sealed class PermissionMiddleware(RequestDelegate next)
{
    public const string CheckedKey = "leal.permissions.checked";

    public async Task InvokeAsync(HttpContext context, PermissionResolver resolver)
    {
        if (context.User.Identity?.IsAuthenticated != true)
        {
            await next(context);
            return;
        }
        var requirement = PermissionRules.Resolve(context.Request.Method, context.Request.Path.Value);
        if (requirement is null)
        {
            await next(context);
            return;
        }

        var permissions = await resolver.ResolveAsync(context, context.RequestAborted);
        if (!PermissionRules.Satisfies(permissions, requirement))
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            await context.Response.WriteAsJsonAsync(new
            {
                message = $"Tu perfil no permite {PermissionRules.LevelText(requirement.Level)} en {PermissionRules.ModuleLabel(requirement.Module)}.",
                module = requirement.Module,
                requiredLevel = requirement.Level.ToString()
            });
            return;
        }
        context.Items[CheckedKey] = true;
        await next(context);
    }
}

public static class PermissionEndpoints
{
    /// <summary>Permisos efectivos del usuario, para que la pantalla muestre solo lo que puede usar.</summary>
    public static IEndpointRouteBuilder MapPermissionEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/v1/auth/permissions", async (HttpContext http, PermissionResolver resolver, CancellationToken ct) =>
        {
            var permissions = await resolver.ResolveAsync(http, ct);
            var modules = PermissionCatalog.Modules.ToDictionary(m => m.Key, m => permissions.LevelOf(m.Key).ToString());
            var allowed = PermissionCatalog.AllowedModuleKeys(new EffectivePermissions(
                PermissionCatalog.Modules.ToDictionary(m => m.Key, m => permissions.LevelOf(m.Key)), permissions.Sensitive));
            return Results.Ok(new { modules, sensitive = permissions.Sensitive, permissions.IsSuperAdmin, allowedModules = allowed });
        }).RequireAuthorization();
        return endpoints;
    }
}
