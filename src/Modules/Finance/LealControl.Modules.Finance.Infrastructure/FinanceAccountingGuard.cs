namespace LealControl.Modules.Finance.Infrastructure;

/// <summary>No-op hasta que Contabilidad registre el gateway real (bloque 4).</summary>
internal static class FinanceAccountingGuard
{
    public static Task<bool> IsPeriodClosedAsync(Guid tenantId, DateTime documentDate, CancellationToken ct) =>
        Task.FromResult(false);
}
