using System.Text.Json;
using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Accounting.Contracts.Posting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace LealControl.Modules.Accounting.Infrastructure;

/// <summary>
/// Encola <see cref="PostableDocument"/> en accounting.pending_documents.
/// El asiento real se genera en batch-post / auto-post (motor de plantillas).
/// </summary>
public sealed class AccountingPostingGateway(
    AccountingDbContext db,
    ITenantContext tenant,
    ILogger<AccountingPostingGateway> logger) : IAccountingPostingGateway
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task PostAsync(PostableDocument document, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(document);
        if (string.IsNullOrWhiteSpace(document.SourceModule) || string.IsNullOrWhiteSpace(document.DocumentId))
        {
            throw new ArgumentException("SourceModule y DocumentId son obligatorios.", nameof(document));
        }

        await db.EnsureAccountingTablesAsync(cancellationToken);
        var tenantId = tenant.TenantId;

        var existing = await db.PendingDocuments
            .SingleOrDefaultAsync(
                x => x.TenantId == tenantId
                     && x.SourceModule == document.SourceModule
                     && x.SourceDocumentId == document.DocumentId
                     && x.Status != AccountingPendingDocumentStatuses.Skipped,
                cancellationToken);

        var payload = JsonSerializer.Serialize(document, JsonOptions);

        // 4.6 Auto-post: si está activo, renderizamos y grabamos en el momento.
        var settings = await db.GetOrCreateTenantSettingsAsync(tenantId, cancellationToken);
        if (settings.AutoPostOnConfirm)
        {
            // Idempotencia: si ya existe asiento real para este doc, sólo vinculamos pending.
            var existingJournalEntry = await db.JournalEntries
                .AsNoTracking()
                .FirstOrDefaultAsync(
                    j => j.TenantId == tenantId &&
                         j.SourceModule == document.SourceModule &&
                         j.SourceDocumentId == document.DocumentId,
                    cancellationToken);

            if (existing is not null && existing.Status == AccountingPendingDocumentStatuses.Posted)
            {
                // Ya estaba publicado.
                return;
            }

            AccountingPendingDocument pendingRow = existing ?? new AccountingPendingDocument
            {
                TenantId = tenantId,
                SourceModule = document.SourceModule.Trim(),
                DocumentType = document.DocumentType.Trim(),
                SourceDocumentId = document.DocumentId.Trim(),
                DocumentNumber = document.DocumentNumber?.Trim() ?? document.DocumentId,
                DocumentDateUtc = document.Date.Kind == DateTimeKind.Unspecified
                    ? DateTime.SpecifyKind(document.Date, DateTimeKind.Utc)
                    : document.Date.ToUniversalTime(),
                PayloadJson = payload,
                Status = AccountingPendingDocumentStatuses.Error,
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow
            };

            if (existing is null)
            {
                db.PendingDocuments.Add(pendingRow);
            }
            else
            {
                pendingRow.DocumentType = document.DocumentType;
                pendingRow.DocumentNumber = document.DocumentNumber?.Trim() ?? document.DocumentId;
                pendingRow.DocumentDateUtc = document.Date.Kind == DateTimeKind.Unspecified
                    ? DateTime.SpecifyKind(document.Date, DateTimeKind.Utc)
                    : document.Date.ToUniversalTime();
                pendingRow.PayloadJson = payload;
            }

            try
            {
                if (existingJournalEntry is not null)
                {
                    pendingRow.Status = AccountingPendingDocumentStatuses.Posted;
                    pendingRow.LastError = null;
                    pendingRow.JournalEntryId = existingJournalEntry.Id;
                    pendingRow.UpdatedAtUtc = DateTime.UtcNow;
                    await db.SaveChangesAsync(cancellationToken);
                    return;
                }

                var templates = await db.JournalTemplates
                    .AsNoTracking()
                    .Include(t => t.Lines)
                    .Where(t => t.TenantId == tenantId && t.Status == "Active")
                    .ToListAsync(cancellationToken);

                var accounts = await db.Accounts
                    .AsNoTracking()
                    .Where(a => a.TenantId == tenantId)
                    .ToListAsync(cancellationToken);

                var resolver = new DbAccountResolver(accounts);
                var selection = JournalTemplateSelector.Select(document, templates);

                if (selection.Template is null)
                {
                    pendingRow.Status = AccountingPendingDocumentStatuses.Error;
                    pendingRow.LastError = selection.Warning ?? "Sin asiento modelo disponible.";
                    pendingRow.JournalEntryId = null;
                    pendingRow.UpdatedAtUtc = DateTime.UtcNow;
                    await db.SaveChangesAsync(cancellationToken);
                    return;
                }

                var overrides = await FinanceAccountMappingHelper.ResolveAmountSourceAccountsAsync(document, tenantId, db, cancellationToken);
                var entry = JournalTemplateEngine.Render(selection.Template, document, tenantId, resolver, overrides);
                var maxNumber = await db.JournalEntries
                    .Where(j => j.TenantId == tenantId)
                    .MaxAsync(j => (int?)j.EntryNumber, cancellationToken) ?? 0;

                entry.EntryNumber = maxNumber + 1;
                db.JournalEntries.Add(entry);

                pendingRow.Status = AccountingPendingDocumentStatuses.Posted;
                pendingRow.LastError = null;
                pendingRow.JournalEntryId = entry.Id;
                pendingRow.UpdatedAtUtc = DateTime.UtcNow;

                await db.SaveChangesAsync(cancellationToken);
            }
            catch (Exception ex)
            {
                pendingRow.Status = AccountingPendingDocumentStatuses.Error;
                pendingRow.LastError = ex.Message.Length > 990 ? ex.Message[..990] : ex.Message;
                pendingRow.JournalEntryId = null;
                pendingRow.UpdatedAtUtc = DateTime.UtcNow;
                await db.SaveChangesAsync(cancellationToken);
            }

            return;
        }

        if (existing is not null)
        {
            if (existing.Status == AccountingPendingDocumentStatuses.Posted)
            {
                logger.LogInformation(
                    "Documento {Module}/{DocId} ya está Posted; se ignora re-post.",
                    document.SourceModule, document.DocumentId);
                return;
            }

            existing.DocumentType = document.DocumentType;
            existing.DocumentNumber = document.DocumentNumber;
            existing.DocumentDateUtc = document.Date.Kind == DateTimeKind.Unspecified
                ? DateTime.SpecifyKind(document.Date, DateTimeKind.Utc)
                : document.Date.ToUniversalTime();
            existing.PayloadJson = payload;
            existing.Status = AccountingPendingDocumentStatuses.Pending;
            existing.LastError = null;
            existing.UpdatedAtUtc = DateTime.UtcNow;
        }
        else
        {
            db.PendingDocuments.Add(new AccountingPendingDocument
            {
                TenantId = tenantId,
                SourceModule = document.SourceModule.Trim(),
                DocumentType = document.DocumentType.Trim(),
                SourceDocumentId = document.DocumentId.Trim(),
                DocumentNumber = document.DocumentNumber?.Trim() ?? document.DocumentId,
                DocumentDateUtc = document.Date.Kind == DateTimeKind.Unspecified
                    ? DateTime.SpecifyKind(document.Date, DateTimeKind.Utc)
                    : document.Date.ToUniversalTime(),
                PayloadJson = payload,
                Status = AccountingPendingDocumentStatuses.Pending,
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow
            });
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task ReverseAsync(
        string sourceModule,
        string sourceDocumentId,
        string reason,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(sourceModule) || string.IsNullOrWhiteSpace(sourceDocumentId))
        {
            return;
        }

        await db.EnsureAccountingTablesAsync(cancellationToken);
        var tenantId = tenant.TenantId;

        var pending = await db.PendingDocuments
            .Where(x => x.TenantId == tenantId
                        && x.SourceModule == sourceModule
                        && x.SourceDocumentId == sourceDocumentId)
            .ToListAsync(cancellationToken);

        foreach (var row in pending)
        {
            if (row.Status == AccountingPendingDocumentStatuses.Pending
                || row.Status == AccountingPendingDocumentStatuses.Error)
            {
                row.Status = AccountingPendingDocumentStatuses.Skipped;
                row.LastError = string.IsNullOrWhiteSpace(reason)
                    ? "Anulado antes de contabilizar."
                    : $"Anulado: {reason.Trim()}";
                row.UpdatedAtUtc = DateTime.UtcNow;
                continue;
            }

            if (row.Status != AccountingPendingDocumentStatuses.Posted)
                continue;

            var original = row.JournalEntryId.HasValue
                ? await db.JournalEntries.Include(e => e.Lines)
                    .FirstOrDefaultAsync(e => e.Id == row.JournalEntryId.Value && e.TenantId == tenantId, cancellationToken)
                : await db.JournalEntries.Include(e => e.Lines)
                    .FirstOrDefaultAsync(
                        e => e.TenantId == tenantId
                             && e.SourceModule == sourceModule
                             && e.SourceDocumentId == sourceDocumentId
                             && e.EntryType != "Reversal",
                        cancellationToken);

            if (original is null)
            {
                row.Status = AccountingPendingDocumentStatuses.Skipped;
                row.LastError = "Anulado: no se encontró el asiento original para revertir.";
                row.UpdatedAtUtc = DateTime.UtcNow;
                continue;
            }

            var isLocked = await db.Periods.AnyAsync(p =>
                p.TenantId == tenantId
                && p.Year == original.Date.Year
                && p.Month == original.Date.Month
                && p.Status == "Locked", cancellationToken);
            if (isLocked)
            {
                logger.LogWarning(
                    "No se revirtió {Module}/{DocId}: período {Month}/{Year} cerrado.",
                    sourceModule, sourceDocumentId, original.Date.Month, original.Date.Year);
                row.LastError = $"No se pudo revertir: período {original.Date.Month:D2}/{original.Date.Year} cerrado.";
                row.UpdatedAtUtc = DateTime.UtcNow;
                continue;
            }

            var alreadyReversed = await db.JournalEntries.AnyAsync(
                e => e.TenantId == tenantId
                     && e.EntryType == "Reversal"
                     && e.SourceDocumentId == original.Id.ToString(),
                cancellationToken);
            if (alreadyReversed)
            {
                row.Status = AccountingPendingDocumentStatuses.Skipped;
                row.LastError = "Ya existía contra-asiento.";
                row.UpdatedAtUtc = DateTime.UtcNow;
                continue;
            }

            var maxNumber = await db.JournalEntries
                .Where(j => j.TenantId == tenantId)
                .MaxAsync(j => (int?)j.EntryNumber, cancellationToken) ?? 0;

            var reversal = new JournalEntry
            {
                TenantId = tenantId,
                EntryNumber = maxNumber + 1,
                Date = DateTime.UtcNow,
                Concept = string.IsNullOrWhiteSpace(reason)
                    ? $"Reversión asiento {original.EntryNumber}"
                    : $"Reversión asiento {original.EntryNumber}: {reason.Trim()}",
                EntryType = "Reversal",
                SourceModule = sourceModule,
                SourceDocumentId = original.Id.ToString(),
                Status = "Posted",
                CreatedBy = "Accounting.Reversal",
                CreatedAtUtc = DateTime.UtcNow
            };

            foreach (var line in original.Lines)
            {
                reversal.Lines.Add(new JournalEntryLine
                {
                    JournalEntryId = reversal.Id,
                    TenantId = tenantId,
                    AccountId = line.AccountId,
                    AccountCode = line.AccountCode,
                    AccountName = line.AccountName,
                    Debit = line.Credit,
                    Credit = line.Debit,
                    Currency = line.Currency,
                    ExchangeRate = line.ExchangeRate,
                    CostCenterId = line.CostCenterId,
                    CostCenterCode = line.CostCenterCode,
                    CostCenterName = line.CostCenterName,
                    Memo = $"Rev. {line.Memo}"
                });
            }

            reversal.TotalDebit = reversal.Lines.Sum(l => l.Debit);
            reversal.TotalCredit = reversal.Lines.Sum(l => l.Credit);
            db.JournalEntries.Add(reversal);

            row.Status = AccountingPendingDocumentStatuses.Skipped;
            row.LastError = $"Revertido con asiento {reversal.EntryNumber}.";
            row.UpdatedAtUtc = DateTime.UtcNow;
        }

        await db.SaveChangesAsync(cancellationToken);
        logger.LogInformation(
            "ReverseAsync {Module}/{DocId}: {Count} pendientes marcados Skipped. Motivo: {Reason}",
            sourceModule, sourceDocumentId, pending.Count, reason);
    }
}
