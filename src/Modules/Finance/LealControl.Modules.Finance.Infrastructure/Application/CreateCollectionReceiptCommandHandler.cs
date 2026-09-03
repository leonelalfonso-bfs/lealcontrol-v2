using LealControl.BuildingBlocks.Results;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Accounting.Contracts.Posting;
using LealControl.Modules.Finance.Application;
using LealControl.Modules.Finance.Application.Collections;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace LealControl.Modules.Finance.Infrastructure;

internal sealed class CreateCollectionReceiptCommandHandler
    : IRequestHandler<CreateCollectionReceiptCommand, Result<CreatedCollectionReceiptDto>>
{
    private readonly FinanceDbContext _db;
    private readonly ITenantContext _tenant;
    private readonly IAccountingPostingGateway _accounting;
    private readonly ILoggerFactory _loggerFactory;

    public CreateCollectionReceiptCommandHandler(
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

    public async Task<Result<CreatedCollectionReceiptDto>> Handle(
        CreateCollectionReceiptCommand body,
        CancellationToken ct)
    {
        var validated = CreateCollectionReceiptValidator.Validate(body);
        if (validated.IsFailure)
        {
            return Result.Failure<CreatedCollectionReceiptDto>(validated.Error);
        }

        var snapshot = validated.Value;
        var tenantId = _tenant.TenantId.Value;
        await FinanceConcepts.EnsureBaseConceptsAsync(_db, tenantId, ct);

        var lines = snapshot.Lines;
        var imputations = snapshot.Imputations;
        var totalLinesAmount = snapshot.TotalLinesAmount;
        var totalImputedAmount = snapshot.TotalImputedAmount;
        var advanceAmount = snapshot.AdvanceAmount;
        var currency = snapshot.Currency;
        var description = snapshot.Description;

        var receiptId = Guid.NewGuid();
        var number = await FinanceDocumentSequences.NextNumberAsync(_db, tenantId, "RC", "RC-0001", ct);
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
            AdvanceAmount = advanceAmount,
            Currency = currency,
            InvoiceAmount = totalImputedAmount > 0 ? totalImputedAmount : body.InvoiceAmount,
            InvoiceCurrency = body.InvoiceCurrency?.Trim().ToUpperInvariant(),
            InvoiceExchangeRate = body.InvoiceExchangeRate,
            PaymentExchangeRate = body.PaymentExchangeRate,
            SuggestedAdjustmentArs = body.SuggestedAdjustmentArs,
            SuggestedAdjustmentType = body.SuggestedAdjustmentType?.Trim(),
            ExchangeDifferenceAmount = body.SuggestedAdjustmentArs,
            ReceiptDateUtc = body.ReceiptDateUtc,
            Description = description,
            Status = "Confirmed",
            CreatedAtUtc = DateTime.UtcNow
        };

        _db.CollectionReceipts.Add(receipt);

        if (lines.Count > 0)
        {
            var conceptId = await _db.FinancialConcepts
                .Where(x => x.TenantId == tenantId && (x.Code == "COBRO_CLIENTE" || x.Code == "COBRO_CLIENTES"))
                .Select(x => (Guid?)x.Id)
                .SingleOrDefaultAsync(ct);

            foreach (var line in lines)
            {
                var lineId = Guid.NewGuid();
                var lineCurrency = string.IsNullOrWhiteSpace(line.Currency) ? currency : line.Currency.Trim().ToUpperInvariant();
                var lineMethod = line.Method.Trim();

                _db.CollectionReceiptLines.Add(new CollectionReceiptLine
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

                if (line.MovementId.HasValue)
                {
                    var (ok, linkError, movement) = await FinanceMovementLinkValidator.ValidateForCollectionAsync(
                        _db, tenantId, line.MovementId.Value, line.ConceptId, ct);
                    if (!ok)
                    {
                        return Result.Failure<CreatedCollectionReceiptDto>(
                            FinanceErrors.Validation("Finance.Receipt.InvalidMovement", linkError!));
                    }

                    movement!.ReconciliationStatus = FinancialReconciliationStatus.Reconciled;
                    movement.LinkedEntityType = "CollectionReceipt";
                    movement.LinkedEntityId = receiptId;
                    if (line.ConceptId.HasValue && line.ConceptId != Guid.Empty)
                        movement.ConceptId = line.ConceptId;
                }
                else if ((lineMethod.Equals("BankTransfer", StringComparison.OrdinalIgnoreCase) ||
                         lineMethod.Equals("Cash", StringComparison.OrdinalIgnoreCase) ||
                         lineMethod.Equals("Transferencia", StringComparison.OrdinalIgnoreCase) ||
                         lineMethod.Equals("Efectivo", StringComparison.OrdinalIgnoreCase)) && line.AccountId.HasValue)
                {
                    var account = await _db.Accounts.SingleOrDefaultAsync(
                        x => x.Id == line.AccountId.Value && x.TenantId == tenantId && x.IsActive, ct);
                    if (account is null)
                    {
                        return Result.Failure<CreatedCollectionReceiptDto>(
                            FinanceErrors.Validation("Finance.Receipt.AccountNotFound", "Cuenta financiera inexistente o inactiva."));
                    }

                    var movement = new FinancialMovement
                    {
                        Id = Guid.NewGuid(),
                        TenantId = tenantId,
                        AccountId = line.AccountId.Value,
                        Kind = FinancialMovementKind.Credit,
                        Amount = line.Amount,
                        Currency = lineCurrency,
                        OperationDateUtc = body.ReceiptDateUtc,
                        Description = $"Cobro a cliente ({number}) - {description}",
                        ExternalReference = number,
                        ConceptId = line.ConceptId ?? conceptId,
                        LinkedEntityType = "CollectionReceipt",
                        LinkedEntityId = receiptId,
                        CreatedAtUtc = DateTime.UtcNow
                    };
                    FinanceSystemMovementHelper.ApplySystemDefaults(movement, account);
                    _db.Movements.Add(movement);
                }

                if (line.ChequeId.HasValue)
                {
                    var cheque = await _db.ReceivedCheques.SingleOrDefaultAsync(
                        x => x.Id == line.ChequeId.Value && x.TenantId == tenantId, ct);
                    if (cheque != null)
                    {
                        cheque.CollectionReceiptId = receiptId;
                        cheque.CustomerId = body.CustomerId;
                        cheque.Notes = string.IsNullOrWhiteSpace(cheque.Notes)
                            ? $"Aplicado en Recibo {number}"
                            : $"{cheque.Notes} | Recibo {number}";
                    }
                }
            }
        }
        else
        {
            var cheque = body.ChequeId is null
                ? null
                : await _db.ReceivedCheques.SingleOrDefaultAsync(x => x.Id == body.ChequeId && x.TenantId == tenantId, ct);
            if (cheque is not null) cheque.CollectionReceiptId = receiptId;

            var movement = body.MovementId is null
                ? null
                : await _db.Movements.SingleOrDefaultAsync(x => x.Id == body.MovementId && x.TenantId == tenantId, ct);
            if (movement is not null)
            {
                movement.ReconciliationStatus = FinancialReconciliationStatus.Reconciled;
                movement.LinkedEntityType = "CollectionReceipt";
                movement.LinkedEntityId = receiptId;
            }
            else if (body.AccountId.HasValue && cheque is null)
            {
                var conceptId = await _db.FinancialConcepts
                    .Where(x => x.TenantId == tenantId && x.Code == "COBRO_CLIENTE")
                    .Select(x => (Guid?)x.Id)
                    .SingleOrDefaultAsync(ct);
                _db.Movements.Add(new FinancialMovement
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    AccountId = body.AccountId.Value,
                    Kind = FinancialMovementKind.Credit,
                    Amount = totalLinesAmount,
                    Currency = currency,
                    OperationDateUtc = body.ReceiptDateUtc,
                    Description = description,
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

        foreach (var imp in imputations)
        {
            _db.CollectionReceiptImputations.Add(new CollectionReceiptImputation
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

        if (advanceAmount > 0.01m && body.CustomerId.HasValue)
        {
            _db.CustomerAdvances.Add(new CustomerAdvance
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                CustomerId = body.CustomerId.Value,
                CollectionReceiptId = receiptId,
                Amount = advanceAmount,
                RemainingAmount = advanceAmount,
                Currency = currency,
                CreatedAtUtc = DateTime.UtcNow
            });
        }

        await _db.SaveChangesAsync(ct);

        var savedLines = await _db.CollectionReceiptLines.AsNoTracking()
            .Where(x => x.ReceiptId == receiptId && x.TenantId == tenantId)
            .ToListAsync(ct);
        await FinanceAccountingPublisher.TryPostCollectionReceiptAsync(
            _accounting, _db, receipt, savedLines, _loggerFactory.CreateLogger("FinanceAccounting"), ct);

        return Result.Success(new CreatedCollectionReceiptDto(receiptId, number, "Confirmed", advanceAmount));
    }
}
