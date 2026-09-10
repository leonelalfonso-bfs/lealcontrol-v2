using LealControl.BuildingBlocks.Security;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Finance.Infrastructure;

public enum FinancialConceptDirection { Income, Expense, Internal, Both }
public enum FinancialConceptUsableIn { Receipt, PaymentOrder, MovementOnly, Transfer }
public enum FinancialConceptCounterpartyType { None, Customer, Supplier }
public enum FinancialClassificationStatus { Imported, Suggested, PendingIdentification, Identified, Confirmed, Excluded }

public sealed class FinancialConcept
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public FinancialConceptDirection Direction { get; set; } = FinancialConceptDirection.Both;
    public bool IsActive { get; set; } = true;
    public bool RequiresCounterparty { get; set; }
    public bool RequiresInstrument { get; set; }
    public FinancialConceptUsableIn UsableIn { get; set; } = FinancialConceptUsableIn.Receipt;
    public FinancialConceptCounterpartyType CounterpartyType { get; set; } = FinancialConceptCounterpartyType.None;
    public string? JournalTemplateCode { get; set; }
    public string? CashFlowCategory { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? UpdatedAtUtc { get; set; }
}

public sealed class FinancialConceptRule
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid FinancialConceptId { get; set; }
    public Guid? AccountId { get; set; }
    public FinancialMovementKind? MovementKind { get; set; }
    public string MatchMode { get; set; } = "Contains";
    public string Pattern { get; set; } = "";
    public string? CuitPattern { get; set; }
    public decimal? AmountMin { get; set; }
    public decimal? AmountMax { get; set; }
    public Guid? SuggestedCounterpartyId { get; set; }
    public string? SuggestedCounterpartyType { get; set; }
    public int Priority { get; set; } = 100;
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; }
}

public sealed record UpsertFinancialConceptRequest(string Code, string Name, FinancialConceptDirection Direction, bool IsActive, bool RequiresCounterparty, bool RequiresInstrument, FinancialConceptUsableIn UsableIn, FinancialConceptCounterpartyType CounterpartyType, string? CashFlowCategory, string? JournalTemplateCode, string? Notes);
public sealed record CreateFinancialConceptRuleRequest(Guid FinancialConceptId, Guid? AccountId, FinancialMovementKind? MovementKind, string MatchMode, string Pattern, string? CuitPattern, decimal? AmountMin, decimal? AmountMax, Guid? SuggestedCounterpartyId, string? SuggestedCounterpartyType, int Priority, bool IsActive);
public sealed record BulkClassifyMovementsRequest(IReadOnlyList<Guid> MovementIds, bool Confirm);
public sealed record CreateRuleFromMovementRequest(string? Pattern, string MatchMode, int Priority);
public sealed record ClassifyFinancialMovementRequest(Guid? FinancialConceptId, bool Confirm, string? Note = null);

public static class FinanceConcepts
{
    private sealed record BaseConcept(
        string Code, string Name, FinancialConceptDirection Direction,
        FinancialConceptUsableIn UsableIn, FinancialConceptCounterpartyType CounterpartyType,
        bool Counterparty = false, bool Instrument = false, string? CashFlowCategory = null, string? JournalTemplateCode = null);
    private static readonly BaseConcept[] Defaults =
    [
        new("COBRO_CLIENTE", "Cobro de cliente", FinancialConceptDirection.Income, FinancialConceptUsableIn.Receipt, FinancialConceptCounterpartyType.Customer, true, false, "Cobranzas", "AM-FIN-01"),
        new("PAGO_PROVEEDOR", "Pago a proveedor", FinancialConceptDirection.Expense, FinancialConceptUsableIn.PaymentOrder, FinancialConceptCounterpartyType.Supplier, true, false, "Pagos a proveedores", "AM-FIN-10"),
        new("TRANSFERENCIA_PROPIA", "Transferencia entre cuentas propias", FinancialConceptDirection.Internal, FinancialConceptUsableIn.Transfer, FinancialConceptCounterpartyType.None, false, false, "Transferencias internas", "AM-FIN-20"),
        new("DEPOSITO_EFECTIVO", "Depósito de efectivo", FinancialConceptDirection.Internal, FinancialConceptUsableIn.Transfer, FinancialConceptCounterpartyType.None, false, false, "Transferencias internas", "AM-FIN-20"),
        new("EXTRACCION_EFECTIVO", "Extracción de efectivo", FinancialConceptDirection.Internal, FinancialConceptUsableIn.Transfer, FinancialConceptCounterpartyType.None, false, false, "Transferencias internas", "AM-FIN-20"),
        new("CHEQUE_RECIBIDO", "Cheque o eCheq recibido", FinancialConceptDirection.Income, FinancialConceptUsableIn.Receipt, FinancialConceptCounterpartyType.Customer, true, true, "Cobranzas", "AM-FIN-02"),
        new("CHEQUE_DEPOSITADO", "Depósito de cheque en banco", FinancialConceptDirection.Income, FinancialConceptUsableIn.MovementOnly, FinancialConceptCounterpartyType.None, false, false, "Cobranzas", "AM-FIN-03"),
        new("CHEQUE_EMITIDO", "Cheque o eCheq emitido", FinancialConceptDirection.Expense, FinancialConceptUsableIn.PaymentOrder, FinancialConceptCounterpartyType.Supplier, true, true, "Pagos a proveedores", "AM-FIN-11"),
        new("COMISION", "Comisiones financieras", FinancialConceptDirection.Expense, FinancialConceptUsableIn.MovementOnly, FinancialConceptCounterpartyType.None, false, false, "Gastos financieros", "AM-FIN-30"),
        new("GASTO_BANCARIO", "Gastos bancarios", FinancialConceptDirection.Expense, FinancialConceptUsableIn.MovementOnly, FinancialConceptCounterpartyType.None, false, false, "Gastos financieros", "AM-FIN-30"),
        new("IMPUESTO_RETENCION", "Impuesto, percepción o retención", FinancialConceptDirection.Expense, FinancialConceptUsableIn.MovementOnly, FinancialConceptCounterpartyType.None, false, false, "Impuestos", "AM-FIN-31"),
        new("INTERES_GANADO", "Intereses ganados", FinancialConceptDirection.Income, FinancialConceptUsableIn.MovementOnly, FinancialConceptCounterpartyType.None, false, false, "Resultados financieros", "AM-FIN-32"),
        new("INTERES_PAGADO", "Intereses pagados", FinancialConceptDirection.Expense, FinancialConceptUsableIn.MovementOnly, FinancialConceptCounterpartyType.None, false, false, "Resultados financieros", "AM-FIN-33"),
        new("INVERSION_SUSCRIPCION", "Suscripción de inversión", FinancialConceptDirection.Internal, FinancialConceptUsableIn.Transfer, FinancialConceptCounterpartyType.None, false, false, "Inversiones", "AM-FIN-20"),
        new("INVERSION_RESCATE", "Rescate de inversión", FinancialConceptDirection.Internal, FinancialConceptUsableIn.Transfer, FinancialConceptCounterpartyType.None, false, false, "Inversiones", "AM-FIN-20"),
        new("SUELDOS", "Sueldos y cargas sociales", FinancialConceptDirection.Expense, FinancialConceptUsableIn.MovementOnly, FinancialConceptCounterpartyType.None, false, false, "Personal", "AM-FIN-40"),
        new("PRESTAMO_RECIBIDO", "Préstamo recibido", FinancialConceptDirection.Income, FinancialConceptUsableIn.MovementOnly, FinancialConceptCounterpartyType.None, false, false, "Financiación"),
        new("PAGO_PRESTAMO", "Pago de préstamo", FinancialConceptDirection.Expense, FinancialConceptUsableIn.PaymentOrder, FinancialConceptCounterpartyType.None, false, false, "Financiación", "AM-FIN-10"),
        new("AJUSTE", "Ajuste o diferencia", FinancialConceptDirection.Both, FinancialConceptUsableIn.MovementOnly, FinancialConceptCounterpartyType.None, false, false, "Ajustes", "AM-FIN-90")
    ];

    private static FinancialConcept ToEntity(BaseConcept x, Guid tenantId) => new()
    {
        Id = Guid.NewGuid(), TenantId = tenantId, Code = x.Code, Name = x.Name, Direction = x.Direction,
        RequiresCounterparty = x.Counterparty, RequiresInstrument = x.Instrument, CashFlowCategory = x.CashFlowCategory,
        UsableIn = x.UsableIn, CounterpartyType = x.CounterpartyType, JournalTemplateCode = x.JournalTemplateCode,
        CreatedAtUtc = DateTime.UtcNow
    };

    private static bool SyncSeedAttributes(FinancialConcept item, BaseConcept def)
    {
        var changed = false;
        if (item.UsableIn != def.UsableIn) { item.UsableIn = def.UsableIn; changed = true; }
        if (item.CounterpartyType != def.CounterpartyType) { item.CounterpartyType = def.CounterpartyType; changed = true; }
        if (item.JournalTemplateCode != def.JournalTemplateCode) { item.JournalTemplateCode = def.JournalTemplateCode; changed = true; }
        if (item.RequiresCounterparty != def.Counterparty) { item.RequiresCounterparty = def.Counterparty; changed = true; }
        if (item.RequiresInstrument != def.Instrument) { item.RequiresInstrument = def.Instrument; changed = true; }
        if (changed) item.UpdatedAtUtc = DateTime.UtcNow;
        return changed;
    }

    public static async Task EnsureBaseConceptsAsync(FinanceDbContext db, Guid tenantId, CancellationToken ct)
    {
        var existing = await db.FinancialConcepts.Where(x => x.TenantId == tenantId).ToListAsync(ct);
        var existingCodes = existing.Select(x => x.Code).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var missing = Defaults.Where(x => !existingCodes.Contains(x.Code)).Select(x => ToEntity(x, tenantId)).ToList();
        if (missing.Count > 0)
        {
            db.FinancialConcepts.AddRange(missing);
            await db.SaveChangesAsync(ct);
            existing.AddRange(missing);
        }
        var changed = false;
        foreach (var def in Defaults)
        {
            var item = existing.FirstOrDefault(x => string.Equals(x.Code, def.Code, StringComparison.OrdinalIgnoreCase));
            if (item is not null && SyncSeedAttributes(item, def)) changed = true;
        }
        if (changed) await db.SaveChangesAsync(ct);
    }

    public static async Task ApplySuggestionAsync(FinanceDbContext db, Guid tenantId, FinancialMovement movement, CancellationToken ct)
    {
        var cuit = FinanceCounterpartyLookup.ExtractCuit(movement.Description);
        if (cuit is not null)
        {
            var resolved = await FinanceCounterpartyLookup.TryResolveUniqueAsync(db, tenantId, cuit, movement.Kind, ct);
            if (resolved is not null)
            {
                movement.SuggestedCounterpartyId = resolved.Value.Id;
                movement.SuggestedCounterpartyType = resolved.Value.Type;
                var code = movement.Kind == FinancialMovementKind.Credit ? "COBRO_CLIENTE" : "PAGO_PROVEEDOR";
                var concept = await db.FinancialConcepts.AsNoTracking()
                    .FirstOrDefaultAsync(x => x.TenantId == tenantId && x.Code == code && x.IsActive, ct);
                if (concept is not null)
                {
                    movement.ConceptId = concept.Id;
                    movement.ClassificationStatus = FinancialClassificationStatus.Suggested;
                    movement.ClassifiedAtUtc = DateTime.UtcNow;
                    return;
                }
            }
        }

        var rules = await (from rule in db.FinancialConceptRules
                           join concept in db.FinancialConcepts on rule.FinancialConceptId equals concept.Id
                           where rule.TenantId == tenantId && rule.IsActive && concept.IsActive
                                 && (rule.AccountId == null || rule.AccountId == movement.AccountId)
                                 && (rule.MovementKind == null || rule.MovementKind == movement.Kind)
                           orderby rule.Priority, rule.CreatedAtUtc
                           select new { rule, concept }).ToListAsync(ct);
        var match = rules.FirstOrDefault(x => FinanceConceptMatching.RuleMatches(movement, x.rule));
        if (match is null)
        {
            movement.ClassificationStatus = FinancialClassificationStatus.PendingIdentification;
            return;
        }
        movement.ConceptId = match.concept.Id;
        movement.ClassificationStatus = FinancialClassificationStatus.Suggested;
        movement.ConceptRuleId = match.rule.Id;
        movement.ClassifiedAtUtc = DateTime.UtcNow;
        if (match.rule.SuggestedCounterpartyId.HasValue)
        {
            movement.SuggestedCounterpartyId = match.rule.SuggestedCounterpartyId;
            movement.SuggestedCounterpartyType = match.rule.SuggestedCounterpartyType;
        }
    }

    public static IEndpointRouteBuilder MapFinanceConceptEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/finance").WithTags("Finance Concepts").RequirePolicyOnWrites("RequireFinance");
        group.MapGet("/concepts", async (FinanceDbContext db, LealControl.BuildingBlocks.Tenancy.ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value; await EnsureBaseConceptsAsync(db, tenantId, ct);
            return Results.Ok(await db.FinancialConcepts.AsNoTracking().Where(x => x.TenantId == tenantId).OrderBy(x => x.Name).ToListAsync(ct));
        });
        group.MapPost("/concepts", async (UpsertFinancialConceptRequest body, FinanceDbContext db, LealControl.BuildingBlocks.Tenancy.ITenantContext tenant, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(body.Code) || string.IsNullOrWhiteSpace(body.Name)) return Results.BadRequest("Código y nombre son obligatorios.");
            var tenantId = tenant.TenantId.Value; var code = body.Code.Trim().ToUpperInvariant();
            if (await db.FinancialConcepts.AnyAsync(x => x.TenantId == tenantId && x.Code == code, ct)) return Results.Conflict("Ya existe un concepto con ese código.");
            var item = new FinancialConcept { Id = Guid.NewGuid(), TenantId = tenantId, Code = code, Name = body.Name.Trim(), Direction = body.Direction, IsActive = body.IsActive, RequiresCounterparty = body.RequiresCounterparty, RequiresInstrument = body.RequiresInstrument, UsableIn = body.UsableIn, CounterpartyType = body.CounterpartyType, CashFlowCategory = body.CashFlowCategory?.Trim(), JournalTemplateCode = body.JournalTemplateCode?.Trim(), Notes = body.Notes?.Trim(), CreatedAtUtc = DateTime.UtcNow };
            db.FinancialConcepts.Add(item); await db.SaveChangesAsync(ct); return Results.Created($"/api/v1/finance/concepts/{item.Id}", item);
        });
        group.MapPut("/concepts/{conceptId:guid}", async (Guid conceptId, UpsertFinancialConceptRequest body, FinanceDbContext db, LealControl.BuildingBlocks.Tenancy.ITenantContext tenant, CancellationToken ct) =>
        {
            var item = await db.FinancialConcepts.SingleOrDefaultAsync(x => x.Id == conceptId && x.TenantId == tenant.TenantId.Value, ct);
            if (item is null) return Results.NotFound("Concepto inexistente.");
            if (string.IsNullOrWhiteSpace(body.Code) || string.IsNullOrWhiteSpace(body.Name)) return Results.BadRequest("Código y nombre son obligatorios.");
            item.Code = body.Code.Trim().ToUpperInvariant(); item.Name = body.Name.Trim(); item.Direction = body.Direction; item.IsActive = body.IsActive; item.RequiresCounterparty = body.RequiresCounterparty; item.RequiresInstrument = body.RequiresInstrument; item.UsableIn = body.UsableIn; item.CounterpartyType = body.CounterpartyType; item.CashFlowCategory = body.CashFlowCategory?.Trim(); item.JournalTemplateCode = body.JournalTemplateCode?.Trim(); item.Notes = body.Notes?.Trim(); item.UpdatedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(ct); return Results.Ok(item);
        });
        group.MapGet("/concept-rules", async (FinanceDbContext db, LealControl.BuildingBlocks.Tenancy.ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var items = await (from rule in db.FinancialConceptRules.AsNoTracking()
                               join concept in db.FinancialConcepts.AsNoTracking() on rule.FinancialConceptId equals concept.Id
                               where rule.TenantId == tenantId
                               orderby rule.Priority, rule.Pattern
                               select new { rule.Id, rule.FinancialConceptId, ConceptName = concept.Name, rule.AccountId, rule.MovementKind, rule.MatchMode, rule.Pattern, rule.Priority, rule.IsActive }).ToListAsync(ct);
            return Results.Ok(items);
        });
        group.MapPost("/concept-rules", async (CreateFinancialConceptRuleRequest body, FinanceDbContext db, LealControl.BuildingBlocks.Tenancy.ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            if (body.FinancialConceptId == Guid.Empty || string.IsNullOrWhiteSpace(body.Pattern)) return Results.BadRequest("Indicá concepto y texto a reconocer.");
            if (!await db.FinancialConcepts.AnyAsync(x => x.Id == body.FinancialConceptId && x.TenantId == tenantId && x.IsActive, ct)) return Results.NotFound("El concepto indicado no existe o está inactivo.");
            var mode = string.IsNullOrWhiteSpace(body.MatchMode) ? "Contains" : body.MatchMode.Trim();
            if (!new[] { "Contains", "StartsWith", "EndsWith", "Exact", "Regex" }.Contains(mode, StringComparer.OrdinalIgnoreCase)) return Results.BadRequest("Modo de coincidencia inválido.");
            var item = new FinancialConceptRule { Id = Guid.NewGuid(), TenantId = tenantId, FinancialConceptId = body.FinancialConceptId, AccountId = body.AccountId, MovementKind = body.MovementKind, MatchMode = mode, Pattern = body.Pattern.Trim(), CuitPattern = body.CuitPattern?.Trim(), AmountMin = body.AmountMin, AmountMax = body.AmountMax, SuggestedCounterpartyId = body.SuggestedCounterpartyId, SuggestedCounterpartyType = body.SuggestedCounterpartyType?.Trim(), Priority = Math.Max(1, body.Priority), IsActive = body.IsActive, CreatedAtUtc = DateTime.UtcNow };
            db.FinancialConceptRules.Add(item); await db.SaveChangesAsync(ct); return Results.Created($"/api/v1/finance/concept-rules/{item.Id}", item);
        });
        group.MapPost("/concept-rules/apply", async (FinanceDbContext db, LealControl.BuildingBlocks.Tenancy.ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            await EnsureBaseConceptsAsync(db, tenantId, ct);
            var movements = await db.Movements.Where(x => x.TenantId == tenantId && x.ClassificationStatus != FinancialClassificationStatus.Confirmed && x.ReconciliationStatus != FinancialReconciliationStatus.Reconciled).OrderByDescending(x => x.OperationDateUtc).Take(1000).ToListAsync(ct);
            foreach (var movement in movements) await ApplySuggestionAsync(db, tenantId, movement, ct);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { Processed = movements.Count, Suggested = movements.Count(x => x.ClassificationStatus == FinancialClassificationStatus.Suggested), Pending = movements.Count(x => x.ClassificationStatus == FinancialClassificationStatus.PendingIdentification) });
        });
        group.MapGet("/movements/review", async (FinanceDbContext db, LealControl.BuildingBlocks.Tenancy.ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var rows = await (from movement in db.Movements.AsNoTracking()
                              join account in db.Accounts.AsNoTracking() on movement.AccountId equals account.Id
                              join concept0 in db.FinancialConcepts.AsNoTracking() on movement.ConceptId equals concept0.Id into concepts
                              from concept in concepts.DefaultIfEmpty()
                              where movement.TenantId == tenantId
                              orderby movement.OperationDateUtc descending, movement.CreatedAtUtc descending
                              select new { movement.Id, movement.OperationDateUtc, movement.Description, movement.ExternalReference, movement.Kind, movement.Amount, movement.Currency, AccountName = account.Name, movement.ConceptId, ConceptName = concept == null ? null : concept.Name, movement.ClassificationStatus, movement.ReconciliationStatus }).Take(300).ToListAsync(ct);
            return Results.Ok(rows);
        });
        group.MapPost("/movements/{movementId:guid}/classification", async (Guid movementId, ClassifyFinancialMovementRequest body, FinanceDbContext db, LealControl.BuildingBlocks.Tenancy.ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value; var movement = await db.Movements.SingleOrDefaultAsync(x => x.Id == movementId && x.TenantId == tenantId, ct);
            if (movement is null) return Results.NotFound("Movimiento inexistente.");
            if (movement.ReconciliationStatus == FinancialReconciliationStatus.Reconciled)
                return Results.BadRequest("No se puede reclasificar un movimiento ya conciliado con un recibo u orden de pago.");
            if (body.FinancialConceptId is null || body.FinancialConceptId == Guid.Empty)
            {
                movement.ConceptId = null; movement.ConceptRuleId = null; movement.ClassificationStatus = FinancialClassificationStatus.PendingIdentification; movement.ClassificationNote = body.Note?.Trim(); movement.ClassifiedAtUtc = DateTime.UtcNow;
            }
            else
            {
                var concept = await db.FinancialConcepts.SingleOrDefaultAsync(x => x.Id == body.FinancialConceptId && x.TenantId == tenantId && x.IsActive, ct);
                if (concept is null) return Results.NotFound("Concepto inexistente o inactivo.");
                movement.ConceptId = body.FinancialConceptId; movement.ConceptRuleId = null; movement.ClassificationStatus = body.Confirm ? FinancialClassificationStatus.Confirmed : FinancialClassificationStatus.Identified; movement.ClassificationNote = body.Note?.Trim(); movement.ClassifiedAtUtc = DateTime.UtcNow;
                if (body.Confirm && concept.UsableIn == FinancialConceptUsableIn.MovementOnly && movement.ReconciliationStatus != FinancialReconciliationStatus.Reconciled)
                    movement.ReconciliationStatus = FinancialReconciliationStatus.Excluded;
            }
            await db.SaveChangesAsync(ct); return Results.Ok(new { movement.Id, movement.ConceptId, movement.ClassificationStatus, movement.ClassificationNote });
        });
        group.MapPost("/movements/classification/bulk", async (BulkClassifyMovementsRequest body, FinanceDbContext db, LealControl.BuildingBlocks.Tenancy.ITenantContext tenant, CancellationToken ct) =>
        {
            if (body.MovementIds is null || body.MovementIds.Count == 0) return Results.BadRequest("Indicá al menos un movimiento.");
            var tenantId = tenant.TenantId.Value;
            var confirmed = 0;
            foreach (var movementId in body.MovementIds.Distinct())
            {
                var movement = await db.Movements.SingleOrDefaultAsync(x => x.Id == movementId && x.TenantId == tenantId, ct);
                if (movement is null || movement.ReconciliationStatus == FinancialReconciliationStatus.Reconciled) continue;
                if (movement.ClassificationStatus != FinancialClassificationStatus.Suggested || !movement.ConceptId.HasValue) continue;
                movement.ClassificationStatus = FinancialClassificationStatus.Confirmed;
                movement.ClassifiedAtUtc = DateTime.UtcNow;
                var concept = await db.FinancialConcepts.AsNoTracking().SingleOrDefaultAsync(x => x.Id == movement.ConceptId && x.TenantId == tenantId, ct);
                if (concept?.UsableIn == FinancialConceptUsableIn.MovementOnly)
                    movement.ReconciliationStatus = FinancialReconciliationStatus.Excluded;
                confirmed++;
            }
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { confirmed });
        });
        group.MapPost("/movements/{movementId:guid}/create-rule", async (Guid movementId, CreateRuleFromMovementRequest body, FinanceDbContext db, LealControl.BuildingBlocks.Tenancy.ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var movement = await db.Movements.SingleOrDefaultAsync(x => x.Id == movementId && x.TenantId == tenantId, ct);
            if (movement is null) return Results.NotFound("Movimiento inexistente.");
            if (!movement.ConceptId.HasValue) return Results.BadRequest("Clasificá el movimiento antes de crear la regla.");
            var pattern = string.IsNullOrWhiteSpace(body.Pattern) ? movement.Description.Trim() : body.Pattern.Trim();
            if (pattern.Length > 120) pattern = pattern[..120];
            var mode = string.IsNullOrWhiteSpace(body.MatchMode) ? "Contains" : body.MatchMode.Trim();
            var rule = new FinancialConceptRule
            {
                Id = Guid.NewGuid(), TenantId = tenantId, FinancialConceptId = movement.ConceptId.Value,
                AccountId = movement.AccountId, MovementKind = movement.Kind, MatchMode = mode, Pattern = pattern,
                SuggestedCounterpartyId = movement.SuggestedCounterpartyId, SuggestedCounterpartyType = movement.SuggestedCounterpartyType,
                Priority = Math.Max(1, body.Priority), IsActive = true, CreatedAtUtc = DateTime.UtcNow
            };
            db.FinancialConceptRules.Add(rule);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/finance/concept-rules/{rule.Id}", rule);
        });
        return endpoints;
    }
}
