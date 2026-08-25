using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Finance.Infrastructure;

public sealed record CollectionReceiptLineInput(string Method, decimal Amount, string Currency, Guid? AccountId, Guid? MovementId, Guid? ChequeId, string? RetentionType, string? RetentionCertificate, string? Notes);
public sealed record CreateCollectionReceiptRequest(Guid AccountId, Guid? CustomerId, Guid? InvoiceId, Guid? MovementId, Guid? ChequeId, decimal Amount, string Currency, decimal? InvoiceAmount, string? InvoiceCurrency, decimal? InvoiceExchangeRate, decimal? PaymentExchangeRate, decimal? SuggestedAdjustmentArs, string? SuggestedAdjustmentType, DateTime ReceiptDateUtc, string Description, IReadOnlyList<CollectionReceiptLineInput>? Lines = null);

public static class FinanceReceipts
{
    public static IEndpointRouteBuilder MapFinanceReceiptEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/finance/collections").WithTags("Finance Collections");
        group.MapGet("", async (FinanceDbContext db, LealControl.BuildingBlocks.Tenancy.ITenantContext tenant, CancellationToken ct) => Results.Ok(await db.Set<CollectionReceipt>().AsNoTracking().Where(x => x.TenantId == tenant.TenantId.Value).OrderByDescending(x => x.ReceiptDateUtc).Take(200).ToListAsync(ct)));
        group.MapPost("", async (CreateCollectionReceiptRequest body, FinanceDbContext db, LealControl.BuildingBlocks.Tenancy.ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value; var currency = body.Currency.Trim().ToUpperInvariant();
            await FinanceConcepts.EnsureBaseConceptsAsync(db, tenantId, ct);
            if (body.Amount <= 0 || string.IsNullOrWhiteSpace(body.Description)) return Results.BadRequest("El importe y la descripción son obligatorios.");
            if (body.InvoiceCurrency is not null && body.InvoiceCurrency.Trim().ToUpperInvariant() != currency && (!body.InvoiceAmount.HasValue || !body.InvoiceExchangeRate.HasValue || !body.PaymentExchangeRate.HasValue || body.InvoiceAmount <= 0 || body.InvoiceExchangeRate <= 0 || body.PaymentExchangeRate <= 0)) return Results.BadRequest("Para imputar un comprobante en otra moneda indicá importe y cotizaciones de emisión y cobro.");
            if (body.MovementId is not null && body.ChequeId is not null) return Results.BadRequest("Elegí una transferencia o un cheque, no ambos.");
            var cheque = body.ChequeId is null ? null : await db.ReceivedCheques.SingleOrDefaultAsync(x => x.Id == body.ChequeId && x.TenantId == tenantId, ct);
            if (body.ChequeId is not null && cheque is null) return Results.NotFound("El cheque seleccionado no existe.");
            if (cheque is not null && (cheque.Status != ReceivedChequeStatus.Available || cheque.CollectionReceiptId is not null)) return Results.Conflict("El cheque ya fue aplicado a otro recibo o no está disponible.");
            if (cheque is not null && cheque.Currency != currency) return Results.BadRequest("La moneda del cheque no coincide con la cuenta seleccionada.");
            var account = await db.Accounts.SingleOrDefaultAsync(x => x.Id == body.AccountId && x.TenantId == tenantId && x.IsActive, ct);
            if (account is null) return Results.NotFound("Cuenta financiera inexistente.");
            if (account.Currency != currency) return Results.BadRequest("La moneda no coincide con la cuenta seleccionada.");
            var number = $"RC-{DateTime.UtcNow:yyyyMMddHHmmss}"; var receiptId = Guid.NewGuid();
            var movement = body.MovementId is null ? null : await db.Movements.SingleOrDefaultAsync(x => x.Id == body.MovementId && x.TenantId == tenantId && x.AccountId == body.AccountId, ct);
            if (body.MovementId is not null && movement is null) return Results.NotFound("La transferencia seleccionada no existe en la cuenta.");
            if (movement is not null && movement.ReconciliationStatus == FinancialReconciliationStatus.Reconciled) return Results.Conflict("La transferencia ya está conciliada.");
            db.Set<CollectionReceipt>().Add(new CollectionReceipt { Id = receiptId, TenantId = tenantId, AccountId = body.AccountId, CustomerId = body.CustomerId, InvoiceId = body.InvoiceId, ReceiptNumber = number, Amount = body.Amount, Currency = currency, InvoiceAmount = body.InvoiceAmount, InvoiceCurrency = body.InvoiceCurrency?.Trim().ToUpperInvariant(), InvoiceExchangeRate = body.InvoiceExchangeRate, PaymentExchangeRate = body.PaymentExchangeRate, SuggestedAdjustmentArs = body.SuggestedAdjustmentArs, SuggestedAdjustmentType = body.SuggestedAdjustmentType?.Trim(), ReceiptDateUtc = body.ReceiptDateUtc, Description = body.Description.Trim(), CreatedAtUtc = DateTime.UtcNow });
            foreach (var line in body.Lines ?? Array.Empty<CollectionReceiptLineInput>()) db.CollectionReceiptLines.Add(new CollectionReceiptLine { Id = Guid.NewGuid(), TenantId = tenantId, ReceiptId = receiptId, Method = line.Method.Trim(), Amount = line.Amount, Currency = line.Currency.Trim().ToUpperInvariant(), AccountId = line.AccountId, BankMovementId = line.MovementId, ChequeId = line.ChequeId, RetentionType = line.RetentionType?.Trim(), RetentionCertificate = line.RetentionCertificate?.Trim(), Notes = line.Notes?.Trim(), CreatedAtUtc = DateTime.UtcNow });
            if (cheque is not null) cheque.CollectionReceiptId = receiptId;
            if (movement is null && cheque is null)
            {
                var conceptId = await db.FinancialConcepts.Where(x => x.TenantId == tenantId && x.Code == "COBRO_CLIENTE").Select(x => (Guid?)x.Id).SingleOrDefaultAsync(ct);
                db.Movements.Add(new FinancialMovement { Id = Guid.NewGuid(), TenantId = tenantId, AccountId = body.AccountId, Kind = FinancialMovementKind.Credit, Amount = body.Amount, Currency = currency, OperationDateUtc = body.ReceiptDateUtc, Description = body.Description.Trim(), ExternalReference = number, ConceptId = conceptId, ClassificationStatus = FinancialClassificationStatus.Confirmed, ClassifiedAtUtc = DateTime.UtcNow, LinkedEntityType = "CollectionReceipt", LinkedEntityId = receiptId, ReconciliationStatus = FinancialReconciliationStatus.Reconciled, CreatedAtUtc = DateTime.UtcNow });
            }
            else if (movement is not null) { movement.ReconciliationStatus = FinancialReconciliationStatus.Reconciled; movement.LinkedEntityType = "CollectionReceipt"; movement.LinkedEntityId = receiptId; }
            await db.SaveChangesAsync(ct); return Results.Created($"/api/v1/finance/collections/{receiptId}", new { id = receiptId, receiptNumber = number, status = "Confirmed" });
        });
        var detail = endpoints.MapGroup("/api/v1/finance").WithTags("Finance Detail");
        detail.MapGet("/accounts/{accountId:guid}/movements-detail", async (Guid accountId, FinanceDbContext db, LealControl.BuildingBlocks.Tenancy.ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value; var account = await db.Accounts.AsNoTracking().SingleOrDefaultAsync(x => x.Id == accountId && x.TenantId == tenantId, ct);
            if (account is null) return Results.NotFound("Cuenta financiera inexistente.");
            var rows = await db.Movements.AsNoTracking().Where(x => x.AccountId == accountId && x.TenantId == tenantId).OrderBy(x => x.OperationDateUtc).ThenBy(x => x.CreatedAtUtc).ToListAsync(ct);
            var conceptIds = rows.Where(x => x.ConceptId.HasValue).Select(x => x.ConceptId!.Value).Distinct().ToList();
            var concepts = await db.FinancialConcepts.AsNoTracking().Where(x => x.TenantId == tenantId && conceptIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, x => x.Name, ct);
            var running = account.OpeningBalance; var result = rows.Select(x => { running += x.Kind == FinancialMovementKind.Credit ? x.Amount : -x.Amount; return new { x.Id, x.OperationDateUtc, x.Description, x.ExternalReference, x.Kind, x.Amount, x.Currency, x.ReportedBalance, SystemBalance = running, Difference = x.ReportedBalance.HasValue ? running - x.ReportedBalance.Value : (decimal?)null, x.ReconciliationStatus, ConceptName = x.ConceptId.HasValue && concepts.TryGetValue(x.ConceptId.Value, out var name) ? name : null, x.ClassificationStatus }; }).Reverse();
            return Results.Ok(result);
        }); return endpoints;
    }
}
