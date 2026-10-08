using System;
using System.Collections.Generic;
using LealControl.BuildingBlocks.Tenancy;

namespace LealControl.Modules.Crm.Domain.Settings;

/// <summary>Perfil de permisos: matriz de módulo × nivel y permisos sensibles. Es una plantilla para los usuarios.</summary>
public sealed class PermissionProfile
{
    private PermissionProfile()
    {
    }

    public Guid Id { get; private set; }
    public TenantId TenantId { get; private set; }
    /// <summary>Clave de los perfiles de fábrica ("owner", "sales"...); null en los creados por la empresa.</summary>
    public string? SystemKey { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public string? Description { get; private set; }
    public string MatrixJson { get; private set; } = "{}";
    public bool SeeAmounts { get; private set; }
    public bool SeeCosts { get; private set; }
    public bool SeeSalaries { get; private set; }
    /// <summary>Rol para las políticas por rol, hasta que P2 las reemplace por niveles.</summary>
    public string LegacyRole { get; private set; } = "Comercial";
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }

    /// <summary>"Dueño" no se puede editar ni borrar: siempre tiene que haber quien administre todo.</summary>
    public bool IsLocked => SystemKey == SystemProfiles.Owner;

    public static PermissionProfile Create(TenantId tenantId, string name, string? description,
        IReadOnlyDictionary<string, PermissionLevel> matrix, SensitivePermissions sensitive, string legacyRole,
        DateTime nowUtc, string? systemKey = null) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        SystemKey = systemKey,
        Name = name.Trim(),
        Description = string.IsNullOrWhiteSpace(description) ? null : description.Trim(),
        MatrixJson = PermissionCatalog.WriteMatrix(matrix),
        SeeAmounts = sensitive.Amounts,
        SeeCosts = sensitive.Costs,
        SeeSalaries = sensitive.Salaries,
        LegacyRole = legacyRole,
        CreatedAtUtc = nowUtc,
        UpdatedAtUtc = nowUtc
    };

    public void Update(string name, string? description, IReadOnlyDictionary<string, PermissionLevel> matrix, SensitivePermissions sensitive, DateTime nowUtc)
    {
        Name = name.Trim();
        Description = string.IsNullOrWhiteSpace(description) ? null : description.Trim();
        MatrixJson = PermissionCatalog.WriteMatrix(matrix);
        SeeAmounts = sensitive.Amounts;
        SeeCosts = sensitive.Costs;
        SeeSalaries = sensitive.Salaries;
        UpdatedAtUtc = nowUtc;
    }
}
