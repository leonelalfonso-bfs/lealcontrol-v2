using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Security;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Finance.Infrastructure;

public sealed record BankImportRequest(Guid AccountId, string CsvContent, string? FileName = null);
public sealed record BankImportRow(DateTime OperationDateUtc, decimal Amount, FinancialMovementKind Kind, string Description, string? ExternalReference, decimal? ReportedBalance, string? Error = null);
public sealed record ReconcileMovementRequest(string EntityType, Guid EntityId);

public static class FinanceImport
{
    public static IEndpointRouteBuilder MapFinanceImportEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/finance/imports").WithTags("Finance Imports").RequirePolicyOnWrites("RequireFinance");
        group.MapPost("/bank/preview", (BankImportRequest request) => Results.Ok(Parse(request.CsvContent)));
        group.MapPost("/bank/confirm", async (BankImportRequest request, FinanceDbContext db, LealControl.BuildingBlocks.Tenancy.ITenantContext tenant, HttpContext http, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var account = await db.Accounts.SingleOrDefaultAsync(x => x.Id == request.AccountId && x.TenantId == tenantId && x.IsActive, ct);
            if (account is null)
                return Results.NotFound("Cuenta financiera inexistente.");

            var fileHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(request.CsvContent))).ToLowerInvariant();
            var priorImport = await db.BankStatementImports.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.AccountId == request.AccountId && x.FileHash == fileHash)
                .Select(x => new { x.CreatedAtUtc })
                .FirstOrDefaultAsync(ct);
            if (priorImport is not null)
            {
                return Results.Conflict(new
                {
                    Message = $"Este archivo ya fue importado el {priorImport.CreatedAtUtc.ToLocalTime():dd/MM/yyyy HH:mm}."
                });
            }

            var parsed = Parse(request.CsvContent);
            var valid = parsed.Where(x => x.Error is null).ToList();
            var rejected = parsed.Count(x => x.Error is not null);

            await FinanceConcepts.EnsureBaseConceptsAsync(db, tenantId, ct);

            var importId = Guid.NewGuid();
            var existing = await db.Movements
                .Where(x => x.TenantId == tenantId && x.AccountId == request.AccountId)
                .OrderBy(x => x.CreatedAtUtc)
                .ToListAsync(ct);

            var existingByFingerprint = existing
                .GroupBy(MovementFingerprint)
                .ToDictionary(g => g.Key, g => new Queue<FinancialMovement>(g));

            int updatedCount = 0;
            int freshCount = 0;
            int duplicateCount = 0;

            foreach (var row in valid)
            {
                var fingerprint = RowFingerprint(request.AccountId, row);
                if (existingByFingerprint.TryGetValue(fingerprint, out var queue) && queue.Count > 0)
                {
                    var match = queue.Dequeue();
                    if (row.Description.Contains("Titular:") || !string.IsNullOrWhiteSpace(row.ExternalReference))
                    {
                        match.Description = row.Description;
                        if (!string.IsNullOrWhiteSpace(row.ExternalReference)) match.ExternalReference = row.ExternalReference;
                        if (row.ReportedBalance.HasValue) match.ReportedBalance = row.ReportedBalance;
                        await FinanceConcepts.ApplySuggestionAsync(db, tenantId, match, ct);
                        updatedCount++;
                    }
                    else
                    {
                        duplicateCount++;
                    }

                    continue;
                }

                var movement = new FinancialMovement
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    AccountId = request.AccountId,
                    Kind = row.Kind,
                    Amount = row.Amount,
                    Currency = account.Currency,
                    OperationDateUtc = row.OperationDateUtc,
                    Description = row.Description,
                    ExternalReference = row.ExternalReference,
                    ReportedBalance = row.ReportedBalance,
                    Origin = FinancialMovementOrigin.Imported,
                    ImportId = importId,
                    CreatedAtUtc = DateTime.UtcNow
                };
                await FinanceConcepts.ApplySuggestionAsync(db, tenantId, movement, ct);
                db.Movements.Add(movement);
                existing.Add(movement);
                freshCount++;
            }

            var orderedValid = valid.OrderBy(x => x.OperationDateUtc).ToList();
            var firstRow = orderedValid.FirstOrDefault();
            var lastRow = orderedValid.LastOrDefault();
            decimal? declaredOpening = null;
            if (firstRow is not null && firstRow.ReportedBalance.HasValue)
            {
                declaredOpening = firstRow.Kind == FinancialMovementKind.Credit
                    ? firstRow.ReportedBalance.Value - firstRow.Amount
                    : firstRow.ReportedBalance.Value + firstRow.Amount;
            }

            var declaredClosing = lastRow?.ReportedBalance;
            var creditTotal = existing.Where(x => x.Kind == FinancialMovementKind.Credit).Sum(x => x.Amount);
            var debitTotal = existing.Where(x => x.Kind == FinancialMovementKind.Debit).Sum(x => x.Amount);
            var computedClosing = account.OpeningBalance + creditTotal - debitTotal;

            var balanced = !declaredClosing.HasValue || Math.Abs(declaredClosing.Value - computedClosing) <= 0.01m;
            var importBatch = new BankStatementImport
            {
                Id = importId,
                TenantId = tenantId,
                AccountId = request.AccountId,
                FileName = string.IsNullOrWhiteSpace(request.FileName) ? null : request.FileName.Trim(),
                FileHash = fileHash,
                PeriodStart = orderedValid.FirstOrDefault()?.OperationDateUtc,
                PeriodEnd = orderedValid.LastOrDefault()?.OperationDateUtc,
                DeclaredOpeningBalance = declaredOpening,
                DeclaredClosingBalance = declaredClosing,
                ComputedClosingBalance = computedClosing,
                RowsTotal = parsed.Count,
                RowsImported = freshCount,
                RowsDuplicated = duplicateCount,
                RowsRejected = rejected,
                Status = balanced ? "Balanced" : "Unbalanced",
                CreatedAtUtc = DateTime.UtcNow,
                CreatedBy = http.User.Identity?.Name
            };
            db.BankStatementImports.Add(importBatch);

            await db.SaveChangesAsync(ct);

            var suggestedMatches = await FinanceReconciliationMatcher.FindSuggestionsAsync(
                db, tenantId, request.AccountId, importId, ct);

            return Results.Ok(new
            {
                ImportId = importId,
                Imported = freshCount,
                Updated = updatedCount,
                Duplicates = duplicateCount,
                Rejected = rejected,
                Status = importBatch.Status,
                DeclaredClosingBalance = declaredClosing,
                ComputedClosingBalance = computedClosing,
                BalanceDifference = declaredClosing.HasValue ? declaredClosing.Value - computedClosing : (decimal?)null,
                SuggestedMatches = suggestedMatches
            });
        });

        var finance = endpoints.MapGroup("/api/v1/finance").WithTags("Finance").RequirePolicyOnWrites("RequireFinance");
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
                        join concept in db.FinancialConcepts.AsNoTracking() on movement.ConceptId equals concept.Id
                        join account in db.Accounts.AsNoTracking() on movement.AccountId equals account.Id into accounts
                        from account in accounts.DefaultIfEmpty()
                        where movement.TenantId == tenantId
                              && (accountId == null || movement.AccountId == accountId.Value)
                              && movement.Kind == FinancialMovementKind.Credit
                              && movement.Origin == FinancialMovementOrigin.Imported
                              && movement.ClassificationStatus == FinancialClassificationStatus.Confirmed
                              && movement.ConceptId != null
                              && concept.UsableIn == FinancialConceptUsableIn.Receipt
                              && movement.ReconciliationStatus != FinancialReconciliationStatus.Reconciled
                        select new
                        {
                            movement.Id,
                            movement.AccountId,
                            AccountName = account != null ? account.Name : "",
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

        finance.MapGet("/payments/available-movements", async (Guid? accountId, Guid? conceptId, FinanceDbContext db, LealControl.BuildingBlocks.Tenancy.ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var query = from movement in db.Movements.AsNoTracking()
                        join concept in db.FinancialConcepts.AsNoTracking() on movement.ConceptId equals concept.Id
                        join account in db.Accounts.AsNoTracking() on movement.AccountId equals account.Id into accounts
                        from account in accounts.DefaultIfEmpty()
                        where movement.TenantId == tenantId
                              && (accountId == null || movement.AccountId == accountId.Value)
                              && movement.Kind == FinancialMovementKind.Debit
                              && movement.Origin == FinancialMovementOrigin.Imported
                              && movement.ClassificationStatus == FinancialClassificationStatus.Confirmed
                              && movement.ConceptId != null
                              && concept.UsableIn == FinancialConceptUsableIn.PaymentOrder
                              && movement.ReconciliationStatus != FinancialReconciliationStatus.Reconciled
                        select new
                        {
                            movement.Id,
                            movement.AccountId,
                            AccountName = account != null ? account.Name : "",
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
        FinanceExtras.MapFinanceExtrasEndpoints(endpoints);
        return endpoints;
    }

    public static List<BankImportRow> Parse(string content)
    {
        var records = ReadCsvRecords(content);
        if (records.Count < 2) return [];

        var header = records[0].Select(Normalize).ToList();
        
        var dateIndex = Index(header, "fecha", "f. operacion", "f. oper.", "fecha operacion", "f. valor", "fecha valor", "date");
        var descriptionIndex = Index(header, "descripción", "descripcion", "detalle", "concepto", "movimiento", "leyenda", "motivo", "description");
        var originIndex = Index(header, "origen", "canal", "sucursal", "origin");
        var debitIndex = Index(header, "débitos", "debitos", "debito", "débito", "importe debito", "importe débito", "egreso", "egresos", "cargo", "debit");
        var creditIndex = Index(header, "créditos", "creditos", "credito", "crédito", "importe credito", "importe crédito", "ingreso", "ingresos", "abono", "credit");
        var balanceIndex = Index(header, "saldo", "saldo contable", "saldo disponible", "balance");
        var referenceIndex = Index(header, "número de comprobante", "numero de comprobante", "referencia", "comprobante", "nro comprobante", "nro de comprobante", "nro operacion", "nro de operacion", "id transacción", "id transaccion", "reference");

        // Specific Banco Galicia columns
        var leyendas1Index = Index(header, "leyendas adicionales1", "leyendas adicionales 1", "leyenda adicional 1", "titular", "ordenante", "destinatario / remitente", "remitente", "beneficiario", "nombre", "razon social", "razón social", "contraparte", "cuenta origen", "nombre y apellido", "titular origen");
        var leyendas2Index = Index(header, "leyendas adicionales2", "leyendas adicionales 2", "leyenda adicional 2", "cuit / cuil", "cuit", "cuil", "cuit/cuil", "documento", "cuit/cuil ordenante", "cuit/cuil beneficiario", "cuit ordenante");
        var leyendas3Index = Index(header, "leyendas adicionales3", "leyendas adicionales 3", "leyenda adicional 3", "informacion adicional", "información adicional", "observaciones", "datos adicionales", "detalle ampliado", "motivo", "cbu / cvu", "cbu", "cvu", "cbu/cvu", "cuenta origen cbu");
        var leyendas4Index = Index(header, "leyendas adicionales4", "leyendas adicionales 4", "leyenda adicional 4");
        var obsClienteIndex = Index(header, "observaciones cliente", "observaciones");
        var terminalIndex = Index(header, "número de terminal", "numero de terminal");
        var tipoMovIndex = Index(header, "tipo de movimiento");

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
            var titular = Cell(cells, leyendas1Index);
            var cuit = Cell(cells, leyendas2Index);
            var extra3 = Cell(cells, leyendas3Index);
            var extra4 = Cell(cells, leyendas4Index);
            var obs = Cell(cells, obsClienteIndex);

            var descParts = new List<string>();
            if (!string.IsNullOrWhiteSpace(descRaw)) descParts.Add(descRaw);
            if (!string.IsNullOrWhiteSpace(titular)) descParts.Add($"Titular: {titular}");
            if (!string.IsNullOrWhiteSpace(cuit)) descParts.Add($"CUIT: {cuit}");
            if (!string.IsNullOrWhiteSpace(extra3) && !extra3.Equals("VARIOS", StringComparison.OrdinalIgnoreCase) && !descParts.Contains(extra3))
                descParts.Add(extra3);
            if (!string.IsNullOrWhiteSpace(extra4) && !descParts.Contains(extra4))
                descParts.Add(extra4);
            if (!string.IsNullOrWhiteSpace(origin) && !descParts.Contains(origin))
                descParts.Add($"Canal: {origin}");
            if (!string.IsNullOrWhiteSpace(obs) && !descParts.Contains(obs))
                descParts.Add(obs);

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
        value.Trim().ToLowerInvariant().Replace("\u00a0", " ").Replace("\"", "").Replace("'", "").Replace("\ufeff", "");

    private static decimal ParseDecimal(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return 0;
        var normalized = raw.Trim().Replace("$", "").Replace(" ", "").Replace(".", "").Replace(",", ".");
        return decimal.TryParse(normalized, NumberStyles.Any, CultureInfo.InvariantCulture, out var value) ? value : 0;
    }

    private static decimal? ParseNullableDecimal(string raw) =>
        string.IsNullOrWhiteSpace(raw) ? null : ParseDecimal(raw);

    private static string RowFingerprint(Guid accountId, BankImportRow row) =>
        BuildFingerprint(accountId, row.OperationDateUtc.Date, row.Amount, row.Kind, row.ExternalReference, row.Description);

    private static string MovementFingerprint(FinancialMovement movement) =>
        BuildFingerprint(movement.AccountId, movement.OperationDateUtc.Date, movement.Amount, movement.Kind, movement.ExternalReference, movement.Description);

    private static string BuildFingerprint(
        Guid accountId,
        DateTime date,
        decimal amount,
        FinancialMovementKind kind,
        string? externalReference,
        string description)
    {
        var reference = NormalizeReference(externalReference);
        var descriptionHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(description.Trim().ToLowerInvariant())))[..16];
        return $"{accountId:N}|{date:yyyy-MM-dd}|{amount}|{(int)kind}|{reference}|{descriptionHash}";
    }

    private static string NormalizeReference(string? reference) =>
        string.IsNullOrWhiteSpace(reference) ? "" : reference.Trim().ToUpperInvariant();
}
