using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Security;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Finance.Infrastructure;

public sealed record BankImportRequest(Guid AccountId, string CsvContent, string? FileName = null, Guid? ProfileId = null);
public sealed record BankImportRow(
    DateTime OperationDateUtc,
    decimal Amount,
    FinancialMovementKind Kind,
    string Description,
    string? ExternalReference,
    decimal? ReportedBalance,
    string? Error = null);
public sealed record ReconcileMovementRequest(string EntityType, Guid EntityId);

public sealed record BankColumnMap(
    int? Date = null,
    int? Debit = null,
    int? Credit = null,
    int? Amount = null,
    int? Tipo = null,
    int? Description = null,
    int? Reference = null,
    int? Balance = null);

public sealed record SaveBankImportProfileRequest(
    Guid AccountId,
    string? Name,
    BankColumnMap ColumnMap,
    string? Delimiter = ";",
    string? DateFormat = null);

public static class FinanceImport
{
    public const string TemplateHeader = "Fecha;Tipo;Importe;Descripcion;Referencia;Saldo";
    public const string TemplateSample = """
        Fecha;Tipo;Importe;Descripcion;Referencia;Saldo
        15/03/2026;Credito;15000,50;Transferencia recibida ejemplo;OP-123;100000,00
        16/03/2026;Debito;500,00;Comision mantenimiento;;99500,00
        """;

    private static readonly TimeSpan MatchDateTolerance = TimeSpan.FromDays(2);
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    public static IEndpointRouteBuilder MapFinanceImportEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/finance/imports").WithTags("Finance Imports").RequirePolicyOnWrites("RequireFinance");

        group.MapGet("/bank/template", () =>
        {
            var bytes = Encoding.UTF8.GetBytes(TemplateSample.Replace("\r\n", "\n").Trim() + "\n");
            return Results.File(bytes, "text/csv; charset=utf-8", "lealcontrol-extracto-plantilla.csv");
        });

        group.MapGet("/bank/profiles/{accountId:guid}", async (
            Guid accountId,
            FinanceDbContext db,
            LealControl.BuildingBlocks.Tenancy.ITenantContext tenant,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var profile = await db.BankImportProfiles.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.AccountId == accountId)
                .OrderByDescending(x => x.UpdatedAtUtc ?? x.CreatedAtUtc)
                .Select(x => new
                {
                    x.Id,
                    x.AccountId,
                    x.Name,
                    x.Delimiter,
                    x.DateFormat,
                    ColumnMap = DeserializeColumnMap(x.ColumnMapJson),
                    x.CreatedAtUtc,
                    x.UpdatedAtUtc
                })
                .FirstOrDefaultAsync(ct);
            return profile is null ? Results.NotFound() : Results.Ok(profile);
        });

        group.MapPut("/bank/profiles", async (
            SaveBankImportProfileRequest body,
            FinanceDbContext db,
            LealControl.BuildingBlocks.Tenancy.ITenantContext tenant,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var account = await db.Accounts.AsNoTracking()
                .SingleOrDefaultAsync(x => x.Id == body.AccountId && x.TenantId == tenantId && x.IsActive, ct);
            if (account is null)
                return Results.NotFound("Cuenta financiera inexistente.");
            if (!body.ColumnMap.Date.HasValue)
                return Results.BadRequest("Indicá la columna de Fecha.");
            if (!body.ColumnMap.Amount.HasValue && !body.ColumnMap.Debit.HasValue && !body.ColumnMap.Credit.HasValue)
                return Results.BadRequest("Indicá al menos Importe, Débito o Crédito.");

            var existing = await db.BankImportProfiles
                .Where(x => x.TenantId == tenantId && x.AccountId == body.AccountId)
                .OrderByDescending(x => x.UpdatedAtUtc ?? x.CreatedAtUtc)
                .FirstOrDefaultAsync(ct);

            var mapJson = JsonSerializer.Serialize(body.ColumnMap, JsonOptions);
            var delimiter = string.IsNullOrWhiteSpace(body.Delimiter) ? ";" : body.Delimiter.Trim()[..1];
            if (existing is null)
            {
                existing = new BankImportProfile
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    AccountId = body.AccountId,
                    Name = string.IsNullOrWhiteSpace(body.Name) ? "Perfil de extracto" : body.Name.Trim(),
                    ColumnMapJson = mapJson,
                    Delimiter = delimiter,
                    DateFormat = string.IsNullOrWhiteSpace(body.DateFormat) ? null : body.DateFormat.Trim(),
                    CreatedAtUtc = DateTime.UtcNow
                };
                db.BankImportProfiles.Add(existing);
            }
            else
            {
                existing.Name = string.IsNullOrWhiteSpace(body.Name) ? existing.Name : body.Name.Trim();
                existing.ColumnMapJson = mapJson;
                existing.Delimiter = delimiter;
                existing.DateFormat = string.IsNullOrWhiteSpace(body.DateFormat) ? null : body.DateFormat.Trim();
                existing.UpdatedAtUtc = DateTime.UtcNow;
            }

            await db.SaveChangesAsync(ct);
            return Results.Ok(new
            {
                existing.Id,
                existing.AccountId,
                existing.Name,
                existing.Delimiter,
                existing.DateFormat,
                ColumnMap = body.ColumnMap,
                existing.CreatedAtUtc,
                existing.UpdatedAtUtc
            });
        });

        group.MapPost("/bank/preview", async (
            BankImportRequest request,
            FinanceDbContext db,
            LealControl.BuildingBlocks.Tenancy.ITenantContext tenant,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var account = await db.Accounts.AsNoTracking()
                .SingleOrDefaultAsync(x => x.Id == request.AccountId && x.TenantId == tenantId && x.IsActive, ct);
            if (account is null)
                return Results.NotFound("Cuenta financiera inexistente.");

            var profile = await ResolveProfileAsync(db, tenantId, request.AccountId, request.ProfileId, ct);
            var parseResult = ParseWithOptions(request.CsvContent, profile);
            if (parseResult.RequiresMapping)
            {
                return Results.Ok(new
                {
                    RequiresMapping = true,
                    Headers = parseResult.Headers,
                    HasProfile = profile is not null,
                    ProfileId = profile?.Id,
                    Rows = Array.Empty<object>(),
                    Summary = new { Total = 0, Valid = 0, Rejected = 0, Duplicates = 0, SystemMatches = 0, AmbiguousMatches = 0 }
                });
            }

            var enriched = await EnrichPreviewAsync(db, tenantId, request.AccountId, parseResult.Rows, ct);
            return Results.Ok(new
            {
                RequiresMapping = false,
                Headers = parseResult.Headers,
                HasProfile = profile is not null,
                ProfileId = profile?.Id,
                Rows = enriched.Rows,
                Summary = enriched.Summary
            });
        });

        group.MapPost("/bank/confirm", async (
            BankImportRequest request,
            FinanceDbContext db,
            LealControl.BuildingBlocks.Tenancy.ITenantContext tenant,
            HttpContext http,
            CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var account = await db.Accounts.SingleOrDefaultAsync(x => x.Id == request.AccountId && x.TenantId == tenantId && x.IsActive, ct);
            if (account is null)
                return Results.NotFound("Cuenta financiera inexistente.");
            if (account.BookingMode == FinancialAccountBookingMode.Manual)
                return Results.BadRequest("Esta cuenta es de carga manual. No admite importación de extractos.");

            var fileHash = ComputeFileHash(request.CsvContent);
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

            var profile = await ResolveProfileAsync(db, tenantId, request.AccountId, request.ProfileId, ct);
            var parseResult = ParseWithOptions(request.CsvContent, profile);
            if (parseResult.RequiresMapping)
                return Results.BadRequest("No se reconocieron las columnas del CSV. Guardá un perfil de mapeo o usá la plantilla LealControl.");

            var parsed = parseResult.Rows;
            var valid = parsed.Where(x => x.Error is null).ToList();
            var rejected = parsed.Count(x => x.Error is not null);

            await FinanceConcepts.EnsureBaseConceptsAsync(db, tenantId, ct);

            var importId = Guid.NewGuid();
            // Solo Imported: los System/PendingBank no deben disparar "duplicado" ni fusionarse por fingerprint.
            var existingImported = await db.Movements
                .Where(x => x.TenantId == tenantId
                            && x.AccountId == request.AccountId
                            && x.Origin == FinancialMovementOrigin.Imported)
                .OrderBy(x => x.CreatedAtUtc)
                .ToListAsync(ct);

            var existingByFingerprint = existingImported
                .GroupBy(MovementFingerprint)
                .ToDictionary(g => g.Key, g => new Queue<FinancialMovement>(g));

            var pendingSystem = await db.Movements
                .Where(x => x.TenantId == tenantId
                            && x.AccountId == request.AccountId
                            && x.Origin == FinancialMovementOrigin.System
                            && x.ReconciliationStatus == FinancialReconciliationStatus.PendingBank)
                .ToListAsync(ct);
            var usedSystemIds = new HashSet<Guid>();

            int updatedCount = 0;
            int freshCount = 0;
            int duplicateCount = 0;
            int matchedCount = 0;

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
                existingImported.Add(movement);
                freshCount++;

                var candidates = FindSystemCandidates(pendingSystem, movement, usedSystemIds);
                if (candidates.Count == 1)
                {
                    var system = candidates[0];
                    usedSystemIds.Add(system.Id);
                    ApplyMatchInMemory(movement, system);
                    matchedCount++;
                }
            }

            var allForBalance = await db.Movements
                .Where(x => x.TenantId == tenantId && x.AccountId == request.AccountId)
                .ToListAsync(ct);
            // incluir los recién agregados aún no trackeados en la query anterior vía ChangeTracker
            foreach (var entry in db.ChangeTracker.Entries<FinancialMovement>().Where(e => e.State == EntityState.Added))
            {
                if (allForBalance.All(x => x.Id != entry.Entity.Id))
                    allForBalance.Add(entry.Entity);
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
            var creditTotal = allForBalance.Where(CountsTowardBankBalance).Where(x => x.Kind == FinancialMovementKind.Credit).Sum(x => x.Amount);
            var debitTotal = allForBalance.Where(CountsTowardBankBalance).Where(x => x.Kind == FinancialMovementKind.Debit).Sum(x => x.Amount);
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
                MatchedSystem = matchedCount,
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
                .Select(x => new { x.Id, x.OperationDateUtc, x.Kind, x.Amount, x.Currency, x.Description, x.ExternalReference, x.TransferId, x.ReconciliationStatus, x.LinkedEntityType, x.LinkedEntityId, Origin = x.Origin.ToString() })
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
                              && (movement.Origin == FinancialMovementOrigin.Imported || movement.ImportId != null)
                              && movement.ClassificationStatus == FinancialClassificationStatus.Confirmed
                              && movement.ConceptId != null
                              && concept.UsableIn == FinancialConceptUsableIn.Receipt
                              && movement.ReconciliationStatus != FinancialReconciliationStatus.Reconciled
                              && movement.ReconciliationStatus != FinancialReconciliationStatus.MatchedToImport
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
                            movement.ClassificationStatus,
                            Origin = movement.Origin.ToString()
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
                              && (movement.Origin == FinancialMovementOrigin.Imported || movement.ImportId != null)
                              && movement.ClassificationStatus == FinancialClassificationStatus.Confirmed
                              && movement.ConceptId != null
                              && concept.UsableIn == FinancialConceptUsableIn.PaymentOrder
                              && movement.ReconciliationStatus != FinancialReconciliationStatus.Reconciled
                              && movement.ReconciliationStatus != FinancialReconciliationStatus.MatchedToImport
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
                            movement.ClassificationStatus,
                            Origin = movement.Origin.ToString()
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

    public static List<BankImportRow> Parse(string content) =>
        ParseWithOptions(content, profile: null).Rows;

    public static ParseOutcome ParseWithOptions(string content, BankImportProfile? profile)
    {
        var delimiter = DetectDelimiter(content, profile?.Delimiter);
        var records = ReadCsvRecords(content, delimiter);
        if (records.Count < 2)
            return new ParseOutcome([], [], RequiresMapping: false);

        var rawHeaders = records[0];
        var header = rawHeaders.Select(Normalize).ToList();
        var dateFormats = BuildDateFormats(profile?.DateFormat);

        BankColumnMap? map = null;
        if (profile is not null)
            map = DeserializeColumnMap(profile.ColumnMapJson);

        if (map is null || !map.Date.HasValue)
        {
            map = DetectColumnMap(header);
        }

        if (map is null || !map.Date.HasValue)
        {
            return new ParseOutcome([], rawHeaders.Select(x => x.Trim()).ToList(), RequiresMapping: true);
        }

        var result = new List<BankImportRow>();
        foreach (var cells in records.Skip(1))
        {
            if (cells.All(string.IsNullOrWhiteSpace)) continue;

            var dateRaw = Cell(cells, map.Date.Value);
            if (!TryParseDate(dateRaw, dateFormats, out var date))
            {
                result.Add(new(default, 0, FinancialMovementKind.Debit, string.Join(" | ", cells), null, null, "Fecha inválida."));
                continue;
            }

            var description = BuildDescription(cells, map, header);
            var reference = Cell(cells, map.Reference ?? -1);
            var reported = ParseNullableDecimal(Cell(cells, map.Balance ?? -1));

            decimal amount;
            FinancialMovementKind kind;
            if (map.Tipo.HasValue && map.Amount.HasValue)
            {
                amount = Math.Abs(ParseDecimal(Cell(cells, map.Amount.Value)));
                kind = ParseTipo(Cell(cells, map.Tipo.Value));
            }
            else if (map.Amount.HasValue && !map.Debit.HasValue && !map.Credit.HasValue)
            {
                var signed = ParseDecimal(Cell(cells, map.Amount.Value));
                kind = signed < 0 ? FinancialMovementKind.Debit : FinancialMovementKind.Credit;
                amount = Math.Abs(signed);
            }
            else
            {
                var debit = ParseDecimal(Cell(cells, map.Debit ?? -1));
                var credit = ParseDecimal(Cell(cells, map.Credit ?? -1));
                amount = debit > 0 ? debit : credit;
                kind = debit > 0 ? FinancialMovementKind.Debit : FinancialMovementKind.Credit;
            }

            if (amount == 0)
            {
                result.Add(new(date.ToUniversalTime(), 0, kind, description, reference, reported, "No se encontró débito ni crédito."));
                continue;
            }

            result.Add(new(
                date.ToUniversalTime(),
                amount,
                kind,
                string.IsNullOrWhiteSpace(description) ? "Movimiento bancario" : description,
                string.IsNullOrWhiteSpace(reference) ? null : reference,
                reported));
        }

        return new ParseOutcome(result, rawHeaders.Select(x => x.Trim()).ToList(), RequiresMapping: false);
    }

    public sealed record ParseOutcome(List<BankImportRow> Rows, List<string> Headers, bool RequiresMapping);

    private static async Task<BankImportProfile?> ResolveProfileAsync(
        FinanceDbContext db,
        Guid tenantId,
        Guid accountId,
        Guid? profileId,
        CancellationToken ct)
    {
        if (profileId.HasValue && profileId.Value != Guid.Empty)
        {
            return await db.BankImportProfiles
                .FirstOrDefaultAsync(x => x.Id == profileId.Value && x.TenantId == tenantId && x.AccountId == accountId, ct);
        }

        return await db.BankImportProfiles
            .Where(x => x.TenantId == tenantId && x.AccountId == accountId)
            .OrderByDescending(x => x.UpdatedAtUtc ?? x.CreatedAtUtc)
            .FirstOrDefaultAsync(ct);
    }

    private static async Task<(List<object> Rows, object Summary)> EnrichPreviewAsync(
        FinanceDbContext db,
        Guid tenantId,
        Guid accountId,
        List<BankImportRow> parsed,
        CancellationToken ct)
    {
        var existingImported = await db.Movements.AsNoTracking()
            .Where(x => x.TenantId == tenantId
                        && x.AccountId == accountId
                        && x.Origin == FinancialMovementOrigin.Imported)
            .Select(x => new { x.AccountId, x.OperationDateUtc, x.Amount, x.Kind, x.ExternalReference, x.Description })
            .ToListAsync(ct);

        var fingerprintCounts = existingImported
            .GroupBy(x => BuildFingerprint(x.AccountId, x.OperationDateUtc.Date, x.Amount, x.Kind, x.ExternalReference, x.Description))
            .ToDictionary(g => g.Key, g => g.Count());

        var pendingSystem = await db.Movements.AsNoTracking()
            .Where(x => x.TenantId == tenantId
                        && x.AccountId == accountId
                        && x.Origin == FinancialMovementOrigin.System
                        && x.ReconciliationStatus == FinancialReconciliationStatus.PendingBank)
            .ToListAsync(ct);
        var usedSystem = new HashSet<Guid>();

        int duplicates = 0, matches = 0, ambiguous = 0, rejected = 0, valid = 0;
        var rows = new List<object>();

        foreach (var row in parsed)
        {
            if (row.Error is not null)
            {
                rejected++;
                rows.Add(PreviewRow(row, "error", null, null, null, null));
                continue;
            }

            valid++;
            var fp = RowFingerprint(accountId, row);
            if (fingerprintCounts.TryGetValue(fp, out var remaining) && remaining > 0)
            {
                fingerprintCounts[fp] = remaining - 1;
                duplicates++;
                rows.Add(PreviewRow(row, "duplicate", null, null, null, null));
                continue;
            }

            var candidates = FindSystemCandidates(pendingSystem, row.Kind, row.Amount, row.OperationDateUtc, row.ExternalReference, usedSystem);
            if (candidates.Count == 1)
            {
                var sys = candidates[0];
                usedSystem.Add(sys.Id);
                matches++;
                rows.Add(PreviewRow(row, "match", sys.Id, sys.Description, sys.OperationDateUtc, sys.ExternalReference));
            }
            else if (candidates.Count > 1)
            {
                ambiguous++;
                rows.Add(PreviewRow(row, "ambiguous", null, null, null, null));
            }
            else
            {
                rows.Add(PreviewRow(row, "new", null, null, null, null));
            }
        }

        var summary = new
        {
            Total = parsed.Count,
            Valid = valid,
            Rejected = rejected,
            Duplicates = duplicates,
            SystemMatches = matches,
            AmbiguousMatches = ambiguous
        };
        return (rows, summary);
    }

    private static object PreviewRow(
        BankImportRow row,
        string status,
        Guid? matchedId,
        string? matchedDescription,
        DateTime? matchedDate,
        string? matchedRef) => new
    {
        row.OperationDateUtc,
        row.Amount,
        Kind = row.Kind.ToString(),
        row.Description,
        row.ExternalReference,
        row.ReportedBalance,
        row.Error,
        Status = status,
        MatchedSystemMovementId = matchedId,
        MatchedSystemDescription = matchedDescription,
        MatchedSystemDateUtc = matchedDate,
        MatchedSystemExternalReference = matchedRef
    };

    internal static List<FinancialMovement> FindSystemCandidates(
        IEnumerable<FinancialMovement> pending,
        FinancialMovement imported,
        HashSet<Guid> used) =>
        FindSystemCandidates(pending, imported.Kind, imported.Amount, imported.OperationDateUtc, imported.ExternalReference, used);

    internal static List<FinancialMovement> FindSystemCandidates(
        IEnumerable<FinancialMovement> pending,
        FinancialMovementKind kind,
        decimal amount,
        DateTime operationDateUtc,
        string? externalReference,
        HashSet<Guid> used)
    {
        var impRef = NormalizeReference(externalReference);
        var baseCandidates = pending
            .Where(s => !used.Contains(s.Id))
            .Where(s => s.Kind == kind && s.Amount == amount)
            .Where(s => Math.Abs((s.OperationDateUtc.Date - operationDateUtc.Date).TotalDays) <= MatchDateTolerance.TotalDays)
            .Where(s =>
            {
                var sysRef = NormalizeReference(s.ExternalReference);
                if (string.IsNullOrEmpty(sysRef) || string.IsNullOrEmpty(impRef))
                    return true;
                return sysRef == impRef;
            })
            .ToList();

        if (!string.IsNullOrEmpty(impRef))
        {
            var byRef = baseCandidates.Where(s => NormalizeReference(s.ExternalReference) == impRef).ToList();
            if (byRef.Count > 0)
                return byRef.OrderBy(s => Math.Abs((s.OperationDateUtc - operationDateUtc).TotalHours)).ToList();
        }

        return baseCandidates.OrderBy(s => Math.Abs((s.OperationDateUtc - operationDateUtc).TotalHours)).ToList();
    }

    internal static void ApplyMatchInMemory(FinancialMovement imported, FinancialMovement system)
    {
        imported.ConceptId ??= system.ConceptId;
        imported.LinkedEntityType = system.LinkedEntityType;
        imported.LinkedEntityId = system.LinkedEntityId;
        imported.ReconciliationStatus = FinancialReconciliationStatus.Reconciled;

        system.ReconciliationStatus = FinancialReconciliationStatus.MatchedToImport;
        system.MatchedMovementId = imported.Id;
    }

    public static bool CountsTowardBankBalance(FinancialMovement m)
    {
        if (m.Origin != FinancialMovementOrigin.System)
            return true;
        return m.ReconciliationStatus != FinancialReconciliationStatus.PendingBank
               && m.ReconciliationStatus != FinancialReconciliationStatus.MatchedToImport;
    }

    private static BankColumnMap? DetectColumnMap(List<string> header)
    {
        var dateIndex = Index(header, "fecha", "f. operacion", "f. oper.", "fecha operacion", "f. valor", "fecha valor", "date");
        if (dateIndex < 0) return null;

        var descriptionIndex = Index(header, "descripción", "descripcion", "detalle", "concepto", "movimiento", "leyenda", "motivo", "description");
        var debitIndex = Index(header, "débitos", "debitos", "debito", "débito", "importe debito", "importe débito", "egreso", "egresos", "cargo", "debit");
        var creditIndex = Index(header, "créditos", "creditos", "credito", "crédito", "importe credito", "importe crédito", "ingreso", "ingresos", "abono", "credit");
        var balanceIndex = Index(header, "saldo", "saldo contable", "saldo disponible", "balance");
        var referenceIndex = Index(header, "número de comprobante", "numero de comprobante", "referencia", "comprobante", "nro comprobante", "nro de comprobante", "nro operacion", "nro de operacion", "id transacción", "id transaccion", "reference");
        var tipoIndex = Index(header, "tipo", "tipo movimiento", "tipo de movimiento", "sentido");
        var amountIndex = Index(header, "importe", "monto", "amount", "valor");

        // Plantilla LealControl: Fecha;Tipo;Importe;...
        if (tipoIndex >= 0 && amountIndex >= 0)
        {
            return new BankColumnMap(
                Date: dateIndex,
                Amount: amountIndex,
                Tipo: tipoIndex,
                Description: descriptionIndex >= 0 ? descriptionIndex : null,
                Reference: referenceIndex >= 0 ? referenceIndex : null,
                Balance: balanceIndex >= 0 ? balanceIndex : null);
        }

        if (debitIndex < 0 && creditIndex < 0 && amountIndex < 0)
            return null;

        return new BankColumnMap(
            Date: dateIndex,
            Debit: debitIndex >= 0 ? debitIndex : null,
            Credit: creditIndex >= 0 ? creditIndex : null,
            Amount: amountIndex >= 0 && debitIndex < 0 && creditIndex < 0 ? amountIndex : null,
            Description: descriptionIndex >= 0 ? descriptionIndex : null,
            Reference: referenceIndex >= 0 ? referenceIndex : null,
            Balance: balanceIndex >= 0 ? balanceIndex : null);
    }

    private static string BuildDescription(List<string> cells, BankColumnMap map, List<string> header)
    {
        var descRaw = Cell(cells, map.Description ?? -1);
        var originIndex = Index(header, "origen", "canal", "sucursal", "origin");
        var leyendas1Index = Index(header, "leyendas adicionales1", "leyendas adicionales 1", "leyenda adicional 1", "titular", "ordenante", "destinatario / remitente", "remitente", "beneficiario", "nombre", "razon social", "razón social", "contraparte", "cuenta origen", "nombre y apellido", "titular origen");
        var leyendas2Index = Index(header, "leyendas adicionales2", "leyendas adicionales 2", "leyenda adicional 2", "cuit / cuil", "cuit", "cuil", "cuit/cuil", "documento", "cuit/cuil ordenante", "cuit/cuil beneficiario", "cuit ordenante");
        var leyendas3Index = Index(header, "leyendas adicionales3", "leyendas adicionales 3", "leyenda adicional 3", "informacion adicional", "información adicional", "observaciones", "datos adicionales", "detalle ampliado", "motivo", "cbu / cvu", "cbu", "cvu", "cbu/cvu", "cuenta origen cbu");
        var leyendas4Index = Index(header, "leyendas adicionales4", "leyendas adicionales 4", "leyenda adicional 4");
        var obsClienteIndex = Index(header, "observaciones cliente", "observaciones");

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

        return string.Join(" · ", descParts.Where(x => !string.IsNullOrWhiteSpace(x))).Trim();
    }

    private static FinancialMovementKind ParseTipo(string raw)
    {
        var n = Normalize(raw);
        if (n is "debito" or "débito" or "debit" or "d" or "egreso" or "cargo" or "-")
            return FinancialMovementKind.Debit;
        return FinancialMovementKind.Credit;
    }

    private static char DetectDelimiter(string content, string? profileDelimiter)
    {
        if (!string.IsNullOrWhiteSpace(profileDelimiter))
            return profileDelimiter.Trim()[0];
        var firstLine = content.Split('\n', 2)[0];
        if (firstLine.Contains(';')) return ';';
        if (firstLine.Contains('\t')) return '\t';
        return ',';
    }

    private static string[] BuildDateFormats(string? preferred)
    {
        var defaults = new[] { "dd/MM/yyyy", "d/M/yyyy", "yyyy-MM-dd", "dd-MM-yyyy", "dd/MM/yy", "d/M/yy" };
        if (string.IsNullOrWhiteSpace(preferred)) return defaults;
        return new[] { preferred.Trim() }.Concat(defaults).Distinct().ToArray();
    }

    private static bool TryParseDate(string dateRaw, string[] formats, out DateTime date) =>
        DateTime.TryParseExact(dateRaw, formats, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out date);

    private static List<List<string>> ReadCsvRecords(string content, char delimiter)
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
            else if (ch == delimiter && !quoted)
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

    /// <summary>Huella estable para deduplicar filas de extracto (tests + importación).</summary>
    public static string BuildFingerprint(
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

    public static string ComputeFileHash(string csvContent) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(csvContent))).ToLowerInvariant();

    public static string NormalizeReference(string? reference) =>
        string.IsNullOrWhiteSpace(reference) ? "" : reference.Trim().ToUpperInvariant();

    public static BankColumnMap? DeserializeColumnMap(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            return JsonSerializer.Deserialize<BankColumnMap>(json, JsonOptions);
        }
        catch
        {
            return null;
        }
    }
}
