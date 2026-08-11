namespace LealControl.Modules.Crm.Domain.Customers;

public readonly record struct ContactId(Guid Value)
{
    public static ContactId New() => new(Guid.NewGuid());

    public override string ToString() => Value.ToString();
}
