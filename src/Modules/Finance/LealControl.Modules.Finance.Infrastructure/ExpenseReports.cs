using LealControl.BuildingBlocks.Security;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Finance.Application.Payments;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Finance.Infrastructure;

/// <summary>Rendición de gastos de un empleado contra su billetera (planilla FS 7.1 901 R2).</summary>
public sealed class ExpenseReport
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public string Number { get; set; } = "";
    public Guid WalletAccountId { get; set; }
    public Guid EmployeeId { get; set; }
    public string EmployeeName { get; set; } = "";
    /// <summary>Lunes de la semana que se rinde.</summary>
    public DateTime WeekStart { get; set; }
    public Guid? VehicleId { get; set; }
    public string? VehiclePlate { get; set; }
    public Guid? ServiceOrderId { get; set; }
    public string? ServiceOrderLabel { get; set; }
    /// <summary>Dólar billete vendedor del Banco Nación con el que se controlaron los topes al aprobar.</summary>
    public decimal? UsdRate { get; set; }
    /// <summary>Open (se va cargando), Approved (descontada de la billetera).</summary>
    public string Status { get; set; } = "Open";
    public string? Notes { get; set; }
    public string? ApprovedBy { get; set; }
    public DateTime? ApprovedAtUtc { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public List<ExpenseReportLine> Lines { get; set; } = [];
}

public sealed class ExpenseReportLine
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid ReportId { get; set; }
    public DateTime Date { get; set; }
    public string Category { get; set; } = "";
    /// <summary>Personas que cubre el comprobante (el tope de hospedaje cambia de una a dos).</summary>
    public int People { get; set; } = 1;
    public string SupplierName { get; set; } = "";
    public string? SupplierTaxId { get; set; }
    /// <summary>A, B, C, Ticket, Recibo o SinComprobante. La factura A va a Compras por el crédito de IVA.</summary>
    public string VoucherType { get; set; } = "B";
    public string? VoucherNumber { get; set; }
    public decimal Amount { get; set; }
    public decimal? Liters { get; set; }
    public string? Detail { get; set; }
    /// <summary>Factura A ya registrada en Compras: al aprobar se paga con la billetera por orden de pago.</summary>
    public Guid? PurchaseInvoiceId { get; set; }
    public Guid? MovementId { get; set; }
    public Guid? PaymentOrderId { get; set; }
}

/// <summary>Topes por persona en dólares; excederlos no bloquea, avisa para que se apruebe a conciencia.</summary>
public sealed class ExpensePolicy
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public decimal MealUsd { get; set; } = 17m;
    public decimal SnackUsd { get; set; } = 10m;
    public decimal LodgingOneUsd { get; set; } = 30m;
    public decimal LodgingTwoUsd { get; set; } = 50m;
}

public sealed record CreateWalletRequest(Guid EmployeeId, decimal OpeningBalance);
public sealed record ExpenseReportRequest(Guid EmployeeId, DateTime WeekStart, Guid? VehicleId, Guid? ServiceOrderId, string? Notes);
public sealed record ExpenseLineRequest(DateTime Date, string Category, int People, string SupplierName, string? SupplierTaxId, string VoucherType,
    string? VoucherNumber, decimal Amount, decimal? Liters, string? Detail, Guid? PurchaseInvoiceId);
public sealed record ApproveExpenseReportRequest(decimal? UsdRate);
public sealed record ExpensePolicyRequest(decimal MealUsd, decimal SnackUsd, decimal LodgingOneUsd, decimal LodgingTwoUsd);

/// <summary>
/// Billeteras de viáticos y rendiciones de gastos. La billetera es una cuenta financiera del tipo Billetera vinculada al
/// empleado: los depósitos son transferencias desde el banco y los gastos salen de las rendiciones aprobadas. Las facturas
/// A a nombre de la empresa no se cargan dos veces: se vinculan a la factura de Compras y se pagan con una orden de pago.
/// </summary>
public static class ExpenseReports
{
    /// <summary>Categorías de la planilla, con el concepto financiero de cada una.</summary>
    public static readonly IReadOnlyDictionary<string, (string Name, string Concept)> Categories = new Dictionary<string, (string, string)>
    {
        ["Lodging"] = ("Hospedaje", "VIATICOS"),
        ["Meal"] = ("Comida", "VIATICOS"),
        ["Snack"] = ("Refrigerio", "VIATICOS"),
        ["Fuel"] = ("Combustible", "COMBUSTIBLE"),
        ["Taxi"] = ("Taxis / Remises", "VIATICOS"),
        ["Hardware"] = ("Ferretería", "FERRETERIA"),
        ["VehicleMaintenance"] = ("Mantenimiento vehículo", "MANTENIMIENTO_VEHICULOS"),
        ["Other"] = ("Otros", "OTROS_GASTOS")
    };
    private static readonly string[] VoucherTypes = ["A", "B", "C", "Ticket", "Recibo", "SinComprobante"];

    private static string Digits(string? s) => new((s ?? "").Where(char.IsAsciiDigit).ToArray());

    private sealed record EmployeeRow(Guid Id, string FirstName, string LastName);
    private sealed record PurchaseRow(Guid Id, Guid SupplierId, string SupplierName, string SupplierDocument, string FormattedNumber, decimal Total, string Status, string InvoiceType);

    private static async Task<Dictionary<Guid, string>> EmployeesAsync(FinanceDbContext db, Guid tenantId, CancellationToken ct)
    {
        var exists = await db.Database.SqlQuery<bool>($"""SELECT to_regclass('hr."Employees"') IS NOT NULL AS "Value" """).SingleAsync(ct);
        if (!exists) return [];
        var rows = await db.Database.SqlQuery<EmployeeRow>($"""
            SELECT "Id", COALESCE("FirstName", '') AS "FirstName", COALESCE("LastName", '') AS "LastName"
            FROM hr."Employees" WHERE "TenantId" = {tenantId}
            """).ToListAsync(ct);
        return rows.ToDictionary(e => e.Id, e => $"{e.LastName}, {e.FirstName}".Trim(' ', ','));
    }

    private static Task<List<PurchaseRow>> PurchasesAsync(FinanceDbContext db, Guid tenantId, Guid[] ids, CancellationToken ct) =>
        db.Database.SqlQuery<PurchaseRow>($"""
            SELECT "Id", "SupplierId", "SupplierName", "SupplierDocument", "FormattedNumber", "Total", "Status", "InvoiceType"
            FROM purchases.purchase_invoices WHERE "TenantId" = {tenantId} AND "Id" = ANY({ids})
            """).ToListAsync(ct);

    private static async Task<ExpensePolicy> PolicyAsync(FinanceDbContext db, Guid tenantId, CancellationToken ct) =>
        await db.ExpensePolicies.AsNoTracking().FirstOrDefaultAsync(p => p.TenantId == tenantId, ct) ?? new ExpensePolicy { TenantId = tenantId };

    private static decimal Balance(FinancialAccount account, IEnumerable<FinancialMovement> movements) =>
        account.OpeningBalance + movements.Where(m => m.AccountId == account.Id).Sum(m => m.Kind == FinancialMovementKind.Credit ? m.Amount : -m.Amount);

    /// <summary>Por qué no se puede aprobar (factura A sin vincular, datos faltantes), renglón por renglón.</summary>
    private static List<string> Problems(ExpenseReport report, IReadOnlyDictionary<Guid, PurchaseRow> purchases)
    {
        var problems = new List<string>();
        foreach (var l in report.Lines.OrderBy(l => l.Date))
        {
            var label = $"{l.Date:dd/MM} {l.SupplierName} {l.VoucherNumber}".Trim();
            if (l.VoucherType != "A") continue;
            if (l.PurchaseInvoiceId is not { } id || !purchases.TryGetValue(id, out var p))
                problems.Add($"{label}: la factura A tiene que estar registrada en Compras y vinculada.");
            else if (p.Status == "Cancelled")
                problems.Add($"{label}: la factura de Compras vinculada está anulada.");
            else if (p.Total != l.Amount)
                problems.Add($"{label}: el importe ({l.Amount:N2}) no coincide con la factura de Compras ({p.Total:N2}).");
        }
        return problems;
    }

    private static async Task<object> ViewAsync(FinanceDbContext db, Guid tenantId, ExpenseReport r, CancellationToken ct)
    {
        var policy = await PolicyAsync(db, tenantId, ct);
        var wallet = await db.Accounts.AsNoTracking().FirstAsync(a => a.Id == r.WalletAccountId, ct);
        var movements = await db.Movements.AsNoTracking().Where(m => m.TenantId == tenantId && m.AccountId == wallet.Id).ToListAsync(ct);
        var weekEnd = r.WeekStart.AddDays(7);
        // Anticipos y reposiciones: lo que entró a la billetera en la semana (transferencias desde el banco).
        var advances = movements.Where(m => m.Kind == FinancialMovementKind.Credit && m.OperationDateUtc >= r.WeekStart && m.OperationDateUtc < weekEnd)
            .OrderBy(m => m.OperationDateUtc).Select(m => new { m.OperationDateUtc, m.Amount, m.Description }).ToList();
        var purchaseIds = r.Lines.Where(l => l.PurchaseInvoiceId.HasValue).Select(l => l.PurchaseInvoiceId!.Value).ToArray();
        var purchases = (await PurchasesAsync(db, tenantId, purchaseIds, ct)).ToDictionary(p => p.Id);
        var total = r.Lines.Sum(l => l.Amount);
        var balance = Balance(wallet, movements);
        return new
        {
            r.Id, r.Number, r.WalletAccountId, WalletName = wallet.Name, r.EmployeeId, r.EmployeeName, r.WeekStart, r.VehicleId, r.VehiclePlate,
            r.ServiceOrderId, r.ServiceOrderLabel, r.UsdRate, r.Status, r.Notes, r.ApprovedBy, r.ApprovedAtUtc, r.CreatedAtUtc,
            Total = total, Advances = advances, AdvancesTotal = advances.Sum(a => a.Amount),
            WalletBalance = balance,
            // Mientras está abierta, el saldo que quedaría al aprobarla.
            BalanceAfter = r.Status == "Open" ? balance - total : balance,
            Policy = new { policy.MealUsd, policy.SnackUsd, policy.LodgingOneUsd, policy.LodgingTwoUsd },
            Problems = r.Status == "Open" ? Problems(r, purchases) : [],
            Lines = r.Lines.OrderBy(l => l.Date).ThenBy(l => l.Category).Select(l => new
            {
                l.Id, l.Date, l.Category, CategoryName = Categories.GetValueOrDefault(l.Category).Name, l.People, l.SupplierName, l.SupplierTaxId,
                l.VoucherType, l.VoucherNumber, l.Amount, l.Liters, l.Detail, l.PurchaseInvoiceId,
                PurchaseInvoiceNumber = l.PurchaseInvoiceId is { } pid && purchases.TryGetValue(pid, out var p) ? p.FormattedNumber : null,
                l.MovementId, l.PaymentOrderId
            })
        };
    }

    public static IEndpointRouteBuilder MapExpenseReportEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/finance/expense-reports").WithTags("Finance").RequirePolicyOnWrites("RequireFinance");

        group.MapGet("/wallets", async (FinanceDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var wallets = await db.Accounts.AsNoTracking().Where(a => a.TenantId == t && a.EmployeeId != null).OrderBy(a => a.Name).ToListAsync(ct);
            var ids = wallets.Select(w => w.Id).ToList();
            var movements = await db.Movements.AsNoTracking().Where(m => m.TenantId == t && ids.Contains(m.AccountId)).ToListAsync(ct);
            var open = await db.ExpenseReports.AsNoTracking().Include(r => r.Lines).Where(r => r.TenantId == t && r.Status == "Open").ToListAsync(ct);
            return Results.Ok(wallets.Select(w => new
            {
                w.Id, w.Name, w.EmployeeId, w.IsActive, Balance = Balance(w, movements),
                OpenReports = open.Count(r => r.WalletAccountId == w.Id), PendingAmount = open.Where(r => r.WalletAccountId == w.Id).Sum(r => r.Lines.Sum(l => l.Amount))
            }));
        });

        group.MapPost("/wallets", async (CreateWalletRequest req, FinanceDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var employees = await EmployeesAsync(db, t, ct);
            if (!employees.TryGetValue(req.EmployeeId, out var name)) return Results.BadRequest(new { message = "El empleado no existe en RRHH." });
            if (await db.Accounts.AnyAsync(a => a.TenantId == t && a.EmployeeId == req.EmployeeId, ct))
                return Results.Conflict(new { message = $"{name} ya tiene billetera." });
            var account = new FinancialAccount
            {
                Id = Guid.NewGuid(), TenantId = t, Name = $"Billetera {name}", Currency = "ARS", Type = FinancialAccountType.Wallet,
                BookingMode = FinancialAccountBookingMode.Manual, OpeningBalance = req.OpeningBalance, EmployeeId = req.EmployeeId, CreatedAtUtc = DateTime.UtcNow
            };
            db.Accounts.Add(account);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/finance/accounts/{account.Id}", new { account.Id, account.Name });
        });

        group.MapGet("/policy", async (FinanceDbContext db, ITenantContext tenant, CancellationToken ct) => Results.Ok(await PolicyAsync(db, tenant.TenantId.Value, ct)));

        group.MapPut("/policy", async (ExpensePolicyRequest req, FinanceDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            if (new[] { req.MealUsd, req.SnackUsd, req.LodgingOneUsd, req.LodgingTwoUsd }.Any(v => v < 0)) return Results.BadRequest(new { message = "Los topes no pueden ser negativos." });
            var policy = await db.ExpensePolicies.FirstOrDefaultAsync(p => p.TenantId == t, ct)
                ?? db.ExpensePolicies.Add(new ExpensePolicy { Id = Guid.NewGuid(), TenantId = t }).Entity;
            (policy.MealUsd, policy.SnackUsd, policy.LodgingOneUsd, policy.LodgingTwoUsd) = (req.MealUsd, req.SnackUsd, req.LodgingOneUsd, req.LodgingTwoUsd);
            await db.SaveChangesAsync(ct);
            return Results.Ok(policy);
        });

        group.MapGet("", async (Guid? employeeId, FinanceDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var reports = await db.ExpenseReports.AsNoTracking().Include(r => r.Lines)
                .Where(r => r.TenantId == t && (employeeId == null || r.EmployeeId == employeeId))
                .OrderByDescending(r => r.WeekStart).ThenByDescending(r => r.Number).Take(200).ToListAsync(ct);
            return Results.Ok(reports.Select(r => new { r.Id, r.Number, r.EmployeeId, r.EmployeeName, r.WeekStart, r.VehiclePlate, r.ServiceOrderLabel, r.Status, Total = r.Lines.Sum(l => l.Amount), Lines = r.Lines.Count }));
        });

        group.MapGet("/{id:guid}", async (Guid id, FinanceDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var r = await db.ExpenseReports.AsNoTracking().Include(x => x.Lines).FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenant.TenantId.Value, ct);
            return r is null ? Results.NotFound() : Results.Ok(await ViewAsync(db, tenant.TenantId.Value, r, ct));
        });

        group.MapPost("", async (ExpenseReportRequest req, FinanceDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var wallet = await db.Accounts.AsNoTracking().FirstOrDefaultAsync(a => a.TenantId == t && a.EmployeeId == req.EmployeeId, ct);
            if (wallet is null) return Results.BadRequest(new { message = "El empleado no tiene billetera: creala primero." });
            var name = (await EmployeesAsync(db, t, ct)).GetValueOrDefault(req.EmployeeId) ?? wallet.Name;
            var report = new ExpenseReport
            {
                Id = Guid.NewGuid(), TenantId = t, WalletAccountId = wallet.Id, EmployeeId = req.EmployeeId, EmployeeName = name,
                Number = await FinanceDocumentSequences.NextNumberAsync(db, t, "ExpenseReport", "RND", ct), CreatedAtUtc = DateTime.UtcNow
            };
            var error = await ApplyHeaderAsync(db, t, report, req, ct);
            if (error is not null) return Results.BadRequest(new { message = error });
            db.ExpenseReports.Add(report);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/finance/expense-reports/{report.Id}", await ViewAsync(db, t, report, ct));
        });

        group.MapPut("/{id:guid}", async (Guid id, ExpenseReportRequest req, FinanceDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var report = await db.ExpenseReports.Include(x => x.Lines).FirstOrDefaultAsync(x => x.Id == id && x.TenantId == t, ct);
            if (report is null) return Results.NotFound();
            if (report.Status != "Open") return Results.Conflict(new { message = "La rendición ya está aprobada." });
            if (req.EmployeeId != report.EmployeeId) return Results.BadRequest(new { message = "No se puede cambiar el empleado de una rendición." });
            var error = await ApplyHeaderAsync(db, t, report, req, ct);
            if (error is not null) return Results.BadRequest(new { message = error });
            await db.SaveChangesAsync(ct);
            return Results.Ok(await ViewAsync(db, t, report, ct));
        });

        group.MapPost("/{id:guid}/lines", async (Guid id, ExpenseLineRequest req, FinanceDbContext db, ITenantContext tenant, CancellationToken ct) =>
            await SaveLineAsync(db, tenant.TenantId.Value, id, null, req, ct));

        group.MapPut("/{id:guid}/lines/{lineId:guid}", async (Guid id, Guid lineId, ExpenseLineRequest req, FinanceDbContext db, ITenantContext tenant, CancellationToken ct) =>
            await SaveLineAsync(db, tenant.TenantId.Value, id, lineId, req, ct));

        group.MapDelete("/{id:guid}/lines/{lineId:guid}", async (Guid id, Guid lineId, FinanceDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var report = await db.ExpenseReports.Include(x => x.Lines).FirstOrDefaultAsync(x => x.Id == id && x.TenantId == t, ct);
            if (report is null) return Results.NotFound();
            if (report.Status != "Open") return Results.Conflict(new { message = "La rendición ya está aprobada." });
            var line = report.Lines.FirstOrDefault(l => l.Id == lineId);
            if (line is null) return Results.NotFound();
            db.ExpenseReportLines.Remove(line);
            report.Lines.Remove(line);
            await db.SaveChangesAsync(ct);
            return Results.Ok(await ViewAsync(db, t, report, ct));
        });

        // Facturas de Compras que puede ser el comprobante del renglón: mismo CUIT del proveedor, sin pagos imputados ni otra rendición.
        group.MapGet("/purchase-candidates", async (string? supplierTaxId, string? search, FinanceDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var cuit = Digits(supplierTaxId);
            var text = $"%{(search ?? "").Trim()}%";
            var rows = await db.Database.SqlQuery<PurchaseRow>($"""
                SELECT "Id", "SupplierId", "SupplierName", "SupplierDocument", "FormattedNumber", "Total", "Status", "InvoiceType"
                FROM purchases.purchase_invoices
                WHERE "TenantId" = {t} AND "Status" = 'Recorded'
                  AND ({cuit} = '' OR REPLACE(REPLACE("SupplierDocument", '-', ''), ' ', '') = {cuit})
                  AND NOT EXISTS (SELECT 1 FROM finance."PaymentOrderImputations" i JOIN finance."PaymentOrders" o ON o."Id" = i."PaymentOrderId"
                                  WHERE i."PurchaseInvoiceId" = purchase_invoices."Id" AND o."Status" <> 'Voided')
                  AND NOT EXISTS (SELECT 1 FROM finance."ExpenseReportLines" l WHERE l."PurchaseInvoiceId" = purchase_invoices."Id")
                  AND ("SupplierName" ILIKE {text} OR "FormattedNumber" ILIKE {text})
                ORDER BY "IssueDate" DESC LIMIT 30
                """).ToListAsync(ct);
            return Results.Ok(rows.Select(p => new { p.Id, p.SupplierName, p.SupplierDocument, p.FormattedNumber, p.Total, p.InvoiceType }));
        });

        group.MapPost("/{id:guid}/approve", async (Guid id, ApproveExpenseReportRequest req, FinanceDbContext db, ITenantContext tenant, ISender sender, HttpContext http, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var report = await db.ExpenseReports.Include(x => x.Lines).FirstOrDefaultAsync(x => x.Id == id && x.TenantId == t, ct);
            if (report is null) return Results.NotFound();
            if (report.Status != "Open") return Results.Conflict(new { message = "La rendición ya está aprobada." });
            if (report.Lines.Count == 0) return Results.BadRequest(new { message = "La rendición no tiene gastos." });
            var purchases = (await PurchasesAsync(db, t, report.Lines.Where(l => l.PurchaseInvoiceId.HasValue).Select(l => l.PurchaseInvoiceId!.Value).ToArray(), ct)).ToDictionary(p => p.Id);
            if (Problems(report, purchases) is { Count: > 0 } problems) return Results.BadRequest(new { message = string.Join(" ", problems) });

            await FinanceConcepts.EnsureBaseConceptsAsync(db, t, ct);
            var concepts = await db.FinancialConcepts.AsNoTracking().Where(c => c.TenantId == t).ToDictionaryAsync(c => c.Code, c => c.Id, ct);
            var wallet = await db.Accounts.AsNoTracking().FirstAsync(a => a.Id == report.WalletAccountId, ct);

            // Facturas A: orden de pago desde la billetera, así Compras queda pagada y el gasto no se duplica.
            foreach (var line in report.Lines.Where(l => l.VoucherType == "A"))
            {
                var p = purchases[line.PurchaseInvoiceId!.Value];
                var result = await sender.Send(new CreatePaymentOrderCommand(p.SupplierId, p.SupplierName, p.SupplierDocument, line.Date, "ARS", line.Amount,
                    $"Rendición {report.Number} · {report.EmployeeName}",
                    [new PaymentOrderLineInput("Cash", line.Amount, "ARS", wallet.Id, null, null, null, null, null, null)],
                    [new PaymentOrderImputationInput(p.Id, p.FormattedNumber, p.Total, line.Amount)]), ct);
                if (!result.IsSuccess)
                    return Results.BadRequest(new { message = $"{line.SupplierName} {line.VoucherNumber}: no se pudo pagar la factura de Compras. {result.Error.Message}" });
                line.PaymentOrderId = result.Value.Id;
            }
            // El resto: un egreso de la billetera por comprobante, con el concepto de su categoría.
            foreach (var line in report.Lines.Where(l => l.VoucherType != "A"))
            {
                var movement = new FinancialMovement
                {
                    Id = Guid.NewGuid(), TenantId = t, AccountId = wallet.Id, Kind = FinancialMovementKind.Debit, Amount = line.Amount, Currency = "ARS",
                    OperationDateUtc = line.Date, Description = $"{Categories[line.Category].Name} · {line.SupplierName} {line.VoucherNumber}".Trim(),
                    ExternalReference = report.Number, ConceptId = concepts.TryGetValue(Categories[line.Category].Concept, out var c) ? c : null,
                    LinkedEntityType = "ExpenseReport", LinkedEntityId = report.Id, CreatedAtUtc = DateTime.UtcNow
                };
                FinanceSystemMovementHelper.ApplySystemDefaults(movement, wallet);
                db.Movements.Add(movement);
                line.MovementId = movement.Id;
            }
            report.Status = "Approved";
            report.UsdRate = req.UsdRate;
            report.ApprovedBy = http.User.Identity?.Name;
            report.ApprovedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return Results.Ok(await ViewAsync(db, t, report, ct));
        });

        // Volver a abrirla: se borran los egresos y se anulan las órdenes de pago de las facturas A.
        group.MapPost("/{id:guid}/reopen", async (Guid id, FinanceDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var report = await db.ExpenseReports.Include(x => x.Lines).FirstOrDefaultAsync(x => x.Id == id && x.TenantId == t, ct);
            if (report is null) return Results.NotFound();
            if (report.Status != "Approved") return Results.Conflict(new { message = "La rendición no está aprobada." });
            var movementIds = report.Lines.Where(l => l.MovementId.HasValue).Select(l => l.MovementId!.Value).ToList();
            var movements = await db.Movements.Where(m => movementIds.Contains(m.Id)).ToListAsync(ct);
            foreach (var line in report.Lines.Where(l => l.PaymentOrderId.HasValue))
            {
                await FinanceVoid.VoidPaymentOrderAsync(line.PaymentOrderId!.Value, new VoidFinanceDocumentRequest($"Rendición {report.Number} reabierta"), db, t, ct, fromExpenseReport: true);
                if (await db.PaymentOrders.AnyAsync(o => o.Id == line.PaymentOrderId && o.Status != "Voided", ct))
                    return Results.Conflict(new { message = $"No se pudo anular la orden de pago de {line.SupplierName} {line.VoucherNumber}." });
                line.PaymentOrderId = null;
            }
            db.Movements.RemoveRange(movements);
            foreach (var line in report.Lines) line.MovementId = null;
            report.Status = "Open";
            report.UsdRate = null;
            report.ApprovedBy = null;
            report.ApprovedAtUtc = null;
            await db.SaveChangesAsync(ct);
            return Results.Ok(await ViewAsync(db, t, report, ct));
        });

        return endpoints;
    }

    private static async Task<string?> ApplyHeaderAsync(FinanceDbContext db, Guid tenantId, ExpenseReport report, ExpenseReportRequest req, CancellationToken ct)
    {
        var monday = req.WeekStart.Date.AddDays(-(((int)req.WeekStart.DayOfWeek + 6) % 7));
        report.WeekStart = DateTime.SpecifyKind(monday, DateTimeKind.Utc);
        report.Notes = string.IsNullOrWhiteSpace(req.Notes) ? null : req.Notes.Trim();
        (report.VehicleId, report.VehiclePlate) = (null, null);
        if (req.VehicleId is { } vehicleId)
        {
            var plate = await db.Database.SqlQuery<string>($"""SELECT "Plate" AS "Value" FROM fleet."Vehicles" WHERE "TenantId" = {tenantId} AND "Id" = {vehicleId}""").FirstOrDefaultAsync(ct);
            if (plate is null) return "El vehículo no existe en Flota.";
            (report.VehicleId, report.VehiclePlate) = (vehicleId, plate);
        }
        (report.ServiceOrderId, report.ServiceOrderLabel) = (null, null);
        if (req.ServiceOrderId is { } orderId)
        {
            var label = await db.Database.SqlQuery<string>($"""SELECT 'OS ' || "Number" || ' · ' || "CustomerName" AS "Value" FROM fleet."ServiceOrders" WHERE "TenantId" = {tenantId} AND "Id" = {orderId}""").FirstOrDefaultAsync(ct);
            if (label is null) return "La orden de servicio no existe.";
            (report.ServiceOrderId, report.ServiceOrderLabel) = (orderId, label);
        }
        return null;
    }

    private static async Task<IResult> SaveLineAsync(FinanceDbContext db, Guid tenantId, Guid reportId, Guid? lineId, ExpenseLineRequest req, CancellationToken ct)
    {
        var report = await db.ExpenseReports.Include(x => x.Lines).FirstOrDefaultAsync(x => x.Id == reportId && x.TenantId == tenantId, ct);
        if (report is null) return Results.NotFound();
        if (report.Status != "Open") return Results.Conflict(new { message = "La rendición ya está aprobada." });
        if (!Categories.ContainsKey(req.Category)) return Results.BadRequest(new { message = "Categoría inválida." });
        if (!VoucherTypes.Contains(req.VoucherType)) return Results.BadRequest(new { message = "Tipo de comprobante inválido." });
        if (req.Amount <= 0) return Results.BadRequest(new { message = "El importe tiene que ser mayor a cero." });
        if (string.IsNullOrWhiteSpace(req.SupplierName)) return Results.BadRequest(new { message = "Falta el proveedor o la razón social." });
        if (req.Date.Date < report.WeekStart.Date || req.Date.Date >= report.WeekStart.Date.AddDays(7))
            return Results.BadRequest(new { message = $"La fecha tiene que estar en la semana del {report.WeekStart:dd/MM} al {report.WeekStart.AddDays(6):dd/MM}." });
        if (req.PurchaseInvoiceId is { } pid && req.VoucherType == "A")
        {
            var linked = (await PurchasesAsync(db, tenantId, [pid], ct)).FirstOrDefault();
            if (linked is null) return Results.BadRequest(new { message = "La factura de Compras no existe." });
            if (report.Lines.Any(l => l.Id != lineId && l.PurchaseInvoiceId == pid)
                || await db.ExpenseReportLines.AnyAsync(l => l.TenantId == tenantId && l.ReportId != reportId && l.PurchaseInvoiceId == pid, ct))
                return Results.Conflict(new { message = $"La factura {linked.FormattedNumber} ya está en otra rendición." });
        }
        var line = lineId is { } existing ? report.Lines.FirstOrDefault(l => l.Id == existing) : null;
        if (lineId.HasValue && line is null) return Results.NotFound();
        if (line is null)
        {
            line = new ExpenseReportLine { Id = Guid.NewGuid(), TenantId = tenantId, ReportId = report.Id };
            // Al agregarla al contexto, EF la suma sola a report.Lines (sumarla a mano la duplica).
            db.ExpenseReportLines.Add(line);
        }
        line.Date = DateTime.SpecifyKind(req.Date.Date, DateTimeKind.Utc);
        line.Category = req.Category;
        line.People = Math.Clamp(req.People, 1, 20);
        line.SupplierName = req.SupplierName.Trim();
        line.SupplierTaxId = Digits(req.SupplierTaxId) is { Length: 11 } cuit ? cuit : null;
        line.VoucherType = req.VoucherType;
        line.VoucherNumber = string.IsNullOrWhiteSpace(req.VoucherNumber) ? null : req.VoucherNumber.Trim();
        line.Amount = Math.Round(req.Amount, 2);
        line.Liters = req.Category == "Fuel" && req.Liters > 0 ? req.Liters : null;
        line.Detail = string.IsNullOrWhiteSpace(req.Detail) ? null : req.Detail.Trim();
        line.PurchaseInvoiceId = req.VoucherType == "A" ? req.PurchaseInvoiceId : null;
        await db.SaveChangesAsync(ct);
        return Results.Ok(await ViewAsync(db, tenantId, report, ct));
    }
}
