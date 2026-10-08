using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace LealControl.Modules.Crm.Domain.Settings;

/// <summary>Nivel de acceso a un módulo. Cada nivel incluye a los anteriores.</summary>
public enum PermissionLevel
{
    None = 0,
    /// <summary>Consultar y exportar.</summary>
    View = 1,
    /// <summary>Crear y editar.</summary>
    Edit = 2,
    /// <summary>Autorizar, anular, confirmar, cerrar.</summary>
    Approve = 3,
    /// <summary>Configuración del módulo.</summary>
    Admin = 4
}

/// <summary>Módulo del sistema sujeto a permisos. La clave es la misma que usa el control por ruta.</summary>
public sealed record PermissionModule(string Key, string Label, string Description);

/// <summary>Permisos sensibles, aparte de los niveles por módulo.</summary>
public sealed record SensitivePermissions(bool Amounts, bool Costs, bool Salaries)
{
    public static readonly SensitivePermissions None = new(false, false, false);
    public static readonly SensitivePermissions All = new(true, true, true);
}

/// <summary>Excepciones de un usuario sobre su perfil. Lo que es null toma el valor del perfil.</summary>
public sealed record PermissionOverrides(
    Dictionary<string, PermissionLevel>? Modules = null,
    bool? Amounts = null,
    bool? Costs = null,
    bool? Salaries = null)
{
    public bool IsEmpty => (Modules is null || Modules.Count == 0) && Amounts is null && Costs is null && Salaries is null;
}

public sealed record EffectivePermissions(IReadOnlyDictionary<string, PermissionLevel> Modules, SensitivePermissions Sensitive)
{
    public PermissionLevel LevelOf(string module) => Modules.TryGetValue(module, out var level) ? level : PermissionLevel.None;
}

public static class PermissionCatalog
{
    public const string Administration = "administration";

    /// <summary>
    /// Módulos con permisos. Directorio (clientes y proveedores) es base y siempre visible;
    /// CRM viaja con Ventas mientras esté deshabilitado como módulo aparte.
    /// </summary>
    public static readonly IReadOnlyList<PermissionModule> Modules =
    [
        new("sales", "Ventas y facturación", "Presupuestos, pedidos, remitos, facturas y notas"),
        new("finance", "Finanzas y cobranzas", "Cobros, pagos, bancos, cheques y cuentas corrientes"),
        new("purchases", "Compras", "Órdenes de compra, recepciones y facturas de proveedores"),
        new("inventory", "Stock y producción", "Productos, depósitos, movimientos y producción"),
        new("accounting", "Contabilidad", "Plan de cuentas, asientos y balances"),
        new("hr", "RRHH", "Legajos, asistencias y liquidaciones"),
        new("fleet", "Flota", "Unidades, vencimientos, mantenimiento y combustible"),
        new("quality", "Calidad", "Sistema de gestión, documentos y registros"),
        new("metrology", "Metrología", "Equipos, pesas patrón e informes"),
        new("communications", "Comunicaciones", "Bandeja de correo y WhatsApp"),
        new("grains", "Cereales", "Contratos y balanza"),
        new(Administration, "Configuración y usuarios", "Datos de la empresa, ARCA, usuarios y permisos")
    ];

    public static readonly IReadOnlySet<string> Keys = Modules.Select(m => m.Key).ToHashSet(StringComparer.OrdinalIgnoreCase);

    /// <summary>Claves que el control por ruta y el menú usan además de las del catálogo.</summary>
    private static readonly IReadOnlyDictionary<string, string[]> ExtraModuleKeys = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
    {
        ["sales"] = ["crm"]
    };

    public static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Converters = { new JsonStringEnumConverter() }
    };

    public static Dictionary<string, PermissionLevel> ReadMatrix(string? json)
    {
        var result = Modules.ToDictionary(m => m.Key, _ => PermissionLevel.None, StringComparer.OrdinalIgnoreCase);
        if (string.IsNullOrWhiteSpace(json)) return result;
        try
        {
            var parsed = JsonSerializer.Deserialize<Dictionary<string, PermissionLevel>>(json, Json);
            foreach (var (key, level) in parsed ?? [])
                if (Keys.Contains(key) && Enum.IsDefined(level)) result[key] = level;
        }
        catch (JsonException)
        {
        }
        return result;
    }

    public static string WriteMatrix(IReadOnlyDictionary<string, PermissionLevel> matrix) =>
        JsonSerializer.Serialize(Modules.ToDictionary(m => m.Key, m => matrix.TryGetValue(m.Key, out var l) ? l : PermissionLevel.None), Json);

    public static PermissionOverrides ReadOverrides(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new PermissionOverrides();
        try
        {
            var parsed = JsonSerializer.Deserialize<PermissionOverrides>(json, Json) ?? new PermissionOverrides();
            var modules = parsed.Modules?
                .Where(kv => Keys.Contains(kv.Key) && Enum.IsDefined(kv.Value))
                .ToDictionary(kv => kv.Key, kv => kv.Value, StringComparer.OrdinalIgnoreCase);
            return parsed with { Modules = modules is { Count: > 0 } ? modules : null };
        }
        catch (JsonException)
        {
            return new PermissionOverrides();
        }
    }

    public static string? WriteOverrides(PermissionOverrides? overrides) =>
        overrides is null || overrides.IsEmpty ? null : JsonSerializer.Serialize(overrides, Json);

    public static EffectivePermissions Resolve(PermissionProfile? profile, PermissionOverrides? overrides)
    {
        var matrix = ReadMatrix(profile?.MatrixJson);
        if (overrides?.Modules is { } modules)
            foreach (var (key, level) in modules) matrix[key] = level;
        var sensitive = new SensitivePermissions(
            overrides?.Amounts ?? profile?.SeeAmounts ?? false,
            overrides?.Costs ?? profile?.SeeCosts ?? false,
            overrides?.Salaries ?? profile?.SeeSalaries ?? false);
        return new EffectivePermissions(matrix, sensitive);
    }

    /// <summary>Lista de módulos (claves de ruta y menú) que el usuario puede ver: lo que hoy viaja en el token.</summary>
    public static string[] AllowedModuleKeys(EffectivePermissions effective) =>
        effective.Modules
            .Where(kv => kv.Value >= PermissionLevel.View)
            .SelectMany(kv => ExtraModuleKeys.TryGetValue(kv.Key, out var extra) ? extra.Prepend(kv.Key) : [kv.Key])
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(k => k)
            .ToArray();

    /// <summary>
    /// Rol que siguen usando las políticas por rol hasta la etapa P2: administrar la configuración
    /// equivale a "Admin"; si no, el rol base del perfil.
    /// </summary>
    public static string LegacyRole(EffectivePermissions effective, PermissionProfile? profile) =>
        effective.LevelOf(Administration) >= PermissionLevel.Admin ? "Admin" : profile?.LegacyRole ?? "Comercial";
}

/// <summary>Perfiles de fábrica. Se crean en cada empresa y se pueden editar o copiar (salvo "Dueño").</summary>
public static class SystemProfiles
{
    public const string Owner = "owner";

    public sealed record Definition(string Key, string Name, string Description, string LegacyRole,
        Dictionary<string, PermissionLevel> Matrix, SensitivePermissions Sensitive);

    private static Dictionary<string, PermissionLevel> Matrix(params (string Key, PermissionLevel Level)[] entries) =>
        entries.ToDictionary(e => e.Key, e => e.Level, StringComparer.OrdinalIgnoreCase);

    public static readonly IReadOnlyList<Definition> All =
    [
        new(Owner, "Dueño", "Todo, incluida la configuración, los usuarios y los datos sensibles.", "Admin",
            PermissionCatalog.Modules.ToDictionary(m => m.Key, _ => PermissionLevel.Admin, StringComparer.OrdinalIgnoreCase),
            SensitivePermissions.All),
        new("administration", "Administración", "Ventas, cobranzas, pagos y compras, con importes. Sin RRHH.", "Contador",
            Matrix(("sales", PermissionLevel.Approve), ("finance", PermissionLevel.Approve), ("purchases", PermissionLevel.Approve),
                ("accounting", PermissionLevel.Edit), ("inventory", PermissionLevel.View), ("fleet", PermissionLevel.View),
                ("communications", PermissionLevel.Edit)),
            new SensitivePermissions(true, true, false)),
        new("sales", "Ventas", "Presupuestos, pedidos y clientes. Sin costos ni finanzas.", "Comercial",
            Matrix(("sales", PermissionLevel.Edit), ("inventory", PermissionLevel.View), ("communications", PermissionLevel.Edit)),
            new SensitivePermissions(true, false, false)),
        new("purchases", "Compras", "Compras y stock, con costos. Sin finanzas.", "Compras",
            Matrix(("purchases", PermissionLevel.Approve), ("inventory", PermissionLevel.Edit), ("communications", PermissionLevel.Edit)),
            new SensitivePermissions(false, true, false)),
        new("hr", "RRHH", "Legajos, sueldos y personas de flota. Sin finanzas.", "RRHH",
            Matrix(("hr", PermissionLevel.Admin), ("fleet", PermissionLevel.Edit), ("communications", PermissionLevel.Edit)),
            new SensitivePermissions(false, false, true)),
        new("technician", "Técnico", "Calidad, metrología y flota. Sin precios ni importes.", "Técnico",
            Matrix(("quality", PermissionLevel.Edit), ("metrology", PermissionLevel.Edit), ("fleet", PermissionLevel.View),
                ("inventory", PermissionLevel.View)),
            SensitivePermissions.None),
        new("readonly", "Solo lectura", "Consulta todo menos RRHH y configuración. Sin datos sensibles.", "Lectura",
            PermissionCatalog.Modules.ToDictionary(m => m.Key,
                m => m.Key is "hr" or PermissionCatalog.Administration ? PermissionLevel.None : PermissionLevel.View,
                StringComparer.OrdinalIgnoreCase),
            SensitivePermissions.None)
    ];

    /// <summary>Perfil de fábrica que corresponde a un rol de antes de los perfiles.</summary>
    public static string ForLegacyRole(string? role) => (role ?? "").Trim().ToLowerInvariant() switch
    {
        "admin" or "administrador" or "superadmin" => Owner,
        "contador" or "tesorero" => "administration",
        "compras" => "purchases",
        "técnico" or "tecnico" or "calidad" or "directortecnico" => "technician",
        "rrhh" => "hr",
        _ => "sales"
    };
}
