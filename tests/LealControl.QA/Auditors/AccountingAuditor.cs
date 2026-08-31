using System;
using System.Linq;
using System.Threading.Tasks;
using LealControl.Modules.Accounting.Infrastructure;
using LealControl.QA.Infrastructure;
using LealControl.QA.Models;
using Microsoft.EntityFrameworkCore;

namespace LealControl.QA.Auditors;

public sealed class AccountingAuditor : IQaAuditor
{
    public string Name => "Accounting Auditor";
    public string Module => "Accounting";

    public async Task AuditDocumentJournalEntryAsync(QaTestContext context, QaScenarioResult scenario, string sourceModule, string sourceDocumentId, decimal expectedTotal)
    {
        var accountingDb = context.GetService<AccountingDbContext>();
        var tenantId = context.TenantId;

        // 1. Locate journal entry
        var entry = await accountingDb.JournalEntries
            .Include(j => j.Lines)
            .FirstOrDefaultAsync(j => j.TenantId == tenantId && j.SourceModule == sourceModule && j.SourceDocumentId == sourceDocumentId);

        scenario.AddCheck(
            name: "Asiento contable generado para comprobante de origen",
            module: Module,
            condition: entry != null,
            expected: $"Asiento existente para {sourceModule}:{sourceDocumentId}",
            actual: entry != null ? $"Asiento #{entry.EntryNumber} (ID: {entry.Id})" : "No se encontró asiento contable",
            message: "Toda operación relevante de negocio debe contar con su asiento contable registrado.",
            entity: "JournalEntry",
            entityId: sourceDocumentId);

        if (entry == null) return;

        // 2. Double-entry rule: Debe == Haber
        var linesDebit = entry.Lines.Sum(l => l.Debit);
        var linesCredit = entry.Lines.Sum(l => l.Credit);

        scenario.AddCheck(
            name: "Partida doble contable balanceada (Debe == Haber)",
            module: Module,
            condition: linesDebit == linesCredit,
            expected: $"Debe: ${linesDebit:N2} == Haber: ${linesDebit:N2}",
            actual: $"Debe: ${linesDebit:N2} | Haber: ${linesCredit:N2}",
            message: $"El asiento #{entry.EntryNumber} debe balancear exactamente.",
            entity: "JournalEntry",
            entityId: entry.Id.ToString());

        // 3. Entry total matches expected amount
        scenario.AddCheck(
            name: "Importe total del asiento contable coincide con comprobante",
            module: Module,
            condition: linesDebit == expectedTotal,
            expected: $"${expectedTotal:N2}",
            actual: $"${linesDebit:N2}",
            message: $"El importe total imputado (${linesDebit:N2}) debe coincidir con el total del comprobante (${expectedTotal:N2}).",
            entity: "JournalEntry",
            entityId: entry.Id.ToString());

        // 4. Validate accounts exist in Chart of Accounts
        var accountCodes = entry.Lines.Select(l => l.AccountCode).Distinct().ToList();
        var existingAccounts = await accountingDb.Accounts
            .Where(a => a.TenantId == tenantId && accountCodes.Contains(a.Code))
            .Select(a => a.Code)
            .ToListAsync();

        var missingAccounts = accountCodes.Except(existingAccounts).ToList();
        scenario.AddCheck(
            name: "Todas las cuentas imputadas existen en el Plan de Cuentas",
            module: Module,
            condition: missingAccounts.Count == 0,
            expected: "0 cuentas inexistentes",
            actual: missingAccounts.Count == 0 ? "Todas válidas" : $"Faltantes: {string.Join(", ", missingAccounts)}",
            message: "No pueden imputarse asientos contra cuentas inexistentes.",
            entity: "Account",
            entityId: entry.Id.ToString());
    }
}
