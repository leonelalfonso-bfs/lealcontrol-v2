using LealControl.BuildingBlocks.Security;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Finance.Infrastructure;

public sealed record PaymentOrderLineInput(
    string Method,
    decimal Amount,
    string Currency,
    Guid? AccountId,
    Guid? BankMovementId,
    Guid? ChequeId,
    Guid? ConceptId,
    string? RetentionType,
    string? RetentionCertificate,
    string? Notes
);

public sealed record PaymentOrderImputationInput(
    Guid PurchaseInvoiceId,
    string InvoiceNumber,
    decimal InvoiceTotal,
    decimal AmountImputed
);

public sealed record CreatePaymentOrderRequest(
    Guid? SupplierId,
    string SupplierName,
    string? SupplierTaxId,
    DateTime PaymentDateUtc,
    string Currency,
    decimal Amount,
    string? Notes,
    IReadOnlyList<PaymentOrderLineInput>? Lines = null,
    IReadOnlyList<PaymentOrderImputationInput>? Imputations = null
);

public static class FinancePayments
{
    public static IEndpointRouteBuilder MapFinancePaymentEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/finance/payments").WithTags("Finance Payment Orders").RequirePolicyOnWrites("RequireFinance");

        // List payment orders
        group.MapGet("", async (FinanceDbContext db, LealControl.BuildingBlocks.Tenancy.ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var orders = await db.PaymentOrders
                .AsNoTracking()
                .Where(x => x.TenantId == tenantId)
                .OrderByDescending(x => x.PaymentDateUtc)
                .ThenByDescending(x => x.CreatedAtUtc)
                .Take(250)
                .ToListAsync(ct);

            var orderIds = orders.Select(x => x.Id).ToList();

            var linesSummary = await db.PaymentOrderLines
                .AsNoTracking()
                .Where(x => x.TenantId == tenantId && orderIds.Contains(x.PaymentOrderId))
                .GroupBy(x => x.PaymentOrderId)
                .Select(g => new { OrderId = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.OrderId, x => x.Count, ct);

            var imputationsSummary = await db.PaymentOrderImputations
                .AsNoTracking()
                .Where(x => x.TenantId == tenantId && orderIds.Contains(x.PaymentOrderId))
                .GroupBy(x => x.PaymentOrderId)
                .Select(g => new { OrderId = g.Key, Count = g.Count(), Invoices = string.Join(", ", g.Select(i => i.InvoiceNumber)) })
                .ToDictionaryAsync(x => x.OrderId, ct);

            var result = orders.Select(o => new
            {
                o.Id,
                o.SupplierId,
                o.SupplierName,
                o.SupplierTaxId,
                o.OrderNumber,
                o.Amount,
                o.Currency,
                o.PaymentDateUtc,
                o.Notes,
                o.Status,
                o.CreatedAtUtc,
                LinesCount = linesSummary.TryGetValue(o.Id, out var lc) ? lc : 0,
                InvoicesCount = imputationsSummary.TryGetValue(o.Id, out var imp) ? imp.Count : 0,
                InvoicesSummary = imputationsSummary.TryGetValue(o.Id, out var imp2) ? imp2.Invoices : ""
            });

            return Results.Ok(result);
        });

        // Get single payment order with detail
        group.MapGet("/{id:guid}", async (Guid id, FinanceDbContext db, LealControl.BuildingBlocks.Tenancy.ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var order = await db.PaymentOrders.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            if (order is null) return Results.NotFound("Orden de pago inexistente.");

            var lines = await db.PaymentOrderLines.AsNoTracking().Where(x => x.PaymentOrderId == id && x.TenantId == tenantId).ToListAsync(ct);
            var imputations = await db.PaymentOrderImputations.AsNoTracking().Where(x => x.PaymentOrderId == id && x.TenantId == tenantId).ToListAsync(ct);

            return Results.Ok(new
            {
                order.Id,
                order.SupplierId,
                order.SupplierName,
                order.SupplierTaxId,
                order.OrderNumber,
                order.Amount,
                order.Currency,
                order.PaymentDateUtc,
                order.Notes,
                order.Status,
                order.CreatedAtUtc,
                Lines = lines,
                Imputations = imputations
            });
        });

        // Create payment order
        group.MapPost("", async (CreatePaymentOrderRequest body, FinanceDbContext db, LealControl.BuildingBlocks.Tenancy.ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            if (string.IsNullOrWhiteSpace(body.SupplierName))
                return Results.BadRequest("El nombre del proveedor es obligatorio.");

            var currency = string.IsNullOrWhiteSpace(body.Currency) ? "ARS" : body.Currency.Trim().ToUpperInvariant();
            var lines = body.Lines ?? Array.Empty<PaymentOrderLineInput>();
            var imputations = body.Imputations ?? Array.Empty<PaymentOrderImputationInput>();
            var totalLinesAmount = lines.Count > 0 ? lines.Sum(x => x.Amount) : body.Amount;
            if (totalLinesAmount <= 0)
                return Results.BadRequest("El importe total de la orden de pago debe ser mayor a cero.");
            if (lines.Count > 0 && Math.Abs(totalLinesAmount - body.Amount) > 0.01m)
                return Results.BadRequest("El importe total debe coincidir con la suma de las líneas de pago.");

            var totalImputedAmount = imputations.Sum(x => x.AmountImputed);
            if (imputations.Count > 0 && totalImputedAmount > totalLinesAmount + 0.01m)
                return Results.BadRequest($"El total imputado (${totalImputedAmount:N2}) supera el total pagado (${totalLinesAmount:N2}).");

            var advanceAmount = Math.Max(0, totalLinesAmount - totalImputedAmount);
            var orderId = Guid.NewGuid();
            var number = await FinanceDocumentSequences.NextNumberAsync(db, tenantId, "OP", "OP-0001", ct);

            var order = new PaymentOrder
            {
                Id = orderId,
                TenantId = tenantId,
                SupplierId = body.SupplierId,
                SupplierName = body.SupplierName.Trim(),
                SupplierTaxId = body.SupplierTaxId?.Trim(),
                OrderNumber = number,
                Amount = totalLinesAmount,
                AdvanceAmount = advanceAmount,
                Currency = currency,
                PaymentDateUtc = body.PaymentDateUtc,
                Notes = body.Notes?.Trim(),
                Status = "Confirmed",
                CreatedAtUtc = DateTime.UtcNow
            };

            db.PaymentOrders.Add(order);

            // Lines processing (Bank, Cash, Cheque, Retentions)
            foreach (var line in lines)
            {
                var lineId = Guid.NewGuid();
                var lineCurrency = string.IsNullOrWhiteSpace(line.Currency) ? currency : line.Currency.Trim().ToUpperInvariant();

                db.PaymentOrderLines.Add(new PaymentOrderLine
                {
                    Id = lineId,
                    TenantId = tenantId,
                    PaymentOrderId = orderId,
                    Method = line.Method.Trim(),
                    Amount = line.Amount,
                    Currency = lineCurrency,
                    AccountId = line.AccountId,
                    BankMovementId = line.BankMovementId,
                    ChequeId = line.ChequeId,
                    ConceptId = line.ConceptId,
                    RetentionType = line.RetentionType?.Trim(),
                    RetentionCertificate = line.RetentionCertificate?.Trim(),
                    Notes = line.Notes?.Trim(),
                    CreatedAtUtc = DateTime.UtcNow
                });

                                // If it's a bank movement reconciliation
                if (line.BankMovementId.HasValue)
                {
                    var (ok, linkError, movement) = await FinanceMovementLinkValidator.ValidateForPaymentAsync(
                        db, tenantId, line.BankMovementId.Value, line.ConceptId, ct);
                    if (!ok)
                        return Results.BadRequest(linkError);

                    movement!.ReconciliationStatus = FinancialReconciliationStatus.Reconciled;
                    movement.LinkedEntityType = "PaymentOrder";
                    movement.LinkedEntityId = orderId;
                    if (line.ConceptId.HasValue && line.ConceptId != Guid.Empty)
                        movement.ConceptId = line.ConceptId;
                }
                // Else if bank or cash without pre-existing movement: create debit movement
                else if ((line.Method == "BankTransfer" || line.Method == "Cash") && line.AccountId.HasValue)
                {
                    var account = await db.Accounts.SingleOrDefaultAsync(x => x.Id == line.AccountId.Value && x.TenantId == tenantId && x.IsActive, ct);
                    if (account != null)
                    {
                        var conceptId = await db.FinancialConcepts
                            .Where(x => x.TenantId == tenantId && (x.Code == "PAGO_PROVEEDOR" || x.Code == "PAGO_PROVEEDORES"))
                            .Select(x => (Guid?)x.Id)
                            .SingleOrDefaultAsync(ct);

                        var paymentMovement = new FinancialMovement
                        {
                            Id = Guid.NewGuid(),
                            TenantId = tenantId,
                            AccountId = line.AccountId.Value,
                            Kind = FinancialMovementKind.Debit,
                            Amount = line.Amount,
                            Currency = lineCurrency,
                            OperationDateUtc = body.PaymentDateUtc,
                            Description = $"Pago a proveedor {body.SupplierName} ({number})",
                            ExternalReference = number,
                            ConceptId = line.ConceptId ?? conceptId,
                            LinkedEntityType = "PaymentOrder",
                            LinkedEntityId = orderId,
                            CreatedAtUtc = DateTime.UtcNow
                        };
                        FinanceSystemMovementHelper.ApplySystemDefaults(paymentMovement, account);
                        db.Movements.Add(paymentMovement);
                    }
                }

                // Cheque delivery / endorsement / own cheque issued
                if ((line.Method == "ChequeOwn" || line.Method == "ChequeThirdParty" || line.Method == "Cheque") && line.ChequeId.HasValue)
                {
                    var cheque = await db.ReceivedCheques.SingleOrDefaultAsync(x => x.Id == line.ChequeId.Value && x.TenantId == tenantId, ct);
                    if (cheque != null)
                    {
                        if (line.Method == "ChequeOwn" || cheque.Direction == ChequeDirection.Issued)
                        {
                            cheque.Direction = ChequeDirection.Issued;
                            cheque.Status = ReceivedChequeStatus.Issued;
                            cheque.SupplierId = body.SupplierId;
                            cheque.PaymentOrderId = orderId;
                            cheque.BankAccountId = line.AccountId;
                        }
                        else
                        {
                            cheque.Status = ReceivedChequeStatus.UsedForPayment;
                        }
                        cheque.Notes = string.IsNullOrWhiteSpace(cheque.Notes)
                            ? $"Entregado en OP {number} a {body.SupplierName}"
                            : $"{cheque.Notes} | Entregado en OP {number}";
                    }
                }
                else if (line.Method == "ChequeOwn" && !line.ChequeId.HasValue && line.AccountId.HasValue)
                {
                    var issued = new ReceivedCheque
                    {
                        Id = Guid.NewGuid(),
                        TenantId = tenantId,
                        CheckNumber = $"OP-{number}",
                        Amount = line.Amount,
                        Currency = lineCurrency,
                        Direction = ChequeDirection.Issued,
                        Status = ReceivedChequeStatus.Issued,
                        SupplierId = body.SupplierId,
                        PaymentOrderId = orderId,
                        BankAccountId = line.AccountId,
                        DueDateUtc = body.PaymentDateUtc,
                        Notes = $"Emitido en OP {number} · {body.SupplierName}",
                        CreatedAtUtc = DateTime.UtcNow
                    };
                    db.ReceivedCheques.Add(issued);
                }
            }

            // Imputations
            foreach (var imp in imputations)
            {
                db.PaymentOrderImputations.Add(new PaymentOrderImputation
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    PaymentOrderId = orderId,
                    PurchaseInvoiceId = imp.PurchaseInvoiceId,
                    InvoiceNumber = imp.InvoiceNumber.Trim(),
                    InvoiceTotal = imp.InvoiceTotal,
                    AmountImputed = imp.AmountImputed,
                    CreatedAtUtc = DateTime.UtcNow
                });
            }

            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/finance/payments/{orderId}", new { id = orderId, orderNumber = number, status = "Confirmed", advanceAmount });
        });

        group.MapPost("/{id:guid}/void", async (Guid id, VoidFinanceDocumentRequest body, FinanceDbContext db, LealControl.BuildingBlocks.Tenancy.ITenantContext tenant, CancellationToken ct) =>
            await FinanceVoid.VoidPaymentOrderAsync(id, body, db, tenant.TenantId.Value, ct));

        return endpoints;
    }
}

