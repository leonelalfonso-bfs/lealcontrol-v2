using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Accounting.Contracts.Posting;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Finance.Infrastructure;

public sealed record TreasuryResetRequest(string Confirm);

/// <summary>
/// Reinicio total de Tesorería de la empresa, para volver a cargar todo desde los extractos: borra movimientos
/// de todas las cuentas, importaciones, cheques, recibos, órdenes de pago (con retenciones, anticipos y lotes de
/// pago) y operaciones de FCI. Los asientos de recibos y órdenes se revierten en Contabilidad; las rendiciones
/// aprobadas vuelven a abiertas. Se conservan las cuentas, conceptos, reglas, fondos y la numeración (los
/// números ya entregados no se repiten). Facturas de venta y compra no se tocan: vuelven a figurar impagas.
/// </summary>
internal static class FinanceTreasuryReset
{
    public const string ConfirmPhrase = "BORRAR TESORERIA";

    public sealed record Summary(int Accounts, int Movements, int Imports, int Cheques, int Receipts, int PaymentOrders,
        int Withholdings, int Advances, int PaymentBatches, int FundOperations, int ExpenseReportsReopened);

    public static void MapTreasuryResetEndpoints(IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/finance/treasury-reset").WithTags("Finance");

        group.MapGet("", async (FinanceDbContext db, ITenantContext tenant, CancellationToken ct) =>
            Results.Ok(await CountAsync(db, tenant.TenantId.Value, ct))).RequireAuthorization("RequireAdmin");

        group.MapPost("", async (TreasuryResetRequest body, FinanceDbContext db, ITenantContext tenant, IAccountingPostingGateway accounting, CancellationToken ct) =>
        {
            if (!string.Equals(body.Confirm?.Trim(), ConfirmPhrase, StringComparison.OrdinalIgnoreCase))
                return Results.BadRequest($"Escribí \"{ConfirmPhrase}\" para confirmar.");
            var t = tenant.TenantId.Value;
            var summary = await CountAsync(db, t, ct);

            // Primero Contabilidad: lo pendiente queda omitido y lo contabilizado se revierte con un asiento inverso.
            var documents = (await db.CollectionReceipts.Where(x => x.TenantId == t).Select(x => x.Id).ToListAsync(ct))
                .Concat(await db.PaymentOrders.Where(x => x.TenantId == t).Select(x => x.Id).ToListAsync(ct));
            foreach (var id in documents)
                await accounting.ReverseAsync(AccountingSourceModules.Finance, id.ToString(), "Reinicio de Tesorería", ct);

            await using var tx = await db.Database.BeginTransactionAsync(ct);
            await db.CollectionReceiptImputations.Where(x => x.TenantId == t).ExecuteDeleteAsync(ct);
            await db.CollectionReceiptLines.Where(x => x.TenantId == t).ExecuteDeleteAsync(ct);
            await db.CustomerAdvances.Where(x => x.TenantId == t).ExecuteDeleteAsync(ct);
            await db.CollectionReceipts.Where(x => x.TenantId == t).ExecuteDeleteAsync(ct);
            await db.Withholdings.Where(x => x.TenantId == t).ExecuteDeleteAsync(ct);
            await db.PaymentBatchItems.Where(x => x.TenantId == t).ExecuteDeleteAsync(ct);
            await db.PaymentBatches.Where(x => x.TenantId == t).ExecuteDeleteAsync(ct);
            await db.PaymentOrderImputations.Where(x => x.TenantId == t).ExecuteDeleteAsync(ct);
            await db.PaymentOrderLines.Where(x => x.TenantId == t).ExecuteDeleteAsync(ct);
            await db.PaymentOrders.Where(x => x.TenantId == t).ExecuteDeleteAsync(ct);
            await db.ReceivedCheques.Where(x => x.TenantId == t).ExecuteDeleteAsync(ct);
            await db.ExpenseReportLines.Where(x => x.TenantId == t && x.MovementId != null)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.MovementId, (Guid?)null), ct);
            await db.ExpenseReports.Where(x => x.TenantId == t && x.Status == "Approved")
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.Status, "Open").SetProperty(x => x.ApprovedBy, (string?)null).SetProperty(x => x.ApprovedAtUtc, (DateTime?)null), ct);
            await db.Movements.Where(x => x.TenantId == t).ExecuteDeleteAsync(ct);
            await db.BankStatementImports.Where(x => x.TenantId == t).ExecuteDeleteAsync(ct);
            await db.InvestmentFundOperations.Where(x => x.TenantId == t).ExecuteDeleteAsync(ct);
            await tx.CommitAsync(ct);
            return Results.Ok(summary);
        }).RequireAuthorization("RequireAdmin");
    }

    private static async Task<Summary> CountAsync(FinanceDbContext db, Guid t, CancellationToken ct) => new(
        await db.Accounts.CountAsync(x => x.TenantId == t, ct),
        await db.Movements.CountAsync(x => x.TenantId == t, ct),
        await db.BankStatementImports.CountAsync(x => x.TenantId == t, ct),
        await db.ReceivedCheques.CountAsync(x => x.TenantId == t, ct),
        await db.CollectionReceipts.CountAsync(x => x.TenantId == t, ct),
        await db.PaymentOrders.CountAsync(x => x.TenantId == t, ct),
        await db.Withholdings.CountAsync(x => x.TenantId == t, ct),
        await db.CustomerAdvances.CountAsync(x => x.TenantId == t, ct),
        await db.PaymentBatches.CountAsync(x => x.TenantId == t, ct),
        await db.InvestmentFundOperations.CountAsync(x => x.TenantId == t, ct),
        await db.ExpenseReports.CountAsync(x => x.TenantId == t && x.Status == "Approved", ct));
}
