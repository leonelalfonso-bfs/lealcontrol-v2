using LealControl.BuildingBlocks.Results;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Accounting.Contracts.Posting;
using LealControl.Modules.Finance.Application;
using LealControl.Modules.Finance.Application.Payments;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace LealControl.Modules.Finance.Infrastructure;

internal sealed class CreatePaymentOrderCommandHandler
    : IRequestHandler<CreatePaymentOrderCommand, Result<CreatedPaymentOrderDto>>
{
    private readonly FinanceDbContext _db;
    private readonly ITenantContext _tenant;
    private readonly IAccountingPostingGateway _accounting;
    private readonly ILoggerFactory _loggerFactory;

    public CreatePaymentOrderCommandHandler(
        FinanceDbContext db,
        ITenantContext tenant,
        IAccountingPostingGateway accounting,
        ILoggerFactory loggerFactory)
    {
        _db = db;
        _tenant = tenant;
        _accounting = accounting;
        _loggerFactory = loggerFactory;
    }

    public async Task<Result<CreatedPaymentOrderDto>> Handle(
        CreatePaymentOrderCommand body,
        CancellationToken ct)
    {
        var validated = CreatePaymentOrderValidator.Validate(body);
        if (validated.IsFailure)
        {
            return Result.Failure<CreatedPaymentOrderDto>(validated.Error);
        }

        var snapshot = validated.Value;
        var tenantId = _tenant.TenantId.Value;
        var currency = snapshot.Currency;
        var lines = snapshot.Lines;
        var imputations = snapshot.Imputations;
        var totalLinesAmount = snapshot.TotalLinesAmount;
        var advanceAmount = snapshot.AdvanceAmount;
        var supplierName = snapshot.SupplierName;

        var orderId = Guid.NewGuid();
        var number = await FinanceDocumentSequences.NextNumberAsync(_db, tenantId, "OP", "OP-0001", ct);

        var order = new PaymentOrder
        {
            Id = orderId,
            TenantId = tenantId,
            SupplierId = body.SupplierId,
            SupplierName = supplierName,
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

        _db.PaymentOrders.Add(order);

        foreach (var line in lines)
        {
            var lineId = Guid.NewGuid();
            var lineCurrency = string.IsNullOrWhiteSpace(line.Currency) ? currency : line.Currency.Trim().ToUpperInvariant();

            _db.PaymentOrderLines.Add(new PaymentOrderLine
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

            if (line.BankMovementId.HasValue)
            {
                var (ok, linkError, movement) = await FinanceMovementLinkValidator.ValidateForPaymentAsync(
                    _db, tenantId, line.BankMovementId.Value, line.ConceptId, ct);
                if (!ok)
                {
                    return Result.Failure<CreatedPaymentOrderDto>(
                        FinanceErrors.Validation("Finance.Payment.InvalidMovement", linkError!));
                }

                movement!.ReconciliationStatus = FinancialReconciliationStatus.Reconciled;
                movement.LinkedEntityType = "PaymentOrder";
                movement.LinkedEntityId = orderId;
                if (line.ConceptId.HasValue && line.ConceptId != Guid.Empty)
                    movement.ConceptId = line.ConceptId;
            }
            else if ((line.Method == "BankTransfer" || line.Method == "Cash") && line.AccountId.HasValue)
            {
                var account = await _db.Accounts.SingleOrDefaultAsync(
                    x => x.Id == line.AccountId.Value && x.TenantId == tenantId && x.IsActive, ct);
                if (account != null)
                {
                    var conceptId = await _db.FinancialConcepts
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
                        Description = $"Pago a proveedor {supplierName} ({number})",
                        ExternalReference = number,
                        ConceptId = line.ConceptId ?? conceptId,
                        LinkedEntityType = "PaymentOrder",
                        LinkedEntityId = orderId,
                        CreatedAtUtc = DateTime.UtcNow
                    };
                    FinanceSystemMovementHelper.ApplySystemDefaults(paymentMovement, account);
                    _db.Movements.Add(paymentMovement);
                }
            }

            if ((line.Method == "ChequeOwn" || line.Method == "ChequeThirdParty" || line.Method == "Cheque") && line.ChequeId.HasValue)
            {
                var cheque = await _db.ReceivedCheques.SingleOrDefaultAsync(
                    x => x.Id == line.ChequeId.Value && x.TenantId == tenantId, ct);
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
                        ? $"Entregado en OP {number} a {supplierName}"
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
                    Notes = $"Emitido en OP {number} · {supplierName}",
                    CreatedAtUtc = DateTime.UtcNow
                };
                _db.ReceivedCheques.Add(issued);
            }
        }

        foreach (var imp in imputations)
        {
            _db.PaymentOrderImputations.Add(new PaymentOrderImputation
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

        await _db.SaveChangesAsync(ct);

        var savedLines = await _db.PaymentOrderLines.AsNoTracking()
            .Where(x => x.PaymentOrderId == orderId && x.TenantId == tenantId)
            .ToListAsync(ct);
        await FinanceAccountingPublisher.TryPostPaymentOrderAsync(
            _accounting, _db, order, savedLines, _loggerFactory.CreateLogger("FinanceAccounting"), ct);

        return Result.Success(new CreatedPaymentOrderDto(orderId, number, "Confirmed", advanceAmount));
    }
}
