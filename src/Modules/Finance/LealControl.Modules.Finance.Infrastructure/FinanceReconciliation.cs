using LealControl.BuildingBlocks.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Finance.Infrastructure;

public sealed record ReconciliationMatchRequest(Guid ImportedMovementId, Guid SystemMovementId);
public sealed record ReconciliationUnmatchRequest(Guid ImportedMovementId);

public static class FinanceReconciliation
{
    public static IEndpointRouteBuilder MapFinanceReconciliationEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/finance/reconciliation")
            .WithTags("Finance Reconciliation")
            .RequirePolicyOnWrites("RequireFinance");

        group.MapGet("/", async (
            Guid accountId,
            DateTime? from,
            DateTime? to,
            Guid? importId,
            FinanceDbContext db,
            ITenantContext tenant,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            if (!await db.Accounts.AnyAsync(x => x.Id == accountId && x.TenantId == tenantId, ct))
            {
                return Results.NotFound("Cuenta financiera inexistente.");
            }

            var fromUtc = from?.ToUniversalTime() ?? DateTime.UtcNow.AddDays(-30);
            var toUtc = to?.ToUniversalTime() ?? DateTime.UtcNow.AddDays(1);

            var imported = await db.Movements.AsNoTracking()
                .Where(x => x.TenantId == tenantId
                            && x.AccountId == accountId
                            && x.Origin == FinancialMovementOrigin.Imported
                            && x.OperationDateUtc >= fromUtc
                            && x.OperationDateUtc <= toUtc
                            && x.ReconciliationStatus != FinancialReconciliationStatus.Reconciled
                            && x.ReconciliationStatus != FinancialReconciliationStatus.MatchedToImport)
                .OrderBy(x => x.OperationDateUtc)
                .Select(x => new
                {
                    x.Id,
                    Side = "Imported",
                    x.OperationDateUtc,
                    x.Kind,
                    x.Amount,
                    x.Currency,
                    x.Description,
                    x.ExternalReference,
                    x.ConceptId,
                    x.ReconciliationStatus,
                    x.LinkedEntityType,
                    x.LinkedEntityId,
                    x.ImportId
                })
                .ToListAsync(ct);

            var system = await db.Movements.AsNoTracking()
                .Where(x => x.TenantId == tenantId
                            && x.AccountId == accountId
                            && x.Origin == FinancialMovementOrigin.System
                            && x.OperationDateUtc >= fromUtc
                            && x.OperationDateUtc <= toUtc
                            && x.ReconciliationStatus == FinancialReconciliationStatus.PendingBank)
                .OrderBy(x => x.OperationDateUtc)
                .Select(x => new
                {
                    x.Id,
                    Side = "System",
                    x.OperationDateUtc,
                    x.Kind,
                    x.Amount,
                    x.Currency,
                    x.Description,
                    x.ExternalReference,
                    x.ConceptId,
                    x.ReconciliationStatus,
                    x.LinkedEntityType,
                    x.LinkedEntityId,
                    ImportId = (Guid?)null
                })
                .ToListAsync(ct);

            var suggestions = await FinanceReconciliationMatcher.FindSuggestionsAsync(
                db, tenantId, accountId, importId, ct);

            return Results.Ok(new
            {
                AccountId = accountId,
                From = fromUtc,
                To = toUtc,
                Imported = imported,
                System = system,
                SuggestedMatches = suggestions
            });
        });

        group.MapPost("/match", async (
            ReconciliationMatchRequest body,
            FinanceDbContext db,
            ITenantContext tenant,
            CancellationToken ct) =>
        {
            var (ok, error) = await FinanceReconciliationMatcher.ConfirmMatchAsync(
                db, tenant.TenantId.Value, body.ImportedMovementId, body.SystemMovementId, ct);
            return ok ? Results.Ok(new { matched = true }) : Results.BadRequest(error);
        });

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
