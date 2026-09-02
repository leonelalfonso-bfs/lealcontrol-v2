using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Finance.Infrastructure;

public enum FinancialConceptDirection { Income, Expense, Internal, Both }
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
    public int Priority { get; set; } = 100;
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; }
}

public sealed record UpsertFinancialConceptRequest(string Code, string Name, FinancialConceptDirection Direction, bool IsActive, bool RequiresCounterparty, bool RequiresInstrument, string? CashFlowCategory, string? Notes);
public sealed record CreateFinancialConceptRuleRequest(Guid FinancialConceptId, Guid? AccountId, FinancialMovementKind? MovementKind, string MatchMode, string Pattern, int Priority, bool IsActive);
public sealed record ClassifyFinancialMovementRequest(Guid? FinancialConceptId, bool Confirm, string? Note = null);

public static class FinanceConcepts
{
    private sealed record BaseConcept(string Code, string Name, FinancialConceptDirection Direction, bool Counterparty = false, bool Instrument = false, string? CashFlowCategory = null);
    private static readonly BaseConcept[] Defaults =
    [
        new("COBRO_CLIENTE", "Cobro de cliente", FinancialConceptDirection.Income, true, false, "Cobranzas"),
        new("PAGO_PROVEEDOR", "Pago a proveedor", FinancialConceptDirection.Expense, true, false, "Pagos a proveedores"),
        new("TRANSFERENCIA_PROPIA", "Transferencia entre cuentas propias", FinancialConceptDirection.Internal, false, false, "Transferencias internas"),
        new("DEPOSITO_EFECTIVO", "Depósito de efectivo", FinancialConceptDirection.Internal, false, false, "Transferencias internas"),
        new("EXTRACCION_EFECTIVO", "Extracción de efectivo", FinancialConceptDirection.Internal, false, false, "Transferencias internas"),
        new("CHEQUE_RECIBIDO", "Cheque o eCheq recibido", FinancialConceptDirection.Income, true, true, "Cobranzas"),
        new("CHEQUE_EMITIDO", "Cheque o eCheq emitido", FinancialConceptDirection.Expense, true, true, "Pagos a proveedores"),
        new("COMISION", "Comisiones financieras", FinancialConceptDirection.Expense, false, false, "Gastos financieros"),
        new("GASTO_BANCARIO", "Gastos bancarios", FinancialConceptDirection.Expense, false, false, "Gastos financieros"),
        new("IMPUESTO_RETENCION", "Impuesto, percepción o retención", FinancialConceptDirection.Expense, false, false, "Impuestos"),
        new("INTERES_GANADO", "Intereses ganados", FinancialConceptDirection.Income, false, false, "Resultados financieros"),
        new("INTERES_PAGADO", "Intereses pagados", FinancialConceptDirection.Expense, false, false, "Resultados financieros"),
        new("INVERSION_SUSCRIPCION", "Suscripción de inversión", FinancialConceptDirection.Internal, false, false, "Inversiones"),
        new("INVERSION_RESCATE", "Rescate de inversión", FinancialConceptDirection.Internal, false, false, "Inversiones"),
        new("SUELDOS", "Sueldos y cargas sociales", FinancialConceptDirection.Expense, false, false, "Personal"),
        new("PRESTAMO_RECIBIDO", "Préstamo recibido", FinancialConceptDirection.Income, false, false, "Financiación"),
        new("PAGO_PRESTAMO", "Pago de préstamo", FinancialConceptDirection.Expense, false, false, "Financiación"),
        new("AJUSTE", "Ajuste o diferencia", FinancialConceptDirection.Both, false, false, "Ajustes")
    ];

    public static async Task EnsureBaseConceptsAsync(FinanceDbContext db, Guid tenantId, CancellationToken ct)
    {
        var existingCodes = await db.FinancialConcepts.Where(x => x.TenantId == tenantId).Select(x => x.Code).ToListAsync(ct);
        var missing = Defaults.Where(x => !existingCodes.Contains(x.Code, StringComparer.OrdinalIgnoreCase)).Select(x => new FinancialConcept
        {
            Id = Guid.NewGuid(), TenantId = tenantId, Code = x.Code, Name = x.Name, Direction = x.Direction,
            RequiresCounterparty = x.Counterparty, RequiresInstrument = x.Instrument, CashFlowCategory = x.CashFlowCategory,
            CreatedAtUtc = DateTime.UtcNow
        }).ToList();
        if (missing.Count == 0) return;
        db.FinancialConcepts.AddRange(missing);
        await db.SaveChangesAsync(ct);
    }

    public static async Task ApplySuggestionAsync(FinanceDbContext db, Guid tenantId, FinancialMovement movement, CancellationToken ct)
    {
        var rules = await (from rule in db.FinancialConceptRules
                           join concept in db.FinancialConcepts on rule.FinancialConceptId equals concept.Id
                           where rule.TenantId == tenantId && rule.IsActive && concept.IsActive
                                 && (rule.AccountId == null || rule.AccountId == movement.AccountId)
                                 && (rule.MovementKind == null || rule.MovementKind == movement.Kind)
                           orderby rule.Priority, rule.CreatedAtUtc
                           select new { rule, concept }).ToListAsync(ct);
        var match = rules.FirstOrDefault(x => Matches(movement.Description, x.rule.Pattern, x.rule.MatchMode));
        if (match is null)
        {
            movement.ClassificationStatus = FinancialClassificationStatus.PendingIdentification;
            return;
        }
        movement.ConceptId = match.concept.Id;
        movement.ClassificationStatus = FinancialClassificationStatus.Suggested;
        movement.ConceptRuleId = match.rule.Id;
        movement.ClassifiedAtUtc = DateTime.UtcNow;
    }

    private static bool Matches(string source, string pattern, string mode)
    {
        if (string.IsNullOrWhiteSpace(pattern)) return false;
        var text = source.Trim(); var expected = pattern.Trim();
        return mode.Trim().ToUpperInvariant() switch
        {
            "STARTSWITH" => text.StartsWith(expected, StringComparison.OrdinalIgnoreCase),
            "ENDSWITH" => text.EndsWith(expected, StringComparison.OrdinalIgnoreCase),
            "EXACT" => string.Equals(text, expected, StringComparison.OrdinalIgnoreCase),
            _ => text.Contains(expected, StringComparison.OrdinalIgnoreCase)
        };
    }

    public static IEndpointRouteBuilder MapFinanceConceptEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/finance").WithTags("Finance Concepts");
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
            var item = new FinancialConcept { Id = Guid.NewGuid(), TenantId = tenantId, Code = code, Name = body.Name.Trim(), Direction = body.Direction, IsActive = body.IsActive, RequiresCounterparty = body.RequiresCounterparty, RequiresInstrument = body.RequiresInstrument, CashFlowCategory = body.CashFlowCategory?.Trim(), Notes = body.Notes?.Trim(), CreatedAtUtc = DateTime.UtcNow };
            db.FinancialConcepts.Add(item); await db.SaveChangesAsync(ct); return Results.Created($"/api/v1/finance/concepts/{item.Id}", item);
        });
        group.MapPut("/concepts/{conceptId:guid}", async (Guid conceptId, UpsertFinancialConceptRequest body, FinanceDbContext db, LealControl.BuildingBlocks.Tenancy.ITenantContext tenant, CancellationToken ct) =>
        {
            var item = await db.FinancialConcepts.SingleOrDefaultAsync(x => x.Id == conceptId && x.TenantId == tenant.TenantId.Value, ct);
            if (item is null) return Results.NotFound("Concepto inexistente.");
            if (string.IsNullOrWhiteSpace(body.Code) || string.IsNullOrWhiteSpace(body.Name)) return Results.BadRequest("Código y nombre son obligatorios.");
            item.Code = body.Code.Trim().ToUpperInvariant(); item.Name = body.Name.Trim(); item.Direction = body.Direction; item.IsActive = body.IsActive; item.RequiresCounterparty = body.RequiresCounterparty; item.RequiresInstrument = body.RequiresInstrument; item.CashFlowCategory = body.CashFlowCategory?.Trim(); item.Notes = body.Notes?.Trim(); item.UpdatedAtUtc = DateTime.UtcNow;
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
            if (!new[] { "Contains", "StartsWith", "EndsWith", "Exact" }.Contains(mode, StringComparer.OrdinalIgnoreCase)) return Results.BadRequest("Modo de coincidencia inválido.");
            var item = new FinancialConceptRule { Id = Guid.NewGuid(), TenantId = tenantId, FinancialConceptId = body.FinancialConceptId, AccountId = body.AccountId, MovementKind = body.MovementKind, MatchMode = mode, Pattern = body.Pattern.Trim(), Priority = Math.Max(1, body.Priority), IsActive = body.IsActive, CreatedAtUtc = DateTime.UtcNow };
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
                if (!await db.FinancialConcepts.AnyAsync(x => x.Id == body.FinancialConceptId && x.TenantId == tenantId && x.IsActive, ct)) return Results.NotFound("Concepto inexistente o inactivo.");
                movement.ConceptId = body.FinancialConceptId; movement.ConceptRuleId = null; movement.ClassificationStatus = body.Confirm ? FinancialClassificationStatus.Confirmed : FinancialClassificationStatus.Identified; movement.ClassificationNote = body.Note?.Trim(); movement.ClassifiedAtUtc = DateTime.UtcNow;
            }
            await db.SaveChangesAsync(ct); return Results.Ok(new { movement.Id, movement.ConceptId, movement.ClassificationStatus, movement.ClassificationNote });
        });
        return endpoints;
    }
}
