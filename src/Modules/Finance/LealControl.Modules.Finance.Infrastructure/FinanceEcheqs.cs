using LealControl.BuildingBlocks.Security;
using System.Globalization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Finance.Infrastructure;

public sealed record CreateReceivedChequeRequest(string CheckNumber, decimal Amount, string Currency, DateTime? IssueDateUtc, DateTime? DueDateUtc, string? IssuerName, string? IssuerTaxId, string? BankName, string? Notes, ChequeDirection Direction = ChequeDirection.Received);
public sealed record ImportReceivedChequesRequest(string CsvContent);
public sealed record ImportIssuedChequesRequest(string CsvContent);
public sealed record LinkChequeMovementRequest(Guid AccountId, Guid MovementId, bool IsCredit);
public sealed record UseChequeForPaymentRequest(string Reference);

public static class FinanceEcheqs
{
    public static IEndpointRouteBuilder MapFinanceEcheqEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/finance/echeqs").WithTags("Finance eCheqs").RequirePolicyOnWrites("RequireFinance");
        group.MapGet("", async (FinanceDbContext db, LealControl.BuildingBlocks.Tenancy.ITenantContext tenant, CancellationToken ct) =>
            Results.Ok(await db.ReceivedCheques.AsNoTracking().Where(x => x.TenantId == tenant.TenantId.Value).OrderByDescending(x => x.DueDateUtc).ThenByDescending(x => x.CreatedAtUtc).ToListAsync(ct)));
        group.MapPost("", async (CreateReceivedChequeRequest body, FinanceDbContext db, LealControl.BuildingBlocks.Tenancy.ITenantContext tenant, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(body.CheckNumber) || body.Amount <= 0) return Results.BadRequest("Número e importe son obligatorios.");
            var item = new ReceivedCheque { Id = Guid.NewGuid(), TenantId = tenant.TenantId.Value, CheckNumber = body.CheckNumber.Trim(), Amount = body.Amount, Currency = string.IsNullOrWhiteSpace(body.Currency) ? "ARS" : body.Currency.Trim().ToUpperInvariant(), IssueDateUtc = body.IssueDateUtc, DueDateUtc = body.DueDateUtc, IssuerName = body.IssuerName?.Trim(), IssuerTaxId = body.IssuerTaxId?.Trim(), BankName = body.BankName?.Trim(), Notes = body.Notes?.Trim(), Direction = body.Direction, Status = ReceivedChequeStatus.Available, CreatedAtUtc = DateTime.UtcNow };
            db.ReceivedCheques.Add(item); await db.SaveChangesAsync(ct); return Results.Created($"/api/v1/finance/echeqs/{item.Id}", item);
        });
        group.MapPost("/import", async (ImportReceivedChequesRequest body, FinanceDbContext db, LealControl.BuildingBlocks.Tenancy.ITenantContext tenant, CancellationToken ct) =>
        {
            var lines = body.CsvContent.Replace("\r", "").Split('\n', StringSplitOptions.RemoveEmptyEntries); if (lines.Length < 3) return Results.BadRequest("El archivo no contiene el formato de cheques recibidos.");
            var tenantId = tenant.TenantId.Value; var imported = 0; var duplicates = 0;
            foreach (var raw in lines.Skip(2))
            {
                var c = raw.Split(';'); if (c.Length < 9) continue; var number = c[0].Trim(); var amount = ParseMoney(c[6]); if (string.IsNullOrWhiteSpace(number) || amount <= 0) continue;
                var echeqId = c.Length > 9 ? c[9].Trim() : null; if (await db.ReceivedCheques.AnyAsync(x => x.TenantId == tenantId && x.Direction == ChequeDirection.Received && x.CheckNumber == number && x.Amount == amount && x.EcheqId == echeqId, ct)) { duplicates++; continue; }
                db.ReceivedCheques.Add(new ReceivedCheque { Id = Guid.NewGuid(), TenantId = tenantId, CheckNumber = number, EcheqId = echeqId, Cmc7 = c.Length > 10 ? c[10].Trim() : null, Amount = amount, Currency = "ARS", DueDateUtc = ParseDate(c[4]), IssueDateUtc = ParseDate(c[5]), Direction = ChequeDirection.Received, Status = ReceivedChequeStatus.Available, BankName = c[8].Trim(), ReceivedFrom = c.Length > 2 ? c[2].Trim() : null, IssuerTaxId = c.Length > 3 ? c[3].Trim() : null, IssuerName = c.Length > 16 ? c[16].Trim() : null, Notes = c.Length > 11 ? c[11].Trim() : null, CreatedAtUtc = DateTime.UtcNow }); imported++;
            }
            await db.SaveChangesAsync(ct); return Results.Ok(new { imported, duplicates });
        });
        group.MapPost("/import-issued", async (ImportIssuedChequesRequest body, FinanceDbContext db, LealControl.BuildingBlocks.Tenancy.ITenantContext tenant, CancellationToken ct) =>
        {
            var lines = body.CsvContent.Replace("\r", "").Split('\n', StringSplitOptions.RemoveEmptyEntries); if (lines.Length < 3) return Results.BadRequest("El archivo no contiene el formato de cheques emitidos.");
            var tenantId = tenant.TenantId.Value; var imported = 0; var duplicates = 0;
            foreach (var raw in lines.Skip(2))
            {
                var c = raw.Split(';'); if (c.Length < 13) continue; var number = c[0].Trim(); var amount = ParseMoney(c[6]); if (string.IsNullOrWhiteSpace(number) || amount <= 0) continue;
                var echeqId = c.Length > 10 ? c[10].Trim() : null;
                if (await db.ReceivedCheques.AnyAsync(x => x.TenantId == tenantId && x.Direction == ChequeDirection.Issued && x.CheckNumber == number && x.Amount == amount && x.EcheqId == echeqId, ct)) { duplicates++; continue; }
                db.ReceivedCheques.Add(new ReceivedCheque { Id = Guid.NewGuid(), TenantId = tenantId, CheckNumber = number, EcheqId = echeqId, Cmc7 = c.Length > 11 ? c[11].Trim() : null, Amount = amount, Currency = "ARS", DueDateUtc = ParseDate(c[4]), IssueDateUtc = ParseDate(c[5]), Direction = ChequeDirection.Issued, Status = ReceivedChequeStatus.Available, BankName = c.Length > 9 ? c[9].Trim() : null, ReceivedFrom = c.Length > 1 ? c[1].Trim() : null, IssuerTaxId = c.Length > 3 ? c[3].Trim() : null, IssuerName = c.Length > 17 ? c[17].Trim() : null, Notes = c.Length > 12 ? c[12].Trim() : null, CreatedAtUtc = DateTime.UtcNow });
                imported++;
            }
            await db.SaveChangesAsync(ct); return Results.Ok(new { imported, duplicates });
        });
        group.MapPost("/{id:guid}/link-movement", async (Guid id, LinkChequeMovementRequest body, FinanceDbContext db, LealControl.BuildingBlocks.Tenancy.ITenantContext tenant, CancellationToken ct) =>
        {
            var cheque = await db.ReceivedCheques.SingleOrDefaultAsync(x => x.Id == id && x.TenantId == tenant.TenantId.Value, ct); var movement = await db.Movements.SingleOrDefaultAsync(x => x.Id == body.MovementId && x.AccountId == body.AccountId && x.TenantId == tenant.TenantId.Value, ct);
            if (cheque is null || movement is null) return Results.NotFound("Cheque o movimiento inexistente.");
            cheque.BankAccountId = body.AccountId; cheque.BankMovementId = movement.Id; if (body.IsCredit) { cheque.Status = ReceivedChequeStatus.Credited; cheque.CreditedAtUtc = movement.OperationDateUtc; } else { cheque.Status = ReceivedChequeStatus.Presented; cheque.DepositedAtUtc = movement.OperationDateUtc; }
            await db.SaveChangesAsync(ct); return Results.Ok(cheque);
        });
        group.MapPost("/{id:guid}/use-for-payment", async (Guid id, UseChequeForPaymentRequest body, FinanceDbContext db, LealControl.BuildingBlocks.Tenancy.ITenantContext tenant, CancellationToken ct) =>
        {
            var cheque = await db.ReceivedCheques.SingleOrDefaultAsync(x => x.Id == id && x.TenantId == tenant.TenantId.Value, ct); if (cheque is null) return Results.NotFound("Cheque inexistente."); if (cheque.Status != ReceivedChequeStatus.Available) return Results.Conflict("Solo se puede usar un cheque disponible.");
            cheque.Status = ReceivedChequeStatus.UsedForPayment; cheque.Notes = string.IsNullOrWhiteSpace(body.Reference) ? cheque.Notes : $"Pago: {body.Reference}"; await db.SaveChangesAsync(ct); return Results.Ok(cheque);
        });
        group.MapPost("/normalize-imported", async (FinanceDbContext db, LealControl.BuildingBlocks.Tenancy.ITenantContext tenant, CancellationToken ct) =>
        {
            var rows = await db.ReceivedCheques.Where(x => x.TenantId == tenant.TenantId.Value && x.EcheqId != null && x.Direction == ChequeDirection.Received).ToListAsync(ct);
            foreach (var cheque in rows)
            {
                cheque.Direction = ChequeDirection.Received; cheque.Status = ReceivedChequeStatus.Available;
                cheque.BankAccountId = null; cheque.BankMovementId = null; cheque.DepositedAtUtc = null; cheque.CreditedAtUtc = null; cheque.CollectionReceiptId = null;
            }
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { normalized = rows.Count });
        });
        return endpoints;
    }
    private static decimal ParseMoney(string value) { var n = value.Trim().Replace("$", "").Replace(".", "").Replace(",", "."); return decimal.TryParse(n, NumberStyles.Any, CultureInfo.InvariantCulture, out var amount) ? amount : 0; }
    private static DateTime? ParseDate(string value) => DateTime.TryParseExact(value.Trim(), "dd/MM/yyyy", CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var date) ? date.ToUniversalTime() : null;
}
