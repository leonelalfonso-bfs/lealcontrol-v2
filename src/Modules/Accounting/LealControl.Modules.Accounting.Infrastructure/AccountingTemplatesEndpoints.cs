using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Security;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Accounting.Contracts.Posting;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace LealControl.Modules.Accounting.Infrastructure;

internal static class AccountingTemplatesEndpoints
{
    public static RouteGroupBuilder MapAccountingTemplatesEndpoints(this RouteGroupBuilder group)
    {
        // ====================================================================
        // 15. Asientos Modelos (Journal Templates CRUD & Catalogue)
        // ====================================================================
        group.MapGet("/templates", async (
            [FromQuery] string? sourceModule,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            await db.EnsureAccountingTablesAsync(ct);
            await db.SeedDefaultChartOfAccountsAsync(tenantId, ct);
            await db.SeedDefaultJournalTemplatesAsync(tenantId, ct);

            var query = db.JournalTemplates
                .AsNoTracking()
                .Include(t => t.Lines)
                .Where(t => t.TenantId == tenantId);

            if (!string.IsNullOrWhiteSpace(sourceModule))
            {
                query = query.Where(t => t.SourceModule.ToLower() == sourceModule.ToLower());
            }

            var templates = await query.OrderBy(t => t.Code).ToListAsync(ct);
            var dtos = templates.Select(t => new JournalTemplateDto(
                t.Id,
                t.Code,
                t.Name,
                t.SourceModule,
                t.DocumentType,
                t.Description,
                t.Status,
                t.EntrySeries,
                t.CreatedAtUtc,
                t.UpdatedAtUtc,
                t.Lines.OrderBy(l => l.OrderIndex).Select(l => new JournalTemplateLineDto(
                    l.Id,
                    l.OrderIndex,
                    l.AccountId,
                    l.AccountCode,
                    l.AccountName,
                    l.DebitCredit,
                    l.AmountSource,
                    l.Condition,
                    l.IsInvertedSign,
                    l.MemoTemplate
                )).ToList()
            )).ToList();

            return Results.Ok(dtos);
        });

        group.MapGet("/templates/{id:guid}", async (
            Guid id,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            var t = await db.JournalTemplates
                .AsNoTracking()
                .Include(x => x.Lines)
                .FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);

            if (t == null) return Results.NotFound(new { message = "Asiento Modelo no encontrado." });

            var dto = new JournalTemplateDto(
                t.Id,
                t.Code,
                t.Name,
                t.SourceModule,
                t.DocumentType,
                t.Description,
                t.Status,
                t.EntrySeries,
                t.CreatedAtUtc,
                t.UpdatedAtUtc,
                t.Lines.OrderBy(l => l.OrderIndex).Select(l => new JournalTemplateLineDto(
                    l.Id,
                    l.OrderIndex,
                    l.AccountId,
                    l.AccountCode,
                    l.AccountName,
                    l.DebitCredit,
                    l.AmountSource,
                    l.Condition,
                    l.IsInvertedSign,
                    l.MemoTemplate
                )).ToList()
            );

            return Results.Ok(dto);
        });

        group.MapPost("/templates", async (
            CreateJournalTemplateRequest req,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(req.Code) || string.IsNullOrWhiteSpace(req.Name))
            {
                return Results.BadRequest(new { message = "El código y el nombre del asiento modelo son obligatorios." });
            }

            var tenantId = tenantContext.TenantId;
            await db.EnsureAccountingTablesAsync(ct);

            var exists = await db.JournalTemplates.AnyAsync(t => t.TenantId == tenantId && t.Code == req.Code.Trim(), ct);
            if (exists)
            {
                return Results.BadRequest(new { message = $"Ya existe un asiento modelo con el código {req.Code}." });
            }

            var template = new JournalTemplate
            {
                TenantId = tenantId,
                Code = req.Code.Trim(),
                Name = req.Name.Trim(),
                SourceModule = req.SourceModule ?? "Sales",
                DocumentType = req.DocumentType ?? "InvoiceA",
                Description = req.Description ?? string.Empty,
                Status = req.Status ?? "Active",
                EntrySeries = req.EntrySeries ?? "General",
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow
            };

            if (req.Lines != null)
            {
                int idx = 1;
                foreach (var l in req.Lines)
                {
                    template.Lines.Add(new JournalTemplateLine
                    {
                        TemplateId = template.Id,
                        TenantId = tenantId,
                        OrderIndex = l.OrderIndex > 0 ? l.OrderIndex : idx++,
                        AccountId = l.AccountId,
                        AccountCode = l.AccountCode.Trim(),
                        AccountName = l.AccountName.Trim(),
                        DebitCredit = l.DebitCredit ?? "Debit",
                        AmountSource = l.AmountSource ?? "Total",
                        Condition = l.Condition ?? "Always",
                        IsInvertedSign = l.IsInvertedSign,
                        MemoTemplate = l.MemoTemplate
                    });
                }
            }

            db.JournalTemplates.Add(template);
            await db.SaveChangesAsync(ct);

            return Results.Created($"/api/v1/accounting/templates/{template.Id}", template);
        });

        group.MapPut("/templates/{id:guid}", async (
            Guid id,
            UpdateJournalTemplateRequest req,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            var template = await db.JournalTemplates
                .Include(t => t.Lines)
                .FirstOrDefaultAsync(t => t.Id == id && t.TenantId == tenantId, ct);

            if (template == null) return Results.NotFound(new { message = "Asiento Modelo no encontrado." });

            if (!string.IsNullOrWhiteSpace(req.Code) && req.Code.Trim() != template.Code)
            {
                var codeExists = await db.JournalTemplates.AnyAsync(t => t.TenantId == tenantId && t.Code == req.Code.Trim() && t.Id != id, ct);
                if (codeExists)
                {
                    return Results.BadRequest(new { message = $"Ya existe otro asiento modelo con el código {req.Code}." });
                }
                template.Code = req.Code.Trim();
            }

            template.Name = req.Name.Trim();
            template.SourceModule = req.SourceModule ?? template.SourceModule;
            template.DocumentType = req.DocumentType ?? template.DocumentType;
            template.Description = req.Description ?? string.Empty;
            template.Status = req.Status ?? template.Status;
            template.EntrySeries = req.EntrySeries ?? template.EntrySeries;
            template.UpdatedAtUtc = DateTime.UtcNow;

            // Replace Lines
            db.JournalTemplateLines.RemoveRange(template.Lines);
            template.Lines.Clear();

            if (req.Lines != null)
            {
                int idx = 1;
                foreach (var l in req.Lines)
                {
                    template.Lines.Add(new JournalTemplateLine
                    {
                        TemplateId = template.Id,
                        TenantId = tenantId,
                        OrderIndex = l.OrderIndex > 0 ? l.OrderIndex : idx++,
                        AccountId = l.AccountId,
                        AccountCode = l.AccountCode.Trim(),
                        AccountName = l.AccountName.Trim(),
                        DebitCredit = l.DebitCredit ?? "Debit",
                        AmountSource = l.AmountSource ?? "Total",
                        Condition = l.Condition ?? "Always",
                        IsInvertedSign = l.IsInvertedSign,
                        MemoTemplate = l.MemoTemplate
                    });
                }
            }

            await db.SaveChangesAsync(ct);
            return Results.Ok(template);
        });

        group.MapDelete("/templates/{id:guid}", async (
            Guid id,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            var template = await db.JournalTemplates.FirstOrDefaultAsync(t => t.Id == id && t.TenantId == tenantId, ct);
            if (template == null) return Results.NotFound(new { message = "Asiento Modelo no encontrado." });

            db.JournalTemplates.Remove(template);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { message = "Asiento Modelo eliminado correctamente." });
        });

        group.MapGet("/templates/variables", () =>
        {
            var variables = new List<AmountSourceVariableInfo>
            {
                new("Total", "Total Comprobante", "Importe total bruto del comprobante", "General", new() { "Sales", "Purchases", "Finance" }),
                new("Net21", "Subtotal Neto Gravado (21%)", "Neto gravado al 21% de IVA", "Impuestos / IVA", new() { "Sales", "Purchases" }),
                new("Net105", "Subtotal Neto Gravado (10.5%)", "Neto gravado al 10.5% de IVA", "Impuestos / IVA", new() { "Sales", "Purchases" }),
                new("Net27", "Subtotal Neto Gravado (27%)", "Neto gravado al 27% de IVA", "Impuestos / IVA", new() { "Sales", "Purchases" }),
                new("NetExempt", "Subtotal Exento / No Gravado", "Conceptos exentos o no gravados", "Impuestos / IVA", new() { "Sales", "Purchases" }),
                new("TotalNet", "Total Neto Gravado (Suma)", "Suma de todos los netos", "General", new() { "Sales", "Purchases" }),
                new("Vat21", "IVA Débito / Crédito Fiscal (21%)", "IVA liquidado al 21%", "Impuestos / IVA", new() { "Sales", "Purchases" }),
                new("Vat105", "IVA Débito / Crédito Fiscal (10.5%)", "IVA liquidado al 10.5%", "Impuestos / IVA", new() { "Sales", "Purchases" }),
                new("Vat27", "IVA Débito / Crédito Fiscal (27%)", "IVA liquidado al 27%", "Impuestos / IVA", new() { "Sales", "Purchases" }),
                new("TotalVat", "Total IVA Liquidado (Suma)", "Suma total de IVA", "Impuestos / IVA", new() { "Sales", "Purchases" }),
                new("PerceptionIibb", "Percepción IIBB", "Percepción de Ingresos Brutos", "Percepciones", new() { "Sales", "Purchases" }),
                new("PerceptionVat", "Percepción IVA", "Percepción impositiva de IVA", "Percepciones", new() { "Sales", "Purchases" }),
                new("PerceptionEarnings", "Percepción Ganancias", "Percepción impositiva de Ganancias", "Percepciones", new() { "Sales", "Purchases" }),
                new("Withholdings", "Retenciones Sufridas / Practicadas", "Retenciones de impuestos en cobros o pagos", "Retenciones", new() { "Finance", "Sales", "Purchases" }),
                new("PaymentAmount", "Importe Medio de Pago (Caja / Banco)", "Importe neto pagado o cobrado", "Tesorería", new() { "Finance" }),
                new("CmvCost", "Costo Mercadería Vendida (CMV)", "Costo de valuación de inventario", "Stock", new() { "Sales", "Inventory" }),
                new("StockValueAdjustment", "Valor de Ajuste de Stock", "Importe monetario de ajuste de inventario", "Stock", new() { "Inventory" })
            };

            return Results.Ok(variables);
        });

        return group;
    }
}
