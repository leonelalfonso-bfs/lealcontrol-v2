using LealControl.BuildingBlocks.Persistence;
using LealControl.Modules.Crm.Domain.Activities;
using LealControl.Modules.Crm.Domain.Customers;
using LealControl.Modules.Crm.Domain.Leads;
using LealControl.Modules.Crm.Domain.Opportunities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

namespace LealControl.Modules.Crm.Infrastructure.Persistence;

public sealed class CrmDbContext : DbContext, IUnitOfWork
{
    public const string Schema = "crm";
    private readonly ILogger<CrmDbContext> _logger;

    public CrmDbContext(DbContextOptions<CrmDbContext> options)
        : this(options, null)
    {
    }

    public CrmDbContext(DbContextOptions<CrmDbContext> options, ILogger<CrmDbContext>? logger)
        : base(options)
    {
        _logger = logger ?? NullLogger<CrmDbContext>.Instance;
    }

    public DbSet<Customer> Customers => Set<Customer>();

    public DbSet<CustomerEquipment> CustomerEquipments => Set<CustomerEquipment>();

    public DbSet<Lead> Leads => Set<Lead>();

    public DbSet<Opportunity> Opportunities => Set<Opportunity>();

    public DbSet<Activity> Activities => Set<Activity>();

    public DbSet<LealControl.Modules.Crm.Domain.Settings.CompanySettings> CompanySettings => Set<LealControl.Modules.Crm.Domain.Settings.CompanySettings>();

    public DbSet<LealControl.Modules.Crm.Domain.Settings.TenantUser> TenantUsers => Set<LealControl.Modules.Crm.Domain.Settings.TenantUser>();

    public DbSet<LealControl.Modules.Crm.Domain.Suppliers.Supplier> Suppliers => Set<LealControl.Modules.Crm.Domain.Suppliers.Supplier>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Schema);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(CrmDbContext).Assembly);
    }

    public async Task EnsureCrmTablesAsync()
    {
        try
        {
            await Database.ExecuteSqlRawAsync(@"
                CREATE TABLE IF NOT EXISTS public.tenant_settings (
                    ""TenantId"" uuid NOT NULL PRIMARY KEY,
                    ""LegalName"" character varying(256) NOT NULL,
                    ""TradeName"" character varying(256),
                    ""DocumentType"" character varying(20) NOT NULL DEFAULT 'Cuit',
                    ""DocumentNumber"" character varying(20) NOT NULL DEFAULT '30715489629',
                    ""TaxCondition"" character varying(64) NOT NULL DEFAULT 'ResponsableInscripto',
                    ""IibbRegime"" character varying(64) NOT NULL DEFAULT 'ConvenioMultilateral',
                    ""IibbNumber"" character varying(64),
                    ""ActivityStartDate"" character varying(32),
                    ""Email"" character varying(128),
                    ""Phone"" character varying(64),
                    ""WhatsApp"" character varying(64),
                    ""Website"" character varying(256),
                    ""FiscalStreet"" character varying(256),
                    ""FiscalCity"" character varying(128),
                    ""FiscalProvince"" character varying(64),
                    ""FiscalPostalCode"" character varying(20),
                    ""LogoUrl"" text,
                    ""ArcaCertificateCrt"" text,
                    ""ArcaCertificateKey"" text,
                    ""ArcaEnvironment"" character varying(32) NOT NULL DEFAULT 'Homologacion',
                    ""ArcaSignerCuit"" character varying(20),
                    ""BankName"" character varying(128),
                    ""BankCbu"" character varying(64),
                    ""BankAlias"" character varying(64),
                    ""DefaultQuoteValidDays"" integer NOT NULL DEFAULT 15,
                    ""DefaultDeliveryDays"" integer NOT NULL DEFAULT 7,
                    ""DefaultWarranty"" character varying(256),
                    ""DefaultPaymentTerms"" character varying(256),
                    ""CreatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now(),
                    ""UpdatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now()
                );

                CREATE TABLE IF NOT EXISTS public.tenant_users (
                    ""Id"" uuid NOT NULL PRIMARY KEY,
                    ""TenantId"" uuid NOT NULL,
                    ""FullName"" character varying(128) NOT NULL,
                    ""Email"" character varying(128) NOT NULL,
                    ""Role"" character varying(64) NOT NULL DEFAULT 'Comercial',
                    ""PasswordHash"" character varying(256),
                    ""IsActive"" boolean NOT NULL DEFAULT true,
                    ""CreatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now(),
                    ""LastLoginUtc"" timestamp with time zone
                );

                ALTER TABLE public.tenant_settings ADD COLUMN IF NOT EXISTS ""ActivityStartDate"" character varying(32);
                ALTER TABLE public.tenant_settings ADD COLUMN IF NOT EXISTS ""CreatedAtUtc"" timestamp with time zone DEFAULT now();
                ALTER TABLE public.tenant_settings ADD COLUMN IF NOT EXISTS ""UpdatedAtUtc"" timestamp with time zone DEFAULT now();
                ALTER TABLE public.tenant_users ADD COLUMN IF NOT EXISTS ""PasswordHash"" character varying(256);
                ALTER TABLE public.tenant_users ADD COLUMN IF NOT EXISTS ""LastLoginUtc"" timestamp with time zone;
                ALTER TABLE public.tenant_users ADD COLUMN IF NOT EXISTS ""IsActive"" boolean DEFAULT true;
                ALTER TABLE public.tenant_users ADD COLUMN IF NOT EXISTS ""AllowedModulesJson"" text DEFAULT '[""sales"", ""crm"", ""purchases"", ""inventory"", ""finance"", ""fleet"", ""hr"", ""grains""]';
                ALTER TABLE crm.customers ADD COLUMN IF NOT EXISTS ""CreditRating"" character varying(10);
                ALTER TABLE crm.customers ADD COLUMN IF NOT EXISTS ""BcraWorstSituation"" integer;
                ALTER TABLE crm.customers ADD COLUMN IF NOT EXISTS ""BcraTotalDebt"" numeric(18,2);
                ALTER TABLE crm.customers ADD COLUMN IF NOT EXISTS ""BcraRejectedChequesCount"" integer;
                ALTER TABLE crm.customers ADD COLUMN IF NOT EXISTS ""BcraLastCheckedAtUtc"" timestamp with time zone;
                ALTER TABLE crm.customers ADD COLUMN IF NOT EXISTS ""CreditRecommendation"" character varying(2000);
            ");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error en EnsureCrmTablesAsync");
        }
    }
}
