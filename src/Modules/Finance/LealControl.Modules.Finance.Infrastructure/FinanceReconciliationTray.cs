using System.Text.RegularExpressions;
using LealControl.BuildingBlocks.Security;
using LealControl.BuildingBlocks.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Finance.Infrastructure;

public sealed record TrayMatch(Guid ImportedId, Guid SystemId);
public sealed record TrayCheque(Guid ImportedId, Guid ChequeId);
public sealed record TrayMatchMany(Guid ImportedId, List<Guid> SystemIds);
public sealed record TrayTransfer(Guid ImportedId, Guid OtherAccountId);
public sealed record ConfirmTrayRequest(Guid AccountId, List<TrayMatch>? Matches, List<TrayCheque>? Cheques, List<Guid>? Classify, List<TrayMatchMany>? MatchesMany = null, List<TrayTransfer>? Transfers = null);

/// <summary>
/// Bandeja de conciliación (nota 69, F1b): para cada movimiento del extracto sin conciliar, la acción sugerida, en este orden:
/// 1) conciliar con un cobro o pago del sistema (mismo importe, ±5 días; entre varios, el del mismo CUIT y la fecha más cercana),
///    o con varios del mismo CUIT que suman el importe (una transferencia que paga varias órdenes);
/// 2) un eCheq emitido por su número; 3) crear la orden de pago o el recibo del proveedor o cliente del CUIT;
/// 4) una transferencia a la billetera de viáticos del empleado del CUIT; 5) un gasto, impuesto o inversión ya clasificado; 6) sin identificar.
/// Cualquier movimiento sin conciliar se puede marcar a mano como transferencia con otra cuenta propia (banco, caja o billetera). Las sugerencias se confirman todas juntas.
/// </summary>
public static partial class FinanceReconciliationTray
{
    public static readonly TimeSpan DateTolerance = TimeSpan.FromDays(5);

    [GeneratedRegex(@"(?:cheq|chq).*?(?:nro\.?:?|n[º°]\.?|#)\s*0*(\d{1,12})\b", RegexOptions.IgnoreCase)]
    private static partial Regex EcheqNumber();

    /// <summary>Número de cheque que nombra el banco ("Echeq 48 Hs. Nro. 345", "Echeq Galicia Nro: 345", "Cheque pagado Nro 345").</summary>
    public static long? ChequeNumberIn(string description) =>
        EcheqNumber().Match(description ?? "") is { Success: true } m && long.TryParse(m.Groups[1].Value, out var n) ? n : null;

    private static long? Numeric(string? number) =>
        long.TryParse(new string((number ?? "").Where(char.IsDigit).ToArray()), out var n) ? n : null;

    public static IEndpointRouteBuilder MapReconciliationTray(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/finance/reconciliation/tray").WithTags("Finance").RequirePolicyOnWrites("RequireFinance");

        group.MapGet("", async (Guid accountId, FinanceDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            if (!await db.Accounts.AnyAsync(x => x.Id == accountId && x.TenantId == tenantId, ct)) return Results.NotFound("Cuenta financiera inexistente.");
            var imported = await db.Movements.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.AccountId == accountId && x.Origin == FinancialMovementOrigin.Imported
                    && x.ReconciliationStatus != FinancialReconciliationStatus.Reconciled
                    && x.ReconciliationStatus != FinancialReconciliationStatus.MatchedToImport
                    && x.ReconciliationStatus != FinancialReconciliationStatus.Excluded)
                .OrderBy(x => x.OperationDateUtc).ToListAsync(ct);
            var system = await db.Movements.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.AccountId == accountId && x.Origin == FinancialMovementOrigin.System
                    && x.ReconciliationStatus == FinancialReconciliationStatus.PendingBank)
                .ToListAsync(ct);
            var systemTaxIds = await SystemTaxIdsAsync(db, tenantId, system, ct);
            var labels = await SystemLabelsAsync(db, tenantId, system, ct);
            var cheques = await db.ReceivedCheques.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.Direction == ChequeDirection.Issued && x.BankMovementId == null
                    && x.Status != ReceivedChequeStatus.Cancelled && x.Status != ReceivedChequeStatus.Rejected)
                .ToListAsync(ct);
            var concepts = await db.FinancialConcepts.AsNoTracking().Where(x => x.TenantId == tenantId).ToDictionaryAsync(x => x.Id, ct);
            var batches = await PaymentBatches.ConsolidatedPendingAsync(db, tenantId, accountId, ct);
            var wallets = await WalletsByCuilAsync(db, tenantId, ct);

            var usedSystem = new HashSet<Guid>();
            var usedCheques = new HashSet<Guid>();
            var suggested = new List<(FinancialMovement Movement, object? Suggestion)>();
            foreach (var m in imported)
            {
                object? suggestion = null;
                var candidates = system
                    .Where(s => !usedSystem.Contains(s.Id) && s.Kind == m.Kind && s.Amount == m.Amount
                        && Math.Abs((s.OperationDateUtc.Date - m.OperationDateUtc.Date).TotalDays) <= DateTolerance.TotalDays)
                    .ToList();
                if (candidates.Count > 1 && m.CounterpartyTaxId is { } cuit)
                {
                    var sameParty = candidates.Where(s => systemTaxIds.GetValueOrDefault(s.Id) == cuit).ToList();
                    if (sameParty.Count > 0) candidates = sameParty;
                }
                if (candidates.Count > 1)
                {
                    var nearest = candidates.Min(s => Math.Abs((s.OperationDateUtc.Date - m.OperationDateUtc.Date).TotalDays));
                    candidates = candidates.Where(s => Math.Abs((s.OperationDateUtc.Date - m.OperationDateUtc.Date).TotalDays) == nearest).ToList();
                }
                if (candidates.Count == 1)
                {
                    usedSystem.Add(candidates[0].Id);
                    suggestion = new { Type = "Match", SystemId = candidates[0].Id, Label = labels.GetValueOrDefault(candidates[0].Id, candidates[0].Description), candidates[0].OperationDateUtc };
                }
                else if (m.Kind == FinancialMovementKind.Debit && batches.FirstOrDefault(b => b.Batch.Total == m.Amount
                        && b.MovementIds.All(id => !usedSystem.Contains(id))
                        && Math.Abs((b.Batch.RequestDate.Date - m.OperationDateUtc.Date).TotalDays) <= DateTolerance.TotalDays) is { Batch: not null } batch)
                {
                    foreach (var id in batch.MovementIds) usedSystem.Add(id);
                    suggestion = new { Type = "MatchMany", SystemIds = batch.MovementIds, Label = $"Lote de pagos {batch.Batch.Number:0000} ({batch.MovementIds.Count} transferencias)" };
                }
                else if (m.CounterpartyTaxId is { } partyTaxId && SubsetSum(system
                        .Where(s => !usedSystem.Contains(s.Id) && s.Kind == m.Kind && s.Amount < m.Amount
                            && systemTaxIds.GetValueOrDefault(s.Id) == partyTaxId
                            && Math.Abs((s.OperationDateUtc.Date - m.OperationDateUtc.Date).TotalDays) <= DateTolerance.TotalDays)
                        .OrderBy(s => s.OperationDateUtc).Take(12).ToList(), m.Amount) is { } group)
                {
                    foreach (var s in group) usedSystem.Add(s.Id);
                    suggestion = new { Type = "MatchMany", SystemIds = group.Select(s => s.Id), Label = string.Join(" + ", group.Select(s => labels.GetValueOrDefault(s.Id, s.Description))) };
                }
                else if (m.Kind == FinancialMovementKind.Debit && ChequeNumberIn(m.Description) is { } number
                    && cheques.FirstOrDefault(c => !usedCheques.Contains(c.Id) && Numeric(c.CheckNumber) == number && c.Amount == m.Amount) is { } cheque)
                {
                    usedCheques.Add(cheque.Id);
                    suggestion = new { Type = "Cheque", ChequeId = cheque.Id, Label = $"eCheq {cheque.CheckNumber} a {cheque.ReceivedFrom ?? cheque.IssuerName}", cheque.PaymentOrderId };
                }
                else if (m.Kind == FinancialMovementKind.Debit && m.CounterpartyTaxId is { } employeeCuil
                    && wallets.TryGetValue(Digits(employeeCuil), out var wallet) && wallet.Id != accountId)
                    suggestion = new { Type = "Transfer", AccountId = wallet.Id, Label = wallet.Name };
                else if (m.SuggestedCounterpartyId is { } partyId && m.SuggestedCounterpartyType is "Supplier" or "Customer")
                    suggestion = new { Type = m.SuggestedCounterpartyType == "Supplier" ? "CreatePayment" : "CreateReceipt", CounterpartyId = partyId };
                else if (m.ConceptId is { } conceptId && concepts.TryGetValue(conceptId, out var concept)
                    && concept.UsableIn is FinancialConceptUsableIn.MovementOnly or FinancialConceptUsableIn.Transfer)
                    suggestion = new { Type = "Classified", ConceptId = conceptId, Label = concept.Name };
                suggested.Add((m, suggestion));
            }
            // Débito que el banco no nombra como cheque: se ofrecen los cheques emitidos sin debitar del mismo importe para elegirlo a mano.
            var rows = suggested.Select(x => new
            {
                x.Movement.Id, x.Movement.OperationDateUtc, x.Movement.Kind, x.Movement.Amount, x.Movement.Description, x.Movement.CounterpartyTaxId, x.Movement.CounterpartyName,
                Suggestion = x.Suggestion ?? new { Type = "Unknown" },
                ChequeOptions = x.Movement.Kind == FinancialMovementKind.Debit
                    ? cheques.Where(c => !usedCheques.Contains(c.Id) && c.Amount == x.Movement.Amount)
                        .Select(c => new { ChequeId = c.Id, Label = $"Cheque {c.CheckNumber} a {c.IssuerName ?? c.ReceivedFrom}", c.PaymentOrderId }).ToList()
                    : []
            }).ToList();
            return Results.Ok(new { AccountId = accountId, Rows = rows, PendingSystem = system.Count(s => !usedSystem.Contains(s.Id)) });
        });

        group.MapPost("/confirm", async (ConfirmTrayRequest body, FinanceDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var ids = (body.Matches ?? []).SelectMany(x => new[] { x.ImportedId, x.SystemId })
                .Concat((body.MatchesMany ?? []).SelectMany(x => x.SystemIds.Append(x.ImportedId)))
                .Concat((body.Cheques ?? []).Select(x => x.ImportedId)).Concat((body.Transfers ?? []).Select(x => x.ImportedId)).Concat(body.Classify ?? []).ToList();
            var movements = await db.Movements.Where(x => x.TenantId == tenantId && x.AccountId == body.AccountId && ids.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
            int matched = 0, chequesLinked = 0, classified = 0, transfers = 0;
            var errors = new List<string>();

            foreach (var pair in body.Matches ?? [])
            {
                if (!movements.TryGetValue(pair.ImportedId, out var imp) || !movements.TryGetValue(pair.SystemId, out var sys)
                    || imp.Origin != FinancialMovementOrigin.Imported || sys.Origin != FinancialMovementOrigin.System
                    || sys.ReconciliationStatus != FinancialReconciliationStatus.PendingBank
                    || imp.Kind != sys.Kind || imp.Amount != sys.Amount
                    || Math.Abs((imp.OperationDateUtc.Date - sys.OperationDateUtc.Date).TotalDays) > DateTolerance.TotalDays)
                {
                    errors.Add($"No se pudo conciliar el movimiento del {imp?.OperationDateUtc:dd/MM} por {imp?.Amount:N2}: cambió o no coincide.");
                    continue;
                }
                FinanceImport.ApplyMatchInMemory(imp, sys);
                matched++;
            }

            foreach (var group in body.MatchesMany ?? [])
            {
                var parts = group.SystemIds.Select(id => movements.GetValueOrDefault(id)).ToList();
                if (!movements.TryGetValue(group.ImportedId, out var imp) || imp.Origin != FinancialMovementOrigin.Imported || parts.Count < 2
                    || parts.Any(p => p is null || p.Origin != FinancialMovementOrigin.System || p.ReconciliationStatus != FinancialReconciliationStatus.PendingBank || p.Kind != imp.Kind)
                    || parts.Sum(p => p!.Amount) != imp.Amount)
                {
                    errors.Add($"No se pudo conciliar el movimiento del {imp?.OperationDateUtc:dd/MM} por {imp?.Amount:N2} con varios pagos: cambiaron o no suman.");
                    continue;
                }
                // El movimiento del banco queda vinculado al primero; todos los del sistema apuntan a él.
                FinanceImport.ApplyMatchInMemory(imp, parts[0]!);
                foreach (var p in parts.Skip(1))
                {
                    p!.ReconciliationStatus = FinancialReconciliationStatus.MatchedToImport;
                    p.MatchedMovementId = imp.Id;
                }
                matched += parts.Count;
            }

            if ((body.Transfers ?? []).Count > 0)
            {
                await FinanceConcepts.EnsureBaseConceptsAsync(db, tenantId, ct);
                var transferConceptId = await db.FinancialConcepts.Where(x => x.TenantId == tenantId && x.Code == "TRANSFERENCIA_PROPIA").Select(x => (Guid?)x.Id).SingleOrDefaultAsync(ct);
                var otherIds = body.Transfers!.Select(x => x.OtherAccountId).Append(body.AccountId).ToList();
                var accounts = await db.Accounts.Where(x => x.TenantId == tenantId && otherIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
                foreach (var pair in body.Transfers!)
                {
                    if (!movements.TryGetValue(pair.ImportedId, out var imp) || imp.Origin != FinancialMovementOrigin.Imported || imp.ReconciliationStatus == FinancialReconciliationStatus.Reconciled
                        || pair.OtherAccountId == body.AccountId || !accounts.TryGetValue(pair.OtherAccountId, out var other) || !other.IsActive || other.Currency != imp.Currency)
                    {
                        errors.Add($"No se pudo registrar la transferencia del {imp?.OperationDateUtc:dd/MM}: la cuenta no existe, está inactiva o es de otra moneda.");
                        continue;
                    }
                    // La otra punta queda en la otra cuenta; si es un banco, se concilia con su propio extracto.
                    var transferId = Guid.NewGuid();
                    var own = accounts.GetValueOrDefault(body.AccountId)?.Name ?? "cuenta";
                    var counterpart = new FinancialMovement
                    {
                        Id = Guid.NewGuid(), TenantId = tenantId, AccountId = other.Id,
                        Kind = imp.Kind == FinancialMovementKind.Debit ? FinancialMovementKind.Credit : FinancialMovementKind.Debit,
                        Amount = imp.Amount, Currency = imp.Currency, OperationDateUtc = imp.OperationDateUtc,
                        Description = imp.Kind == FinancialMovementKind.Debit ? $"Transferencia desde {own}" : $"Transferencia hacia {own}",
                        ExternalReference = $"TRANSFER:{transferId}", TransferId = transferId, ConceptId = transferConceptId, CreatedAtUtc = DateTime.UtcNow
                    };
                    FinanceSystemMovementHelper.ApplySystemDefaults(counterpart, other);
                    db.Movements.Add(counterpart);
                    imp.TransferId = transferId;
                    imp.ConceptId = transferConceptId;
                    imp.ReconciliationStatus = FinancialReconciliationStatus.Reconciled;
                    imp.ClassificationStatus = FinancialClassificationStatus.Confirmed;
                    imp.ClassifiedAtUtc = DateTime.UtcNow;
                    transfers++;
                }
            }

            if ((body.Cheques ?? []).Count > 0)
            {
                var chequeIds = body.Cheques!.Select(x => x.ChequeId).ToList();
                var cheques = await db.ReceivedCheques.Where(x => x.TenantId == tenantId && chequeIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
                var issuedConcept = await db.FinancialConcepts.AsNoTracking().FirstOrDefaultAsync(x => x.TenantId == tenantId && x.Code == "CHEQUE_EMITIDO", ct);
                foreach (var pair in body.Cheques!)
                {
                    if (!movements.TryGetValue(pair.ImportedId, out var imp) || !cheques.TryGetValue(pair.ChequeId, out var cheque)
                        || cheque.BankMovementId is not null || cheque.Amount != imp.Amount || imp.Kind != FinancialMovementKind.Debit)
                    {
                        errors.Add($"No se pudo vincular el eCheq del {imp?.OperationDateUtc:dd/MM}: cambió o no coincide.");
                        continue;
                    }
                    cheque.BankAccountId = body.AccountId;
                    cheque.BankMovementId = imp.Id;
                    cheque.Status = ReceivedChequeStatus.Debited;
                    cheque.CreditedAtUtc = imp.OperationDateUtc;
                    imp.ReconciliationStatus = FinancialReconciliationStatus.Reconciled;
                    imp.LinkedEntityType = cheque.PaymentOrderId is null ? "Cheque" : "PaymentOrder";
                    imp.LinkedEntityId = cheque.PaymentOrderId ?? cheque.Id;
                    if (issuedConcept is not null) imp.ConceptId = issuedConcept.Id;
                    imp.ClassificationStatus = FinancialClassificationStatus.Confirmed;
                    imp.ClassifiedAtUtc = DateTime.UtcNow;
                    chequesLinked++;
                }
            }

            if ((body.Classify ?? []).Count > 0)
            {
                var concepts = await db.FinancialConcepts.AsNoTracking().Where(x => x.TenantId == tenantId).ToDictionaryAsync(x => x.Id, ct);
                foreach (var id in body.Classify!)
                {
                    if (!movements.TryGetValue(id, out var m) || m.ConceptId is not { } conceptId || !concepts.TryGetValue(conceptId, out var concept)) continue;
                    m.ClassificationStatus = FinancialClassificationStatus.Confirmed;
                    m.ClassifiedAtUtc = DateTime.UtcNow;
                    // Igual que la clasificación manual: un gasto o impuesto del banco no espera un cobro ni un pago.
                    if (concept.UsableIn == FinancialConceptUsableIn.MovementOnly && m.ReconciliationStatus != FinancialReconciliationStatus.Reconciled)
                        m.ReconciliationStatus = FinancialReconciliationStatus.Excluded;
                    classified++;
                }
            }

            await db.SaveChangesAsync(ct);
            return Results.Ok(new { Matched = matched, Cheques = chequesLinked, Transfers = transfers, Classified = classified, Errors = errors });
        });

        return endpoints;
    }

    /// <summary>CUIT de la contraparte de cada pago o cobro del sistema (orden de pago: proveedor; recibo: cliente).</summary>
    private static async Task<Dictionary<Guid, string>> SystemTaxIdsAsync(FinanceDbContext db, Guid tenantId, List<FinancialMovement> system, CancellationToken ct)
    {
        var result = new Dictionary<Guid, string>();
        var orderIds = system.Where(s => s.LinkedEntityType == "PaymentOrder" && s.LinkedEntityId.HasValue).Select(s => s.LinkedEntityId!.Value).ToList();
        var orders = await db.PaymentOrders.AsNoTracking().Where(o => o.TenantId == tenantId && orderIds.Contains(o.Id))
            .Select(o => new { o.Id, o.SupplierTaxId }).ToDictionaryAsync(o => o.Id, ct);
        var receiptIds = system.Where(s => s.LinkedEntityType == "CollectionReceipt" && s.LinkedEntityId.HasValue).Select(s => s.LinkedEntityId!.Value).ToList();
        var receipts = await db.CollectionReceipts.AsNoTracking().Where(r => r.TenantId == tenantId && receiptIds.Contains(r.Id))
            .Select(r => new { r.Id, r.CustomerId }).ToDictionaryAsync(r => r.Id, ct);
        var customerTaxIds = new Dictionary<Guid, string>();
        var customerIds = receipts.Values.Where(r => r.CustomerId.HasValue).Select(r => r.CustomerId!.Value).Distinct().ToList();
        if (customerIds.Count > 0)
        {
            try
            {
                var rows = await db.Database.SqlQuery<CustomerTaxIdRow>($@"SELECT ""Id"", document_number AS ""TaxId"" FROM crm.customers WHERE ""TenantId"" = {tenantId} AND ""Id"" = ANY({customerIds.ToArray()})").ToListAsync(ct);
                customerTaxIds = rows.Where(r => r.TaxId != null).ToDictionary(r => r.Id, r => Digits(r.TaxId));
            }
            catch (Npgsql.PostgresException)
            {
                // CRM no instalado: sin CUIT de clientes.
            }
        }
        foreach (var s in system)
        {
            if (s.LinkedEntityId is not { } id) continue;
            if (orders.TryGetValue(id, out var o) && !string.IsNullOrWhiteSpace(o.SupplierTaxId)) result[s.Id] = Digits(o.SupplierTaxId);
            else if (receipts.TryGetValue(id, out var r) && r.CustomerId is { } c && customerTaxIds.TryGetValue(c, out var tax)) result[s.Id] = tax;
        }
        return result;
    }

    private static async Task<Dictionary<Guid, string>> SystemLabelsAsync(FinanceDbContext db, Guid tenantId, List<FinancialMovement> system, CancellationToken ct)
    {
        var ids = system.Where(s => s.LinkedEntityId.HasValue).Select(s => s.LinkedEntityId!.Value).ToList();
        var orders = await db.PaymentOrders.AsNoTracking().Where(o => o.TenantId == tenantId && ids.Contains(o.Id))
            .ToDictionaryAsync(o => o.Id, o => $"OP {o.OrderNumber} · {o.SupplierName}", ct);
        var receipts = await db.CollectionReceipts.AsNoTracking().Where(r => r.TenantId == tenantId && ids.Contains(r.Id))
            .ToDictionaryAsync(r => r.Id, r => $"Recibo {r.ReceiptNumber}", ct);
        return system.Where(s => s.LinkedEntityId.HasValue)
            .Select(s => (s.Id, Label: orders.GetValueOrDefault(s.LinkedEntityId!.Value) ?? receipts.GetValueOrDefault(s.LinkedEntityId!.Value)))
            .Where(x => x.Label is not null).ToDictionary(x => x.Id, x => x.Label!);
    }

    private sealed record EmployeeCuilRow(Guid Id, string Cuil);

    /// <summary>Billeteras de viáticos activas por CUIL del empleado (de RRHH), para reconocer la transferencia al empleado.</summary>
    private static async Task<Dictionary<string, FinancialAccount>> WalletsByCuilAsync(FinanceDbContext db, Guid tenantId, CancellationToken ct)
    {
        var wallets = await db.Accounts.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive && x.EmployeeId != null).ToListAsync(ct);
        if (wallets.Count == 0) return [];
        if (!await db.Database.SqlQuery<bool>($"""SELECT to_regclass('hr."Employees"') IS NOT NULL AS "Value" """).SingleAsync(ct)) return [];
        var ids = wallets.Select(w => w.EmployeeId!.Value).ToArray();
        var cuils = await db.Database.SqlQuery<EmployeeCuilRow>($"""SELECT "Id", COALESCE("Cuil", '') AS "Cuil" FROM hr."Employees" WHERE "TenantId" = {tenantId} AND "Id" = ANY({ids})""").ToListAsync(ct);
        return cuils.Select(c => (Cuil: Digits(c.Cuil), Wallets: wallets.Where(w => w.EmployeeId == c.Id).ToList()))
            .Where(x => x.Cuil.Length == 11 && x.Wallets.Count == 1)
            .GroupBy(x => x.Cuil).Where(g => g.Count() == 1)
            .ToDictionary(g => g.Key, g => g.Single().Wallets[0]);
    }

    /// <summary>De 2 a 5 movimientos que suman exactamente el importe (búsqueda acotada a 12 candidatos).</summary>
    internal static List<FinancialMovement>? SubsetSum(List<FinancialMovement> candidates, decimal target)
    {
        List<FinancialMovement>? found = null;
        void Search(int start, decimal remaining, List<FinancialMovement> chosen)
        {
            if (found is not null) return;
            if (remaining == 0m && chosen.Count >= 2) { found = [.. chosen]; return; }
            if (remaining <= 0m || chosen.Count == 5) return;
            for (var i = start; i < candidates.Count && found is null; i++)
            {
                chosen.Add(candidates[i]);
                Search(i + 1, remaining - candidates[i].Amount, chosen);
                chosen.RemoveAt(chosen.Count - 1);
            }
        }
        Search(0, target, []);
        return found;
    }

    private static string Digits(string? value) => new((value ?? "").Where(char.IsDigit).ToArray());

    private sealed record CustomerTaxIdRow(Guid Id, string? TaxId);
}
