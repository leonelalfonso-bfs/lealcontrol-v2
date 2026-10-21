using LealControl.BuildingBlocks.Security;
using LealControl.BuildingBlocks.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Finance.Infrastructure;

public sealed record ReconciliationUnmatchRequest(Guid ImportedMovementId);

public static class FinanceReconciliation
{
    public static IEndpointRouteBuilder MapFinanceReconciliationEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/finance/reconciliation")
            .WithTags("Finance Reconciliation")
            .RequirePolicyOnWrites("RequireFinance");

        // La consulta y la conciliación uno a uno se reemplazaron por la bandeja (FinanceReconciliationTray).
        group.MapPost("/unmatch", async (
            ReconciliationUnmatchRequest body,
            FinanceDbContext db,
            ITenantContext tenant,
            CancellationToken ct) =>
        {
            var (ok, error) = await FinanceReconciliationMatcher.UnmatchAsync(
                db, tenant.TenantId.Value, body.ImportedMovementId, ct);
            return ok ? Results.Ok(new { unmatched = true }) : Results.BadRequest(error);
        });

        return endpoints;
    }
}
