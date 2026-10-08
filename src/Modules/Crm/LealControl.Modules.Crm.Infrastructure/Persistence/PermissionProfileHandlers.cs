using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Results;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Application.Settings;
using LealControl.Modules.Crm.Domain.Settings;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Crm.Infrastructure.Persistence;

public sealed class PermissionProfileHandlers(CrmDbContext db, ITenantContext tenantContext,
    LealControl.BuildingBlocks.Security.IPermissionChangeNotifier? permissionChanges = null) :
    IRequestHandler<ListPermissionProfilesQuery, Result<IReadOnlyList<PermissionProfileDto>>>,
    IRequestHandler<SavePermissionProfileCommand, Result<PermissionProfileDto>>,
    IRequestHandler<DeletePermissionProfileCommand, Result<bool>>
{
    private static PermissionProfileDto ToDto(PermissionProfile p, int users) => new(
        p.Id, p.Name, p.Description, p.SystemKey, p.IsLocked, PermissionCatalog.ReadMatrix(p.MatrixJson),
        p.SeeAmounts, p.SeeCosts, p.SeeSalaries, users);

    public async Task<Result<IReadOnlyList<PermissionProfileDto>>> Handle(ListPermissionProfilesQuery request, CancellationToken ct)
    {
        var tenantId = tenantContext.TenantId;
        var profiles = await PermissionProfilesBootstrap.EnsureSystemProfilesAsync(db, tenantId, ct);
        var counts = await db.TenantUsers.AsNoTracking().Where(u => u.TenantId == tenantId && u.ProfileId != null)
            .GroupBy(u => u.ProfileId!.Value).Select(g => new { g.Key, Count = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.Count, ct);
        var order = SystemProfiles.All.Select(d => d.Key).ToList();
        IReadOnlyList<PermissionProfileDto> list = profiles
            .OrderBy(p => p.SystemKey is null ? int.MaxValue : order.IndexOf(p.SystemKey))
            .ThenBy(p => p.Name)
            .Select(p => ToDto(p, counts.GetValueOrDefault(p.Id)))
            .ToList();
        return Result<IReadOnlyList<PermissionProfileDto>>.Success(list);
    }

    public async Task<Result<PermissionProfileDto>> Handle(SavePermissionProfileCommand request, CancellationToken ct)
    {
        var tenantId = tenantContext.TenantId;
        var name = (request.Name ?? "").Trim();
        if (name.Length is 0 or > 80) return Fail("El nombre del perfil es obligatorio (hasta 80 caracteres).");
        if ((request.Description ?? "").Trim().Length > 300) return Fail("La descripción admite hasta 300 caracteres.");
        if (request.Matrix is null) return Fail("Faltan los niveles por módulo.");
        if (request.Matrix.Keys.Any(k => !PermissionCatalog.Keys.Contains(k)) || request.Matrix.Values.Any(v => !Enum.IsDefined(v)))
            return Fail("Hay módulos o niveles inválidos.");

        var profiles = await PermissionProfilesBootstrap.EnsureSystemProfilesAsync(db, tenantId, ct);
        if (profiles.Any(p => p.Id != request.Id && string.Equals(p.Name, name, StringComparison.OrdinalIgnoreCase)))
            return Fail($"Ya hay un perfil llamado \"{name}\".");

        var sensitive = new SensitivePermissions(request.SeeAmounts, request.SeeCosts, request.SeeSalaries);
        var now = DateTime.UtcNow;
        PermissionProfile profile;
        if (request.Id is { } id)
        {
            profile = profiles.FirstOrDefault(p => p.Id == id)!;
            if (profile is null) return Fail("El perfil no existe.");
            if (profile.IsLocked) return Fail("El perfil Dueño no se modifica: siempre tiene acceso a todo.");
            var activeUsers = await db.TenantUsers.Where(u => u.TenantId == tenantId && u.IsActive).ToListAsync(ct);
            var hadAdministrator = HasAdministrator(activeUsers, profiles);
            profile.Update(name, request.Description, request.Matrix, sensitive, now);

            // Los usuarios del perfil toman los cambios (módulos y rol derivados).
            var users = await db.TenantUsers.Where(u => u.TenantId == tenantId && u.ProfileId == id).ToListAsync(ct);
            foreach (var user in users) user.ApplyPermissions(profile, PermissionCatalog.ReadOverrides(user.PermissionOverridesJson));
            if (hadAdministrator && !HasAdministrator(activeUsers, profiles))
                return Fail("Con este cambio no quedaría nadie que administre la configuración y los usuarios.");
        }
        else
        {
            var source = request.CopyFromId is { } copyId ? profiles.FirstOrDefault(p => p.Id == copyId) : null;
            profile = PermissionProfile.Create(tenantId, name, request.Description, request.Matrix, sensitive,
                source?.LegacyRole ?? "Comercial", now);
            db.PermissionProfiles.Add(profile);
        }

        await db.SaveChangesAsync(ct);
        permissionChanges?.PermissionsChanged(tenantId.Value);
        var count = await db.TenantUsers.CountAsync(u => u.TenantId == tenantId && u.ProfileId == profile.Id, ct);
        return Result<PermissionProfileDto>.Success(ToDto(profile, count));
    }

    public async Task<Result<bool>> Handle(DeletePermissionProfileCommand request, CancellationToken ct)
    {
        var tenantId = tenantContext.TenantId;
        var profile = await db.PermissionProfiles.FirstOrDefaultAsync(p => p.Id == request.Id && p.TenantId == tenantId, ct);
        if (profile is null) return Result<bool>.Success(true);
        if (profile.SystemKey is not null)
            return Result<bool>.Failure(Error.Validation("Crm.Permissions.SystemProfile", "Los perfiles de fábrica no se borran (se pueden editar)."));
        var users = await db.TenantUsers.CountAsync(u => u.TenantId == tenantId && u.ProfileId == profile.Id, ct);
        if (users > 0)
            return Result<bool>.Failure(Error.Validation("Crm.Permissions.ProfileInUse", $"El perfil lo usan {users} usuario(s): cambiales el perfil antes de borrarlo."));
        db.PermissionProfiles.Remove(profile);
        await db.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }

    private static bool HasAdministrator(IEnumerable<TenantUser> activeUsers, IReadOnlyCollection<PermissionProfile> profiles) =>
        activeUsers.Any(u => u.EffectivePermissions(profiles.FirstOrDefault(p => p.Id == u.ProfileId))
            .LevelOf(PermissionCatalog.Administration) >= PermissionLevel.Admin);

    private static Result<PermissionProfileDto> Fail(string message) =>
        Result<PermissionProfileDto>.Failure(Error.Validation("Crm.Permissions.Invalid", message));
}
