using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Accounting.Contracts.Posting;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Accounting.Infrastructure;

/// <summary>
/// Resultado de la selección de plantilla para un documento pendiente.
/// </summary>
public sealed record TemplateSelectionResult(
    JournalTemplate? Template,
    string MatchReason,
    string? Warning);

/// <summary>
/// Selecciona la plantilla de asiento modelo que corresponde a un <see cref="PostableDocument"/>.
/// Prioridad:
///   1. <see cref="PostableDocument.TemplateHint"/> (código exacto, p.ej. "AM-FIN-01" desde FinancialConcept.JournalTemplateCode).
///   2. SourceModule + DocumentType exacto.
///   3. SourceModule + DocumentType = "All".
///   4. Ninguna → warning "sin modelo".
/// Solo considera plantillas con Status = "Active".
/// </summary>
public static class JournalTemplateSelector
{
    public static async Task<TemplateSelectionResult> SelectAsync(
        PostableDocument document,
        TenantId tenantId,
        AccountingDbContext db,
        CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(document);

        var templates = await db.JournalTemplates
            .AsNoTracking()
            .Include(t => t.Lines)
            .Where(t => t.TenantId == tenantId && t.Status == "Active")
            .ToListAsync(ct);

        return Select(document, templates);
    }

    public static TemplateSelectionResult Select(
        PostableDocument document,
        IReadOnlyList<JournalTemplate> activeTemplates)
    {
        ArgumentNullException.ThrowIfNull(document);
        if (activeTemplates is null || activeTemplates.Count == 0)
        {
            return new TemplateSelectionResult(null, "NoTemplates",
                $"No hay asientos modelo activos para el tenant.");
        }

        // 1. TemplateHint (código exacto del concepto financiero)
        if (!string.IsNullOrWhiteSpace(document.TemplateHint))
        {
            var byHint = activeTemplates.FirstOrDefault(t =>
                string.Equals(t.Code, document.TemplateHint.Trim(), StringComparison.OrdinalIgnoreCase));

            if (byHint is not null)
                return new TemplateSelectionResult(byHint, "TemplateHint", null);
        }

        // 2. SourceModule + DocumentType exacto
        var byModuleAndType = activeTemplates
            .Where(t =>
                string.Equals(t.SourceModule, document.SourceModule, StringComparison.OrdinalIgnoreCase)
                && string.Equals(t.DocumentType, document.DocumentType, StringComparison.OrdinalIgnoreCase))
            .ToList();

        if (byModuleAndType.Count == 1)
            return new TemplateSelectionResult(byModuleAndType[0], "ModuleAndType", null);

        if (byModuleAndType.Count > 1)
        {
            return new TemplateSelectionResult(byModuleAndType[0], "ModuleAndType",
                $"Hay {byModuleAndType.Count} plantillas para {document.SourceModule}/{document.DocumentType}; se usó la primera ({byModuleAndType[0].Code}).");
        }

        // 3. SourceModule + DocumentType = "All"
        var byModuleAll = activeTemplates.FirstOrDefault(t =>
            string.Equals(t.SourceModule, document.SourceModule, StringComparison.OrdinalIgnoreCase)
            && string.Equals(t.DocumentType, AccountingDocumentTypes.All, StringComparison.OrdinalIgnoreCase));

        if (byModuleAll is not null)
            return new TemplateSelectionResult(byModuleAll, "ModuleAll", null);

        // 4. Sin match
        return new TemplateSelectionResult(null, "NoMatch",
            $"No se encontró asiento modelo para {document.SourceModule}/{document.DocumentType}. El documento queda pendiente.");
    }
}
