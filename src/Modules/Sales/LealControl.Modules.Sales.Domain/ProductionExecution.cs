namespace LealControl.Modules.Sales.Domain.Production;

public enum ProductionExecutionType { Consumption = 0, Return = 1, Scrap = 2, Output = 3 }

public sealed class ProductionExecutionEntry
{
    private ProductionExecutionEntry() { }
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid ProductionOrderId { get; private set; }
    public Guid ProductId { get; private set; }
    public decimal Quantity { get; private set; }
    public string Unit { get; private set; } = "UN";
    public ProductionExecutionType Type { get; private set; }
    public string? LotNumber { get; private set; }
    public string? SerialNumbers { get; private set; }
    public string? Notes { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public static ProductionExecutionEntry Create(Guid tenantId, Guid orderId, Guid productId, decimal quantity, string unit, ProductionExecutionType type, string? lotNumber, string? serialNumbers, string? notes, DateTime now) => new() { Id = Guid.NewGuid(), TenantId = tenantId, ProductionOrderId = orderId, ProductId = productId, Quantity = quantity, Unit = unit.Trim(), Type = type, LotNumber = lotNumber?.Trim(), SerialNumbers = serialNumbers?.Trim(), Notes = notes?.Trim(), CreatedAtUtc = now };
}
