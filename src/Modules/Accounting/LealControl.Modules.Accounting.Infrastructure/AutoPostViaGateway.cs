using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Accounting.Contracts.Posting;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Accounting.Infrastructure;

/// <summary>
/// Compatibilidad: endpoints auto-post antiguos publican via <see cref="IAccountingPostingGateway"/>.
/// </summary>
internal static class AutoPostViaGateway
{
    public static async Task<IResult> EnqueueAndReportAsync(
        IAccountingPostingGateway gateway,
        AccountingDbContext db,
        TenantId tenantId,
        PostableDocument document,
        CancellationToken ct)
    {
        await db.EnsureAccountingTablesAsync(ct);
        await db.SeedDefaultChartOfAccountsAsync(tenantId, ct);
        await db.SeedDefaultJournalTemplatesAsync(tenantId, ct);

        // /auto-post/* must generate the journal entry now, regardless of the tenant toggle
        // used by the normal Sales/Finance publish path.
        var settings = await db.GetOrCreateTenantSettingsAsync(tenantId, ct);
        if (!settings.AutoPostOnConfirm)
        {
            settings.AutoPostOnConfirm = true;
            await db.SaveChangesAsync(ct);
        }

        await gateway.PostAsync(document, ct);

        var pending = await db.PendingDocuments.AsNoTracking()
            .Where(x => x.TenantId == tenantId
                        && x.SourceModule == document.SourceModule
                        && x.SourceDocumentId == document.DocumentId
                        && x.Status != AccountingPendingDocumentStatuses.Skipped)
            .OrderByDescending(x => x.UpdatedAtUtc)
            .FirstOrDefaultAsync(ct);

        if (pending is null)
        {
            return Results.Ok(new
            {
                obsolete = true,
                message = "Documento publicado a Contabilidad.",
                status = "Unknown"
            });
        }

        if (pending.Status == AccountingPendingDocumentStatuses.Error)
        {
            return Results.BadRequest(new
            {
                obsolete = true,
                message = pending.LastError ?? "No se pudo contabilizar el documento.",
                status = pending.Status,
                pendingDocumentId = pending.Id
            });
        }

        if (pending.Status == AccountingPendingDocumentStatuses.Posted && pending.JournalEntryId is Guid entryId)
        {
            var entry = await db.JournalEntries.AsNoTracking()
                .FirstOrDefaultAsync(e => e.Id == entryId, ct);
            return Results.Created($"/api/v1/accounting/journal-entries/{entryId}", new
            {
                obsolete = true,
                message = "Asiento generado vía plantilla.",
                status = pending.Status,
                entryId,
                entryNumber = entry?.EntryNumber
            });
        }

        return Results.Accepted($"/api/v1/accounting/pending-documents", new
        {
            obsolete = true,
            message = "Documento encolado. Se contabiliza con el lote o con auto-post activado.",
            status = pending.Status,
            pendingDocumentId = pending.Id
        });
    }

    public static Dictionary<string, decimal> InvoiceAmounts(decimal net, decimal vat, decimal total) =>
        new(StringComparer.OrdinalIgnoreCase)
        {
            [AccountingAmountSources.Total] = total,
            [AccountingAmountSources.Net21] = net,
            [AccountingAmountSources.Vat21] = vat,
            [AccountingAmountSources.TotalVat] = vat
        };
}
