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

    public enum Sensitive { Amounts, Costs, Salaries }

    /// <summary>Pantallas enteras de datos sensibles: sin el permiso, no se entra.</summary>
    private static readonly (string Prefix, Sensitive Kind)[] SensitiveAreas =
    [
        ("/api/v1/finance", Sensitive.Amounts),
        ("/api/v1/accounting", Sensitive.Amounts),
        ("/api/v1/sales/current-accounts", Sensitive.Amounts),
        ("/api/v1/sales/production/costs", Sensitive.Costs),
        ("/api/v1/sales/inventory/products/suppliers", Sensitive.Costs),
        ("/api/v1/sales/products/suppliers", Sensitive.Costs),
        ("/api/v1/purchases", Sensitive.Costs),
        ("/api/v1/hr/payroll", Sensitive.Salaries)
    ];

    /// <summary>Campos que se quitan de las respuestas a quien no tiene el permiso.</summary>
    private static readonly (string Prefix, Sensitive Kind, string[] Fields)[] MaskedFields =
    [
        ("/api/v1/sales/products", Sensitive.Costs, ["costPrice", "purchaseCurrency", "purchasePrice"]),
        ("/api/v1/sales/inventory", Sensitive.Costs, ["unitCostArs", "unitCostUsd", "costPrice", "purchasePrice"]),
        ("/api/v1/sales/production", Sensitive.Costs, ["unitCost", "extendedCost", "materialCost", "costPerOutputUnit", "costPrice"]),
        ("/api/v1/hr", Sensitive.Salaries, ["baseSalary", "hourlyRate"])
    ];

    public static Sensitive? SensitiveArea(string? path) =>
        path is null ? null : SensitiveAreas.Where(a => path.StartsWith(a.Prefix, StringComparison.OrdinalIgnoreCase))
            .Select(a => (Sensitive?)a.Kind).FirstOrDefault();

    public static IReadOnlyList<string> FieldsToMask(string? path, SensitivePermissions sees) =>
        path is null ? [] : MaskedFields
            .Where(m => path.StartsWith(m.Prefix, StringComparison.OrdinalIgnoreCase) && !Sees(sees, m.Kind))
            .SelectMany(m => m.Fields).ToList();

    public static bool Sees(SensitivePermissions sees, Sensitive kind) => kind switch
    {
        Sensitive.Amounts => sees.Amounts,
        Sensitive.Costs => sees.Costs,
        _ => sees.Salaries
    };

    public static string SensitiveText(Sensitive kind) => kind switch
    {
        Sensitive.Amounts => "importes y saldos",
        Sensitive.Costs => "costos y precios de compra",
        _ => "sueldos"
    };

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

    private static Task<UserPermissions?> FromDatabaseAsync(HttpContext context, Guid tenantId, Guid userId, CancellationToken ct) =>
        FromCrmAsync(context.RequestServices.GetRequiredService<CrmDbContext>(), tenantId, userId, ct);

    /// <summary>
    /// Permisos de un usuario leídos de la base de su empresa (también fuera de un pedido, por
    /// ejemplo en el resumen diario). Null si el usuario no existe o no tiene perfil.
    /// </summary>
    public static async Task<UserPermissions?> FromCrmAsync(CrmDbContext db, Guid tenantId, Guid userId, CancellationToken ct)
    {
        UserPermissions? resolved = null;
        {
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

    /// <summary>Usuarios sin perfil (tokens anteriores o de integración): administradores, todo; el resto, solo ver.</summary>
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
                // Sin perfil y sin ser administrador: solo consulta (conservador; con perfil manda el perfil).
                if (PermissionCatalog.Keys.Contains(normalized)) modules[normalized] = PermissionLevel.View;
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

        if (!permissions.IsSuperAdmin && PermissionRules.SensitiveArea(context.Request.Path.Value) is { } area
            && !PermissionRules.Sees(permissions.Sensitive, area))
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            await context.Response.WriteAsJsonAsync(new
            {
                message = $"Tu perfil no permite ver {PermissionRules.SensitiveText(area)}.",
                sensitive = area.ToString()
            });
            return;
        }

        var mask = permissions.IsSuperAdmin ? [] : PermissionRules.FieldsToMask(context.Request.Path.Value, permissions.Sensitive);
        if (mask.Count == 0)
        {
            await next(context);
            return;
        }
        await SensitiveFieldFilter.WriteMaskedAsync(context, next, mask);
    }
}

/// <summary>
/// Quita de la respuesta JSON los campos sensibles que el usuario no puede ver: el dato no sale
/// del servidor (no alcanza con ocultarlo en la pantalla).
/// </summary>
public static class SensitiveFieldFilter
{
    public static async Task WriteMaskedAsync(HttpContext context, RequestDelegate next, IReadOnlyList<string> fields)
    {
        var original = context.Response.Body;
        await using var buffer = new System.IO.MemoryStream();
        context.Response.Body = buffer;
        try
        {
            await next(context);
        }
        finally
        {
            context.Response.Body = original;
        }

        buffer.Position = 0;
        var isJson = context.Response.ContentType?.Contains("json", StringComparison.OrdinalIgnoreCase) == true;
        if (!isJson || buffer.Length == 0)
        {
            await buffer.CopyToAsync(original, context.RequestAborted);
            return;
        }

        System.Text.Json.Nodes.JsonNode? node;
        try
        {
            node = await System.Text.Json.Nodes.JsonNode.ParseAsync(buffer, cancellationToken: context.RequestAborted);
        }
        catch (JsonException)
        {
            buffer.Position = 0;
            await buffer.CopyToAsync(original, context.RequestAborted);
            return;
        }
        Strip(node, new HashSet<string>(fields, StringComparer.OrdinalIgnoreCase));
        var bytes = System.Text.Encoding.UTF8.GetBytes(node?.ToJsonString() ?? "null");
        context.Response.ContentLength = bytes.Length;
        await original.WriteAsync(bytes, context.RequestAborted);
    }

    public static void Strip(System.Text.Json.Nodes.JsonNode? node, HashSet<string> fields)
    {
        switch (node)
        {
            case System.Text.Json.Nodes.JsonObject obj:
                foreach (var key in obj.Select(p => p.Key).Where(fields.Contains).ToList()) obj.Remove(key);
                foreach (var child in obj.Select(p => p.Value).ToList()) Strip(child, fields);
                break;
            case System.Text.Json.Nodes.JsonArray array:
                foreach (var child in array) Strip(child, fields);
                break;
        }
    }
}

/// <summary>Datos sensibles que ve el usuario del pedido, para las protecciones al guardar.</summary>
public sealed class HttpSensitiveDataAccess(IHttpContextAccessor accessor) : ISensitiveDataAccess
{
    private SensitivePermissions Current =>
        accessor.HttpContext is { } http && PermissionResolver.FromContext(http) is { } p && !p.IsSuperAdmin
            ? p.Sensitive
            : SensitivePermissions.All;

    public bool CanSeeAmounts => Current.Amounts;
    public bool CanSeeCosts => Current.Costs;
    public bool CanSeeSalaries => Current.Salaries;
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
