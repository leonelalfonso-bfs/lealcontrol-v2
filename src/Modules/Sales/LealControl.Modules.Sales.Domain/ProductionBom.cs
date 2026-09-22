namespace LealControl.Modules.Sales.Domain.Production;

public sealed class ProductionBom
{
    private ProductionBom() { }
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid ProductId { get; private set; }
    public string Version { get; private set; } = "1.0";
    public string Name { get; private set; } = string.Empty;
    public string? Description { get; private set; }
    public decimal OutputQuantity { get; private set; } = 1;
    public string OutputUnit { get; private set; } = "UN";
    public bool IsActive { get; private set; } = true;
    public DateTime? ValidFromUtc { get; private set; }
    public DateTime? ValidToUtc { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }
    public List<ProductionBomLine> Lines { get; private set; } = [];
    public static ProductionBom Create(Guid tenantId, Guid productId, string version, string name, string? description, decimal outputQuantity, string outputUnit, DateTime now) => new() { Id = Guid.NewGuid(), TenantId = tenantId, ProductId = productId, Version = version.Trim(), Name = name.Trim(), Description = description?.Trim(), OutputQuantity = outputQuantity, OutputUnit = outputUnit.Trim(), CreatedAtUtc = now, UpdatedAtUtc = now };
    public void Update(string version, string name, string? description, decimal outputQuantity, string outputUnit, bool isActive, DateTime? validFromUtc, DateTime? validToUtc, DateTime now) { Version = version.Trim(); Name = name.Trim(); Description = description?.Trim(); OutputQuantity = outputQuantity; OutputUnit = outputUnit.Trim(); IsActive = isActive; ValidFromUtc = validFromUtc; ValidToUtc = validToUtc; UpdatedAtUtc = now; }
}

public sealed class ProductionBomLine
{
    private ProductionBomLine() { }
    public Guid Id { get; private set; }
    public Guid ProductionBomId { get; private set; }
    public Guid ComponentProductId { get; private set; }
    public Guid? SubstituteProductId { get; private set; }
    public decimal Quantity { get; private set; }
    public string Unit { get; private set; } = "UN";
    public decimal ScrapPercent { get; private set; }
    public string? AppliesToVariant { get; private set; }
    public bool IsOptional { get; private set; }
    public int SortOrder { get; private set; }
    public static ProductionBomLine Create(Guid bomId, Guid componentProductId, decimal quantity, string unit, decimal scrapPercent, string? variant, bool optional, int sortOrder, Guid? substituteProductId = null) => new() { Id = Guid.NewGuid(), ProductionBomId = bomId, ComponentProductId = componentProductId, SubstituteProductId = substituteProductId, Quantity = quantity, Unit = unit.Trim(), ScrapPercent = scrapPercent, AppliesToVariant = variant?.Trim(), IsOptional = optional, SortOrder = sortOrder };
}
