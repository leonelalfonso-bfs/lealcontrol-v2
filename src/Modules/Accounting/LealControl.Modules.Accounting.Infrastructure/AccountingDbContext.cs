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
            b.Property(x => x.TotalDebit).HasPrecision(18, 2);
            b.Property(x => x.TotalCredit).HasPrecision(18, 2);
            b.Property(x => x.CreatedBy).HasMaxLength(128);
            b.Property(x => x.TenantId).HasConversion(v => v.Value, v => new TenantId(v));
            b.HasMany(x => x.Lines).WithOne().HasForeignKey(x => x.JournalEntryId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<JournalEntryLine>(b =>
        {
            b.ToTable("journal_entry_lines", "accounting");
            b.HasKey(x => x.Id);
            b.Property(x => x.AccountCode).HasMaxLength(32).IsRequired();
            b.Property(x => x.AccountName).HasMaxLength(160).IsRequired();
            b.Property(x => x.Debit).HasPrecision(18, 2);
            b.Property(x => x.Credit).HasPrecision(18, 2);
            b.Property(x => x.Currency).HasMaxLength(10).HasDefaultValue("ARS");
            b.Property(x => x.ExchangeRate).HasPrecision(18, 4).HasDefaultValue(1);
            b.Property(x => x.CostCenterCode).HasMaxLength(32);
            b.Property(x => x.CostCenterName).HasMaxLength(128);
            b.Property(x => x.Memo).HasMaxLength(500);
            b.Property(x => x.TenantId).HasConversion(v => v.Value, v => new TenantId(v));
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
    }

    public async Task EnsureAccountingTablesAsync(CancellationToken ct = default)
    {
        try
        {
            await Database.ExecuteSqlRawAsync(@"
                CREATE SCHEMA IF NOT EXISTS accounting;

                CREATE TABLE IF NOT EXISTS accounting.accounts (
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
                );
                CREATE UNIQUE INDEX IF NOT EXISTS ""IX_accounts_Tenant_Code"" ON accounting.accounts (""TenantId"", ""Code"");

                CREATE TABLE IF NOT EXISTS accounting.journal_entries (
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
                );

                CREATE TABLE IF NOT EXISTS accounting.journal_entry_lines (
                    ""Id"" uuid NOT NULL PRIMARY KEY,
                    ""JournalEntryId"" uuid NOT NULL,
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
                );

                CREATE TABLE IF NOT EXISTS accounting.cost_centers (
                    ""Id"" uuid NOT NULL PRIMARY KEY,
                    ""TenantId"" uuid NOT NULL,
                    ""Code"" character varying(32) NOT NULL,
                    ""Name"" character varying(128) NOT NULL,
                    ""Category"" character varying(64) NOT NULL DEFAULT 'Administration',
                    ""IsActive"" boolean NOT NULL DEFAULT true,
                    ""CreatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now()
                );
                CREATE UNIQUE INDEX IF NOT EXISTS ""IX_cost_centers_Tenant_Code"" ON accounting.cost_centers (""TenantId"", ""Code"");

                CREATE TABLE IF NOT EXISTS accounting.periods (
                    ""Id"" uuid NOT NULL PRIMARY KEY,
                    ""TenantId"" uuid NOT NULL,
                    ""Year"" integer NOT NULL,
                    ""Month"" integer NOT NULL,
                    ""Status"" character varying(32) NOT NULL DEFAULT 'Open',
                    ""LockedAtUtc"" timestamp with time zone,
                    ""LockedBy"" character varying(128)
                );
                CREATE UNIQUE INDEX IF NOT EXISTS ""IX_periods_Tenant_Year_Month"" ON accounting.periods (""TenantId"", ""Year"", ""Month"");
            ", ct);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[AccountingDbContext] Error en EnsureAccountingTablesAsync: {ex.Message}");
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
}
