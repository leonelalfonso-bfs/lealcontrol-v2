using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Accounting.Contracts.Posting;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace LealControl.Modules.Accounting.Infrastructure;

/// <summary>
/// Resuelve cuentas contables para el motor de plantillas leyendo desde <see cref="AccountingDbContext"/>.
/// </summary>
internal sealed class DbAccountResolver : IAccountingAccountResolver
{
    private readonly Dictionary<string, ResolvedAccountingAccount> _cache;

    public DbAccountResolver(IReadOnlyList<Account> accounts)
    {
        _cache = new Dictionary<string, ResolvedAccountingAccount>(StringComparer.OrdinalIgnoreCase);
        foreach (var a in accounts)
            _cache[a.Code] = new ResolvedAccountingAccount(a.Id, a.Code, a.Name);
    }

    public ResolvedAccountingAccount Resolve(string accountCode, string accountNameFallback)
    {
        if (_cache.TryGetValue(accountCode, out var resolved))
            return resolved;

        throw new InvalidOperationException(
            $"No se encontró la cuenta contable en chart of accounts: code='{accountCode}'. Nombre='{accountNameFallback}'.");
    }
}

/// <summary>
/// Procesador de contabilización en lote: preview, execute, revert.
/// Usa <see cref="JournalTemplateSelector"/> + <see cref="JournalTemplateEngine"/> para generar asientos reales.
/// </summary>
public static class BatchPostProcessor
{
    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);

    public static async Task<BatchPostingPreviewResponse> PreviewAsync(
        BatchPostingPreviewRequest req,
        TenantId tenantId,
        AccountingDbContext db,
        CancellationToken ct)
    {
        await db.EnsureAccountingTablesAsync(ct);
        await db.SeedDefaultChartOfAccountsAsync(tenantId, ct);

        var pending = await LoadPendingDocumentsAsync(db, tenantId, req.PeriodStart, req.PeriodEnd, req.Modules, ct);
        if (pending.Count == 0)
        {
            return new BatchPostingPreviewResponse(0, 0, 0, 0, 0, true, [], [], ["No hay documentos pendientes en el período seleccionado."], []);
        }

        var templates = await db.JournalTemplates.AsNoTracking().Include(t => t.Lines)
            .Where(t => t.TenantId == tenantId && t.Status == "Active").ToListAsync(ct);

        var accounts = await db.Accounts.AsNoTracking().Where(a => a.TenantId == tenantId).ToListAsync(ct);
        var resolver = new DbAccountResolver(accounts);

        var previewItems = new List<BatchPostingPreviewItemDto>();
        var warnings = new List<string>();
        var unmapped = new List<string>();
        var accountTotals = new Dictionary<string, (string Name, decimal Debit, decimal Credit)>(StringComparer.OrdinalIgnoreCase);

        foreach (var pendingDoc in pending)
        {
            var document = DeserializePayload(pendingDoc);
            if (document is null)
            {
                warnings.Add($"No se pudo deserializar el payload del documento {pendingDoc.DocumentNumber} ({pendingDoc.Id}).");
                continue;
            }

            var selection = JournalTemplateSelector.Select(document, templates);
            if (selection.Template is null)
            {
                unmapped.Add($"{pendingDoc.SourceModule}/{pendingDoc.DocumentType}: {pendingDoc.DocumentNumber}");
                if (selection.Warning is not null) warnings.Add(selection.Warning);
                continue;
            }

            if (selection.Warning is not null) warnings.Add(selection.Warning);

            try
            {
                var overrides = await FinanceAccountMappingHelper.ResolveAmountSourceAccountsAsync(document, tenantId, db, ct);
                var entry = JournalTemplateEngine.Render(selection.Template, document, tenantId, resolver, overrides);

                var linesDtos = entry.Lines.Select(l => new JournalEntryLinePreviewDto(
                    l.AccountCode, l.AccountName, l.Debit, l.Credit, l.Memo ?? "")).ToList();

                var docAmount = document.Amounts.TryGetValue(AccountingAmountSources.Total, out var t) ? t : 0m;

                previewItems.Add(new BatchPostingPreviewItemDto(
                    pendingDoc.SourceDocumentId,
                    pendingDoc.DocumentNumber,
                    pendingDoc.DocumentType,
                    pendingDoc.SourceModule,
                    pendingDoc.DocumentDateUtc,
                    document.CounterpartyName ?? "",
                    docAmount,
                    selection.Template.Code,
                    selection.Template.Name,
                    linesDtos));

                foreach (var l in entry.Lines)
                {
                    if (!accountTotals.TryGetValue(l.AccountCode, out var acc))
                        acc = (l.AccountName, 0, 0);
                    accountTotals[l.AccountCode] = (acc.Name, acc.Debit + l.Debit, acc.Credit + l.Credit);
                }
            }
            catch (InvalidOperationException ex)
            {
                warnings.Add($"{pendingDoc.DocumentNumber}: {ex.Message}");
                unmapped.Add($"{pendingDoc.SourceModule}/{pendingDoc.DocumentType}: {pendingDoc.DocumentNumber} (desbalanceado)");
            }
        }

        var totalDebit = previewItems.Sum(p => p.Lines.Sum(l => l.Debit));
        var totalCredit = previewItems.Sum(p => p.Lines.Sum(l => l.Credit));
        var totalLines = previewItems.Sum(p => p.Lines.Count);

        var accountsSummary = accountTotals.Select(kvp =>
            new AccountBalanceSummaryDto(kvp.Key, kvp.Value.Name, kvp.Value.Debit, kvp.Value.Credit))
            .OrderBy(a => a.AccountCode).ToList();

        return new BatchPostingPreviewResponse(
            previewItems.Count,
            previewItems.Count,
            totalLines,
            totalDebit,
            totalCredit,
            Math.Abs(totalDebit - totalCredit) < 0.01m,
            accountsSummary,
            previewItems,
            warnings,
            unmapped);
    }

    public static async Task<BatchPostingExecuteResponse> ExecuteAsync(
        BatchPostingExecuteRequest req,
        TenantId tenantId,
        AccountingDbContext db,
        ILogger logger,
        CancellationToken ct)
    {
        var sw = Stopwatch.StartNew();
        await db.EnsureAccountingTablesAsync(ct);
        await db.SeedDefaultChartOfAccountsAsync(tenantId, ct);

        var isLocked = await db.Periods.AnyAsync(p =>
            p.TenantId == tenantId
            && p.Status == "Locked"
            && ((req.PeriodStart.Year == p.Year && req.PeriodStart.Month <= p.Month)
                || (req.PeriodEnd.Year == p.Year && req.PeriodEnd.Month >= p.Month)), ct);

        if (isLocked)
        {
            return new BatchPostingExecuteResponse(
                Guid.Empty, "", 0, 0, 0, 0, 0, "Failed", 0,
                [], [$"El período seleccionado contiene meses cerrados con candado contable."]);
        }

        var pending = await LoadPendingDocumentsAsync(db, tenantId, req.PeriodStart, req.PeriodEnd, req.Modules, ct);
        if (pending.Count == 0)
        {
            return new BatchPostingExecuteResponse(
                Guid.Empty, "", 0, 0, 0, 0, 0, "Completed", 0,
                [], ["No hay documentos pendientes."]);
        }

        var templates = await db.JournalTemplates.Include(t => t.Lines)
            .Where(t => t.TenantId == tenantId && t.Status == "Active").ToListAsync(ct);

        var accounts = await db.Accounts.Where(a => a.TenantId == tenantId).ToListAsync(ct);
        var resolver = new DbAccountResolver(accounts);

        var maxNumber = await db.JournalEntries
            .Where(j => j.TenantId == tenantId)
            .MaxAsync(j => (int?)j.EntryNumber, ct) ?? 0;

        int entriesGenerated = 0, errorsCount = 0;
        decimal totalDebit = 0, totalCredit = 0;
        var entryNumbers = new List<string>();
        var exceptions = new List<string>();

        foreach (var pendingDoc in pending)
        {
            var document = DeserializePayload(pendingDoc);
            if (document is null)
            {
                pendingDoc.Status = AccountingPendingDocumentStatuses.Error;
                pendingDoc.LastError = "No se pudo deserializar el payload.";
                pendingDoc.UpdatedAtUtc = DateTime.UtcNow;
                errorsCount++;
                exceptions.Add($"{pendingDoc.DocumentNumber}: payload inválido.");
                continue;
            }

            var selection = JournalTemplateSelector.Select(document, templates);
            if (selection.Template is null)
            {
                errorsCount++;
                exceptions.Add($"{pendingDoc.DocumentNumber}: {selection.Warning ?? "Sin plantilla."}");
                continue;
            }

            try
            {
                var overrides = await FinanceAccountMappingHelper.ResolveAmountSourceAccountsAsync(document, tenantId, db, ct);
                var entry = JournalTemplateEngine.Render(selection.Template, document, tenantId, resolver, overrides);
                maxNumber++;
                entry.EntryNumber = maxNumber;

                db.JournalEntries.Add(entry);

                pendingDoc.Status = AccountingPendingDocumentStatuses.Posted;
                pendingDoc.JournalEntryId = entry.Id;
                pendingDoc.LastError = null;
                pendingDoc.UpdatedAtUtc = DateTime.UtcNow;

                entriesGenerated++;
                totalDebit += entry.TotalDebit;
                totalCredit += entry.TotalCredit;
                entryNumbers.Add(entry.EntryNumber.ToString());
            }
            catch (Exception ex)
            {
                pendingDoc.Status = AccountingPendingDocumentStatuses.Error;
                pendingDoc.LastError = ex.Message.Length > 990 ? ex.Message[..990] : ex.Message;
                pendingDoc.UpdatedAtUtc = DateTime.UtcNow;
                errorsCount++;
                exceptions.Add($"{pendingDoc.DocumentNumber}: {ex.Message}");
                logger.LogWarning(ex, "Error al renderizar asiento para {DocNumber}", pendingDoc.DocumentNumber);
            }
        }

        var batchNumber = $"BATCH-{DateTime.UtcNow:yyyyMMdd-HHmmss}";
        var batchRun = new AccountingBatchRun
        {
            TenantId = tenantId,
            BatchNumber = batchNumber,
            ExecutedAtUtc = DateTime.UtcNow,
            ExecutedBy = req.ExecutedBy ?? "contador@empresa.com",
            PeriodStart = req.PeriodStart.Kind == DateTimeKind.Unspecified
                ? DateTime.SpecifyKind(req.PeriodStart, DateTimeKind.Utc)
                : req.PeriodStart.ToUniversalTime(),
            PeriodEnd = req.PeriodEnd.Kind == DateTimeKind.Unspecified
                ? DateTime.SpecifyKind(req.PeriodEnd, DateTimeKind.Utc)
                : req.PeriodEnd.ToUniversalTime(),
            ModulesIncluded = string.Join(",", req.Modules ?? ["All"]),
            DocumentsProcessedCount = pending.Count,
            EntriesGeneratedCount = entriesGenerated,
            ErrorsCount = errorsCount,
            Status = errorsCount == 0 ? "Completed" : "CompletedWithWarnings",
            DurationSeconds = (decimal)sw.Elapsed.TotalSeconds,
            SummaryJson = JsonSerializer.Serialize(new { totalDebit, totalCredit, entriesGenerated, errorsCount }, JsonOpts),
            LogDetailsJson = JsonSerializer.Serialize(exceptions, JsonOpts)
        };

        db.BatchRuns.Add(batchRun);
        await db.SaveChangesAsync(ct);
        sw.Stop();

        return new BatchPostingExecuteResponse(
            batchRun.Id,
            batchNumber,
            pending.Count,
            entriesGenerated,
            errorsCount,
            totalDebit,
            totalCredit,
            batchRun.Status,
            (decimal)sw.Elapsed.TotalSeconds,
            entryNumbers,
            exceptions);
    }

    public static async Task<IResult> RevertAsync(
        Guid batchRunId,
        TenantId tenantId,
        AccountingDbContext db,
        CancellationToken ct)
    {
        var run = await db.BatchRuns.FirstOrDefaultAsync(r => r.Id == batchRunId && r.TenantId == tenantId, ct);
        if (run is null)
            return Results.NotFound(new { message = "Lote de contabilización no encontrado." });

        if (run.Status == "Reverted")
            return Results.BadRequest(new { message = "Este lote ya ha sido revertido previamente." });

        var postedDocs = await db.PendingDocuments
            .Where(d => d.TenantId == tenantId
                        && d.Status == AccountingPendingDocumentStatuses.Posted
                        && d.JournalEntryId != null)
            .ToListAsync(ct);

        var entryIds = await db.JournalEntries
            .Where(j => j.TenantId == tenantId
                        && j.CreatedBy == "Accounting.TemplateEngine"
                        && j.CreatedAtUtc >= run.ExecutedAtUtc.AddSeconds(-5)
                        && j.CreatedAtUtc <= run.ExecutedAtUtc.AddSeconds((double)run.DurationSeconds + 5))
            .Select(j => j.Id)
            .ToListAsync(ct);

        var entryIdSet = new HashSet<Guid>(entryIds);

        int reverted = 0;
        foreach (var doc in postedDocs)
        {
            if (doc.JournalEntryId.HasValue && entryIdSet.Contains(doc.JournalEntryId.Value))
            {
                var entry = await db.JournalEntries.Include(e => e.Lines)
                    .FirstOrDefaultAsync(e => e.Id == doc.JournalEntryId.Value, ct);
                if (entry is not null)
                {
                    db.JournalEntryLines.RemoveRange(entry.Lines);
                    db.JournalEntries.Remove(entry);
                }

                doc.Status = AccountingPendingDocumentStatuses.Pending;
                doc.JournalEntryId = null;
                doc.LastError = $"Revertido por lote {run.BatchNumber}.";
                doc.UpdatedAtUtc = DateTime.UtcNow;
                reverted++;
            }
        }

        run.Status = "Reverted";
        await db.SaveChangesAsync(ct);

        return Results.Ok(new
        {
            message = $"Lote {run.BatchNumber} revertido correctamente. {reverted} asiento(s) eliminado(s), documentos devueltos a Pending."
        });
    }

    private static async Task<List<AccountingPendingDocument>> LoadPendingDocumentsAsync(
        AccountingDbContext db, TenantId tenantId,
        DateTime periodStart, DateTime periodEnd, List<string>? modules, CancellationToken ct)
    {
        var start = periodStart.Kind == DateTimeKind.Unspecified
            ? DateTime.SpecifyKind(periodStart, DateTimeKind.Utc) : periodStart.ToUniversalTime();
        var end = periodEnd.Kind == DateTimeKind.Unspecified
            ? DateTime.SpecifyKind(periodEnd, DateTimeKind.Utc) : periodEnd.ToUniversalTime();

        var query = db.PendingDocuments
            .Where(d => d.TenantId == tenantId
                        && (d.Status == AccountingPendingDocumentStatuses.Pending
                            || d.Status == AccountingPendingDocumentStatuses.Error)
                        && d.DocumentDateUtc >= start
                        && d.DocumentDateUtc <= end);

        if (modules is not null && modules.Count > 0 && !modules.Contains("All", StringComparer.OrdinalIgnoreCase))
        {
            query = query.Where(d => modules.Contains(d.SourceModule));
        }

        return await query.OrderBy(d => d.DocumentDateUtc).ToListAsync(ct);
    }

    private static PostableDocument? DeserializePayload(AccountingPendingDocument pendingDoc)
    {
        try
        {
            return JsonSerializer.Deserialize<PostableDocument>(pendingDoc.PayloadJson, JsonOpts);
        }
        catch
        {
            return null;
        }
    }
}
