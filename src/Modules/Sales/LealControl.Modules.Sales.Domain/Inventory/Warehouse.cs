using System;
using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Tenancy;

namespace LealControl.Modules.Sales.Domain.Inventory;

public enum WarehouseType
{
    MainWarehouse = 1,
    Workshop = 2,
    MobileUnit = 3,
    Scrap = 4
}

public sealed class Warehouse : Entity<Guid>
{
    private Warehouse()
    {
    }

    public Warehouse(
        Guid id,
        TenantId tenantId,
        string code,
        string name,
        WarehouseType type,
        string? address,
        string? assignedTechnicianName,
        bool isActive,
        DateTime createdAtUtc)
        : base(id)
    {
        TenantId = tenantId;
        Code = code;
        Name = name;
        Type = type;
        Address = address;
        AssignedTechnicianName = assignedTechnicianName;
        IsActive = isActive;
        CreatedAtUtc = createdAtUtc;
    }

    public TenantId TenantId { get; private set; }

    public string Code { get; private set; } = string.Empty;

    public string Name { get; private set; } = string.Empty;

    public WarehouseType Type { get; private set; } = WarehouseType.MainWarehouse;

    public string? Address { get; private set; }

    public string? AssignedTechnicianName { get; private set; }

    public bool IsActive { get; private set; } = true;

    public DateTime CreatedAtUtc { get; private set; }

    public static Warehouse Create(
        TenantId tenantId,
        string code,
        string name,
        WarehouseType type,
        string? address,
        string? assignedTechnicianName)
    {
        return new Warehouse(
            Guid.NewGuid(),
            tenantId,
            code.Trim().ToUpperInvariant(),
            name.Trim(),
            type,
            address?.Trim(),
            assignedTechnicianName?.Trim(),
            true,
            DateTime.UtcNow);
    }

    public void Update(
        string code,
        string name,
        WarehouseType type,
        string? address,
        string? assignedTechnicianName,
        bool isActive)
    {
        Code = code.Trim().ToUpperInvariant();
        Name = name.Trim();
        Type = type;
        Address = address?.Trim();
        AssignedTechnicianName = assignedTechnicianName?.Trim();
        IsActive = isActive;
    }
}
