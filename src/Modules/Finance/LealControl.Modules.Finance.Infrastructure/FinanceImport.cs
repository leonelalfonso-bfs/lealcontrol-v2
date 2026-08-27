using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Finance.Infrastructure;

public sealed record BankImportRequest(Guid AccountId, string CsvContent);
public sealed record BankImportRow(DateTime OperationDateUtc, decimal Amount, FinancialMovementKind Kind, string Description, string? ExternalReference, decimal? ReportedBalance, string? Error = null);
public sealed record ReconcileMovementRequest(string EntityType, Guid EntityId);

public static class FinanceImport
{
    public static IEndpointRouteBuilder MapFinanceImportEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/finance/imports").WithTags("Finance Imports");
        group.MapPost("/bank/preview", (BankImportRequest request) => Results.Ok(Parse(request.CsvContent)));
        group.MapPost("/bank/confirm", async (BankImportRequest request, FinanceDbContext db, LealControl.BuildingBlocks.Tenancy.ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            if (!await db.Accounts.AnyAsync(x => x.Id == request.AccountId && x.TenantId == tenantId && x.IsActive, ct))
                return Results.NotFound("Cuenta financiera inexistente.");

            var parsed = Parse(request.CsvContent);
            var valid = parsed.Where(x => x.Error is null).ToList();
            var existing = await db.Movements.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.AccountId == request.AccountId)
                .Select(x => new { x.OperationDateUtc, x.Amount, x.Kind, x.Description, x.ExternalReference })
                .ToListAsync(ct);

            var fresh = valid.Where(row => !existing.Any(item => 
                item.OperationDateUtc.Date == row.OperationDateUtc.Date && 
                item.Amount == row.Amount && 
                item.Kind == row.Kind && 
                (string.IsNullOrWhiteSpace(row.ExternalReference) ? item.Description == row.Description : item.ExternalReference == row.ExternalReference)
            )).ToList();

            await FinanceConcepts.EnsureBaseConceptsAsync(db, tenantId, ct);
            foreach (var row in fresh)
            {
                var movement = new FinancialMovement
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    AccountId = request.AccountId,
                    Kind = row.Kind,
                    Amount = row.Amount,
                    Currency = "ARS",
                    OperationDateUtc = row.OperationDateUtc,
                    Description = row.Description,
                    ExternalReference = row.ExternalReference,
                    ReportedBalance = row.ReportedBalance,
                    CreatedAtUtc = DateTime.UtcNow
                };
                await FinanceConcepts.ApplySuggestionAsync(db, tenantId, movement, ct);
                db.Movements.Add(movement);
            }
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { Imported = fresh.Count, Duplicates = valid.Count - fresh.Count, Rejected = parsed.Count(x => x.Error is not null) });
        });

        var finance = endpoints.MapGroup("/api/v1/finance").WithTags("Finance");
        finance.MapGet("/accounts/{accountId:guid}/movements", async (Guid accountId, FinanceDbContext db, LealControl.BuildingBlocks.Tenancy.ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            if (!await db.Accounts.AnyAsync(x => x.Id == accountId && x.TenantId == tenantId, ct))
                return Results.NotFound("Cuenta financiera inexistente.");

            var rows = await db.Movements.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.AccountId == accountId)
                .OrderByDescending(x => x.OperationDateUtc)
                .ThenByDescending(x => x.CreatedAtUtc)
                .Take(500)
                .Select(x => new { x.Id, x.OperationDateUtc, x.Kind, x.Amount, x.Currency, x.Description, x.ExternalReference, x.TransferId, x.ReconciliationStatus, x.LinkedEntityType, x.LinkedEntityId })
                .ToListAsync(ct);
            return Results.Ok(rows);
        });

        finance.MapGet("/collections/available-movements", async (Guid? accountId, Guid? conceptId, FinanceDbContext db, LealControl.BuildingBlocks.Tenancy.ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var query = from movement in db.Movements.AsNoTracking()
                        join concept in db.FinancialConcepts.AsNoTracking() on movement.ConceptId equals concept.Id into concepts
                        from concept in concepts.DefaultIfEmpty()
                        where movement.TenantId == tenantId
                              && (accountId == null || movement.AccountId == accountId.Value)
                              && movement.Kind == FinancialMovementKind.Credit
                              && movement.ReconciliationStatus != FinancialReconciliationStatus.Reconciled
                        select new
                        {
                            movement.Id,
                            movement.AccountId,
                            movement.OperationDateUtc,
                            movement.Amount,
                            movement.Currency,
                            movement.Description,
                            movement.ExternalReference,
                            movement.ReconciliationStatus,
                            movement.ConceptId,
                            ConceptName = concept != null ? concept.Name : "Sin clasificar",
                            ConceptCode = concept != null ? concept.Code : null,
                            movement.ClassificationStatus
                        };

            if (conceptId.HasValue && conceptId.Value != Guid.Empty)
            {
                query = query.Where(x => x.ConceptId == conceptId.Value);
            }

            var rows = await query.OrderByDescending(x => x.OperationDateUtc).Take(200).ToListAsync(ct);
            return Results.Ok(rows);
        });

        finance.MapPost("/movements/{movementId:guid}/reconcile", async (Guid movementId, ReconcileMovementRequest request, FinanceDbContext db, LealControl.BuildingBlocks.Tenancy.ITenantContext tenant, CancellationToken ct) =>
        {
            var movement = await db.Movements.SingleOrDefaultAsync(x => x.Id == movementId && x.TenantId == tenant.TenantId.Value, ct);
            if (movement is null) return Results.NotFound("Movimiento inexistente.");
            if (string.IsNullOrWhiteSpace(request.EntityType) || request.EntityId == Guid.Empty)
                return Results.BadRequest("Indicá el tipo y el identificador del documento relacionado.");

            movement.ReconciliationStatus = FinancialReconciliationStatus.Reconciled;
            movement.LinkedEntityType = request.EntityType.Trim();
            movement.LinkedEntityId = request.EntityId;
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { movement.Id, movement.ReconciliationStatus, movement.LinkedEntityType, movement.LinkedEntityId });
        });

        FinanceConcepts.MapFinanceConceptEndpoints(endpoints);
        FinanceReceipts.MapFinanceReceiptEndpoints(endpoints);
        FinanceEcheqs.MapFinanceEcheqEndpoints(endpoints);
        FinancePayments.MapFinancePaymentEndpoints(endpoints);
        return endpoints;
    }

    private static List<BankImportRow> Parse(string content)
    {
        var records = ReadCsvRecords(content);
        if (records.Count < 2) return [];

        var header = records[0].Select(Normalize).ToList();
        
        var dateIndex = Index(header, "fecha", "f. operacion", "f. oper.", "fecha operacion", "f. valor", "fecha valor", "date");
        var descriptionIndex = Index(header, "descripción", "descripcion", "detalle", "concepto", "movimiento", "leyenda", "motivo", "description");
        var debitIndex = Index(header, "débitos", "debitos", "debito", "débito", "importe debito", "importe débito", "egreso", "egresos", "cargo", "debit");
        var creditIndex = Index(header, "créditos", "creditos", "credito", "crédito", "importe credito", "importe crédito", "ingreso", "ingresos", "abono", "credit");
        var balanceIndex = Index(header, "saldo", "saldo contable", "saldo disponible", "balance");
        var originIndex = Index(header, "origen", "canal", "sucursal", "origin");
        var conceptIndex = Index(header, "concepto", "tipo movimiento", "tipo de movimiento", "tipo");
        var referenceIndex = Index(header, "número de comprobante", "numero de comprobante", "referencia", "comprobante", "nro comprobante", "nro de comprobante", "nro operacion", "nro de operacion", "id transacción", "id transaccion", "reference");
        
        // Counterparty / Sender / CUIT / Reason extractions
        var counterpartyIndex = Index(header, "titular", "ordenante", "destinatario / remitente", "remitente", "beneficiario", "nombre", "razon social", "razón social", "contraparte", "cuenta origen", "nombre y apellido", "titular origen");
        var taxIdIndex = Index(header, "cuit / cuil", "cuit", "cuil", "cuit/cuil", "documento", "cuit/cuil ordenante", "cuit/cuil beneficiario", "cuit ordenante");
        var additionalInfoIndex = Index(header, "informacion adicional", "información adicional", "observaciones", "datos adicionales", "detalle ampliado", "motivo");
        var cbuIndex = Index(header, "cbu / cvu", "cbu", "cvu", "cbu/cvu", "cuenta origen cbu");

        var result = new List<BankImportRow>();
        foreach (var cells in records.Skip(1))
        {
            if (cells.All(string.IsNullOrWhiteSpace)) continue;

            var dateRaw = Cell(cells, dateIndex);
            if (!DateTime.TryParseExact(dateRaw, new[] { "dd/MM/yyyy", "d/M/yyyy", "yyyy-MM-dd", "dd-MM-yyyy", "dd/MM/yy" }, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var date))
            {
                result.Add(new(default, 0, FinancialMovementKind.Debit, string.Join(" | ", cells), null, null, "Fecha inválida."));
                continue;
            }

            var descRaw = Cell(cells, descriptionIndex);
            var origin = Cell(cells, originIndex);
            var concept = Cell(cells, conceptIndex);
            var counterparty = Cell(cells, counterpartyIndex);
            var taxId = Cell(cells, taxIdIndex);
            var addInfo = Cell(cells, additionalInfoIndex);
            var cbu = Cell(cells, cbuIndex);

            var descParts = new List<string>();
            if (!string.IsNullOrWhiteSpace(descRaw)) descParts.Add(descRaw);
            if (!string.IsNullOrWhiteSpace(counterparty) && !descRaw.Contains(counterparty, StringComparison.OrdinalIgnoreCase))
                descParts.Add($"Titular: {counterparty}");
            if (!string.IsNullOrWhiteSpace(taxId) && !descRaw.Contains(taxId, StringComparison.OrdinalIgnoreCase))
                descParts.Add($"CUIT: {taxId}");
            if (!string.IsNullOrWhiteSpace(origin) && !descRaw.Contains(origin, StringComparison.OrdinalIgnoreCase))
                descParts.Add($"Canal: {origin}");
            if (!string.IsNullOrWhiteSpace(addInfo) && !descRaw.Contains(addInfo, StringComparison.OrdinalIgnoreCase) && !descParts.Contains(addInfo))
                descParts.Add(addInfo);
            if (!string.IsNullOrWhiteSpace(cbu) && !descRaw.Contains(cbu, StringComparison.OrdinalIgnoreCase))
                descParts.Add($"CBU: {cbu}");
            if (!string.IsNullOrWhiteSpace(concept) && !descRaw.Contains(concept, StringComparison.OrdinalIgnoreCase) && !descParts.Contains(concept))
                descParts.Add(concept);

            var description = string.Join(" · ", descParts.Where(x => !string.IsNullOrWhiteSpace(x))).Trim();
            var reference = Cell(cells, referenceIndex);
            var reported = ParseNullableDecimal(Cell(cells, balanceIndex));
            var debit = ParseDecimal(Cell(cells, debitIndex));
            var credit = ParseDecimal(Cell(cells, creditIndex));
            var amount = debit > 0 ? debit : credit;
            var kind = debit > 0 ? FinancialMovementKind.Debit : FinancialMovementKind.Credit;

            if (debitIndex < 0 && creditIndex < 0 && cells.Count > 1)
            {
                amount = ParseDecimal(Cell(cells, 1));
                kind = amount < 0 ? FinancialMovementKind.Debit : FinancialMovementKind.Credit;
                amount = Math.Abs(amount);
            }

            if (amount == 0)
            {
                result.Add(new(date.ToUniversalTime(), 0, kind, description, reference, reported, "No se encontró débito ni crédito."));
                continue;
            }

            result.Add(new(date.ToUniversalTime(), amount, kind, string.IsNullOrWhiteSpace(description) ? "Movimiento bancario" : description, reference, reported));
        }
        return result;
    }

    private static List<List<string>> ReadCsvRecords(string content)
    {
        var result = new List<List<string>>();
        var row = new List<string>();
        var cell = new StringBuilder();
        var quoted = false;
        for (var i = 0; i < content.Length; i++)
        {
            var ch = content[i];
            if (ch == '"')
            {
                if (quoted && i + 1 < content.Length && content[i + 1] == '"')
                {
                    cell.Append('"');
                    i++;
                }
                else quoted = !quoted;
            }
            else if ((ch == ';' || (ch == ',' && !content.Contains(';'))) && !quoted)
            {
                row.Add(cell.ToString());
                cell.Clear();
            }
            else if ((ch == '\n' || ch == '\r') && !quoted)
            {
                if (ch == '\r' && i + 1 < content.Length && content[i + 1] == '\n') i++;
                row.Add(cell.ToString());
                cell.Clear();
                if (row.Any(x => !string.IsNullOrWhiteSpace(x))) result.Add(row);
                row = new();
            }
            else cell.Append(ch);
        }
        row.Add(cell.ToString());
        if (row.Any(x => !string.IsNullOrWhiteSpace(x))) result.Add(row);
        return result;
    }

    private static int Index(List<string> header, params string[] names) =>
        names.Select(name => header.IndexOf(Normalize(name))).FirstOrDefault(x => x >= 0, -1);

    private static string Cell(List<string> row, int index) =>
        index >= 0 && index < row.Count ? row[index].Trim() : "";

    private static string Normalize(string value) =>
        value.Trim().ToLowerInvariant().Replace("\u00a0", " ").Replace("\"", "").Replace("'", "");

    private static decimal ParseDecimal(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return 0;
        var normalized = raw.Trim().Replace("$", "").Replace(" ", "").Replace(".", "").Replace(",", ".");
        return decimal.TryParse(normalized, NumberStyles.Any, CultureInfo.InvariantCulture, out var value) ? value : 0;
    }

    private static decimal? ParseNullableDecimal(string raw) =>
        string.IsNullOrWhiteSpace(raw) ? null : ParseDecimal(raw);
}
