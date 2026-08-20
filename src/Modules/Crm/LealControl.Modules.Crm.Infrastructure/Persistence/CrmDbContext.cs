using LealControl.BuildingBlocks.Persistence;
using LealControl.Modules.Crm.Domain.Activities;
using LealControl.Modules.Crm.Domain.Customers;
using LealControl.Modules.Crm.Domain.Leads;
using LealControl.Modules.Crm.Domain.Opportunities;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Crm.Infrastructure.Persistence;

public sealed class CrmDbContext : DbContext, IUnitOfWork
{
    public const string Schema = "crm";

    public CrmDbContext(DbContextOptions<CrmDbContext> options)
        : base(options)
    {
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
                ALTER TABLE public.tenant_settings ADD COLUMN IF NOT EXISTS ""ActivityStartDate"" character varying(32);
                ALTER TABLE public.tenant_users ADD COLUMN IF NOT EXISTS ""PasswordHash"" character varying(256);
                ALTER TABLE public.tenant_users ADD COLUMN IF NOT EXISTS ""LastLoginUtc"" timestamp with time zone;
                ALTER TABLE crm.customers ADD COLUMN IF NOT EXISTS ""CreditRating"" character varying(10);
                ALTER TABLE crm.customers ADD COLUMN IF NOT EXISTS ""BcraWorstSituation"" integer;
                ALTER TABLE crm.customers ADD COLUMN IF NOT EXISTS ""BcraTotalDebt"" numeric(18,2);
                ALTER TABLE crm.customers ADD COLUMN IF NOT EXISTS ""BcraRejectedChequesCount"" integer;
                ALTER TABLE crm.customers ADD COLUMN IF NOT EXISTS ""BcraLastCheckedAtUtc"" timestamp with time zone;
                ALTER TABLE crm.customers ADD COLUMN IF NOT EXISTS ""CreditRecommendation"" character varying(2000);
            ");
        }
        catch
        {
            // Ignore if handled by migrations
        }
    }
}
