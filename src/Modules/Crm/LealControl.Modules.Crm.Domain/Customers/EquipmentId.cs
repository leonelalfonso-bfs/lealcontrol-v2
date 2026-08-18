namespace LealControl.Modules.Crm.Domain.Customers;

public readonly record struct EquipmentId(Guid Value)
{
    public static EquipmentId New() => new(Guid.NewGuid());

    public static EquipmentId Empty => new(Guid.Empty);
}
