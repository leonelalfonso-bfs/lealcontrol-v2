namespace LealControl.Modules.Sales.Domain.Production;

public sealed class ProductionWorkCenter
{
    private ProductionWorkCenter() { }
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public string Code { get; private set; } = string.Empty;
    public string Name { get; private set; } = string.Empty;
    public string? Description { get; private set; }
    public decimal CapacityHoursPerDay { get; private set; }
    public bool IsActive { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }
    public static ProductionWorkCenter Create(Guid tenantId, string code, string name, decimal capacityHoursPerDay, DateTime now) => new() { Id = Guid.NewGuid(), TenantId = tenantId, Code = code.Trim(), Name = name.Trim(), CapacityHoursPerDay = capacityHoursPerDay, IsActive = true, CreatedAtUtc = now, UpdatedAtUtc = now };
}

public sealed class ProductionRoute
{
    private ProductionRoute() { }
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid ProductId { get; private set; }
    public string Version { get; private set; } = "1.0";
    public string Name { get; private set; } = string.Empty;
    public bool IsActive { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }
    public List<ProductionOperation> Operations { get; private set; } = [];
    public static ProductionRoute Create(Guid tenantId, Guid productId, string version, string name, DateTime now) => new() { Id = Guid.NewGuid(), TenantId = tenantId, ProductId = productId, Version = version.Trim(), Name = name.Trim(), IsActive = true, CreatedAtUtc = now, UpdatedAtUtc = now };
    public void Update(string version, string name, bool isActive, DateTime now) { Version = version.Trim(); Name = name.Trim(); IsActive = isActive; UpdatedAtUtc = now; }
}

public sealed class ProductionOperation
{
    private ProductionOperation() { }
    public Guid Id { get; private set; }
    public Guid ProductionRouteId { get; private set; }
    public Guid WorkCenterId { get; private set; }
    public int Sequence { get; private set; }
    public string Code { get; private set; } = string.Empty;
    public string Name { get; private set; } = string.Empty;
    public decimal SetupMinutes { get; private set; }
    public decimal RunMinutesPerUnit { get; private set; }
    public bool IsQualityCheckpoint { get; private set; }
    public static ProductionOperation Create(Guid routeId, Guid workCenterId, int sequence, string code, string name, decimal setupMinutes, decimal runMinutesPerUnit, bool qualityCheckpoint) => new() { Id = Guid.NewGuid(), ProductionRouteId = routeId, WorkCenterId = workCenterId, Sequence = sequence, Code = code.Trim(), Name = name.Trim(), SetupMinutes = setupMinutes, RunMinutesPerUnit = runMinutesPerUnit, IsQualityCheckpoint = qualityCheckpoint };
}
