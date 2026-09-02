using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Finance.Infrastructure;

public sealed record CashCountRequest(decimal CountedAmount, DateTime CountDateUtc, string? Note);

public static class FinanceExtras
{
    public static IEndpointRouteBuilder MapFinanceExtrasEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/finance").WithTags("Finance").RequirePolicyOnWrites("RequireFinance");

        group.MapPost("/accounts/{accountId:guid}/cash-count", async (Guid accountId, CashCountRequest body, FinanceDbContext db, LealControl.BuildingBlocks.Tenancy.ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var account = await db.Accounts.SingleOrDefaultAsync(x => x.Id == accountId && x.TenantId == tenantId && x.IsActive, ct);
            if (account is null) return Results.NotFound("Cuenta inexistente.");
            if (account.Type != FinancialAccountType.Cash)
                return Results.BadRequest("El arqueo solo aplica a cuentas de tipo Caja.");

            await FinanceConcepts.EnsureBaseConceptsAsync(db, tenantId, ct);
            var conceptId = await db.FinancialConcepts
                .Where(x => x.TenantId == tenantId && x.Code == "AJUSTE")
                .Select(x => (Guid?)x.Id)
                .SingleOrDefaultAsync(ct);

            var net = await db.Movements.Where(x => x.TenantId == tenantId && x.AccountId == accountId)
                .SumAsync(x => x.Kind == FinancialMovementKind.Credit ? x.Amount : -x.Amount, ct);
            var systemBalance = account.OpeningBalance + net;
            var diff = body.CountedAmount - systemBalance;
            if (Math.Abs(diff) < 0.01m)
                return Results.Ok(new { systemBalance, countedAmount = body.CountedAmount, difference = 0m, movementId = (Guid?)null });

            var movement = new FinancialMovement
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                AccountId = accountId,
                Kind = diff > 0 ? FinancialMovementKind.Credit : FinancialMovementKind.Debit,
                Amount = Math.Abs(diff),
                Currency = account.Currency,
                OperationDateUtc = body.CountDateUtc,
                Description = string.IsNullOrWhiteSpace(body.Note) ? "Ajuste por arqueo de caja" : body.Note.Trim(),
                ExternalReference = "CASH-COUNT",
                ConceptId = conceptId,
                CreatedAtUtc = DateTime.UtcNow
            };
            FinanceSystemMovementHelper.ApplySystemDefaults(movement, account);
            db.Movements.Add(movement);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { systemBalance, countedAmount = body.CountedAmount, difference = diff, movementId = movement.Id });
        });

        group.MapGet("/cash-flow/projection", async (int? days, FinanceDbContext db, LealControl.BuildingBlocks.Tenancy.ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var horizon = Math.Clamp(days ?? 30, 7, 365);
            var today = DateTime.UtcNow.Date;
            var limit = today.AddDays(horizon);

            var accounts = await db.Accounts.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive).ToListAsync(ct);
            var balances = await db.Movements.AsNoTracking().Where(x => x.TenantId == tenantId)
                .GroupBy(x => x.AccountId)
                .Select(g => new { AccountId = g.Key, Net = g.Sum(x => x.Kind == FinancialMovementKind.Credit ? x.Amount : -x.Amount) })
                .ToDictionaryAsync(x => x.AccountId, x => x.Net, ct);

            var availableToday = accounts.Sum(a => a.OpeningBalance + balances.GetValueOrDefault(a.Id));

            var cheques = await db.ReceivedCheques.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.DueDateUtc != null && x.DueDateUtc >= today && x.DueDateUtc <= limit)
                .ToListAsync(ct);

            var paymentOrders = await db.PaymentOrders.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.Status == "Confirmed" && x.PaymentDateUtc >= today && x.PaymentDateUtc <= limit)
                .ToListAsync(ct);

            var flows = new List<object>();
            foreach (var ch in cheques.Where(x => x.Status is ReceivedChequeStatus.Available or ReceivedChequeStatus.Deposited or ReceivedChequeStatus.Presented or ReceivedChequeStatus.Issued))
            {
                flows.Add(new
                {
                    date = ch.DueDateUtc!.Value,
                    kind = ch.Direction == ChequeDirection.Received ? "Ingreso" : "Egreso",
                    source = ch.Direction == ChequeDirection.Received ? "Cheque recibido" : "Cheque emitido (a pagar)",
                    detail = $"{ch.CheckNumber} · {ch.IssuerName ?? ch.BankName ?? ""}",
                    amount = ch.Amount,
                    currency = ch.Currency
                });
            }
            foreach (var op in paymentOrders)
            {
                flows.Add(new
                {
                    date = op.PaymentDateUtc,
                    kind = "Egreso",
                    source = "Orden de pago",
                    detail = $"{op.OrderNumber} · {op.SupplierName}",
                    amount = op.Amount,
                    currency = op.Currency
                });
            }

            flows = flows.OrderBy(x => ((DateTime)x.GetType().GetProperty("date")!.GetValue(x)!)).ToList();
            return Results.Ok(new { availableToday, horizonDays = horizon, flows });
        });

        return endpoints;
    }
}
