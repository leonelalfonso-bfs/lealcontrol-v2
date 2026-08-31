using System;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Tenancy;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Api.SuperAdmin;

public sealed class MasterDbContext : DbContext
{
    public MasterDbContext(DbContextOptions<MasterDbContext> options) : base(options)
    {
    }

    public DbSet<MasterTenant> Tenants => Set<MasterTenant>();
    public DbSet<SuperAdminUser> SuperAdmins => Set<SuperAdminUser>();
    public DbSet<SubscriptionPlan> Plans => Set<SubscriptionPlan>();
    public DbSet<TenantPaymentRecord> Payments => Set<TenantPaymentRecord>();
    public DbSet<MasterDemoRequest> DemoRequests => Set<MasterDemoRequest>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<MasterDemoRequest>(b =>
        {
            b.ToTable("master_demo_requests", "public");
            b.HasKey(x => x.Id);
            b.Property(x => x.CompanyName).HasMaxLength(160).IsRequired();
            b.Property(x => x.Cuit).HasMaxLength(40).IsRequired();
            b.Property(x => x.ContactFullName).HasMaxLength(120).IsRequired();
            b.Property(x => x.Email).HasMaxLength(160).IsRequired();
            b.Property(x => x.Phone).HasMaxLength(60).IsRequired();
            b.Property(x => x.EstimatedUsers).HasMaxLength(40).HasDefaultValue("1-5");
            b.Property(x => x.Status).HasMaxLength(32).HasDefaultValue("Pending");
        });

        modelBuilder.Entity<MasterTenant>(b =>
        {
            b.ToTable("master_tenants", "public");
            b.HasKey(x => x.Id);
            b.HasIndex(x => x.Slug).IsUnique();
            b.Property(x => x.Name).HasMaxLength(160).IsRequired();
            b.Property(x => x.Slug).HasMaxLength(64).IsRequired();
            b.Property(x => x.DbName).HasMaxLength(64).IsRequired();
            b.Property(x => x.PlanCode).HasMaxLength(32).HasDefaultValue("pyme");
            b.Property(x => x.Status).HasMaxLength(32).HasDefaultValue("Active");
            b.Property(x => x.MonthlyPriceArs).HasPrecision(18, 2);
            b.Property(x => x.MonthlyPriceUsd).HasPrecision(18, 2);
            b.Property(x => x.AdminEmail).HasMaxLength(160);
            b.Property(x => x.AdminFullName).HasMaxLength(160);
            b.Property(x => x.AdminPhone).HasMaxLength(64);
            b.Property(x => x.StorageMb).HasPrecision(18, 2).HasDefaultValue(0);
        });

        modelBuilder.Entity<SuperAdminUser>(b =>
        {
            b.ToTable("superadmin_users", "public");
            b.HasKey(x => x.Id);
            b.HasIndex(x => x.Email).IsUnique();
            b.Property(x => x.FullName).HasMaxLength(120).IsRequired();
            b.Property(x => x.Email).HasMaxLength(160).IsRequired();
            b.Property(x => x.PasswordHash).HasMaxLength(256).IsRequired();
            b.Property(x => x.Role).HasMaxLength(32).HasDefaultValue("SuperAdmin");
        });

        modelBuilder.Entity<SubscriptionPlan>(b =>
        {
            b.ToTable("subscription_plans", "public");
            b.HasKey(x => x.Id);
            b.HasIndex(x => x.Code).IsUnique();
            b.Property(x => x.Code).HasMaxLength(32).IsRequired();
            b.Property(x => x.Name).HasMaxLength(120).IsRequired();
            b.Property(x => x.PriceArs).HasPrecision(18, 2);
            b.Property(x => x.PriceUsd).HasPrecision(18, 2);
        });

        modelBuilder.Entity<TenantPaymentRecord>(b =>
        {
            b.ToTable("tenant_payments", "public");
            b.HasKey(x => x.Id);
            b.Property(x => x.ExternalPaymentId).HasMaxLength(128);
            b.Property(x => x.Status).HasMaxLength(32).HasDefaultValue("Pending");
            b.Property(x => x.Amount).HasPrecision(18, 2);
            b.Property(x => x.Currency).HasMaxLength(10).HasDefaultValue("ARS");
            b.Property(x => x.PaymentMethod).HasMaxLength(64).HasDefaultValue("MercadoPago");
            b.Property(x => x.PayerEmail).HasMaxLength(160);
        });
    }

    public async Task EnsureMasterTablesCreatedAsync(CancellationToken cancellationToken = default)
    {
        var sql = @"
            CREATE TABLE IF NOT EXISTS public.master_tenants (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""Name"" character varying(160) NOT NULL,
                ""Slug"" character varying(64) NOT NULL,
                ""DbName"" character varying(64) NOT NULL,
                ""PlanCode"" character varying(32) NOT NULL DEFAULT 'pyme',
                ""Status"" character varying(32) NOT NULL DEFAULT 'Active',
                ""MonthlyPriceArs"" numeric(18,2) NOT NULL DEFAULT 0,
                ""MonthlyPriceUsd"" numeric(18,2) NOT NULL DEFAULT 0,
                ""AdminEmail"" character varying(160) NOT NULL,
                ""AdminFullName"" character varying(160) NOT NULL,
                ""AdminPhone"" character varying(64),
                ""CreatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now(),
                ""ExpiresAtUtc"" timestamp with time zone,
                ""StorageMb"" numeric(18,2) NOT NULL DEFAULT 0,
                ""UserCount"" integer NOT NULL DEFAULT 1,
                ""IsActive"" boolean NOT NULL DEFAULT true,
                ""Notes"" text,
                ""EnabledModulesJson"" text DEFAULT '[""sales"", ""crm"", ""purchases"", ""inventory"", ""finance"", ""fleet"", ""hr"", ""grains""]'
            );
            CREATE UNIQUE INDEX IF NOT EXISTS ""IX_master_tenants_Slug"" ON public.master_tenants (""Slug"");

            ALTER TABLE public.master_tenants ADD COLUMN IF NOT EXISTS ""EnabledModulesJson"" text DEFAULT '[""sales"", ""crm"", ""purchases"", ""inventory"", ""finance"", ""fleet"", ""hr"", ""grains""]';

            CREATE TABLE IF NOT EXISTS public.superadmin_users (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""FullName"" character varying(120) NOT NULL,
                ""Email"" character varying(160) NOT NULL,
                ""PasswordHash"" character varying(256) NOT NULL,
                ""Role"" character varying(32) NOT NULL DEFAULT 'SuperAdmin',
                ""IsActive"" boolean NOT NULL DEFAULT true,
                ""CreatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now(),
                ""LastLoginUtc"" timestamp with time zone
            );
            CREATE UNIQUE INDEX IF NOT EXISTS ""IX_superadmin_users_Email"" ON public.superadmin_users (""Email"");

            CREATE TABLE IF NOT EXISTS public.subscription_plans (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""Code"" character varying(32) NOT NULL,
                ""Name"" character varying(120) NOT NULL,
                ""PriceArs"" numeric(18,2) NOT NULL DEFAULT 0,
                ""PriceUsd"" numeric(18,2) NOT NULL DEFAULT 0,
                ""MaxUsers"" integer NOT NULL DEFAULT 10,
                ""Description"" text,
                ""FeaturesJson"" text,
                ""EnabledModulesJson"" text DEFAULT '[""sales"", ""crm"", ""purchases"", ""inventory"", ""finance"", ""fleet"", ""hr"", ""grains""]',
                ""IsActive"" boolean NOT NULL DEFAULT true
            );
            CREATE UNIQUE INDEX IF NOT EXISTS ""IX_subscription_plans_Code"" ON public.subscription_plans (""Code"");

            ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS ""EnabledModulesJson"" text DEFAULT '[""sales"", ""crm"", ""purchases"", ""inventory"", ""finance"", ""fleet"", ""hr"", ""grains""]';

            CREATE TABLE IF NOT EXISTS public.tenant_payments (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""ExternalPaymentId"" character varying(128),
                ""Status"" character varying(32) NOT NULL DEFAULT 'Pending',
                ""Amount"" numeric(18,2) NOT NULL DEFAULT 0,
                ""Currency"" character varying(10) NOT NULL DEFAULT 'ARS',
                ""PaymentMethod"" character varying(64) NOT NULL DEFAULT 'MercadoPago',
                ""PayerEmail"" character varying(160),
                ""CreatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now(),
                ""ApprovedAtUtc"" timestamp with time zone,
                ""RawPayloadJson"" text
            );

            CREATE TABLE IF NOT EXISTS public.master_demo_requests (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""CompanyName"" character varying(160) NOT NULL,
                ""Cuit"" character varying(40) NOT NULL,
                ""ContactFullName"" character varying(120) NOT NULL,
                ""Email"" character varying(160) NOT NULL,
                ""Phone"" character varying(60) NOT NULL,
                ""EstimatedUsers"" character varying(40) NOT NULL DEFAULT '1-5',
                ""InterestedModulesJson"" text DEFAULT '[]',
                ""Message"" text,
                ""Status"" character varying(32) NOT NULL DEFAULT 'Pending',
                ""CreatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now()
            );
        ";

        await Database.ExecuteSqlRawAsync(sql, cancellationToken);

        // Seed Default SuperAdmin if not exists
        var hasAdmin = await SuperAdmins.AnyAsync(cancellationToken);
        if (!hasAdmin)
        {
            var defaultHash = HashPassword("admin123");
            SuperAdmins.Add(new SuperAdminUser
            {
                Id = Guid.NewGuid(),
                FullName = "Administrador Master LEAL",
                Email = "admin@lealcontrol.com",
                PasswordHash = defaultHash,
                Role = "SuperAdmin",
                IsActive = true,
                CreatedAtUtc = DateTime.UtcNow
            });
        }

        // Seed Default Plans
        if (!await Plans.AnyAsync(cancellationToken))
        {
            Plans.AddRange(
                new SubscriptionPlan
                {
                    Code = "starter",
                    Name = "Starter Pyme",
                    PriceArs = 45000,
                    PriceUsd = 45,
                    MaxUsers = 3,
                    Description = "Ideal para profesionales y microempresas",
                    FeaturesJson = @"[""Facturación ARCA"", ""Presupuestos"", ""Clientes y Proveedores"", ""Gestión de Cobranzas""]",
                    EnabledModulesJson = @"[""sales"", ""crm""]"
                },
                new SubscriptionPlan
                {
                    Code = "pyme",
                    Name = "Pyme Profesional",
                    PriceArs = 95000,
                    PriceUsd = 95,
                    MaxUsers = 10,
                    Description = "Gestión integral para pymes comerciales y de servicios",
                    FeaturesJson = @"[""Todo lo de Starter"", ""CRM Kanban & Oportunidades"", ""Gestión de Flota y Vehículos"", ""Finanzas & Conciliación Echeqs"", ""RRHH & Sueldos CCT""]",
                    EnabledModulesJson = @"[""sales"", ""crm"", ""purchases"", ""inventory"", ""finance"", ""fleet"", ""hr""]"
                },
                new SubscriptionPlan
                {
                    Code = "agro",
                    Name = "LEAL Agro Granario",
                    PriceArs = 165000,
                    PriceUsd = 165,
                    MaxUsers = 25,
                    Description = "Especial para acopios, cooperativas y corredores de cereal",
                    FeaturesJson = @"[""Todo lo de Pyme"", ""Módulo de Cereales & Contratos"", ""Balanza & Camiones CPE / CTG"", ""Fijaciones de Precio Rosario/BB"", ""Liquidación Primaria Granos""]",
                    EnabledModulesJson = @"[""sales"", ""crm"", ""purchases"", ""inventory"", ""finance"", ""fleet"", ""hr"", ""grains""]"
                },
                new SubscriptionPlan
                {
                    Code = "enterprise",
                    Name = "Enterprise Corporativo",
                    PriceArs = 280000,
                    PriceUsd = 280,
                    MaxUsers = 100,
                    Description = "Capacidad ilimitada, base dedicada y soporte prioritario 24/7",
                    FeaturesJson = @"[""Todo lo de Agro"", ""Usuarios Ilimitados"", ""Base de Datos Físicamente Aislada"", ""Backups Horarios"", ""Auditoría Forense"", ""SLA 99.9%""]",
                    EnabledModulesJson = @"[""sales"", ""crm"", ""purchases"", ""inventory"", ""finance"", ""fleet"", ""hr"", ""grains"", ""accounting""]"
                }
            );
        }

        // Seed Primary Default Tenant
        var defaultTenantId = Guid.Parse("11111111-1111-1111-1111-111111111111");
        var hasDefaultTenant = await Tenants.AnyAsync(t => t.Id == defaultTenantId, cancellationToken);
        if (!hasDefaultTenant)
        {
            Tenants.Add(new MasterTenant
            {
                Id = defaultTenantId,
                Name = "Empresa Demostración",
                Slug = "demo",
                DbName = "lealcontrol",
                PlanCode = "agro",
                Status = "Active",
                MonthlyPriceArs = 95000,
                MonthlyPriceUsd = 95,
                AdminEmail = "admin@lealcontrol.com",
                AdminFullName = "Admin Demostración",
                AdminPhone = "341-555-0100",
                CreatedAtUtc = DateTime.UtcNow,
                IsActive = true,
                EnabledModulesJson = @"[""sales"", ""crm"", ""purchases"", ""inventory"", ""finance"", ""fleet"", ""hr"", ""grains""]"
            });
        }

        await SaveChangesAsync(cancellationToken);
    }

    public static string HashPassword(string password)
    {
        byte[] salt = RandomNumberGenerator.GetBytes(16);
        byte[] hash = Rfc2898DeriveBytes.Pbkdf2(
            password,
            salt,
            iterations: 100_000,
            hashAlgorithm: HashAlgorithmName.SHA256,
            outputLength: 32);

        return $"{Convert.ToBase64String(salt)}.{Convert.ToBase64String(hash)}";
    }

    public static bool VerifyPassword(string password, string storedHash)
    {
        if (string.IsNullOrWhiteSpace(storedHash))
            return false;

        // Modern PBKDF2 format (salt.hash)
        if (storedHash.Contains('.'))
        {
            var parts = storedHash.Split('.');
            if (parts.Length != 2) return false;

            try
            {
                byte[] salt = Convert.FromBase64String(parts[0]);
                byte[] expectedHash = Convert.FromBase64String(parts[1]);

                byte[] actualHash = Rfc2898DeriveBytes.Pbkdf2(
                    password,
                    salt,
                    iterations: 100_000,
                    hashAlgorithm: HashAlgorithmName.SHA256,
                    outputLength: 32);

                return CryptographicOperations.FixedTimeEquals(actualHash, expectedHash);
            }
            catch
            {
                return false;
            }
        }

        // Legacy SHA-256 fallback (backward-compatible for existing installations)
        try
        {
            using var sha256 = SHA256.Create();
            var bytes = Encoding.UTF8.GetBytes(password + "LealControlSalt2026");
            var legacyHash = Convert.ToBase64String(sha256.ComputeHash(bytes));
            return CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(legacyHash),
                Encoding.UTF8.GetBytes(storedHash));
        }
        catch
        {
            return false;
        }
    }
}
