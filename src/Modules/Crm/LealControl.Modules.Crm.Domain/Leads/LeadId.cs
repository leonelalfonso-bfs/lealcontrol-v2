namespace LealControl.Modules.Crm.Domain.Leads;

public readonly record struct LeadId(Guid Value)
{
    public static LeadId New() => new(Guid.NewGuid());

    public override string ToString() => Value.ToString();
}
