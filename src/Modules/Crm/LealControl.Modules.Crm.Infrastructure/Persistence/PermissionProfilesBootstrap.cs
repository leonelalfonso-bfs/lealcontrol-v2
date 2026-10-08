using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Domain.Settings;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Crm.Infrastructure.Persistence;

/// <summary>
/// Crea los perfiles de fábrica de cada empresa y asigna perfil a los usuarios que todavía no
/// tienen. La migración conserva los módulos que cada usuario veía; lo único que cambia es que un
/// usuario sin módulos ya no ve todo, sino lo de su perfil.
/// </summary>
public static class PermissionProfilesBootstrap
{
    public static async Task MigrateAllTenantsAsync(CrmDbContext db, CancellationToken ct)
    {
        var tenantIds = await db.TenantUsers.AsNoTracking().Select(u => u.TenantId).Distinct().ToListAsync(ct);
        foreach (var tenantId in tenantIds)
        {
            var profiles = await EnsureSystemProfilesAsync(db, tenantId, ct);
            await MigrateUsersAsync(db, tenantId, profiles, ct);
        }
    }

    public static async Task<List<PermissionProfile>> EnsureSystemProfilesAsync(CrmDbContext db, TenantId tenantId, CancellationToken ct)
    {
        var profiles = await db.PermissionProfiles.Where(p => p.TenantId == tenantId).ToListAsync(ct);
        var now = DateTime.UtcNow;
        var added = false;
        foreach (var definition in SystemProfiles.All)
        {
            if (profiles.Any(p => p.SystemKey == definition.Key)) continue;
            // Si la empresa ya usa ese nombre para un perfil propio, el de fábrica lleva sufijo.
            var name = profiles.Any(p => string.Equals(p.Name, definition.Name, StringComparison.OrdinalIgnoreCase))
                ? $"{definition.Name} (fábrica)"
                : definition.Name;
            var profile = PermissionProfile.Create(tenantId, name, definition.Description, definition.Matrix,
                definition.Sensitive, definition.LegacyRole, now, definition.Key);
            db.PermissionProfiles.Add(profile);
            profiles.Add(profile);
            added = true;
        }
        if (added) await db.SaveChangesAsync(ct);
        return profiles;
    }

    private static async Task MigrateUsersAsync(CrmDbContext db, TenantId tenantId, List<PermissionProfile> profiles, CancellationToken ct)
    {
        var users = await db.TenantUsers.Where(u => u.TenantId == tenantId && u.ProfileId == null).ToListAsync(ct);
        if (users.Count == 0) return;
        foreach (var user in users)
        {
            var key = SystemProfiles.ForLegacyRole(user.Role);
            var profile = profiles.First(p => p.SystemKey == key);
            var originalRole = user.Role;
            user.ApplyPermissions(profile, key == SystemProfiles.Owner ? null : OverridesPreservingModules(profile, user.AllowedModulesJson));
            // El rol se conserva: las políticas por rol siguen vigentes hasta P2.
            if (key != SystemProfiles.Owner) user.RestoreRole(originalRole);
        }
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Excepciones para que el usuario vea exactamente los módulos que veía antes (si tenía lista).</summary>
    public static PermissionOverrides? OverridesPreservingModules(PermissionProfile profile, string? allowedModulesJson)
    {
        string[] previous;
        try
        {
            previous = JsonSerializer.Deserialize<string[]>(allowedModulesJson ?? "[]") ?? [];
        }
        catch (JsonException)
        {
            previous = [];
        }
        // Sin lista: antes veía todo (el agujero). Ahora ve lo de su perfil.
        if (previous.Length == 0) return null;

        var had = previous.Select(m => m.Trim().ToLowerInvariant() == "crm" ? "sales" : m.Trim().ToLowerInvariant())
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var matrix = PermissionCatalog.ReadMatrix(profile.MatrixJson);
        var changes = new Dictionary<string, PermissionLevel>(StringComparer.OrdinalIgnoreCase);
        foreach (var module in PermissionCatalog.Modules.Where(m => m.Key != PermissionCatalog.Administration))
        {
            var level = matrix[module.Key];
            if (had.Contains(module.Key) && level == PermissionLevel.None) changes[module.Key] = PermissionLevel.Edit;
            else if (!had.Contains(module.Key) && level > PermissionLevel.None) changes[module.Key] = PermissionLevel.None;
        }
        return changes.Count == 0 ? null : new PermissionOverrides(changes);
    }
}
