using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Security;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Accounting.Contracts.Posting;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace LealControl.Modules.Accounting.Infrastructure;

internal static class AccountingAccountsEndpoints
{
    public static RouteGroupBuilder MapAccountingAccountsEndpoints(this RouteGroupBuilder group)
    {
        // ====================================================================
        // 1. Chart of Accounts (Plan de Cuentas Editable)
        // ====================================================================
        group.MapGet("/accounts", async (ITenantContext tenantContext, AccountingDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            await db.EnsureAccountingTablesAsync(ct);
            await db.SeedDefaultChartOfAccountsAsync(tenantId, ct);

            var accounts = await db.Accounts
                .AsNoTracking()
                .Where(a => a.TenantId == tenantId)
                .OrderBy(a => a.Code)
                .ToListAsync(ct);

            return Results.Ok(accounts);
        });

        group.MapPost("/accounts", async (
            CreateAccountRequest req,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(req.Code) || string.IsNullOrWhiteSpace(req.Name))
            {
                return Results.BadRequest(new { message = "Código y nombre de la cuenta son obligatorios." });
            }

            var tenantId = tenantContext.TenantId;
            var exists = await db.Accounts.AnyAsync(a => a.TenantId == tenantId && a.Code == req.Code.Trim(), ct);
            if (exists)
            {
                return Results.BadRequest(new { message = $"Ya existe una cuenta con el código {req.Code}." });
            }

            var account = new Account(
                Guid.NewGuid(),
                tenantId,
                req.Code.Trim(),
                req.Name.Trim(),
                req.AccountType ?? "Asset",
                req.Level > 0 ? req.Level : 4,
                req.ParentCode?.Trim(),
                req.IsDirectPosting,
                req.Currency ?? "ARS",
                req.AdjustsForInflation);

            db.Accounts.Add(account);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/accounting/accounts/{account.Id}", account);
        });

        group.MapPut("/accounts/{id:guid}", async (
            Guid id,
            UpdateAccountRequest req,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            var account = await db.Accounts.FirstOrDefaultAsync(a => a.Id == id && a.TenantId == tenantId, ct);
            if (account == null) return Results.NotFound(new { message = "Cuenta no encontrada." });

            if (!string.IsNullOrWhiteSpace(req.Code) && req.Code.Trim() != account.Code)
            {
                var codeExists = await db.Accounts.AnyAsync(a => a.TenantId == tenantId && a.Code == req.Code.Trim() && a.Id != id, ct);
                if (codeExists)
                {
                    return Results.BadRequest(new { message = $"Ya existe otra cuenta con el código {req.Code}." });
                }
                account.Code = req.Code.Trim();
            }

            account.Name = req.Name.Trim();
            if (!string.IsNullOrWhiteSpace(req.AccountType)) account.AccountType = req.AccountType.Trim();
            if (req.Level > 0) account.Level = req.Level;
            account.ParentCode = req.ParentCode?.Trim();
            account.IsDirectPosting = req.IsDirectPosting;
            if (!string.IsNullOrWhiteSpace(req.Currency)) account.Currency = req.Currency.Trim();
            account.AdjustsForInflation = req.AdjustsForInflation;
            account.IsActive = req.IsActive;

            await db.SaveChangesAsync(ct);
            return Results.Ok(account);
        });

        group.MapDelete("/accounts/{id:guid}", async (
            Guid id,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            var account = await db.Accounts.FirstOrDefaultAsync(a => a.Id == id && a.TenantId == tenantId, ct);
            if (account == null) return Results.NotFound(new { message = "Cuenta no encontrada." });

            // Validate if has recorded journal entry lines
            var hasLines = await db.JournalEntryLines.AnyAsync(l => l.TenantId == tenantId && (l.AccountId == id || l.AccountCode == account.Code), ct);
            if (hasLines)
            {
                return Results.BadRequest(new { message = $"No se puede eliminar la cuenta '{account.Code} - {account.Name}' porque ya posee movimientos en el Libro Diario. Puede desactivarla para que no se use en nuevos asientos." });
            }

            // Validate if has dependent sub-accounts
            var hasChildren = await db.Accounts.AnyAsync(a => a.TenantId == tenantId && a.ParentCode == account.Code, ct);
            if (hasChildren)
            {
                return Results.BadRequest(new { message = $"No se puede eliminar la cuenta '{account.Code}' porque contiene subcuentas dependientes. Elimine o reubique las subcuentas primero." });
            }

            db.Accounts.Remove(account);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { message = "Cuenta eliminada correctamente." });
        });

        // ====================================================================
        // 2. Accounting Mapping (Matriz de Enlace Contable Dinámico)
        // ====================================================================
        group.MapGet("/mapping", async (ITenantContext tenantContext, AccountingDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            await db.EnsureAccountingTablesAsync(ct);
            await db.SeedDefaultChartOfAccountsAsync(tenantId, ct);
            var mapping = await db.GetOrCreateMappingAsync(tenantId, ct);
            return Results.Ok(mapping);
        });

        group.MapPut("/mapping", async (UpdateMappingRequest req, ITenantContext tenantContext, AccountingDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            await db.EnsureAccountingTablesAsync(ct);
            var mapping = await db.GetOrCreateMappingAsync(tenantId, ct);

            mapping.SalesRevenueAccountCode = req.SalesRevenueAccountCode.Trim();
            mapping.SalesVatDebitAccountCode = req.SalesVatDebitAccountCode.Trim();
            mapping.AccountsReceivableAccountCode = req.AccountsReceivableAccountCode.Trim();
            mapping.PurchaseExpenseAccountCode = req.PurchaseExpenseAccountCode.Trim();
            mapping.PurchaseVatCreditAccountCode = req.PurchaseVatCreditAccountCode.Trim();
            mapping.AccountsPayableAccountCode = req.AccountsPayableAccountCode.Trim();
            mapping.CashAccountCode = req.CashAccountCode.Trim();
            mapping.BankAccountCode = req.BankAccountCode.Trim();
            mapping.ChecksInHandAccountCode = req.ChecksInHandAccountCode.Trim();
            mapping.PspDigitalAccountCode = req.PspDigitalAccountCode.Trim();
            mapping.BankExpensesAccountCode = req.BankExpensesAccountCode.Trim();
            mapping.BankTaxAccountCode = req.BankTaxAccountCode.Trim();
            mapping.RetainedEarningsAccountCode = req.RetainedEarningsAccountCode.Trim();
            mapping.ExchangeDifferenceGainAccountCode = req.ExchangeDifferenceGainAccountCode.Trim();
            mapping.ExchangeDifferenceLossAccountCode = req.ExchangeDifferenceLossAccountCode.Trim();
            mapping.SalariesExpenseAccountCode = req.SalariesExpenseAccountCode.Trim();
            mapping.SocialSecurityExpenseAccountCode = req.SocialSecurityExpenseAccountCode.Trim();
            mapping.SalariesPayableAccountCode = req.SalariesPayableAccountCode.Trim();
            mapping.SocialSecurityPayableAccountCode = req.SocialSecurityPayableAccountCode.Trim();
            mapping.UpdatedAtUtc = DateTime.UtcNow;

            await db.SaveChangesAsync(ct);
            return Results.Ok(mapping);
        });

        group.MapGet("/settings", async (ITenantContext tenantContext, AccountingDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            await db.EnsureAccountingTablesAsync(ct);
            var settings = await db.GetOrCreateTenantSettingsAsync(tenantId, ct);
            return Results.Ok(new { settings.AutoPostOnConfirm });
        });

        group.MapGet("/finance-account-mappings", async (ITenantContext tenantContext, AccountingDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            await db.EnsureAccountingTablesAsync(ct);
            var rows = await db.FinanceAccountMappings.AsNoTracking()
                .Where(x => x.TenantId == tenantId)
                .OrderBy(x => x.LedgerAccountCode)
                .Select(x => new { x.FinancialAccountId, x.LedgerAccountCode, x.UpdatedAtUtc })
                .ToListAsync(ct);
            return Results.Ok(rows);
        });

        group.MapPut("/finance-account-mappings", async (
            List<FinanceAccountMappingItemRequest> req,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            await db.EnsureAccountingTablesAsync(ct);
            var existing = await db.FinanceAccountMappings.Where(x => x.TenantId == tenantId).ToListAsync(ct);
            db.FinanceAccountMappings.RemoveRange(existing);

            foreach (var item in req ?? [])
            {
                if (item.FinancialAccountId == Guid.Empty || string.IsNullOrWhiteSpace(item.LedgerAccountCode))
                    continue;
                db.FinanceAccountMappings.Add(new AccountingFinanceAccountMapping
                {
                    TenantId = tenantId,
                    FinancialAccountId = item.FinancialAccountId,
                    LedgerAccountCode = item.LedgerAccountCode.Trim(),
                    UpdatedAtUtc = DateTime.UtcNow
                });
            }

            await db.SaveChangesAsync(ct);
            var rows = await db.FinanceAccountMappings.AsNoTracking()
                .Where(x => x.TenantId == tenantId)
                .Select(x => new { x.FinancialAccountId, x.LedgerAccountCode, x.UpdatedAtUtc })
                .ToListAsync(ct);
            return Results.Ok(rows);
        });

        group.MapPut("/settings", async (
            UpdateAccountingSettingsRequest req,
            ITenantContext tenantContext,
            AccountingDbContext db,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            await db.EnsureAccountingTablesAsync(ct);
            var settings = await db.GetOrCreateTenantSettingsAsync(tenantId, ct);
            settings.AutoPostOnConfirm = req.AutoPostOnConfirm;
            settings.UpdatedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { settings.AutoPostOnConfirm });
        });

        return group;
    }
}
