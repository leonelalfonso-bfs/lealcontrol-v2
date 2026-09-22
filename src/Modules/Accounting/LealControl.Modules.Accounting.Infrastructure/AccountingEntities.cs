using System;
using System.Collections.Generic;
using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Tenancy;

namespace LealControl.Modules.Accounting.Infrastructure;

public sealed class Account : Entity<Guid>
{
    public TenantId TenantId { get; set; }
    public string Code { get; set; } = string.Empty; // e.g., 1.1.01.01.001
    public string Name { get; set; } = string.Empty;
    public string AccountType { get; set; } = "Asset"; // Asset, Liability, Equity, Income, Expense
    public int Level { get; set; } = 1; // 1 to 5
    public string? ParentCode { get; set; }
    public bool IsDirectPosting { get; set; } = true; // Imputable
    public string Currency { get; set; } = "ARS"; // ARS, USD
    public bool AdjustsForInflation { get; set; } = false;
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public Account() : base(Guid.NewGuid()) { }

    public Account(Guid id, TenantId tenantId, string code, string name, string type, int level, string? parentCode, bool isDirectPosting, string currency = "ARS", bool adjustsForInflation = false)
        : base(id)
    {
        TenantId = tenantId;
        Code = code;
        Name = name;
        AccountType = type;
        Level = level;
        ParentCode = parentCode;
        IsDirectPosting = isDirectPosting;
        Currency = currency;
        AdjustsForInflation = adjustsForInflation;
        IsActive = true;
        CreatedAtUtc = DateTime.UtcNow;
    }
}

public sealed class JournalEntry : Entity<Guid>
{
    public TenantId TenantId { get; set; }
    public int EntryNumber { get; set; }
    public DateTime Date { get; set; } = DateTime.UtcNow;
    public string Concept { get; set; } = string.Empty;
    public string EntryType { get; set; } = "Standard"; // Standard, Opening, Adjustment, Closing, Automated
    public string SourceModule { get; set; } = "Manual"; // Sales, Purchases, Finance, Payroll, Fleet, Grains, Manual
    public string? SourceDocumentId { get; set; }
    public string Status { get; set; } = "Posted"; // Draft, Posted, Locked
    public decimal TotalDebit { get; set; }
    public decimal TotalCredit { get; set; }
    public decimal Difference => TotalDebit - TotalCredit;
    public string? CreatedBy { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public List<JournalEntryLine> Lines { get; set; } = new();

    public JournalEntry() : base(Guid.NewGuid()) { }
}

public sealed class JournalEntryLine : Entity<Guid>
{
    public Guid JournalEntryId { get; set; }
    public TenantId TenantId { get; set; }
    public Guid AccountId { get; set; }
    public string AccountCode { get; set; } = string.Empty;
    public string AccountName { get; set; } = string.Empty;
    public decimal Debit { get; set; }
    public decimal Credit { get; set; }
    public string Currency { get; set; } = "ARS";
    public decimal ExchangeRate { get; set; } = 1;
    public Guid? CostCenterId { get; set; }
    public string? CostCenterCode { get; set; }
    public string? CostCenterName { get; set; }
    public string? Memo { get; set; }

    public JournalEntryLine() : base(Guid.NewGuid()) { }
}

public sealed class CostCenter : Entity<Guid>
{
    public TenantId TenantId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Category { get; set; } = "Administration"; // Administration, Commercial, Production, Fleet, Agriculture, Projects
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public CostCenter() : base(Guid.NewGuid()) { }

    public CostCenter(Guid id, TenantId tenantId, string code, string name, string category = "Administration") : base(id)
    {
        TenantId = tenantId;
        Code = code;
        Name = name;
        Category = category;
        IsActive = true;
        CreatedAtUtc = DateTime.UtcNow;
    }
}

public sealed class FiscalYearPeriod : Entity<Guid>
{
    public TenantId TenantId { get; set; }
    public int Year { get; set; }
    public int Month { get; set; }
    public string Status { get; set; } = "Open"; // Open, InReview, Locked
    public DateTime? LockedAtUtc { get; set; }
    public string? LockedBy { get; set; }

    public FiscalYearPeriod() : base(Guid.NewGuid()) { }
}

public sealed class BankStatement : Entity<Guid>
{
    public TenantId TenantId { get; set; }
    public string BankName { get; set; } = "Banco Galicia"; // Banco Galicia, Banco Macro, Santander, BBVA, Nación, MercadoPago
    public string AccountNumber { get; set; } = string.Empty;
    public string Currency { get; set; } = "ARS";
    public DateTime PeriodStartDate { get; set; }
    public DateTime PeriodEndDate { get; set; }
    public decimal InitialBalance { get; set; }
    public decimal FinalBalance { get; set; }
    public string Status { get; set; } = "Open"; // Open, InProgress, Reconciled
    public int TotalLines { get; set; }
    public int ReconciledLines { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public List<BankStatementLine> Lines { get; set; } = new();

    public BankStatement() : base(Guid.NewGuid()) { }
}

public sealed class BankStatementLine : Entity<Guid>
{
    public Guid BankStatementId { get; set; }
    public TenantId TenantId { get; set; }
    public DateTime TransactionDate { get; set; }
    public string Description { get; set; } = string.Empty;
    public string? ReferenceNumber { get; set; }
    public decimal Debit { get; set; } // Débitos / Salidas de dinero
    public decimal Credit { get; set; } // Créditos / Entradas de dinero
    public decimal Balance { get; set; }
    public bool IsReconciled { get; set; } = false;
    public Guid? MatchedJournalEntryId { get; set; }
    public Guid? MatchedJournalEntryLineId { get; set; }
    public string? MatchType { get; set; } // ExactAmount, ReferenceMatch, Manual, AutoPosted
    public string? MatchNotes { get; set; }

    public BankStatementLine() : base(Guid.NewGuid()) { }
}

public sealed class AccountingMapping : Entity<Guid>
{
    public TenantId TenantId { get; set; }
    
    // Ventas
    public string SalesRevenueAccountCode { get; set; } = "4.1.01";
    public string SalesVatDebitAccountCode { get; set; } = "2.1.02.001";
    public string AccountsReceivableAccountCode { get; set; } = "1.1.02.001";
    
    // Compras
    public string PurchaseExpenseAccountCode { get; set; } = "5.1.01";
    public string PurchaseVatCreditAccountCode { get; set; } = "1.1.03.001";
    public string AccountsPayableAccountCode { get; set; } = "2.1.01.001";
    
    // Tesorería
    public string CashAccountCode { get; set; } = "1.1.01.001";
    public string BankAccountCode { get; set; } = "1.1.01.002";
    public string ChecksInHandAccountCode { get; set; } = "1.1.01.004";
    public string PspDigitalAccountCode { get; set; } = "1.1.01.006";
    public string BankExpensesAccountCode { get; set; } = "5.3.01";
    public string BankTaxAccountCode { get; set; } = "5.3.02";
    
    // Cierres y Resultados
    public string RetainedEarningsAccountCode { get; set; } = "3.2.02";
    public string ExchangeDifferenceGainAccountCode { get; set; } = "4.2.03";
    public string ExchangeDifferenceLossAccountCode { get; set; } = "5.3.04";
    
    // Sueldos y Cargas Sociales
    public string SalariesExpenseAccountCode { get; set; } = "5.2.01";
    public string SocialSecurityExpenseAccountCode { get; set; } = "5.2.02";
    public string SalariesPayableAccountCode { get; set; } = "2.1.02.004";
    public string SocialSecurityPayableAccountCode { get; set; } = "2.1.02.003";

    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

    public AccountingMapping() : base(Guid.NewGuid()) { }
    public AccountingMapping(Guid id, TenantId tenantId) : base(id) { TenantId = tenantId; }
}

// =========================================================================
// NUEVAS ENTIDADES: ASIENTOS MODELOS (PLANTILLAS CONFIGURABLES) & AUDITORÍA
// =========================================================================

public sealed class JournalTemplate : Entity<Guid>
{
    public TenantId TenantId { get; set; }
    public string Code { get; set; } = string.Empty; // e.g. AM-001
    public string Name { get; set; } = string.Empty; // e.g. "Factura A de Venta - Cuenta Corriente"
    public string SourceModule { get; set; } = "Sales"; // Sales, Purchases, Finance, Inventory, Payroll, Fleet
    public string DocumentType { get; set; } = "InvoiceA"; // InvoiceA, InvoiceB, InvoiceC, CreditNoteA, CreditNoteB, CreditNoteC, DebitNote, PaymentOrder, CollectionReceipt, BankTransfer, StockAdjustment, All
    public string Description { get; set; } = string.Empty;
    public string Status { get; set; } = "Active"; // Active, Inactive
    public string EntrySeries { get; set; } = "Ventas"; // Ventas, Compras, Finanzas, etc.
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

    public List<JournalTemplateLine> Lines { get; set; } = new();

    public JournalTemplate() : base(Guid.NewGuid()) { }
}

public sealed class JournalTemplateLine : Entity<Guid>
{
    public Guid TemplateId { get; set; }
    public TenantId TenantId { get; set; }
    public int OrderIndex { get; set; } = 1;
    public Guid? AccountId { get; set; }
    public string AccountCode { get; set; } = string.Empty; // e.g. 1.1.02.001
    public string AccountName { get; set; } = string.Empty; // e.g. Deudores por Ventas
    public string DebitCredit { get; set; } = "Debit"; // Debit, Credit
    public string AmountSource { get; set; } = "Total"; // Total, Net21, Net105, Net27, NetExempt, Vat21, Vat105, Vat27, TotalVat, PerceptionIibb, PerceptionVat, PerceptionEarnings, Withholdings, PaymentAmount, CmvCost, StockValueAdjustment
    public string Condition { get; set; } = "Always"; // Always, IfHasVat21, IfHasVat105, IfHasVat27, IfHasPerceptionIibb, IfHasPerceptionVat, IfHasWithholding, IfCash, IfBankTransfer
    public bool IsInvertedSign { get; set; } = false; // Invertir Debe/Haber (útil para Notas de Crédito)
    public string? MemoTemplate { get; set; } // e.g. "{DocumentType} {DocumentNumber} - {CustomerName}"

    public JournalTemplateLine() : base(Guid.NewGuid()) { }
}

public sealed class AccountingBatchRun : Entity<Guid>
{
    public TenantId TenantId { get; set; }
    public string BatchNumber { get; set; } = string.Empty; // e.g. BATCH-2026-0001
    public DateTime ExecutedAtUtc { get; set; } = DateTime.UtcNow;
    public string ExecutedBy { get; set; } = "contador@empresa.com";
    public DateTime PeriodStart { get; set; }
    public DateTime PeriodEnd { get; set; }
    public string ModulesIncluded { get; set; } = "Sales,Purchases"; // Comma-separated
    public int DocumentsProcessedCount { get; set; }
    public int EntriesGeneratedCount { get; set; }
    public int ErrorsCount { get; set; }
    public string Status { get; set; } = "Completed"; // Completed, CompletedWithWarnings, Failed, Reverted
    public decimal DurationSeconds { get; set; }
    public string SummaryJson { get; set; } = "{}";
    public string LogDetailsJson { get; set; } = "[]";
    public string FiltersAppliedJson { get; set; } = "{}";

    public AccountingBatchRun() : base(Guid.NewGuid()) { }
}

public static class AccountingPendingDocumentStatuses
{
    public const string Pending = "Pending";
    public const string Posted = "Posted";
    public const string Skipped = "Skipped";
    public const string Error = "Error";
}

/// <summary>
/// Settings por tenant para el módulo Accounting.
/// </summary>
public sealed class AccountingTenantSettings : Entity<Guid>
{
    public TenantId TenantId { get; set; }

    public bool AutoPostOnConfirm { get; set; } = false;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

    public AccountingTenantSettings() : base(Guid.NewGuid()) { }
    public AccountingTenantSettings(TenantId tenantId) : base(Guid.NewGuid())
    {
        TenantId = tenantId;
        AutoPostOnConfirm = false;
        CreatedAtUtc = DateTime.UtcNow;
        UpdatedAtUtc = DateTime.UtcNow;
    }
}

public sealed class AccountingFinanceAccountMapping : Entity<Guid>
{
    public TenantId TenantId { get; set; }
    public Guid FinancialAccountId { get; set; }
    public string LedgerAccountCode { get; set; } = string.Empty;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

    public AccountingFinanceAccountMapping() : base(Guid.NewGuid()) { }
}

/// <summary>
/// Cola de documentos publicados por Sales/Finance vía IAccountingPostingGateway.
/// Contabilidad nunca lee sales.* / finance.* por SQL cruzado.
/// </summary>
public sealed class AccountingPendingDocument : Entity<Guid>
{
    public TenantId TenantId { get; set; }
    public string SourceModule { get; set; } = "";
    public string DocumentType { get; set; } = "";
    public string SourceDocumentId { get; set; } = "";
    public string DocumentNumber { get; set; } = "";
    public DateTime DocumentDateUtc { get; set; }
    public string PayloadJson { get; set; } = "{}";
    public string Status { get; set; } = AccountingPendingDocumentStatuses.Pending;
    public string? LastError { get; set; }
    public Guid? JournalEntryId { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

    public AccountingPendingDocument() : base(Guid.NewGuid()) { }
}

// DTOs para Asientos Modelos y Contabilización en Lote
public sealed record JournalTemplateDto(
    Guid Id,
    string Code,
    string Name,
    string SourceModule,
    string DocumentType,
    string Description,
    string Status,
    string EntrySeries,
    DateTime CreatedAtUtc,
    DateTime UpdatedAtUtc,
    List<JournalTemplateLineDto> Lines
);

public sealed record JournalTemplateLineDto(
    Guid Id,
    int OrderIndex,
    Guid? AccountId,
    string AccountCode,
    string AccountName,
    string DebitCredit,
    string AmountSource,
    string Condition,
    bool IsInvertedSign,
    string? MemoTemplate
);

public sealed record CreateJournalTemplateRequest(
    string Code,
    string Name,
    string SourceModule,
    string DocumentType,
    string Description,
    string Status,
    string EntrySeries,
    List<JournalTemplateLineDto> Lines
);

public sealed record UpdateJournalTemplateRequest(
    string Code,
    string Name,
    string SourceModule,
    string DocumentType,
    string Description,
    string Status,
    string EntrySeries,
    List<JournalTemplateLineDto> Lines
);

public sealed record AmountSourceVariableInfo(
    string Key,
    string Label,
    string Description,
    string Category, // Sales, Purchases, Finance, Inventory, Taxes
    List<string> ApplicableModules
);

public sealed record UnpostedDocumentsSummaryResponse(
    int TotalPendingCount,
    int SalesPendingCount,
    int PurchasesPendingCount,
    int FinancePendingCount,
    int InventoryPendingCount,
    DateTime? OldestPendingDate,
    DateTime? NewestPendingDate
);

public sealed record BatchPostingPreviewRequest(
    DateTime PeriodStart,
    DateTime PeriodEnd,
    List<string> Modules,
    string? BranchId,
    string? Currency
);

public sealed record BatchPostingPreviewResponse(
    int DocumentsCount,
    int EstimatedEntriesCount,
    int TotalLinesCount,
    decimal TotalDebit,
    decimal TotalCredit,
    bool IsBalanced,
    List<AccountBalanceSummaryDto> AccountsAffected,
    List<BatchPostingPreviewItemDto> PreviewItems,
    List<string> Warnings,
    List<string> UnmappedDocuments
);

public sealed record AccountBalanceSummaryDto(
    string AccountCode,
    string AccountName,
    decimal TotalDebit,
    decimal TotalCredit
);

public sealed record BatchPostingPreviewItemDto(
    string DocumentId,
    string DocumentNumber,
    string DocumentType,
    string SourceModule,
    DateTime Date,
    string CounterpartyName,
    decimal DocumentAmount,
    string TemplateCode,
    string TemplateName,
    List<JournalEntryLinePreviewDto> Lines
);

public sealed record JournalEntryLinePreviewDto(
    string AccountCode,
    string AccountName,
    decimal Debit,
    decimal Credit,
    string Memo
);

public sealed record BatchPostingExecuteRequest(
    DateTime PeriodStart,
    DateTime PeriodEnd,
    List<string> Modules,
    string? BranchId,
    string? Currency,
    string ExecutedBy
);

public sealed record BatchPostingExecuteResponse(
    Guid BatchRunId,
    string BatchNumber,
    int DocumentsProcessed,
    int EntriesGenerated,
    int ErrorsCount,
    decimal TotalDebit,
    decimal TotalCredit,
    string Status,
    decimal DurationSeconds,
    List<string> EntryNumbers,
    List<string> Exceptions
);

public sealed record UpdateMappingRequest(
    string SalesRevenueAccountCode,
    string SalesVatDebitAccountCode,
    string AccountsReceivableAccountCode,
    string PurchaseExpenseAccountCode,
    string PurchaseVatCreditAccountCode,
    string AccountsPayableAccountCode,
    string CashAccountCode,
    string BankAccountCode,
    string ChecksInHandAccountCode,
    string PspDigitalAccountCode,
    string BankExpensesAccountCode,
    string BankTaxAccountCode,
    string RetainedEarningsAccountCode,
    string ExchangeDifferenceGainAccountCode,
    string ExchangeDifferenceLossAccountCode,
    string SalariesExpenseAccountCode,
    string SocialSecurityExpenseAccountCode,
    string SalariesPayableAccountCode,
    string SocialSecurityPayableAccountCode);

public sealed record YearEndClosingRequest(int Year, DateTime ClosingDate);
public sealed record AutoPostPayrollRequest(DateTime Date, string PeriodDescription, decimal TotalGrossSalaries, decimal TotalEmployerContributions, decimal TotalNetSalaries, decimal TotalSocialSecurityToPay, Guid? CostCenterId);
public sealed record ExchangeDifferenceRequest(DateTime Date, decimal UsdExchangeRate, string AccountCode);
