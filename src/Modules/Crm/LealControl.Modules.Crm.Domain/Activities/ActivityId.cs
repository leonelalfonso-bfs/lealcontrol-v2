namespace LealControl.Modules.Crm.Domain.Activities;

public readonly record struct ActivityId(Guid Value)
{
    public static ActivityId New() => new(Guid.NewGuid());

    public override string ToString() => Value.ToString();
}
