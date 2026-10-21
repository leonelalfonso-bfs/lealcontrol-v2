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
public sealed record ConfirmTrayRequest(Guid AccountId, List<TrayMatch>? Matches, List<TrayCheque>? Cheques, List<Guid>? Classify, List<TrayMatchMany>? MatchesMany = null);

/// <summary>
/// Bandeja de conciliación (nota 69, F1b): para cada movimiento del extracto sin conciliar, la acción sugerida, en este orden:
/// 1) conciliar con un cobro o pago del sistema (mismo importe, ±5 días; entre varios, el del mismo CUIT y la fecha más cercana),
///    o con varios del mismo CUIT que suman el importe (una transferencia que paga varias órdenes);
/// 2) un eCheq emitido por su número; 3) crear la orden de pago o el recibo del proveedor o cliente del CUIT;
/// 4) un gasto, impuesto o inversión ya clasificado; 5) sin identificar. Las sugerencias se confirman todas juntas.
/// </summary>
public static partial class FinanceReconciliationTray
{
    public static readonly TimeSpan DateTolerance = TimeSpan.FromDays(5);

    [GeneratedRegex(@"echeq.*?(?:nro\.?:?|n[º°]\.?|#)\s*0*(\d{1,12})\b", RegexOptions.IgnoreCase)]
    private static partial Regex EcheqNumber();

    /// <summary>Número de cheque que nombra el banco ("Echeq 48 Hs. Nro. 345", "Echeq Galicia Nro: 345").</summary>
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

            var usedSystem = new HashSet<Guid>();
            var usedCheques = new HashSet<Guid>();
            var rows = new List<object>();
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
                else if (m.SuggestedCounterpartyId is { } partyId && m.SuggestedCounterpartyType is "Supplier" or "Customer")
                    suggestion = new { Type = m.SuggestedCounterpartyType == "Supplier" ? "CreatePayment" : "CreateReceipt", CounterpartyId = partyId };
                else if (m.ConceptId is { } conceptId && concepts.TryGetValue(conceptId, out var concept)
                    && concept.UsableIn is FinancialConceptUsableIn.MovementOnly or FinancialConceptUsableIn.Transfer)
                    suggestion = new { Type = "Classified", ConceptId = conceptId, Label = concept.Name };
                rows.Add(new
                {
                    m.Id, m.OperationDateUtc, m.Kind, m.Amount, m.Description, m.CounterpartyTaxId, m.CounterpartyName,
                    Suggestion = suggestion ?? new { Type = "Unknown" }
                });
            }
            return Results.Ok(new { AccountId = accountId, Rows = rows, PendingSystem = system.Count(s => !usedSystem.Contains(s.Id)) });
        });

        group.MapPost("/confirm", async (ConfirmTrayRequest body, FinanceDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var ids = (body.Matches ?? []).SelectMany(x => new[] { x.ImportedId, x.SystemId })
                .Concat((body.MatchesMany ?? []).SelectMany(x => x.SystemIds.Append(x.ImportedId)))
                .Concat((body.Cheques ?? []).Select(x => x.ImportedId)).Concat(body.Classify ?? []).ToList();
            var movements = await db.Movements.Where(x => x.TenantId == tenantId && x.AccountId == body.AccountId && ids.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
            int matched = 0, chequesLinked = 0, classified = 0;
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
            return Results.Ok(new { Matched = matched, Cheques = chequesLinked, Classified = classified, Errors = errors });
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
