using System;

namespace LealControl.BuildingBlocks.Tenancy;

public sealed class MasterTenant
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string DbName { get; set; } = string.Empty;
    public string PlanCode { get; set; } = "pyme";
    public string Status { get; set; } = "Active"; // Active, Suspended, Trial, Expired
    public decimal MonthlyPriceArs { get; set; } = 0;
    public decimal MonthlyPriceUsd { get; set; } = 0;
    public string AdminEmail { get; set; } = string.Empty;
    public string AdminFullName { get; set; } = string.Empty;
    public string? AdminPhone { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? ExpiresAtUtc { get; set; }
    public decimal StorageMb { get; set; } = 0;
    public int UserCount { get; set; } = 1;
    public bool IsActive { get; set; } = true;
    public string? Notes { get; set; }
}

public sealed class SuperAdminUser
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string Role { get; set; } = "SuperAdmin"; // SuperAdmin, SupportAdmin
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? LastLoginUtc { get; set; }
}

public sealed class SubscriptionPlan
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public decimal PriceArs { get; set; }
    public decimal PriceUsd { get; set; }
    public int MaxUsers { get; set; } = 10;
    public string Description { get; set; } = string.Empty;
    public string FeaturesJson { get; set; } = "[]";
    public bool IsActive { get; set; } = true;
}
