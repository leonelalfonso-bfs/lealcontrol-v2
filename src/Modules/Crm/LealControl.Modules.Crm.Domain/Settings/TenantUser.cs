using System;
using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Tenancy;

namespace LealControl.Modules.Crm.Domain.Settings;

public sealed class TenantUser : Entity<Guid>
{
    private TenantUser()
    {
    }

    public TenantUser(
        Guid id,
        TenantId tenantId,
        string fullName,
        string email,
        string role,
        bool isActive,
        DateTime createdAtUtc)
        : base(id)
    {
        TenantId = tenantId;
        FullName = fullName;
        Email = email;
        Role = role;
        IsActive = isActive;
        CreatedAtUtc = createdAtUtc;
    }

    public TenantId TenantId { get; private set; }

    public string FullName { get; private set; } = string.Empty;

    public string Email { get; private set; } = string.Empty;

    public string Role { get; private set; } = "Comercial";

    public bool IsActive { get; private set; } = true;

    public DateTime CreatedAtUtc { get; private set; }

    public static TenantUser Create(
        TenantId tenantId,
        string fullName,
        string email,
        string role)
    {
        return new TenantUser(
            Guid.NewGuid(),
            tenantId,
            fullName.Trim(),
            email.Trim().ToLowerInvariant(),
            string.IsNullOrWhiteSpace(role) ? "Comercial" : role.Trim(),
            true,
            DateTime.UtcNow);
    }
}
