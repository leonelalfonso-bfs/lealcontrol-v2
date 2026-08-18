using LealControl.BuildingBlocks.Domain;

namespace LealControl.Modules.Sales.Domain.Production;

public enum ProductionOrderStatus
{
    Draft = 0,
    Planned = 1,
    Released = 2,
    InProgress = 3,
    Paused = 4,
    Completed = 5,
    Cancelled = 6
}

public sealed class ProductionOrder
{
    private ProductionOrder() { }

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public string Number { get; private set; } = string.Empty;
    public Guid ProductId { get; private set; }
    public Guid? BomId { get; private set; }
    public decimal PlannedQuantity { get; private set; }
    public decimal ProducedQuantity { get; private set; }
    public decimal ScrappedQuantity { get; private set; }
    public string Unit { get; private set; } = "UN";
    public ProductionOrderStatus Status { get; private set; }
    public DateTime? PlannedStartUtc { get; private set; }
    public DateTime? PlannedEndUtc { get; private set; }
    public DateTime? StartedAtUtc { get; private set; }
    public DateTime? CompletedAtUtc { get; private set; }
    public string? Notes { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }

    public static ProductionOrder Create(Guid tenantId, string number, Guid productId, Guid? bomId, decimal quantity, string unit, DateTime now)
    {
        if (quantity <= 0) throw new ArgumentOutOfRangeException(nameof(quantity));
        return new ProductionOrder { Id = Guid.NewGuid(), TenantId = tenantId, Number = number.Trim(), ProductId = productId, BomId = bomId, PlannedQuantity = quantity, Unit = unit.Trim(), Status = ProductionOrderStatus.Draft, CreatedAtUtc = now, UpdatedAtUtc = now };
    }

    public void ChangeStatus(ProductionOrderStatus status, DateTime now)
    {
        if (Status == ProductionOrderStatus.Cancelled || Status == ProductionOrderStatus.Completed) throw new InvalidOperationException("La orden ya está cerrada.");
        Status = status;
        if (status == ProductionOrderStatus.InProgress && StartedAtUtc is null) StartedAtUtc = now;
        if (status == ProductionOrderStatus.Completed) CompletedAtUtc = now;
        UpdatedAtUtc = now;
    }
}
