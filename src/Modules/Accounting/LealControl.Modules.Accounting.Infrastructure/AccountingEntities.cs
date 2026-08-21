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
