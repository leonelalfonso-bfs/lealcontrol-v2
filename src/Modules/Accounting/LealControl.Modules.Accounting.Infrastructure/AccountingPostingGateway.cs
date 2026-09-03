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
            }
            // Posted → la reversión de asiento se implementa en 4.9 (contra-asiento).
        }

        await db.SaveChangesAsync(cancellationToken);
        logger.LogInformation(
            "ReverseAsync {Module}/{DocId}: {Count} pendientes marcados Skipped. Motivo: {Reason}",
            sourceModule, sourceDocumentId, pending.Count, reason);
    }
}
