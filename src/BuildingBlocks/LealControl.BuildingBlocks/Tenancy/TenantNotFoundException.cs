using System;

namespace LealControl.BuildingBlocks.Tenancy;

public sealed class TenantNotFoundException : Exception
{
    public TenantNotFoundException(string message) : base(message)
    {
    }

    public static TenantNotFoundException ForTenant(Guid tenantId) =>
        new($"La empresa '{tenantId}' no existe o fue dada de baja.");

    public static TenantNotFoundException Suspended(Guid tenantId) =>
        new($"La empresa '{tenantId}' está suspendida. Contactá al administrador del sistema.");

    public static TenantNotFoundException Expired(Guid tenantId) =>
        new($"La empresa '{tenantId}' expiró. Contactá al administrador del sistema.");
}
