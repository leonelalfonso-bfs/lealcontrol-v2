using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Finance.Infrastructure;

public sealed record CollectionReceiptLineInput(
    string Method,
    decimal Amount,
    string Currency,
    Guid? AccountId,
    Guid? MovementId,
    Guid? ChequeId,
    Guid? ConceptId,
    string? RetentionType,
    string? RetentionCertificate,
    string? Notes
);

public sealed record CollectionReceiptImputationInput(
    Guid InvoiceId,
    string InvoiceNumber,
    decimal InvoiceTotal,
    decimal AmountImputed
);

public sealed record CreateCollectionReceiptRequest(
    Guid? AccountId,
    Guid? CustomerId,
    Guid? InvoiceId,
    Guid? MovementId,
    Guid? ChequeId,
    decimal Amount,
    string Currency,
    decimal? InvoiceAmount,
    string? InvoiceCurrency,
    decimal? InvoiceExchangeRate,
    decimal? PaymentExchangeRate,
    decimal? SuggestedAdjustmentArs,
    string? SuggestedAdjustmentType,
    DateTime ReceiptDateUtc,
    string Description,
    IReadOnlyList<CollectionReceiptLineInput>? Lines = null,
    IReadOnlyList<CollectionReceiptImputationInput>? Imputations = null
);

public static class FinanceReceipts
{
    public static IEndpointRouteBuilder MapFinanceReceiptEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/finance/collections").WithTags("Finance Collections");

        // List receipts
        group.MapGet("", async (FinanceDbContext db, LealControl.BuildingBlocks.Tenancy.ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var receipts = await db.CollectionReceipts
                .AsNoTracking()
                .Where(x => x.TenantId == tenantId)
                .OrderByDescending(x => x.ReceiptDateUtc)
                .ThenByDescending(x => x.CreatedAtUtc)
                .Take(250)
                .ToListAsync(ct);

            var receiptIds = receipts.Select(x => x.Id).ToList();

            var linesSummary = await db.CollectionReceiptLines
                .AsNoTracking()
                .Where(x => x.TenantId == tenantId && receiptIds.Contains(x.ReceiptId))
                .GroupBy(x => x.ReceiptId)
                .Select(g => new { ReceiptId = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.ReceiptId, x => x.Count, ct);

            var imputationsSummary = await db.CollectionReceiptImputations
                .AsNoTracking()
                .Where(x => x.TenantId == tenantId && receiptIds.Contains(x.ReceiptId))
                .GroupBy(x => x.ReceiptId)
                .Select(g => new { ReceiptId = g.Key, Count = g.Count(), Invoices = string.Join(", ", g.Select(i => i.InvoiceNumber)) })
                .ToDictionaryAsync(x => x.ReceiptId, ct);

            var result = receipts.Select(r => new
            {
                r.Id,
                r.CustomerId,
                r.AccountId,
                r.InvoiceId,
                r.ReceiptNumber,
                r.Amount,
                r.Currency,
                r.InvoiceAmount,
                r.InvoiceCurrency,
                r.InvoiceExchangeRate,
                r.PaymentExchangeRate,
                r.SuggestedAdjustmentArs,
                r.SuggestedAdjustmentType,
                r.ReceiptDateUtc,
                r.Description,
                r.Status,
                r.CreatedAtUtc,
                LinesCount = linesSummary.TryGetValue(r.Id, out var lc) ? lc : 0,
                InvoicesCount = imputationsSummary.TryGetValue(r.Id, out var imp) ? imp.Count : (r.InvoiceId.HasValue ? 1 : 0),
                InvoicesSummary = imputationsSummary.TryGetValue(r.Id, out var imp2) ? imp2.Invoices : ""
            });

            return Results.Ok(result);
        });

        // Get single receipt with detail
        group.MapGet("/{id:guid}", async (Guid id, FinanceDbContext db, LealControl.BuildingBlocks.Tenancy.ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var receipt = await db.CollectionReceipts.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            if (receipt is null) return Results.NotFound("Recibo de cobro inexistente.");

            var lines = await db.CollectionReceiptLines.AsNoTracking().Where(x => x.ReceiptId == id && x.TenantId == tenantId).ToListAsync(ct);
            var imputations = await db.CollectionReceiptImputations.AsNoTracking().Where(x => x.ReceiptId == id && x.TenantId == tenantId).ToListAsync(ct);

            return Results.Ok(new
            {
                receipt.Id,
                receipt.CustomerId,
                receipt.AccountId,
                receipt.InvoiceId,
                receipt.ReceiptNumber,
                receipt.Amount,
                receipt.Currency,
                receipt.InvoiceAmount,
                receipt.InvoiceCurrency,
                receipt.InvoiceExchangeRate,
                receipt.PaymentExchangeRate,
                receipt.SuggestedAdjustmentArs,
                receipt.SuggestedAdjustmentType,
                receipt.ReceiptDateUtc,
                receipt.Description,
                receipt.Status,
                receipt.CreatedAtUtc,
                Lines = lines,
                Imputations = imputations
            });
        });

        // Create receipt
        group.MapPost("", async (CreateCollectionReceiptRequest body, FinanceDbContext db, LealControl.BuildingBlocks.Tenancy.ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var currency = string.IsNullOrWhiteSpace(body.Currency) ? "ARS" : body.Currency.Trim().ToUpperInvariant();
            await FinanceConcepts.EnsureBaseConceptsAsync(db, tenantId, ct);

            var lines = body.Lines ?? Array.Empty<CollectionReceiptLineInput>();
            var imputations = body.Imputations ?? Array.Empty<CollectionReceiptImputationInput>();

            // The true receipt amount is ALWAYS the sum of payment lines if provided, or body.Amount
            var totalLinesAmount = lines.Count > 0 ? lines.Sum(x => x.Amount) : body.Amount;
            if (totalLinesAmount <= 0)
            {
                return Results.BadRequest("El importe total de los medios de cobro debe ser mayor a cero.");
            }

            if (string.IsNullOrWhiteSpace(body.Description))
            {
                return Results.BadRequest("La descripción del recibo es obligatoria.");
            }

            // Calculate total imputed to invoices
            var totalImputedAmount = imputations.Count > 0 
                ? imputations.Sum(x => x.AmountImputed) 
                : (body.InvoiceAmount ?? (body.InvoiceId.HasValue ? totalLinesAmount : 0));

            // Strict consistency validation: cannot impute more than collected
            if (imputations.Count > 0 && totalImputedAmount > totalLinesAmount + 0.01m)
            {
                return Results.BadRequest($"El total imputado a facturas (${totalImputedAmount:N2}) supera el total de cobro recibido (${totalLinesAmount:N2}). Ajuste los importes imputados.");
            }

            // Foreign invoice validation
            if (body.InvoiceCurrency is not null && body.InvoiceCurrency.Trim().ToUpperInvariant() != currency && 
                (!body.InvoiceAmount.HasValue || !body.InvoiceExchangeRate.HasValue || !body.PaymentExchangeRate.HasValue || body.InvoiceAmount <= 0 || body.InvoiceExchangeRate <= 0 || body.PaymentExchangeRate <= 0))
            {
                return Results.BadRequest("Para imputar un comprobante en otra moneda indicá importe y cotizaciones de emisión y cobro.");
            }

            var receiptId = Guid.NewGuid();
            var number = $"RC-{DateTime.UtcNow:yyyyMMddHHmmss}";

            var mainAccountId = body.AccountId ?? lines.FirstOrDefault(l => l.AccountId.HasValue)?.AccountId ?? Guid.Empty;

            var receipt = new CollectionReceipt
            {
                Id = receiptId,
                TenantId = tenantId,
                AccountId = mainAccountId,
                CustomerId = body.CustomerId,
                InvoiceId = body.InvoiceId ?? imputations.FirstOrDefault()?.InvoiceId,
                ReceiptNumber = number,
                Amount = totalLinesAmount,
                Currency = currency,
                InvoiceAmount = totalImputedAmount > 0 ? totalImputedAmount : body.InvoiceAmount,
                InvoiceCurrency = body.InvoiceCurrency?.Trim().ToUpperInvariant(),
                InvoiceExchangeRate = body.InvoiceExchangeRate,
                PaymentExchangeRate = body.PaymentExchangeRate,
                SuggestedAdjustmentArs = body.SuggestedAdjustmentArs,
                SuggestedAdjustmentType = body.SuggestedAdjustmentType?.Trim(),
                ReceiptDateUtc = body.ReceiptDateUtc,
                Description = body.Description.Trim(),
                Status = "Confirmed",
                CreatedAtUtc = DateTime.UtcNow
            };

            db.CollectionReceipts.Add(receipt);

            // 1. Process payment lines (Medios de Cobro)
            if (lines.Count > 0)
            {
                var conceptId = await db.FinancialConcepts
                    .Where(x => x.TenantId == tenantId && (x.Code == "COBRO_CLIENTE" || x.Code == "COBRO_CLIENTES"))
                    .Select(x => (Guid?)x.Id)
                    .SingleOrDefaultAsync(ct);

                foreach (var line in lines)
                {
                    var lineId = Guid.NewGuid();
                    var lineCurrency = string.IsNullOrWhiteSpace(line.Currency) ? currency : line.Currency.Trim().ToUpperInvariant();
                    var lineMethod = line.Method.Trim();

                    db.CollectionReceiptLines.Add(new CollectionReceiptLine
                    {
                        Id = lineId,
                        TenantId = tenantId,
                        ReceiptId = receiptId,
                        Method = lineMethod,
                        Amount = line.Amount,
                        Currency = lineCurrency,
                        AccountId = line.AccountId,
                        BankMovementId = line.MovementId,
                        ChequeId = line.ChequeId,
                        ConceptId = line.ConceptId,
                        RetentionType = line.RetentionType?.Trim(),
                        RetentionCertificate = line.RetentionCertificate?.Trim(),
                        Notes = line.Notes?.Trim(),
                        CreatedAtUtc = DateTime.UtcNow
                    });

                    // If it's a bank movement reconciliation
                    if (line.MovementId.HasValue)
                    {
                        var (ok, linkError, movement) = await FinanceMovementLinkValidator.ValidateForCollectionAsync(
                            db, tenantId, line.MovementId.Value, line.ConceptId, ct);
                        if (!ok)
                            return Results.BadRequest(linkError);

                        movement!.ReconciliationStatus = FinancialReconciliationStatus.Reconciled;
                        movement.LinkedEntityType = "CollectionReceipt";
                        movement.LinkedEntityId = receiptId;
                        if (line.ConceptId.HasValue && line.ConceptId != Guid.Empty)
                            movement.ConceptId = line.ConceptId;
                    }
                    // Else if bank or cash without pre-existing movement: create credit movement
                    else if ((lineMethod.Equals("BankTransfer", StringComparison.OrdinalIgnoreCase) || 
                             lineMethod.Equals("Cash", StringComparison.OrdinalIgnoreCase) || 
                             lineMethod.Equals("Transferencia", StringComparison.OrdinalIgnoreCase) || 
                             lineMethod.Equals("Efectivo", StringComparison.OrdinalIgnoreCase)) && line.AccountId.HasValue)
                    {
                        db.Movements.Add(new FinancialMovement
                        {
                            Id = Guid.NewGuid(),
                            TenantId = tenantId,
                            AccountId = line.AccountId.Value,
                            Kind = FinancialMovementKind.Credit,
                            Amount = line.Amount,
                            Currency = lineCurrency,
                            OperationDateUtc = body.ReceiptDateUtc,
                            Description = $"Cobro a cliente ({number}) - {body.Description.Trim()}",
                            ExternalReference = number,
                            ConceptId = conceptId,
                            ClassificationStatus = FinancialClassificationStatus.Confirmed,
                            ClassifiedAtUtc = DateTime.UtcNow,
                            LinkedEntityType = "CollectionReceipt",
                            LinkedEntityId = receiptId,
                            ReconciliationStatus = FinancialReconciliationStatus.Reconciled,
                            CreatedAtUtc = DateTime.UtcNow
                        });
                    }

                    // Cheque linking
                    if (line.ChequeId.HasValue)
                    {
                        var cheque = await db.ReceivedCheques.SingleOrDefaultAsync(x => x.Id == line.ChequeId.Value && x.TenantId == tenantId, ct);
                        if (cheque != null)
                        {
                            cheque.CollectionReceiptId = receiptId;
                            cheque.Notes = string.IsNullOrWhiteSpace(cheque.Notes)
                                ? $"Aplicado en Recibo {number}"
                                : $"{cheque.Notes} | Recibo {number}";
                        }
                    }
                }
            }
            else
            {
                // Fallback for legacy single-item call
                var cheque = body.ChequeId is null ? null : await db.ReceivedCheques.SingleOrDefaultAsync(x => x.Id == body.ChequeId && x.TenantId == tenantId, ct);
                if (cheque is not null) cheque.CollectionReceiptId = receiptId;

                var movement = body.MovementId is null ? null : await db.Movements.SingleOrDefaultAsync(x => x.Id == body.MovementId && x.TenantId == tenantId, ct);
                if (movement is not null)
                {
                    movement.ReconciliationStatus = FinancialReconciliationStatus.Reconciled;
                    movement.LinkedEntityType = "CollectionReceipt";
                    movement.LinkedEntityId = receiptId;
                }
                else if (body.AccountId.HasValue && cheque is null)
                {
                    var conceptId = await db.FinancialConcepts.Where(x => x.TenantId == tenantId && x.Code == "COBRO_CLIENTE").Select(x => (Guid?)x.Id).SingleOrDefaultAsync(ct);
                    db.Movements.Add(new FinancialMovement
                    {
                        Id = Guid.NewGuid(),
                        TenantId = tenantId,
                        AccountId = body.AccountId.Value,
                        Kind = FinancialMovementKind.Credit,
                        Amount = totalLinesAmount,
                        Currency = currency,
                        OperationDateUtc = body.ReceiptDateUtc,
                        Description = body.Description.Trim(),
                        ExternalReference = number,
                        ConceptId = conceptId,
                        ClassificationStatus = FinancialClassificationStatus.Confirmed,
                        ClassifiedAtUtc = DateTime.UtcNow,
                        LinkedEntityType = "CollectionReceipt",
                        LinkedEntityId = receiptId,
                        ReconciliationStatus = FinancialReconciliationStatus.Reconciled,
                        CreatedAtUtc = DateTime.UtcNow
                    });
                }
            }

            // 2. Process invoice imputations (Imputaciones de comprobantes)
            foreach (var imp in imputations)
            {
                db.CollectionReceiptImputations.Add(new CollectionReceiptImputation
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    ReceiptId = receiptId,
                    InvoiceId = imp.InvoiceId,
                    InvoiceNumber = imp.InvoiceNumber.Trim(),
                    InvoiceTotal = imp.InvoiceTotal,
                    AmountImputed = imp.AmountImputed,
                    CreatedAtUtc = DateTime.UtcNow
                });
            }

            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/finance/collections/{receiptId}", new { id = receiptId, receiptNumber = number, status = "Confirmed" });
        });

        var detail = endpoints.MapGroup("/api/v1/finance").WithTags("Finance Detail");
        detail.MapGet("/accounts/{accountId:guid}/movements-detail", async (Guid accountId, FinanceDbContext db, LealControl.BuildingBlocks.Tenancy.ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var account = await db.Accounts.AsNoTracking().SingleOrDefaultAsync(x => x.Id == accountId && x.TenantId == tenantId, ct);
            if (account is null) return Results.NotFound("Cuenta financiera inexistente.");
            var rows = await db.Movements.AsNoTracking().Where(x => x.AccountId == accountId && x.TenantId == tenantId).OrderBy(x => x.OperationDateUtc).ThenBy(x => x.CreatedAtUtc).ToListAsync(ct);
            var conceptIds = rows.Where(x => x.ConceptId.HasValue).Select(x => x.ConceptId!.Value).Distinct().ToList();
            var concepts = await db.FinancialConcepts.AsNoTracking().Where(x => x.TenantId == tenantId && conceptIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, x => x.Name, ct);
            var running = account.OpeningBalance;
            var result = rows.Select(x =>
            {
                running += x.Kind == FinancialMovementKind.Credit ? x.Amount : -x.Amount;
                return new
                {
                    x.Id,
                    x.OperationDateUtc,
                    x.Description,
                    x.ExternalReference,
                    x.Kind,
                    x.Amount,
                    x.Currency,
                    x.ReportedBalance,
                    SystemBalance = running,
                    Difference = x.ReportedBalance.HasValue ? running - x.ReportedBalance.Value : (decimal?)null,
                    x.ReconciliationStatus,
                    x.ConceptId,
                    ConceptName = x.ConceptId.HasValue && concepts.TryGetValue(x.ConceptId.Value, out var name) ? name : null,
                    x.ClassificationStatus
                };
            }).Reverse();
            return Results.Ok(result);
        });

        return endpoints;
    }
}
