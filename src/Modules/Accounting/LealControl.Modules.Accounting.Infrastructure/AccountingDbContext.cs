using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Tenancy;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Accounting.Infrastructure;

public sealed class AccountingDbContext : DbContext
{
    public AccountingDbContext(DbContextOptions<AccountingDbContext> options) : base(options)
    {
    }

    public DbSet<Account> Accounts => Set<Account>();
    public DbSet<JournalEntry> JournalEntries => Set<JournalEntry>();
    public DbSet<JournalEntryLine> JournalEntryLines => Set<JournalEntryLine>();
    public DbSet<CostCenter> CostCenters => Set<CostCenter>();
    public DbSet<FiscalYearPeriod> Periods => Set<FiscalYearPeriod>();
    public DbSet<BankStatement> BankStatements => Set<BankStatement>();
    public DbSet<BankStatementLine> BankStatementLines => Set<BankStatementLine>();
    public DbSet<AccountingMapping> Mappings => Set<AccountingMapping>();
    public DbSet<JournalTemplate> JournalTemplates => Set<JournalTemplate>();
    public DbSet<JournalTemplateLine> JournalTemplateLines => Set<JournalTemplateLine>();
    public DbSet<AccountingBatchRun> BatchRuns => Set<AccountingBatchRun>();
    public DbSet<AccountingPendingDocument> PendingDocuments => Set<AccountingPendingDocument>();
    public DbSet<AccountingTenantSettings> TenantSettings => Set<AccountingTenantSettings>();
    public DbSet<AccountingFinanceAccountMapping> FinanceAccountMappings => Set<AccountingFinanceAccountMapping>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<Account>(b =>
        {
            b.ToTable("accounts", "accounting");
            b.HasKey(x => x.Id);
            b.Property(x => x.Code).HasMaxLength(32).IsRequired();
            b.Property(x => x.Name).HasMaxLength(160).IsRequired();
            b.Property(x => x.AccountType).HasMaxLength(32).IsRequired();
            b.Property(x => x.Currency).HasMaxLength(10).HasDefaultValue("ARS");
            b.Property(x => x.ParentCode).HasMaxLength(32);
            b.Property(x => x.TenantId).HasConversion(v => v.Value, v => new TenantId(v));
            b.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
        });

        modelBuilder.Entity<JournalEntry>(b =>
        {
            b.ToTable("journal_entries", "accounting");
            b.HasKey(x => x.Id);
            b.Property(x => x.Concept).HasMaxLength(500).IsRequired();
            b.Property(x => x.EntryType).HasMaxLength(32).HasDefaultValue("Standard");
            b.Property(x => x.SourceModule).HasMaxLength(32).HasDefaultValue("Manual");
            b.Property(x => x.SourceDocumentId).HasMaxLength(128);
            b.Property(x => x.Status).HasMaxLength(32).HasDefaultValue("Posted");
            b.Property(x => x.CreatedBy).HasMaxLength(128);
            b.Property(x => x.TenantId).HasConversion(v => v.Value, v => new TenantId(v));
            b.HasMany(x => x.Lines).WithOne().HasForeignKey(x => x.JournalEntryId).OnDelete(DeleteBehavior.Cascade);
            b.HasIndex(x => new { x.TenantId, x.EntryNumber }).IsUnique();
            b.HasIndex(x => new { x.TenantId, x.Date });
        });

        modelBuilder.Entity<JournalEntryLine>(b =>
        {
            b.ToTable("journal_entry_lines", "accounting");
            b.HasKey(x => x.Id);
            b.Property(x => x.AccountCode).HasMaxLength(32).IsRequired();
            b.Property(x => x.AccountName).HasMaxLength(160).IsRequired();
            b.Property(x => x.Currency).HasMaxLength(10).HasDefaultValue("ARS");
            b.Property(x => x.CostCenterCode).HasMaxLength(32);
            b.Property(x => x.CostCenterName).HasMaxLength(128);
            b.Property(x => x.Memo).HasMaxLength(500);
            b.Property(x => x.TenantId).HasConversion(v => v.Value, v => new TenantId(v));
            b.HasIndex(x => new { x.TenantId, x.AccountId });
        });

        modelBuilder.Entity<CostCenter>(b =>
        {
            b.ToTable("cost_centers", "accounting");
            b.HasKey(x => x.Id);
            b.Property(x => x.Code).HasMaxLength(32).IsRequired();
            b.Property(x => x.Name).HasMaxLength(128).IsRequired();
            b.Property(x => x.Category).HasMaxLength(64).HasDefaultValue("Administration");
            b.Property(x => x.TenantId).HasConversion(v => v.Value, v => new TenantId(v));
            b.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
        });

        modelBuilder.Entity<FiscalYearPeriod>(b =>
        {
            b.ToTable("periods", "accounting");
            b.HasKey(x => x.Id);
            b.Property(x => x.Status).HasMaxLength(32).HasDefaultValue("Open");
            b.Property(x => x.LockedBy).HasMaxLength(128);
            b.Property(x => x.TenantId).HasConversion(v => v.Value, v => new TenantId(v));
            b.HasIndex(x => new { x.TenantId, x.Year, x.Month }).IsUnique();
        });

        modelBuilder.Entity<BankStatement>(b =>
        {
            b.ToTable("bank_statements", "accounting");
            b.HasKey(x => x.Id);
            b.Property(x => x.BankName).HasMaxLength(120).IsRequired();
            b.Property(x => x.AccountNumber).HasMaxLength(64);
            b.Property(x => x.Currency).HasMaxLength(10).HasDefaultValue("ARS");
            b.Property(x => x.Status).HasMaxLength(32).HasDefaultValue("Open");
            b.Property(x => x.TenantId).HasConversion(v => v.Value, v => new TenantId(v));
            b.HasMany(x => x.Lines).WithOne().HasForeignKey(x => x.BankStatementId).OnDelete(DeleteBehavior.Cascade);
            b.HasIndex(x => new { x.TenantId, x.BankName });
        });

        modelBuilder.Entity<BankStatementLine>(b =>
        {
            b.ToTable("bank_statement_lines", "accounting");
            b.HasKey(x => x.Id);
            b.Property(x => x.Description).HasMaxLength(255).IsRequired();
            b.Property(x => x.ReferenceNumber).HasMaxLength(128);
            b.Property(x => x.MatchType).HasMaxLength(64);
            b.Property(x => x.MatchNotes).HasMaxLength(255);
            b.Property(x => x.TenantId).HasConversion(v => v.Value, v => new TenantId(v));
            b.HasIndex(x => new { x.TenantId, x.TransactionDate });
            b.HasIndex(x => new { x.TenantId, x.IsReconciled });
        });

        modelBuilder.Entity<AccountingMapping>(b =>
        {
            b.ToTable("mappings", "accounting");
            b.HasKey(x => x.Id);
            b.Property(x => x.TenantId).HasConversion(v => v.Value, v => new TenantId(v));
            b.HasIndex(x => x.TenantId).IsUnique();
        });

        modelBuilder.Entity<JournalTemplate>(b =>
        {
            b.ToTable("journal_templates", "accounting");
            b.HasKey(x => x.Id);
            b.Property(x => x.Code).HasMaxLength(32).IsRequired();
            b.Property(x => x.Name).HasMaxLength(160).IsRequired();
            b.Property(x => x.SourceModule).HasMaxLength(32).IsRequired();
            b.Property(x => x.DocumentType).HasMaxLength(64).IsRequired();
            b.Property(x => x.EntrySeries).HasMaxLength(64).HasDefaultValue("General");
            b.Property(x => x.Status).HasMaxLength(32).HasDefaultValue("Active");
            b.Property(x => x.Description).HasMaxLength(500);
            b.Property(x => x.TenantId).HasConversion(v => v.Value, v => new TenantId(v));
            b.HasMany(x => x.Lines).WithOne().HasForeignKey(x => x.TemplateId).OnDelete(DeleteBehavior.Cascade);
            b.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            b.HasIndex(x => new { x.TenantId, x.SourceModule, x.DocumentType });
        });

        modelBuilder.Entity<JournalTemplateLine>(b =>
        {
            b.ToTable("journal_template_lines", "accounting");
            b.HasKey(x => x.Id);
            b.Property(x => x.AccountCode).HasMaxLength(32).IsRequired();
            b.Property(x => x.AccountName).HasMaxLength(160).IsRequired();
            b.Property(x => x.DebitCredit).HasMaxLength(10).IsRequired();
            b.Property(x => x.AmountSource).HasMaxLength(64).IsRequired();
            b.Property(x => x.Condition).HasMaxLength(64).HasDefaultValue("Always");
            b.Property(x => x.MemoTemplate).HasMaxLength(255);
            b.Property(x => x.TenantId).HasConversion(v => v.Value, v => new TenantId(v));
            b.HasIndex(x => new { x.TenantId, x.TemplateId });
        });

        modelBuilder.Entity<AccountingBatchRun>(b =>
        {
            b.ToTable("batch_runs", "accounting");
            b.HasKey(x => x.Id);
            b.Property(x => x.BatchNumber).HasMaxLength(64).IsRequired();
            b.Property(x => x.ExecutedBy).HasMaxLength(128).IsRequired();
            b.Property(x => x.ModulesIncluded).HasMaxLength(128).IsRequired();
            b.Property(x => x.Status).HasMaxLength(32).HasDefaultValue("Completed");
            b.Property(x => x.TenantId).HasConversion(v => v.Value, v => new TenantId(v));
            b.HasIndex(x => new { x.TenantId, x.BatchNumber }).IsUnique();
            b.HasIndex(x => new { x.TenantId, x.ExecutedAtUtc });
        });

        modelBuilder.Entity<AccountingPendingDocument>(b =>
        {
            b.ToTable("pending_documents", "accounting");
            b.HasKey(x => x.Id);
            b.Property(x => x.SourceModule).HasMaxLength(32).IsRequired();
            b.Property(x => x.DocumentType).HasMaxLength(64).IsRequired();
            b.Property(x => x.SourceDocumentId).HasMaxLength(128).IsRequired();
            b.Property(x => x.DocumentNumber).HasMaxLength(64).IsRequired();
            b.Property(x => x.PayloadJson).IsRequired();
            b.Property(x => x.Status).HasMaxLength(32).HasDefaultValue(AccountingPendingDocumentStatuses.Pending);
            b.Property(x => x.LastError).HasMaxLength(1000);
            b.Property(x => x.TenantId).HasConversion(v => v.Value, v => new TenantId(v));
            b.HasIndex(x => new { x.TenantId, x.SourceModule, x.SourceDocumentId });
            b.HasIndex(x => new { x.TenantId, x.Status, x.DocumentDateUtc });
        });

        modelBuilder.Entity<AccountingTenantSettings>(b =>
        {
            b.ToTable("tenant_settings", "accounting");
            b.HasKey(x => x.Id);
            b.Property(x => x.TenantId).HasConversion(v => v.Value, v => new TenantId(v));
            b.Property(x => x.AutoPostOnConfirm).HasDefaultValue(false);
            b.HasIndex(x => x.TenantId).IsUnique();
        });

        modelBuilder.Entity<AccountingFinanceAccountMapping>(b =>
        {
            b.ToTable("finance_account_mapping", "accounting");
            b.HasKey(x => x.Id);
            b.Property(x => x.TenantId).HasConversion(v => v.Value, v => new TenantId(v));
            b.Property(x => x.LedgerAccountCode).HasMaxLength(32).IsRequired();
            b.HasIndex(x => new { x.TenantId, x.FinancialAccountId }).IsUnique();
        });
    }

    public async Task EnsureAccountingTablesAsync(CancellationToken ct = default)
    {
        var statements = new[]
        {
            @"CREATE SCHEMA IF NOT EXISTS accounting;",

            @"CREATE TABLE IF NOT EXISTS accounting.accounts (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""Code"" character varying(32) NOT NULL,
                ""Name"" character varying(160) NOT NULL,
                ""AccountType"" character varying(32) NOT NULL,
                ""Level"" integer NOT NULL DEFAULT 1,
                ""ParentCode"" character varying(32),
                ""IsDirectPosting"" boolean NOT NULL DEFAULT true,
                ""Currency"" character varying(10) NOT NULL DEFAULT 'ARS',
                ""AdjustsForInflation"" boolean NOT NULL DEFAULT false,
                ""IsActive"" boolean NOT NULL DEFAULT true,
                ""CreatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now()
            );",

            @"CREATE UNIQUE INDEX IF NOT EXISTS ""IX_accounts_Tenant_Code"" ON accounting.accounts (""TenantId"", ""Code"");",

            @"CREATE TABLE IF NOT EXISTS accounting.journal_entries (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""EntryNumber"" integer NOT NULL,
                ""Date"" timestamp with time zone NOT NULL,
                ""Concept"" character varying(500) NOT NULL,
                ""EntryType"" character varying(32) NOT NULL DEFAULT 'Standard',
                ""SourceModule"" character varying(32) NOT NULL DEFAULT 'Manual',
                ""SourceDocumentId"" character varying(128),
                ""Status"" character varying(32) NOT NULL DEFAULT 'Posted',
                ""TotalDebit"" numeric(18,2) NOT NULL DEFAULT 0,
                ""TotalCredit"" numeric(18,2) NOT NULL DEFAULT 0,
                ""CreatedBy"" character varying(128),
                ""CreatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now()
            );",

            @"CREATE UNIQUE INDEX IF NOT EXISTS ""IX_journal_entries_Tenant_Number"" ON accounting.journal_entries (""TenantId"", ""EntryNumber"");",
            @"CREATE INDEX IF NOT EXISTS ""IX_journal_entries_Tenant_Date"" ON accounting.journal_entries (""TenantId"", ""Date"");",

            @"CREATE TABLE IF NOT EXISTS accounting.journal_entry_lines (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""JournalEntryId"" uuid NOT NULL REFERENCES accounting.journal_entries(""Id"") ON DELETE CASCADE,
                ""TenantId"" uuid NOT NULL,
                ""AccountId"" uuid NOT NULL,
                ""AccountCode"" character varying(32) NOT NULL,
                ""AccountName"" character varying(160) NOT NULL,
                ""Debit"" numeric(18,2) NOT NULL DEFAULT 0,
                ""Credit"" numeric(18,2) NOT NULL DEFAULT 0,
                ""Currency"" character varying(10) NOT NULL DEFAULT 'ARS',
                ""ExchangeRate"" numeric(18,4) NOT NULL DEFAULT 1,
                ""CostCenterId"" uuid,
                ""CostCenterCode"" character varying(32),
                ""CostCenterName"" character varying(128),
                ""Memo"" character varying(500)
            );",

            @"CREATE INDEX IF NOT EXISTS ""IX_journal_entry_lines_Tenant_AccountId"" ON accounting.journal_entry_lines (""TenantId"", ""AccountId"");",

            @"CREATE TABLE IF NOT EXISTS accounting.cost_centers (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""Code"" character varying(32) NOT NULL,
                ""Name"" character varying(128) NOT NULL,
                ""Category"" character varying(64) NOT NULL DEFAULT 'Administration',
                ""IsActive"" boolean NOT NULL DEFAULT true,
                ""CreatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now()
            );",

            @"CREATE UNIQUE INDEX IF NOT EXISTS ""IX_cost_centers_Tenant_Code"" ON accounting.cost_centers (""TenantId"", ""Code"");",

            @"CREATE TABLE IF NOT EXISTS accounting.periods (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""Year"" integer NOT NULL,
                ""Month"" integer NOT NULL,
                ""Status"" character varying(32) NOT NULL DEFAULT 'Open',
                ""LockedAtUtc"" timestamp with time zone,
                ""LockedBy"" character varying(128)
            );",

            @"CREATE UNIQUE INDEX IF NOT EXISTS ""IX_periods_Tenant_Year_Month"" ON accounting.periods (""TenantId"", ""Year"", ""Month"");",

            @"CREATE TABLE IF NOT EXISTS accounting.bank_statements (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""BankName"" character varying(120) NOT NULL,
                ""AccountNumber"" character varying(64),
                ""Currency"" character varying(10) NOT NULL DEFAULT 'ARS',
                ""PeriodStartDate"" timestamp with time zone NOT NULL,
                ""PeriodEndDate"" timestamp with time zone NOT NULL,
                ""InitialBalance"" numeric(18,2) NOT NULL DEFAULT 0,
                ""FinalBalance"" numeric(18,2) NOT NULL DEFAULT 0,
                ""Status"" character varying(32) NOT NULL DEFAULT 'Open',
                ""TotalLines"" integer NOT NULL DEFAULT 0,
                ""ReconciledLines"" integer NOT NULL DEFAULT 0,
                ""CreatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now()
            );",

            @"CREATE TABLE IF NOT EXISTS accounting.bank_statement_lines (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""BankStatementId"" uuid NOT NULL REFERENCES accounting.bank_statements(""Id"") ON DELETE CASCADE,
                ""TenantId"" uuid NOT NULL,
                ""TransactionDate"" timestamp with time zone NOT NULL,
                ""Description"" character varying(255) NOT NULL,
                ""ReferenceNumber"" character varying(128),
                ""Debit"" numeric(18,2) NOT NULL DEFAULT 0,
                ""Credit"" numeric(18,2) NOT NULL DEFAULT 0,
                ""Balance"" numeric(18,2) NOT NULL DEFAULT 0,
                ""IsReconciled"" boolean NOT NULL DEFAULT false,
                ""MatchedJournalEntryId"" uuid,
                ""MatchedJournalEntryLineId"" uuid,
                ""MatchType"" character varying(64),
                ""MatchNotes"" character varying(255)
            );",

            @"CREATE TABLE IF NOT EXISTS accounting.mappings (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""SalesRevenueAccountCode"" character varying(32) NOT NULL DEFAULT '4.1.01',
                ""SalesVatDebitAccountCode"" character varying(32) NOT NULL DEFAULT '2.1.02.001',
                ""AccountsReceivableAccountCode"" character varying(32) NOT NULL DEFAULT '1.1.02.001',
                ""PurchaseExpenseAccountCode"" character varying(32) NOT NULL DEFAULT '5.1.01',
                ""PurchaseVatCreditAccountCode"" character varying(32) NOT NULL DEFAULT '1.1.03.001',
                ""AccountsPayableAccountCode"" character varying(32) NOT NULL DEFAULT '2.1.01.001',
                ""CashAccountCode"" character varying(32) NOT NULL DEFAULT '1.1.01.001',
                ""BankAccountCode"" character varying(32) NOT NULL DEFAULT '1.1.01.002',
                ""ChecksInHandAccountCode"" character varying(32) NOT NULL DEFAULT '1.1.01.004',
                ""PspDigitalAccountCode"" character varying(32) NOT NULL DEFAULT '1.1.01.006',
                ""BankExpensesAccountCode"" character varying(32) NOT NULL DEFAULT '5.3.01',
                ""BankTaxAccountCode"" character varying(32) NOT NULL DEFAULT '5.3.02',
                ""RetainedEarningsAccountCode"" character varying(32) NOT NULL DEFAULT '3.2.02',
                ""ExchangeDifferenceGainAccountCode"" character varying(32) NOT NULL DEFAULT '4.2.03',
                ""ExchangeDifferenceLossAccountCode"" character varying(32) NOT NULL DEFAULT '5.3.04',
                ""SalariesExpenseAccountCode"" character varying(32) NOT NULL DEFAULT '5.2.01',
                ""SocialSecurityExpenseAccountCode"" character varying(32) NOT NULL DEFAULT '5.2.02',
                ""SalariesPayableAccountCode"" character varying(32) NOT NULL DEFAULT '2.1.02.004',
                ""SocialSecurityPayableAccountCode"" character varying(32) NOT NULL DEFAULT '2.1.02.003',
                ""UpdatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now()
            );",

            @"CREATE UNIQUE INDEX IF NOT EXISTS ""IX_mappings_Tenant"" ON accounting.mappings (""TenantId"");",

            // TABLAS PARA ASIENTOS MODELOS (PLANTILLAS) Y AUDITORÍA DE LOTES
            @"CREATE TABLE IF NOT EXISTS accounting.journal_templates (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""Code"" character varying(32) NOT NULL,
                ""Name"" character varying(160) NOT NULL,
                ""SourceModule"" character varying(32) NOT NULL,
                ""DocumentType"" character varying(64) NOT NULL,
                ""Description"" character varying(500) NOT NULL DEFAULT '',
                ""Status"" character varying(32) NOT NULL DEFAULT 'Active',
                ""EntrySeries"" character varying(64) NOT NULL DEFAULT 'General',
                ""CreatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now(),
                ""UpdatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now()
            );",

            @"CREATE UNIQUE INDEX IF NOT EXISTS ""IX_journal_templates_Tenant_Code"" ON accounting.journal_templates (""TenantId"", ""Code"");",
            @"CREATE INDEX IF NOT EXISTS ""IX_journal_templates_Tenant_Module_Doc"" ON accounting.journal_templates (""TenantId"", ""SourceModule"", ""DocumentType"");",

            @"CREATE TABLE IF NOT EXISTS accounting.journal_template_lines (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TemplateId"" uuid NOT NULL REFERENCES accounting.journal_templates(""Id"") ON DELETE CASCADE,
                ""TenantId"" uuid NOT NULL,
                ""OrderIndex"" integer NOT NULL DEFAULT 1,
                ""AccountId"" uuid,
                ""AccountCode"" character varying(32) NOT NULL,
                ""AccountName"" character varying(160) NOT NULL,
                ""DebitCredit"" character varying(10) NOT NULL DEFAULT 'Debit',
                ""AmountSource"" character varying(64) NOT NULL DEFAULT 'Total',
                ""Condition"" character varying(64) NOT NULL DEFAULT 'Always',
                ""IsInvertedSign"" boolean NOT NULL DEFAULT false,
                ""MemoTemplate"" character varying(255)
            );",

            @"CREATE INDEX IF NOT EXISTS ""IX_journal_template_lines_Tenant_TemplateId"" ON accounting.journal_template_lines (""TenantId"", ""TemplateId"");",

            @"CREATE TABLE IF NOT EXISTS accounting.batch_runs (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""BatchNumber"" character varying(64) NOT NULL,
                ""ExecutedAtUtc"" timestamp with time zone NOT NULL DEFAULT now(),
                ""ExecutedBy"" character varying(128) NOT NULL DEFAULT 'contador@empresa.com',
                ""PeriodStart"" timestamp with time zone NOT NULL,
                ""PeriodEnd"" timestamp with time zone NOT NULL,
                ""ModulesIncluded"" character varying(128) NOT NULL DEFAULT 'Sales,Purchases',
                ""DocumentsProcessedCount"" integer NOT NULL DEFAULT 0,
                ""EntriesGeneratedCount"" integer NOT NULL DEFAULT 0,
                ""ErrorsCount"" integer NOT NULL DEFAULT 0,
                ""Status"" character varying(32) NOT NULL DEFAULT 'Completed',
                ""DurationSeconds"" numeric(18,2) NOT NULL DEFAULT 0,
                ""SummaryJson"" text NOT NULL DEFAULT '{{}}',
                ""LogDetailsJson"" text NOT NULL DEFAULT '[]',
                ""FiltersAppliedJson"" text NOT NULL DEFAULT '{{}}'
            );",

            @"CREATE UNIQUE INDEX IF NOT EXISTS ""IX_batch_runs_Tenant_BatchNumber"" ON accounting.batch_runs (""TenantId"", ""BatchNumber"");",
            @"CREATE INDEX IF NOT EXISTS ""IX_batch_runs_Tenant_ExecutedAt"" ON accounting.batch_runs (""TenantId"", ""ExecutedAtUtc"");",

            @"CREATE TABLE IF NOT EXISTS accounting.pending_documents (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""SourceModule"" character varying(32) NOT NULL,
                ""DocumentType"" character varying(64) NOT NULL,
                ""SourceDocumentId"" character varying(128) NOT NULL,
                ""DocumentNumber"" character varying(64) NOT NULL,
                ""DocumentDateUtc"" timestamp with time zone NOT NULL,
                ""PayloadJson"" text NOT NULL DEFAULT '{{}}',
                ""Status"" character varying(32) NOT NULL DEFAULT 'Pending',
                ""LastError"" character varying(1000),
                ""JournalEntryId"" uuid,
                ""CreatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now(),
                ""UpdatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now()
            );",

            @"CREATE INDEX IF NOT EXISTS ""IX_pending_documents_Tenant_Module_Doc"" ON accounting.pending_documents (""TenantId"", ""SourceModule"", ""SourceDocumentId"");",
            @"CREATE INDEX IF NOT EXISTS ""IX_pending_documents_Tenant_Status_Date"" ON accounting.pending_documents (""TenantId"", ""Status"", ""DocumentDateUtc"");",

            @"CREATE TABLE IF NOT EXISTS accounting.tenant_settings (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""AutoPostOnConfirm"" boolean NOT NULL DEFAULT false,
                ""CreatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now(),
                ""UpdatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now()
            );",

            @"CREATE UNIQUE INDEX IF NOT EXISTS ""IX_tenant_settings_Tenant"" ON accounting.tenant_settings (""TenantId"");",

            @"CREATE TABLE IF NOT EXISTS accounting.finance_account_mapping (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""FinancialAccountId"" uuid NOT NULL,
                ""LedgerAccountCode"" character varying(32) NOT NULL,
                ""UpdatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now()
            );",

            @"CREATE UNIQUE INDEX IF NOT EXISTS ""IX_finance_account_mapping_Tenant_FinAcc"" ON accounting.finance_account_mapping (""TenantId"", ""FinancialAccountId"");"
        };

        foreach (var sql in statements)
        {
            try
            {
                await Database.ExecuteSqlRawAsync(sql, ct);
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[AccountingDbContext.EnsureTables] Warning executing DDL: {ex.Message}");
            }
        }
    }

    public async Task SeedDefaultChartOfAccountsAsync(TenantId tenantId, CancellationToken ct = default)
    {
        var hasAccounts = await Accounts.AnyAsync(a => a.TenantId == tenantId, ct);
        if (hasAccounts) return;

        var defaultAccounts = new List<Account>
        {
            // 1. ACTIVO
            new(Guid.NewGuid(), tenantId, "1", "ACTIVO", "Asset", 1, null, false),
            new(Guid.NewGuid(), tenantId, "1.1", "Activo Corriente", "Asset", 2, "1", false),
            new(Guid.NewGuid(), tenantId, "1.1.01", "Caja y Bancos", "Asset", 3, "1.1", false),
            new(Guid.NewGuid(), tenantId, "1.1.01.001", "Caja Central Administración", "Asset", 4, "1.1.01", true),
            new(Guid.NewGuid(), tenantId, "1.1.01.002", "Banco Galicia C/C", "Asset", 4, "1.1.01", true),
            new(Guid.NewGuid(), tenantId, "1.1.01.003", "Banco Macro C/C", "Asset", 4, "1.1.01", true),
            new(Guid.NewGuid(), tenantId, "1.1.01.004", "Valores a Depositar (Cheques Físicos)", "Asset", 4, "1.1.01", true),
            new(Guid.NewGuid(), tenantId, "1.1.01.005", "eCheqs en Cartera por Cobrar", "Asset", 4, "1.1.01", true),
            new(Guid.NewGuid(), tenantId, "1.1.01.006", "Cuentas Virtuales / MercadoPago / PSP", "Asset", 4, "1.1.01", true),

            new(Guid.NewGuid(), tenantId, "1.1.02", "Créditos por Ventas", "Asset", 3, "1.1", false),
            new(Guid.NewGuid(), tenantId, "1.1.02.001", "Deudores por Ventas (Clientes)", "Asset", 4, "1.1.02", true),
            new(Guid.NewGuid(), tenantId, "1.1.02.002", "Cheques Rechazados a Cobrar", "Asset", 4, "1.1.02", true),

            new(Guid.NewGuid(), tenantId, "1.1.03", "Otros Créditos Fiscales", "Asset", 3, "1.1", false),
            new(Guid.NewGuid(), tenantId, "1.1.03.001", "IVA Crédito Fiscal (Compras)", "Asset", 4, "1.1.03", true),
            new(Guid.NewGuid(), tenantId, "1.1.03.002", "Retenciones y Percepciones IIBB", "Asset", 4, "1.1.03", true),
            new(Guid.NewGuid(), tenantId, "1.1.03.003", "Retenciones Ganancias Sufridas", "Asset", 4, "1.1.03", true),
            new(Guid.NewGuid(), tenantId, "1.1.03.004", "Percepciones IVA Sufridas", "Asset", 4, "1.1.03", true),

            new(Guid.NewGuid(), tenantId, "1.1.04", "Bienes de Cambio / Stock", "Asset", 3, "1.1", false),
            new(Guid.NewGuid(), tenantId, "1.1.04.001", "Mercaderías de Reventa", "Asset", 4, "1.1.04", true),
            new(Guid.NewGuid(), tenantId, "1.1.04.002", "Materias Primas & Insumos", "Asset", 4, "1.1.04", true),
            new(Guid.NewGuid(), tenantId, "1.1.04.003", "Productos Terminados", "Asset", 4, "1.1.04", true),
            new(Guid.NewGuid(), tenantId, "1.1.04.004", "Granos & Cereales en Acopio", "Asset", 4, "1.1.04", true),

            new(Guid.NewGuid(), tenantId, "1.2", "Activo No Corriente", "Asset", 2, "1", false),
            new(Guid.NewGuid(), tenantId, "1.2.01", "Bienes de Uso", "Asset", 3, "1.2", false),
            new(Guid.NewGuid(), tenantId, "1.2.01.001", "Rodados & Flota Vehicular", "Asset", 4, "1.2.01", true),
            new(Guid.NewGuid(), tenantId, "1.2.01.002", "Maquinarias, Balanzas & Equipos", "Asset", 4, "1.2.01", true),
            new(Guid.NewGuid(), tenantId, "1.2.01.003", "Instalaciones & Silos", "Asset", 4, "1.2.01", true),
            new(Guid.NewGuid(), tenantId, "1.2.01.004", "Amortización Acumulada Rodados (-)", "Asset", 4, "1.2.01", true),

            // 2. PASIVO
            new(Guid.NewGuid(), tenantId, "2", "PASIVO", "Liability", 1, null, false),
            new(Guid.NewGuid(), tenantId, "2.1", "Pasivo Corriente", "Liability", 2, "2", false),
            new(Guid.NewGuid(), tenantId, "2.1.01", "Deudas Comerciales", "Liability", 3, "2.1", false),
            new(Guid.NewGuid(), tenantId, "2.1.01.001", "Proveedores de Mercaderías & Servicios", "Liability", 4, "2.1.01", true),
            new(Guid.NewGuid(), tenantId, "2.1.01.002", "Cheques de Pago Diferido Emitidos", "Liability", 4, "2.1.01", true),
            new(Guid.NewGuid(), tenantId, "2.1.01.003", "eCheqs Emitidos Pendientes de Débito", "Liability", 4, "2.1.01", true),

            new(Guid.NewGuid(), tenantId, "2.1.02", "Deudas Fiscales & Cargas Sociales", "Liability", 3, "2.1", false),
            new(Guid.NewGuid(), tenantId, "2.1.02.001", "IVA Débito Fiscal (Ventas)", "Liability", 4, "2.1.02", true),
            new(Guid.NewGuid(), tenantId, "2.1.02.002", "IVA Saldo a Pagar", "Liability", 4, "2.1.02", true),
            new(Guid.NewGuid(), tenantId, "2.1.02.003", "Cargas Sociales / F.931 a Pagar", "Liability", 4, "2.1.02", true),
            new(Guid.NewGuid(), tenantId, "2.1.02.004", "Sueldos y Jornales a Pagar", "Liability", 4, "2.1.02", true),
            new(Guid.NewGuid(), tenantId, "2.1.02.005", "Impuesto a los Ingresos Brutos a Pagar", "Liability", 4, "2.1.02", true),
            new(Guid.NewGuid(), tenantId, "2.1.02.006", "Retenciones Impositivas Practicadas a Pagar", "Liability", 4, "2.1.02", true),

            new(Guid.NewGuid(), tenantId, "2.1.03", "Deudas Financieras & Bancarias", "Liability", 3, "2.1", false),
            new(Guid.NewGuid(), tenantId, "2.1.03.001", "Préstamos Bancarios & Descubiertos", "Liability", 4, "2.1.03", true),

            // 3. PATRIMONIO NETO
            new(Guid.NewGuid(), tenantId, "3", "PATRIMONIO NETO", "Equity", 1, null, false),
            new(Guid.NewGuid(), tenantId, "3.1", "Capital Social", "Equity", 2, "3", false),
            new(Guid.NewGuid(), tenantId, "3.1.01", "Capital Suscripto", "Equity", 3, "3.1", true),
            new(Guid.NewGuid(), tenantId, "3.2", "Resultados", "Equity", 2, "3", false),
            new(Guid.NewGuid(), tenantId, "3.2.01", "Resultados no Asignados de Ejercicios Anteriores", "Equity", 3, "3.2", true),
            new(Guid.NewGuid(), tenantId, "3.2.02", "Resultado del Ejercicio Presente", "Equity", 3, "3.2", true),

            // 4. INGRESOS / GANANCIAS
            new(Guid.NewGuid(), tenantId, "4", "INGRESOS Y GANANCIAS", "Income", 1, null, false),
            new(Guid.NewGuid(), tenantId, "4.1", "Ingresos Operativos", "Income", 2, "4", false),
            new(Guid.NewGuid(), tenantId, "4.1.01", "Venta de Mercaderías & Bienes", "Income", 3, "4.1", true),
            new(Guid.NewGuid(), tenantId, "4.1.02", "Venta de Servicios & Reparaciones", "Income", 3, "4.1", true),
            new(Guid.NewGuid(), tenantId, "4.1.03", "Comisiones por Corretaje de Granos", "Income", 3, "4.1", true),
            new(Guid.NewGuid(), tenantId, "4.1.04", "Servicios de Fletes & Logística", "Income", 3, "4.1", true),
            new(Guid.NewGuid(), tenantId, "4.2", "Ingresos Financieros & Otros", "Income", 2, "4", false),
            new(Guid.NewGuid(), tenantId, "4.2.01", "Descuentos Obtenidos por Pronto Pago", "Income", 3, "4.2", true),
            new(Guid.NewGuid(), tenantId, "4.2.02", "Intereses Ganados", "Income", 3, "4.2", true),
            new(Guid.NewGuid(), tenantId, "4.2.03", "Diferencia de Cambio Positiva", "Income", 3, "4.2", true),

            // 5. EGRESOS / GASTOS
            new(Guid.NewGuid(), tenantId, "5", "EGRESOS Y GASTOS", "Expense", 1, null, false),
            new(Guid.NewGuid(), tenantId, "5.1", "Costo de Mercaderías y Servicios Vendidos", "Expense", 2, "5", false),
            new(Guid.NewGuid(), tenantId, "5.1.01", "Costo de Mercaderías Vendidas (CMV)", "Expense", 3, "5.1", true),
            new(Guid.NewGuid(), tenantId, "5.1.02", "Costo de Insumos & Repuestos Utilizados", "Expense", 3, "5.1", true),

            new(Guid.NewGuid(), tenantId, "5.2", "Gastos de Administración & Operaciones", "Expense", 2, "5", false),
            new(Guid.NewGuid(), tenantId, "5.2.01", "Sueldos y Jornales del Personal", "Expense", 3, "5.2", true),
            new(Guid.NewGuid(), tenantId, "5.2.02", "Contribuciones Patronales & Cargas Sociales", "Expense", 3, "5.2", true),
            new(Guid.NewGuid(), tenantId, "5.2.03", "Combustibles & Lubricantes de Flota", "Expense", 3, "5.2", true),
            new(Guid.NewGuid(), tenantId, "5.2.04", "Mantenimiento, Neumáticos & Services de Flota", "Expense", 3, "5.2", true),
            new(Guid.NewGuid(), tenantId, "5.2.05", "Honorarios Profesionales (Contable, Legal, Auditoría)", "Expense", 3, "5.2", true),
            new(Guid.NewGuid(), tenantId, "5.2.06", "Servicios Públicos (Energía Eléctrica, Gas, Comunicaciones)", "Expense", 3, "5.2", true),
            new(Guid.NewGuid(), tenantId, "5.2.07", "Seguros de Vehículos e Instalaciones", "Expense", 3, "5.2", true),
            new(Guid.NewGuid(), tenantId, "5.2.08", "Amortización de Bienes de Uso", "Expense", 3, "5.2", true),

            new(Guid.NewGuid(), tenantId, "5.3", "Gastos Financieros & Bancarios", "Expense", 2, "5", false),
            new(Guid.NewGuid(), tenantId, "5.3.01", "Comisiones & Gastos Bancarios", "Expense", 3, "5.3", true),
            new(Guid.NewGuid(), tenantId, "5.3.02", "Impuesto a los Débitos y Créditos Bancarios (Ley 25.413)", "Expense", 3, "5.3", true),
            new(Guid.NewGuid(), tenantId, "5.3.03", "Intereses Pagados", "Expense", 3, "5.3", true),
            new(Guid.NewGuid(), tenantId, "5.3.04", "Diferencia de Cambio Negativa", "Expense", 3, "5.3", true)
        };

        Accounts.AddRange(defaultAccounts);

        // Seed Default Cost Centers
        var defaultCostCenters = new List<CostCenter>
        {
            new(Guid.NewGuid(), tenantId, "CC-ADM", "Administración Central", "Administration"),
            new(Guid.NewGuid(), tenantId, "CC-COM", "Comercial & Ventas", "Commercial"),
            new(Guid.NewGuid(), tenantId, "CC-OPR", "Operaciones & Taller", "Production"),
            new(Guid.NewGuid(), tenantId, "CC-LOG", "Logística & Flota", "Fleet"),
            new(Guid.NewGuid(), tenantId, "CC-AGR", "Acopio & Cereales", "Agriculture")
        };

        CostCenters.AddRange(defaultCostCenters);

        await SaveChangesAsync(ct);
    }

    public async Task<AccountingMapping> GetOrCreateMappingAsync(TenantId tenantId, CancellationToken ct = default)
    {
        var mapping = await Mappings.FirstOrDefaultAsync(m => m.TenantId == tenantId, ct);
        if (mapping == null)
        {
            mapping = new AccountingMapping(Guid.NewGuid(), tenantId);
            Mappings.Add(mapping);
            await SaveChangesAsync(ct);
        }
        return mapping;
    }

    public async Task<AccountingTenantSettings> GetOrCreateTenantSettingsAsync(TenantId tenantId, CancellationToken ct = default)
    {
        var settings = await TenantSettings.FirstOrDefaultAsync(s => s.TenantId == tenantId, ct);
        if (settings is null)
        {
            settings = new AccountingTenantSettings(tenantId);
            TenantSettings.Add(settings);
            await SaveChangesAsync(ct);
        }
        return settings;
    }

    public async Task SeedDefaultJournalTemplatesAsync(TenantId tenantId, CancellationToken ct = default)
    {
        var hasTemplates = await JournalTemplates.AnyAsync(t => t.TenantId == tenantId, ct);
        if (hasTemplates)
        {
            await EnsurePurchaseCreditNoteTemplateAsync(tenantId, ct);
            return;
        }

        var t1 = new JournalTemplate
        {
            TenantId = tenantId,
            Code = "AM-VTA-01",
            Name = "Factura A de Venta en Cta Cte",
            SourceModule = "Sales",
            DocumentType = "InvoiceA",
            EntrySeries = "Ventas",
            Description = "Modelo estándar para Factura A de venta a clientes en cuenta corriente con discriminación de IVA y percepciones.",
            Status = "Active"
        };
        t1.Lines.Add(new JournalTemplateLine { TemplateId = t1.Id, TenantId = tenantId, OrderIndex = 1, AccountCode = "1.1.02.001", AccountName = "Deudores por Ventas (Clientes)", DebitCredit = "Debit", AmountSource = "Total", Condition = "Always" });
        t1.Lines.Add(new JournalTemplateLine { TemplateId = t1.Id, TenantId = tenantId, OrderIndex = 2, AccountCode = "4.1.01", AccountName = "Venta de Mercaderías & Bienes", DebitCredit = "Credit", AmountSource = "Net21", Condition = "IfHasVat21" });
        t1.Lines.Add(new JournalTemplateLine { TemplateId = t1.Id, TenantId = tenantId, OrderIndex = 3, AccountCode = "4.1.01", AccountName = "Venta de Mercaderías (10.5%)", DebitCredit = "Credit", AmountSource = "Net105", Condition = "IfHasVat105" });
        t1.Lines.Add(new JournalTemplateLine { TemplateId = t1.Id, TenantId = tenantId, OrderIndex = 4, AccountCode = "4.1.01", AccountName = "Venta de Mercaderías Exentas", DebitCredit = "Credit", AmountSource = "NetExempt", Condition = "Always" });
        t1.Lines.Add(new JournalTemplateLine { TemplateId = t1.Id, TenantId = tenantId, OrderIndex = 5, AccountCode = "2.1.02.001", AccountName = "IVA Débito Fiscal (Ventas 21%)", DebitCredit = "Credit", AmountSource = "Vat21", Condition = "IfHasVat21" });
        t1.Lines.Add(new JournalTemplateLine { TemplateId = t1.Id, TenantId = tenantId, OrderIndex = 6, AccountCode = "2.1.02.001", AccountName = "IVA Débito Fiscal (Ventas 10.5%)", DebitCredit = "Credit", AmountSource = "Vat105", Condition = "IfHasVat105" });
        t1.Lines.Add(new JournalTemplateLine { TemplateId = t1.Id, TenantId = tenantId, OrderIndex = 7, AccountCode = "2.1.02.005", AccountName = "Impuesto a los Ingresos Brutos a Pagar", DebitCredit = "Credit", AmountSource = "PerceptionIibb", Condition = "IfHasPerceptionIibb" });

        var t2 = new JournalTemplate
        {
            TenantId = tenantId,
            Code = "AM-VTA-02",
            Name = "Factura B/C de Venta a Consumidor Final",
            SourceModule = "Sales",
            DocumentType = "InvoiceB",
            EntrySeries = "Ventas",
            Description = "Modelo para Facturas B o C a consumidores finales y monotributistas.",
            Status = "Active"
        };
        t2.Lines.Add(new JournalTemplateLine { TemplateId = t2.Id, TenantId = tenantId, OrderIndex = 1, AccountCode = "1.1.02.001", AccountName = "Deudores por Ventas (Clientes)", DebitCredit = "Debit", AmountSource = "Total", Condition = "Always" });
        t2.Lines.Add(new JournalTemplateLine { TemplateId = t2.Id, TenantId = tenantId, OrderIndex = 2, AccountCode = "4.1.01", AccountName = "Venta de Mercaderías & Bienes", DebitCredit = "Credit", AmountSource = "Net21", Condition = "Always" });
        t2.Lines.Add(new JournalTemplateLine { TemplateId = t2.Id, TenantId = tenantId, OrderIndex = 3, AccountCode = "2.1.02.001", AccountName = "IVA Débito Fiscal (Ventas)", DebitCredit = "Credit", AmountSource = "Vat21", Condition = "IfHasVat21" });

        var t3 = new JournalTemplate
        {
            TenantId = tenantId,
            Code = "AM-VTA-03",
            Name = "Nota de Crédito de Venta",
            SourceModule = "Sales",
            DocumentType = "CreditNoteA",
            EntrySeries = "Ventas",
            Description = "Modelo para Notas de Crédito de ventas (anulación o bonificación).",
            Status = "Active"
        };
        t3.Lines.Add(new JournalTemplateLine { TemplateId = t3.Id, TenantId = tenantId, OrderIndex = 1, AccountCode = "1.1.02.001", AccountName = "Deudores por Ventas (Clientes)", DebitCredit = "Credit", AmountSource = "Total", Condition = "Always" });
        t3.Lines.Add(new JournalTemplateLine { TemplateId = t3.Id, TenantId = tenantId, OrderIndex = 2, AccountCode = "4.1.01", AccountName = "Venta de Mercaderías & Bienes", DebitCredit = "Debit", AmountSource = "Net21", Condition = "Always" });
        t3.Lines.Add(new JournalTemplateLine { TemplateId = t3.Id, TenantId = tenantId, OrderIndex = 3, AccountCode = "2.1.02.001", AccountName = "IVA Débito Fiscal (Ventas)", DebitCredit = "Debit", AmountSource = "Vat21", Condition = "IfHasVat21" });

        var t4 = new JournalTemplate
        {
            TenantId = tenantId,
            Code = "AM-CMP-01",
            Name = "Factura de Compra a Proveedores",
            SourceModule = "Purchases",
            DocumentType = "InvoiceA",
            EntrySeries = "Compras",
            Description = "Modelo para registro de Facturas A y B de compras de mercaderías e insumos.",
            Status = "Active"
        };
        t4.Lines.Add(new JournalTemplateLine { TemplateId = t4.Id, TenantId = tenantId, OrderIndex = 1, AccountCode = "5.1.01", AccountName = "Costo de Mercaderías Vendidas (CMV)", DebitCredit = "Debit", AmountSource = "Net21", Condition = "Always" });
        t4.Lines.Add(new JournalTemplateLine { TemplateId = t4.Id, TenantId = tenantId, OrderIndex = 2, AccountCode = "1.1.03.001", AccountName = "IVA Crédito Fiscal (Compras)", DebitCredit = "Debit", AmountSource = "Vat21", Condition = "IfHasVat21" });
        t4.Lines.Add(new JournalTemplateLine { TemplateId = t4.Id, TenantId = tenantId, OrderIndex = 3, AccountCode = "1.1.03.002", AccountName = "Retenciones y Percepciones IIBB", DebitCredit = "Debit", AmountSource = "PerceptionIibb", Condition = "IfHasPerceptionIibb" });
        t4.Lines.Add(new JournalTemplateLine { TemplateId = t4.Id, TenantId = tenantId, OrderIndex = 4, AccountCode = "2.1.01.001", AccountName = "Proveedores de Mercaderías & Servicios", DebitCredit = "Credit", AmountSource = "Total", Condition = "Always" });

        var t5 = new JournalTemplate
        {
            TenantId = tenantId,
            Code = "AM-FIN-01",
            Name = "Recibo de Cobranza a Clientes",
            SourceModule = "Finance",
            DocumentType = "CollectionReceipt",
            EntrySeries = "Finanzas",
            Description = "Modelo para imputación contable de cobranzas con valores y retenciones sufridas.",
            Status = "Active"
        };
        t5.Lines.Add(new JournalTemplateLine { TemplateId = t5.Id, TenantId = tenantId, OrderIndex = 1, AccountCode = "1.1.01.001", AccountName = "Caja Central Administración", DebitCredit = "Debit", AmountSource = "PaymentAmount", Condition = "Always" });
        t5.Lines.Add(new JournalTemplateLine { TemplateId = t5.Id, TenantId = tenantId, OrderIndex = 2, AccountCode = "1.1.03.002", AccountName = "Retenciones y Percepciones IIBB", DebitCredit = "Debit", AmountSource = "Withholdings", Condition = "IfHasWithholding" });
        t5.Lines.Add(new JournalTemplateLine { TemplateId = t5.Id, TenantId = tenantId, OrderIndex = 3, AccountCode = "1.1.02.001", AccountName = "Deudores por Ventas (Clientes)", DebitCredit = "Credit", AmountSource = "Total", Condition = "Always" });

        var t6 = new JournalTemplate
        {
            TenantId = tenantId,
            Code = "AM-FIN-02",
            Name = "Orden de Pago a Proveedores",
            SourceModule = "Finance",
            DocumentType = "PaymentOrder",
            EntrySeries = "Finanzas",
            Description = "Modelo para pagos a proveedores desde banco o caja con retenciones emitidas.",
            Status = "Active"
        };
        t6.Lines.Add(new JournalTemplateLine { TemplateId = t6.Id, TenantId = tenantId, OrderIndex = 1, AccountCode = "2.1.01.001", AccountName = "Proveedores de Mercaderías & Servicios", DebitCredit = "Debit", AmountSource = "Total", Condition = "Always" });
        t6.Lines.Add(new JournalTemplateLine { TemplateId = t6.Id, TenantId = tenantId, OrderIndex = 2, AccountCode = "1.1.01.002", AccountName = "Banco Galicia C/C", DebitCredit = "Credit", AmountSource = "PaymentAmount", Condition = "Always" });
        t6.Lines.Add(new JournalTemplateLine { TemplateId = t6.Id, TenantId = tenantId, OrderIndex = 3, AccountCode = "2.1.02.006", AccountName = "Retenciones Impositivas Practicadas a Pagar", DebitCredit = "Credit", AmountSource = "Withholdings", Condition = "IfHasWithholding" });

        var t7 = BuildPurchaseCreditNoteTemplate(tenantId);

        JournalTemplates.AddRange(t1, t2, t3, t4, t5, t6, t7);
        await SaveChangesAsync(ct);
    }

    /// <summary>
    /// Garantiza el asiento modelo de NC de proveedor aunque el tenant ya tenga plantillas seedadas
    /// (versiones anteriores no incluían AM-CMP-02 → auto-post NC devolvía 400).
    /// </summary>
    public async Task EnsurePurchaseCreditNoteTemplateAsync(TenantId tenantId, CancellationToken ct = default)
    {
        var exists = await JournalTemplates.AnyAsync(
            t => t.TenantId == tenantId && t.Code == "AM-CMP-02", ct);
        if (exists) return;

        var template = BuildPurchaseCreditNoteTemplate(tenantId);
        JournalTemplates.Add(template);
        await SaveChangesAsync(ct);
    }

    private static JournalTemplate BuildPurchaseCreditNoteTemplate(TenantId tenantId)
    {
        var t = new JournalTemplate
        {
            TenantId = tenantId,
            Code = "AM-CMP-02",
            Name = "Nota de Crédito de Compra a Proveedores",
            SourceModule = "Purchases",
            DocumentType = "CreditNoteA",
            EntrySeries = "Compras",
            Description = "Modelo para Notas de Crédito de proveedores (NC_A/NC-A): invierte el asiento de la factura de compra.",
            Status = "Active"
        };
        // Invertido respecto de AM-CMP-01: crédito en gasto/IVA, débito en proveedores.
        t.Lines.Add(new JournalTemplateLine { TemplateId = t.Id, TenantId = tenantId, OrderIndex = 1, AccountCode = "5.1.01", AccountName = "Costo de Mercaderías Vendidas (CMV)", DebitCredit = "Credit", AmountSource = "Net21", Condition = "Always" });
        t.Lines.Add(new JournalTemplateLine { TemplateId = t.Id, TenantId = tenantId, OrderIndex = 2, AccountCode = "1.1.03.001", AccountName = "IVA Crédito Fiscal (Compras)", DebitCredit = "Credit", AmountSource = "Vat21", Condition = "IfHasVat21" });
        t.Lines.Add(new JournalTemplateLine { TemplateId = t.Id, TenantId = tenantId, OrderIndex = 3, AccountCode = "2.1.01.001", AccountName = "Proveedores de Mercaderías & Servicios", DebitCredit = "Debit", AmountSource = "Total", Condition = "Always" });
        return t;
    }
}
