namespace LealControl.BuildingBlocks.Tenancy;

public interface ITenantContext
{
    TenantId TenantId { get; }

    bool HasTenant { get; }
}
