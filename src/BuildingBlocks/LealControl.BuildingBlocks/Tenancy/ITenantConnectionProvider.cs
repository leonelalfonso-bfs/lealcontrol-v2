namespace LealControl.BuildingBlocks.Tenancy;

public interface ITenantConnectionProvider
{
    string GetConnectionString(TenantId tenantId);

    Task<string> GetConnectionStringAsync(TenantId tenantId, CancellationToken cancellationToken = default);

    void InvalidateCache(TenantId tenantId);
}
