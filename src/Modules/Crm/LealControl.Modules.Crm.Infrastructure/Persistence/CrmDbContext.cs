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

    public async Task EnsureCrmTablesAsync(CancellationToken cancellationToken = default)
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
                ALTER TABLE public.tenant_users ADD COLUMN IF NOT EXISTS ""IsTechnicalDirector"" boolean NOT NULL DEFAULT false;
            ", cancellationToken);

            // Huecos de producción: opportunities/activities/hijos. No crear crm.customers a mano:
            // un stub incompleto hace saltar MigrateAsync y el INSERT de clientes explota (500).
            await Database.ExecuteSqlRawAsync(@"
                CREATE SCHEMA IF NOT EXISTS crm;

                CREATE TABLE IF NOT EXISTS crm.opportunities (
                    ""Id"" uuid NOT NULL PRIMARY KEY,
                    ""TenantId"" uuid NOT NULL,
                    ""Title"" character varying(200) NOT NULL,
                    ""CustomerId"" uuid,
                    ""LeadId"" uuid,
                    ""Stage"" character varying(30) NOT NULL,
                    ""Amount"" numeric(18,2),
                    ""Currency"" character varying(3),
                    ""OwnerId"" uuid,
                    ""LostReason"" character varying(400),
                    ""CreatedAtUtc"" timestamp with time zone NOT NULL,
                    ""UpdatedAtUtc"" timestamp with time zone NOT NULL
                );

                CREATE TABLE IF NOT EXISTS crm.activities (
                    ""Id"" uuid NOT NULL PRIMARY KEY,
                    ""TenantId"" uuid NOT NULL,
                    ""Type"" character varying(30) NOT NULL,
                    ""Description"" character varying(4000) NOT NULL,
                    ""CustomerId"" uuid,
                    ""LeadId"" uuid,
                    ""OpportunityId"" uuid,
                    ""AuthorId"" uuid,
                    ""NextFollowUpOn"" timestamp with time zone,
                    ""OccurredAtUtc"" timestamp with time zone NOT NULL,
                    ""CreatedAtUtc"" timestamp with time zone NOT NULL
                );

                CREATE TABLE IF NOT EXISTS crm.customer_locations (
                    ""Id"" uuid NOT NULL PRIMARY KEY,
                    ""Name"" character varying(160) NOT NULL,
                    street character varying(200) NOT NULL,
                    city character varying(120) NOT NULL,
                    province character varying(40) NOT NULL,
                    postal_code character varying(12) NOT NULL,
                    phone character varying(20),
                    ""Notes"" character varying(2000),
                    customer_id uuid
                );

                CREATE TABLE IF NOT EXISTS crm.customer_contacts (
                    ""Id"" uuid NOT NULL PRIMARY KEY,
                    ""Name"" character varying(160) NOT NULL,
                    ""Role"" character varying(30) NOT NULL,
                    ""LocationId"" uuid,
                    email character varying(200),
                    phone character varying(20),
                    whatsapp character varying(20),
                    ""IsPrimary"" boolean NOT NULL DEFAULT false,
                    ""Notes"" character varying(2000),
                    customer_id uuid
                );

                CREATE TABLE IF NOT EXISTS crm.customer_fiscal_rates (
                    id uuid NOT NULL PRIMARY KEY,
                    ""Jurisdiction"" character varying(40) NOT NULL,
                    ""PerceptionRate"" numeric(8,4) NOT NULL,
                    ""RetentionRate"" numeric(8,4) NOT NULL,
                    ""HasPerceptionExclusion"" boolean NOT NULL DEFAULT false,
                    ""PerceptionExclusionExpiresOn"" date,
                    ""HasRetentionExclusion"" boolean NOT NULL DEFAULT false,
                    ""RetentionExclusionExpiresOn"" date,
                    ""ExclusionCertificateNumber"" character varying(80),
                    customer_id uuid NOT NULL
                );

                CREATE TABLE IF NOT EXISTS crm.customer_equipments (
                    ""Id"" uuid NOT NULL PRIMARY KEY,
                    ""InternalCode"" character varying(80) NOT NULL,
                    ""EquipmentType"" character varying(120) NOT NULL,
                    ""Brand"" character varying(120),
                    ""Model"" character varying(120),
                    ""SerialNumber"" character varying(120),
                    ""MaxCapacity"" character varying(80),
                    ""DivisionScale"" character varying(80),
                    ""LocationId"" uuid,
                    ""Status"" character varying(40),
                    ""LastCalibrationDate"" timestamp with time zone,
                    ""CalibrationIntervalMonths"" integer,
                    ""NextCalibrationDueDate"" timestamp with time zone,
                    ""Notes"" character varying(2000),
                    ""CustomAttributes"" jsonb,
                    customer_id uuid NOT NULL
                );
            ", cancellationToken);

            try
            {
                await Database.ExecuteSqlRawAsync(@"
                    ALTER TABLE crm.customers ADD COLUMN IF NOT EXISTS ""CreditRating"" character varying(10);
                    ALTER TABLE crm.customers ADD COLUMN IF NOT EXISTS ""BcraWorstSituation"" integer;
                    ALTER TABLE crm.customers ADD COLUMN IF NOT EXISTS ""BcraTotalDebt"" numeric(18,2);
                    ALTER TABLE crm.customers ADD COLUMN IF NOT EXISTS ""BcraRejectedChequesCount"" integer;
                    ALTER TABLE crm.customers ADD COLUMN IF NOT EXISTS ""BcraLastCheckedAtUtc"" timestamp with time zone;
                    ALTER TABLE crm.customers ADD COLUMN IF NOT EXISTS ""CreditRecommendation"" character varying(2000);
                    ALTER TABLE crm.customers ADD COLUMN IF NOT EXISTS deleted_at_utc timestamp with time zone;
                    ALTER TABLE crm.customers ADD COLUMN IF NOT EXISTS ""IsLargeCompany"" boolean NOT NULL DEFAULT false;
                    ALTER TABLE crm.customers ADD COLUMN IF NOT EXISTS ""FceThreshold"" numeric(18,2);
                    ALTER TABLE crm.customers ADD COLUMN IF NOT EXISTS ""FceCheckedAtUtc"" timestamp with time zone;
                ", cancellationToken);
            }
            catch (Exception customersEx)
            {
                _logger.LogWarning(customersEx, "EnsureCrmTablesAsync: columnas BCRA en crm.customers omitidas (tabla ausente o esquema incompleto).");
            }

            await Database.ExecuteSqlRawAsync(@"
                ALTER TABLE crm.opportunities ADD COLUMN IF NOT EXISTS ""OwnerName"" character varying(120);
                ALTER TABLE crm.opportunities ADD COLUMN IF NOT EXISTS ""Priority"" character varying(20);
                ALTER TABLE crm.opportunities ADD COLUMN IF NOT EXISTS ""Probability"" integer NOT NULL DEFAULT 10;
                ALTER TABLE crm.opportunities ADD COLUMN IF NOT EXISTS ""RottingDays"" integer;
                ALTER TABLE crm.opportunities ADD COLUMN IF NOT EXISTS ""ExpectedCloseDate"" timestamp with time zone;
                ALTER TABLE crm.opportunities ADD COLUMN IF NOT EXISTS ""CustomFields"" jsonb NOT NULL DEFAULT '{}'::jsonb;
                ALTER TABLE crm.opportunities ADD COLUMN IF NOT EXISTS tags text[];

                ALTER TABLE crm.activities ADD COLUMN IF NOT EXISTS ""DueDate"" timestamp with time zone;
                ALTER TABLE crm.activities ADD COLUMN IF NOT EXISTS ""IsDone"" boolean NOT NULL DEFAULT false;
                ALTER TABLE crm.activities ADD COLUMN IF NOT EXISTS ""CompletedAtUtc"" timestamp with time zone;

                UPDATE crm.opportunities SET ""Priority"" = 'Normal' WHERE ""Priority"" IS NULL OR btrim(""Priority"") = '';
                UPDATE crm.opportunities SET ""CustomFields"" = '{}'::jsonb WHERE ""CustomFields"" IS NULL;
                UPDATE crm.opportunities SET tags = '{}'::text[] WHERE tags IS NULL;
                UPDATE crm.activities SET ""IsDone"" = false WHERE ""IsDone"" IS NULL;
            ", cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error en EnsureCrmTablesAsync");
        }
    }
}
