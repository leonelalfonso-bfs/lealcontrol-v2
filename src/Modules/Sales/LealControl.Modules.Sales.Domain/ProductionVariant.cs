namespace LealControl.Modules.Sales.Domain.Production;

public sealed class ProductionVariant
{
    private ProductionVariant() { }
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid ProductId { get; private set; }
    public string Code { get; private set; } = string.Empty;
    public string Name { get; private set; } = string.Empty;
    public string? AttributesJson { get; private set; }
    public bool IsActive { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }
    public static ProductionVariant Create(Guid tenantId, Guid productId, string code, string name, string? attributesJson, DateTime now) => new() { Id = Guid.NewGuid(), TenantId = tenantId, ProductId = productId, Code = code.Trim(), Name = name.Trim(), AttributesJson = attributesJson, IsActive = true, CreatedAtUtc = now, UpdatedAtUtc = now };
}
