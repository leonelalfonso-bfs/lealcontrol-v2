namespace LealControl.Modules.Crm.Domain.Opportunities;

public readonly record struct OpportunityId(Guid Value)
{
    public static OpportunityId New() => new(Guid.NewGuid());

    public override string ToString() => Value.ToString();
}
