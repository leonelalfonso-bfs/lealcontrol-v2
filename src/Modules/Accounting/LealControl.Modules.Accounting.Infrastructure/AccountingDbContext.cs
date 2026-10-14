using LealControl.BuildingBlocks.Persistence;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Accounting.Contracts.Posting;
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

    public Task EnsureAccountingTablesAsync(CancellationToken ct = default) =>
        SchemaInitializationGate.RunOnceAsync(this, "accounting", EnsureAccountingTablesCoreAsync);

    private async Task EnsureAccountingTablesCoreAsync(CancellationToken ct = default)
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

            @"ALTER TABLE accounting.journal_entry_lines ADD COLUMN IF NOT EXISTS ""OriginalAmount"" numeric(18,2);",

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

    /// <summary>
    /// Numeración correlativa de asientos por empresa. Bloquea la numeración hasta el fin de la
    /// transacción en curso (obligatoria) y devuelve el último número usado: así dos asientos
    /// simultáneos nunca toman el mismo número.
    /// </summary>
    public async Task<int> LockEntryNumberingAsync(TenantId tenantId, CancellationToken ct = default)
    {
        if (Database.CurrentTransaction is null)
            throw new InvalidOperationException("La numeración de asientos se toma dentro de una transacción.");
        await Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(hashtextextended({0}, 0))",
            ["accounting.journal-number:" + tenantId.Value.ToString("N")], ct);
        return await JournalEntries.Where(j => j.TenantId == tenantId).MaxAsync(j => (int?)j.EntryNumber, ct) ?? 0;
    }

    /// <summary>
    /// Un "contabilizar" a la vez por empresa: traer los comprobantes de Ventas y Compras y asentar el
    /// lote quedan en fila, así dos personas no publican ni asientan lo mismo. Se libera al descartarlo.
    /// </summary>
    public async Task<IAsyncDisposable> LockPostingRunAsync(TenantId tenantId, CancellationToken ct = default)
    {
        // La conexión queda abierta hasta liberar: el bloqueo es de la sesión y abarca varias transacciones.
        await Database.OpenConnectionAsync(ct);
        var key = "accounting.posting-run:" + tenantId.Value.ToString("N");
        await Database.ExecuteSqlRawAsync("SELECT pg_advisory_lock(hashtextextended({0}, 0))", [key], ct);
        return new PostingRunLock(this, key);
    }

    private sealed class PostingRunLock(AccountingDbContext db, string key) : IAsyncDisposable
    {
        public async ValueTask DisposeAsync()
        {
            try
            {
                await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_unlock(hashtextextended({0}, 0))", [key], CancellationToken.None);
            }
            finally
            {
                await db.Database.CloseConnectionAsync();
            }
        }
    }

    /// <summary>True si el mes de esa fecha está cerrado con candado.</summary>
    public Task<bool> IsPeriodLockedAsync(TenantId tenantId, DateTime date, CancellationToken ct = default) =>
        Periods.AnyAsync(p => p.TenantId == tenantId && p.Year == date.Year && p.Month == date.Month && p.Status == "Locked", ct);

    /// <summary>Descarta los asientos agregados y no guardados (por ejemplo, después de un error al grabar).</summary>
    public void DiscardUnsavedEntries()
    {
        foreach (var e in ChangeTracker.Entries().Where(e => e.State == EntityState.Added && e.Entity is JournalEntry or JournalEntryLine).ToList())
            e.State = EntityState.Detached;
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
            new(Guid.NewGuid(), tenantId, "5.1.03", "Compras de Mercaderías, Insumos y Servicios", "Expense", 3, "5.1", true),

            new(Guid.NewGuid(), tenantId, "5.2", "Gastos de Administración & Operaciones", "Expense", 2, "5", false),
            new(Guid.NewGuid(), tenantId, "5.2.01", "Sueldos y Jornales del Personal", "Expense", 3, "5.2", true),
            new(Guid.NewGuid(), tenantId, "5.2.02", "Contribuciones Patronales & Cargas Sociales", "Expense", 3, "5.2", true),
            new(Guid.NewGuid(), tenantId, "5.2.03", "Combustibles & Lubricantes de Flota", "Expense", 3, "5.2", true),
            new(Guid.NewGuid(), tenantId, "5.2.04", "Mantenimiento, Neumáticos & Services de Flota", "Expense", 3, "5.2", true),
            new(Guid.NewGuid(), tenantId, "5.2.05", "Honorarios Profesionales (Contable, Legal, Auditoría)", "Expense", 3, "5.2", true),
            new(Guid.NewGuid(), tenantId, "5.2.06", "Servicios Públicos (Energía Eléctrica, Gas, Comunicaciones)", "Expense", 3, "5.2", true),
            new(Guid.NewGuid(), tenantId, "5.2.07", "Seguros de Vehículos e Instalaciones", "Expense", 3, "5.2", true),
            new(Guid.NewGuid(), tenantId, "5.2.08", "Amortización de Bienes de Uso", "Expense", 3, "5.2", true),
            new(Guid.NewGuid(), tenantId, "5.2.09", "Impuestos y Tasas", "Expense", 3, "5.2", true),

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
            await EnsureStandardDocumentTemplatesAsync(tenantId, ct);
            return;
        }

        var collection = new JournalTemplate
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
        collection.Lines.Add(new JournalTemplateLine { TemplateId = collection.Id, TenantId = tenantId, OrderIndex = 1, AccountCode = "1.1.01.001", AccountName = "Caja Central Administración", DebitCredit = "Debit", AmountSource = "PaymentAmount", Condition = "Always" });
        collection.Lines.Add(new JournalTemplateLine { TemplateId = collection.Id, TenantId = tenantId, OrderIndex = 2, AccountCode = "1.1.03.002", AccountName = "Retenciones y Percepciones IIBB", DebitCredit = "Debit", AmountSource = "Withholdings", Condition = "IfHasWithholding" });
        collection.Lines.Add(new JournalTemplateLine { TemplateId = collection.Id, TenantId = tenantId, OrderIndex = 3, AccountCode = "1.1.02.001", AccountName = "Deudores por Ventas (Clientes)", DebitCredit = "Credit", AmountSource = "Total", Condition = "Always" });
        AddCollectionExchangeLines(collection);

        var payment = new JournalTemplate
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
        payment.Lines.Add(new JournalTemplateLine { TemplateId = payment.Id, TenantId = tenantId, OrderIndex = 1, AccountCode = "2.1.01.001", AccountName = "Proveedores de Mercaderías & Servicios", DebitCredit = "Debit", AmountSource = "Total", Condition = "Always" });
        payment.Lines.Add(new JournalTemplateLine { TemplateId = payment.Id, TenantId = tenantId, OrderIndex = 2, AccountCode = "1.1.01.002", AccountName = "Banco Galicia C/C", DebitCredit = "Credit", AmountSource = "PaymentAmount", Condition = "Always" });
        payment.Lines.Add(new JournalTemplateLine { TemplateId = payment.Id, TenantId = tenantId, OrderIndex = 3, AccountCode = "2.1.02.006", AccountName = "Retenciones Impositivas Practicadas a Pagar", DebitCredit = "Credit", AmountSource = "Withholdings", Condition = "IfHasWithholding" });

        JournalTemplates.AddRange(collection, payment);
        await SaveChangesAsync(ct);
        await EnsureStandardDocumentTemplatesAsync(tenantId, ct);
    }

    /// <summary>Códigos de los asientos modelo de fábrica para comprobantes de Ventas y Compras.</summary>
    public static class StandardTemplates
    {
        public const string SalesInvoice = "AM-VTA-FAC";
        public const string SalesCreditNote = "AM-VTA-NC";
        public const string PurchaseInvoice = "AM-CMP-FAC";
        public const string PurchaseCreditNote = "AM-CMP-NC";
        public const string SalesFxDebitNote = "AM-VTA-DC-ND";
        public const string SalesFxCreditNote = "AM-VTA-DC-NC";
        /// <summary>Versiones anteriores, incompletas (solo IVA 21 %): se desactivan al instalar las nuevas.</summary>
        public static readonly string[] Superseded = ["AM-VTA-01", "AM-VTA-02", "AM-VTA-03", "AM-CMP-01", "AM-CMP-02"];
    }

    /// <summary>
    /// Garantiza las cuentas y los asientos modelo de fábrica para facturas, notas de débito y notas de
    /// crédito de Ventas y Compras: todas las alícuotas (21, 10,5 y 27 %), exento y percepciones.
    /// No modifica lo que cada empresa ya personalizó.
    /// </summary>
    public async Task EnsureStandardDocumentTemplatesAsync(TenantId tenantId, CancellationToken ct = default)
    {
        if (await Accounts.AnyAsync(a => a.TenantId == tenantId, ct))
        {
            var codes = await Accounts.Where(a => a.TenantId == tenantId).Select(a => a.Code).ToListAsync(ct);
            if (!codes.Contains("5.1.03"))
                Accounts.Add(new Account(Guid.NewGuid(), tenantId, "5.1.03", "Compras de Mercaderías, Insumos y Servicios", "Expense", 3, "5.1", true));
            if (!codes.Contains("5.2.09"))
                Accounts.Add(new Account(Guid.NewGuid(), tenantId, "5.2.09", "Impuestos y Tasas", "Expense", 3, "5.2", true));
        }

        var existing = await JournalTemplates.Where(t => t.TenantId == tenantId).ToListAsync(ct);
        var installed = false;
        foreach (var template in BuildStandardDocumentTemplates(tenantId))
        {
            if (existing.Any(t => t.Code == template.Code)) continue;
            JournalTemplates.Add(template);
            installed = true;
        }
        // Empresas que ya tenían el modelo de cobros: se le agregan las líneas de diferencia de cambio.
        var collectionTemplate = await JournalTemplates.Include(t => t.Lines)
            .FirstOrDefaultAsync(t => t.TenantId == tenantId && t.Code == "AM-FIN-01", ct);
        if (collectionTemplate is not null && !collectionTemplate.Lines.Any(l => l.AmountSource == AccountingAmountSources.ExchangeGain))
        {
            AddCollectionExchangeLines(collectionTemplate);
            foreach (var line in collectionTemplate.Lines.Skip(collectionTemplate.Lines.Count - 2))
                Entry(line).State = EntityState.Added;
            collectionTemplate.UpdatedAtUtc = DateTime.UtcNow;
        }
        if (installed)
        {
            foreach (var old in existing.Where(t => StandardTemplates.Superseded.Contains(t.Code) && t.Status == "Active"))
            {
                old.Status = "Inactive";
                old.UpdatedAtUtc = DateTime.UtcNow;
            }
        }
        await SaveChangesAsync(ct);
    }

    /// <summary>
    /// Cobro en dólares de facturas en dólares: la diferencia entre la cotización de la factura y la del cobro
    /// va a diferencia de cambio positiva o negativa.
    /// </summary>
    private static void AddCollectionExchangeLines(JournalTemplate collection)
    {
        var next = collection.Lines.Count == 0 ? 1 : collection.Lines.Max(l => l.OrderIndex) + 1;
        collection.Lines.Add(new JournalTemplateLine { TemplateId = collection.Id, TenantId = collection.TenantId, OrderIndex = next, AccountCode = "4.2.03", AccountName = "Diferencia de Cambio Positiva", DebitCredit = "Credit", AmountSource = AccountingAmountSources.ExchangeGain, Condition = "IfHasExchangeGain" });
        collection.Lines.Add(new JournalTemplateLine { TemplateId = collection.Id, TenantId = collection.TenantId, OrderIndex = next + 1, AccountCode = "5.3.04", AccountName = "Diferencia de Cambio Negativa", DebitCredit = "Debit", AmountSource = AccountingAmountSources.ExchangeLoss, Condition = "IfHasExchangeLoss" });
    }

    private static IEnumerable<JournalTemplate> BuildStandardDocumentTemplates(TenantId tenantId)
    {
        JournalTemplate Template(string code, string name, string module, string docType, string series, string description,
            params (string Account, string Name, string Side, string Source)[] lines)
        {
            var t = new JournalTemplate
            {
                TenantId = tenantId, Code = code, Name = name, SourceModule = module, DocumentType = docType,
                EntrySeries = series, Description = description, Status = "Active"
            };
            var order = 1;
            foreach (var (account, accountName, side, source) in lines)
            {
                t.Lines.Add(new JournalTemplateLine
                {
                    TemplateId = t.Id, TenantId = tenantId, OrderIndex = order++, AccountCode = account, AccountName = accountName,
                    DebitCredit = side, AmountSource = source,
                    // El total siempre; cada alícuota, solo si el comprobante la tiene.
                    Condition = source == "Total" ? "Always" : $"IfHas{source}"
                });
            }
            return t;
        }
        static (string, string, string, string)[] Flip((string Account, string Name, string Side, string Source)[] lines) =>
            lines.Select(l => (l.Account, l.Name, l.Side == "Debit" ? "Credit" : "Debit", l.Source)).ToArray();

        (string, string, string, string)[] sale =
        [
            ("1.1.02.001", "Deudores por Ventas (Clientes)", "Debit", "Total"),
            ("4.1.01", "Ventas gravadas 21%", "Credit", "Net21"),
            ("4.1.01", "Ventas gravadas 10,5%", "Credit", "Net105"),
            ("4.1.01", "Ventas gravadas 27%", "Credit", "Net27"),
            ("4.1.01", "Ventas exentas o no gravadas", "Credit", "NetExempt"),
            ("2.1.02.001", "IVA Débito Fiscal 21%", "Credit", "Vat21"),
            ("2.1.02.001", "IVA Débito Fiscal 10,5%", "Credit", "Vat105"),
            ("2.1.02.001", "IVA Débito Fiscal 27%", "Credit", "Vat27"),
            ("2.1.02.005", "Percepción de Ingresos Brutos a Pagar", "Credit", "PerceptionIibb")
        ];
        (string, string, string, string)[] purchase =
        [
            ("5.1.03", "Compras gravadas 21%", "Debit", "Net21"),
            ("5.1.03", "Compras gravadas 10,5%", "Debit", "Net105"),
            ("5.1.03", "Compras gravadas 27%", "Debit", "Net27"),
            ("5.1.03", "Compras exentas o no gravadas", "Debit", "NetExempt"),
            ("1.1.03.001", "IVA Crédito Fiscal 21%", "Debit", "Vat21"),
            ("1.1.03.001", "IVA Crédito Fiscal 10,5%", "Debit", "Vat105"),
            ("1.1.03.001", "IVA Crédito Fiscal 27%", "Debit", "Vat27"),
            ("1.1.03.004", "Percepciones de IVA Sufridas", "Debit", "PerceptionVat"),
            ("1.1.03.002", "Percepciones de Ingresos Brutos Sufridas", "Debit", "PerceptionIibb"),
            ("5.2.09", "Otros tributos", "Debit", "OtherTaxes"),
            ("2.1.01.001", "Proveedores de Mercaderías & Servicios", "Credit", "Total")
        ];

        yield return Template(StandardTemplates.SalesInvoice, "Factura o nota de débito de venta", "Sales", AccountingDocumentTypes.All, "Ventas",
            "Facturas A, B, C y de Crédito Electrónica, y notas de débito: deudores contra ventas por alícuota, IVA débito y percepciones.", sale);
        yield return Template(StandardTemplates.SalesCreditNote, "Nota de crédito de venta", "Sales", "CreditNote", "Ventas",
            "Notas de crédito de venta: el asiento de la factura, invertido.", Flip(sale));
        // Notas por diferencia de cambio: el neto va a diferencia de cambio (positiva o negativa), no a Ventas.
        (string, string, string, string)[] FxNet((string Account, string Name, string Side, string Source)[] lines, string account, string name) =>
            lines.Select(l => l.Account == "4.1.01" ? (account, name, l.Side, l.Source) : (l.Account, l.Name, l.Side, l.Source)).ToArray();
        yield return Template(StandardTemplates.SalesFxDebitNote, "Nota de débito por diferencia de cambio", "Sales", "DebitNote", "Ventas",
            "Nota de débito al cliente por la diferencia de cambio de un cobro en dólares: el neto es diferencia de cambio positiva.",
            FxNet(sale, "4.2.03", "Diferencia de Cambio Positiva"));
        yield return Template(StandardTemplates.SalesFxCreditNote, "Nota de crédito por diferencia de cambio", "Sales", "CreditNote", "Ventas",
            "Nota de crédito al cliente por la diferencia de cambio de un cobro en dólares: el neto es diferencia de cambio negativa.",
            FxNet(Flip(sale), "5.3.04", "Diferencia de Cambio Negativa"));
        yield return Template(StandardTemplates.PurchaseInvoice, "Factura o nota de débito de compra", "Purchases", AccountingDocumentTypes.All, "Compras",
            "Facturas y notas de débito de proveedores: compras por alícuota, IVA crédito, percepciones sufridas y otros tributos contra proveedores.", purchase);
        yield return Template(StandardTemplates.PurchaseCreditNote, "Nota de crédito de compra", "Purchases", "CreditNote", "Compras",
            "Notas de crédito de proveedores: el asiento de la factura de compra, invertido.", Flip(purchase));
    }
}
