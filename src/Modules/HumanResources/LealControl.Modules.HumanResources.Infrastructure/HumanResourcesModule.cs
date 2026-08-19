using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace LealControl.Modules.HumanResources.Infrastructure;

public enum EmployeeStatus { Active, Leave, Terminated }
public enum ContractType { Indefinite, FixedTerm, Eventual, TrialPeriod, Internship }
public enum ConceptType { Remunerative, NonRemunerative, Deduction, CompanyContribution }
public enum PeriodType { Monthly, FirstFortnight, SecondFortnight, SacFirstHalf, SacSecondHalf, FinalSettlement }
public enum PayrollPeriodStatus { Draft, Calculating, Closed, Exported }

public sealed class Employee
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public string FileNumber { get; set; } = ""; // Legajo N°
    public string FirstName { get; set; } = "";
    public string LastName { get; set; } = "";
    public string DocumentNumber { get; set; } = ""; // DNI
    public string Cuil { get; set; } = "";
    public DateTime? BirthDate { get; set; }
    public string Gender { get; set; } = "M";
    public string Nationality { get; set; } = "Argentina";
    public string CivilStatus { get; set; } = "Soltero";
    
    public string Address { get; set; } = "";
    public string City { get; set; } = "San Lorenzo";
    public string Province { get; set; } = "SantaFe";
    public string PostalCode { get; set; } = "2200";
    public string Phone { get; set; } = "";
    public string Email { get; set; } = "";
    public string? EmergencyContactName { get; set; }
    public string? EmergencyContactPhone { get; set; }

    public DateTime HireDate { get; set; }
    public DateTime? SeniorityRecognitionDate { get; set; }
    public DateTime? TerminationDate { get; set; }
    public ContractType ContractType { get; set; } = ContractType.Indefinite;
    public string JobTitle { get; set; } = "";
    public string Department { get; set; } = "Técnica";
    public string CostCenter { get; set; } = "Operaciones";
    public string WorkplaceLocation { get; set; } = "Planta Principal";
    
    public string UnionCct { get; set; } = "Comercio 130/75"; // Convenio Colectivo
    public string UnionCategory { get; set; } = "Administrativo A";
    public string HealthInsurance { get; set; } = "OSECAC"; // Obra Social
    public decimal BaseSalary { get; set; } // Sueldo básico mensual
    public decimal HourlyRate { get; set; } // Valor hora

    public string BankName { get; set; } = "Banco Nación";
    public string Cbu { get; set; } = "";
    public string BankAlias { get; set; } = "";
    public EmployeeStatus Status { get; set; } = EmployeeStatus.Active;
    public string? PhotoPath { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}

public sealed class PayrollConcept
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public string Code { get; set; } = ""; // Ej: 100, 110, 300, 301
    public string Name { get; set; } = ""; // Ej: Sueldo Básico, Antigüedad
    public ConceptType Type { get; set; }
    public string? CalculationFormula { get; set; } // Formula o variable
    public decimal DefaultPercentage { get; set; } // Ej: 11% para Jubilación
    public bool IsSystemDefault { get; set; }
    public bool PrintOnReceipt { get; set; } = true;
    public string? LsdCodeAfip { get; set; } // Código oficial Libro Sueldos Digital
}

public sealed class PayrollPeriod
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public int PeriodMonth { get; set; }
    public int PeriodYear { get; set; }
    public PeriodType PeriodType { get; set; } = PeriodType.Monthly;
    public DateTime PaymentDateUtc { get; set; }
    public DateTime? BankDepositDateUtc { get; set; }
    public PayrollPeriodStatus Status { get; set; } = PayrollPeriodStatus.Draft;
    public string Notes { get; set; } = "";
    public DateTime CreatedAtUtc { get; set; }
}

public sealed class PayrollSlip
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid PayrollPeriodId { get; set; }
    public Guid EmployeeId { get; set; }
    public string ReceiptNumber { get; set; } = "";
    
    public decimal TotalGrossRemunerative { get; set; }
    public decimal TotalNonRemunerative { get; set; }
    public decimal TotalDeductions { get; set; }
    public decimal NetPay { get; set; }
    public string NetPayWords { get; set; } = "";
    
    public DateTime? SignedByCompanyUtc { get; set; }
    public DateTime? SignedByEmployeeUtc { get; set; }
    public string? SignatureHashSha256 { get; set; }
    public string Status { get; set; } = "Issued"; // Issued, Signed, Paid
    public DateTime CreatedAtUtc { get; set; }

    public List<PayrollSlipLine> Lines { get; set; } = [];
}

public sealed class PayrollSlipLine
{
    public Guid Id { get; set; }
    public Guid PayrollSlipId { get; set; }
    public string ConceptCode { get; set; } = "";
    public string ConceptName { get; set; } = "";
    public ConceptType Type { get; set; }
    public decimal Quantity { get; set; }
    public string Unit { get; set; } = "Días";
    public decimal BaseAmount { get; set; }
    public decimal Percentage { get; set; }
    public decimal RemunerativeAmount { get; set; }
    public decimal NonRemunerativeAmount { get; set; }
    public decimal DeductionAmount { get; set; }
}

public sealed class EmployeeTimeTracking
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid EmployeeId { get; set; }
    public DateTime Date { get; set; }
    public DateTime? ClockInUtc { get; set; }
    public DateTime? ClockOutUtc { get; set; }
    public decimal RegularHours { get; set; } = 8;
    public decimal Overtime50Hours { get; set; }
    public decimal Overtime100Hours { get; set; }
    public decimal NightHours { get; set; }
    public string? AbsenceReason { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}

public sealed class EppDelivery
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid EmployeeId { get; set; }
    public DateTime DeliveryDateUtc { get; set; }
    public string ItemName { get; set; } = "";
    public string? BrandModel { get; set; }
    public string? CertificateNumber { get; set; } // N° Certificado IRAM / Sello
    public int Quantity { get; set; } = 1;
    public string? SignedReceiptProofUrl { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}

public sealed class HumanResourcesDbContext(DbContextOptions<HumanResourcesDbContext> options) : DbContext(options)
{
    public const string Schema = "hr";
    public DbSet<Employee> Employees => Set<Employee>();
    public DbSet<PayrollConcept> PayrollConcepts => Set<PayrollConcept>();
    public DbSet<PayrollPeriod> PayrollPeriods => Set<PayrollPeriod>();
    public DbSet<PayrollSlip> PayrollSlips => Set<PayrollSlip>();
    public DbSet<PayrollSlipLine> PayrollSlipLines => Set<PayrollSlipLine>();
    public DbSet<EmployeeTimeTracking> TimeTrackings => Set<EmployeeTimeTracking>();
    public DbSet<EppDelivery> EppDeliveries => Set<EppDelivery>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Schema);

        modelBuilder.Entity<Employee>(b =>
        {
            b.ToTable("Employees");
            b.HasKey(x => x.Id);
            b.Property(x => x.FileNumber).HasMaxLength(40).IsRequired();
            b.Property(x => x.FirstName).HasMaxLength(120).IsRequired();
            b.Property(x => x.LastName).HasMaxLength(120).IsRequired();
            b.Property(x => x.DocumentNumber).HasMaxLength(30).IsRequired();
            b.Property(x => x.Cuil).HasMaxLength(30).IsRequired();
            b.Property(x => x.BaseSalary).HasPrecision(18, 2);
            b.Property(x => x.HourlyRate).HasPrecision(18, 2);
            b.Property(x => x.PhotoPath).HasColumnType("text");
            b.HasIndex(x => new { x.TenantId, x.FileNumber }).IsUnique();
            b.HasIndex(x => new { x.TenantId, x.Cuil });
        });

        modelBuilder.Entity<PayrollConcept>(b =>
        {
            b.ToTable("PayrollConcepts");
            b.HasKey(x => x.Id);
            b.Property(x => x.Code).HasMaxLength(30).IsRequired();
            b.Property(x => x.Name).HasMaxLength(160).IsRequired();
            b.Property(x => x.DefaultPercentage).HasPrecision(8, 4);
            b.HasIndex(x => new { x.TenantId, x.Code });
        });

        modelBuilder.Entity<PayrollPeriod>(b =>
        {
            b.ToTable("PayrollPeriods");
            b.HasKey(x => x.Id);
            b.HasIndex(x => new { x.TenantId, x.PeriodYear, x.PeriodMonth, x.PeriodType });
        });

        modelBuilder.Entity<PayrollSlip>(b =>
        {
            b.ToTable("PayrollSlips");
            b.HasKey(x => x.Id);
            b.Property(x => x.ReceiptNumber).HasMaxLength(40).IsRequired();
            b.Property(x => x.TotalGrossRemunerative).HasPrecision(18, 2);
            b.Property(x => x.TotalNonRemunerative).HasPrecision(18, 2);
            b.Property(x => x.TotalDeductions).HasPrecision(18, 2);
            b.Property(x => x.NetPay).HasPrecision(18, 2);
            b.HasMany(x => x.Lines).WithOne().HasForeignKey(x => x.PayrollSlipId).OnDelete(DeleteBehavior.Cascade);
            b.HasIndex(x => new { x.TenantId, x.PayrollPeriodId, x.EmployeeId });
        });

        modelBuilder.Entity<PayrollSlipLine>(b =>
        {
            b.ToTable("PayrollSlipLines");
            b.HasKey(x => x.Id);
            b.Property(x => x.ConceptCode).HasMaxLength(30).IsRequired();
            b.Property(x => x.ConceptName).HasMaxLength(160).IsRequired();
            b.Property(x => x.Quantity).HasPrecision(10, 2);
            b.Property(x => x.BaseAmount).HasPrecision(18, 2);
            b.Property(x => x.Percentage).HasPrecision(8, 4);
            b.Property(x => x.RemunerativeAmount).HasPrecision(18, 2);
            b.Property(x => x.NonRemunerativeAmount).HasPrecision(18, 2);
            b.Property(x => x.DeductionAmount).HasPrecision(18, 2);
        });

        modelBuilder.Entity<EmployeeTimeTracking>(b =>
        {
            b.ToTable("TimeTrackings");
            b.HasKey(x => x.Id);
            b.Property(x => x.RegularHours).HasPrecision(6, 2);
            b.Property(x => x.Overtime50Hours).HasPrecision(6, 2);
            b.Property(x => x.Overtime100Hours).HasPrecision(6, 2);
            b.Property(x => x.NightHours).HasPrecision(6, 2);
            b.HasIndex(x => new { x.TenantId, x.EmployeeId, x.Date });
        });

        modelBuilder.Entity<EppDelivery>(b =>
        {
            b.ToTable("EppDeliveries");
            b.HasKey(x => x.Id);
            b.Property(x => x.ItemName).HasMaxLength(200).IsRequired();
            b.HasIndex(x => new { x.TenantId, x.EmployeeId });
        });
    }

    public async Task EnsureHrTablesAsync(CancellationToken ct = default)
    {
        var sql = @"
            CREATE SCHEMA IF NOT EXISTS hr;

            CREATE TABLE IF NOT EXISTS hr.""Employees"" (
                ""Id"" uuid PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""FileNumber"" character varying(40) NOT NULL,
                ""FirstName"" character varying(120) NOT NULL,
                ""LastName"" character varying(120) NOT NULL,
                ""DocumentNumber"" character varying(30) NOT NULL,
                ""Cuil"" character varying(30) NOT NULL,
                ""BirthDate"" timestamp with time zone,
                ""Gender"" character varying(10) NOT NULL DEFAULT 'M',
                ""Nationality"" character varying(60) NOT NULL DEFAULT 'Argentina',
                ""CivilStatus"" character varying(40) NOT NULL DEFAULT 'Soltero',
                ""Address"" character varying(250) NOT NULL DEFAULT '',
                ""City"" character varying(120) NOT NULL DEFAULT 'San Lorenzo',
                ""Province"" character varying(60) NOT NULL DEFAULT 'SantaFe',
                ""PostalCode"" character varying(20) NOT NULL DEFAULT '2200',
                ""Phone"" character varying(60) NOT NULL DEFAULT '',
                ""Email"" character varying(160) NOT NULL DEFAULT '',
                ""EmergencyContactName"" character varying(160),
                ""EmergencyContactPhone"" character varying(60),
                ""HireDate"" timestamp with time zone NOT NULL,
                ""SeniorityRecognitionDate"" timestamp with time zone,
                ""TerminationDate"" timestamp with time zone,
                ""ContractType"" integer NOT NULL DEFAULT 0,
                ""JobTitle"" character varying(120) NOT NULL DEFAULT '',
                ""Department"" character varying(120) NOT NULL DEFAULT 'Operaciones',
                ""CostCenter"" character varying(120) NOT NULL DEFAULT 'Técnica',
                ""WorkplaceLocation"" character varying(120) NOT NULL DEFAULT 'Planta Central',
                ""UnionCct"" character varying(120) NOT NULL DEFAULT 'Comercio 130/75',
                ""UnionCategory"" character varying(120) NOT NULL DEFAULT 'Administrativo A',
                ""HealthInsurance"" character varying(120) NOT NULL DEFAULT 'OSECAC',
                ""BaseSalary"" numeric(18,2) NOT NULL DEFAULT 0,
                ""HourlyRate"" numeric(18,2) NOT NULL DEFAULT 0,
                ""BankName"" character varying(120) NOT NULL DEFAULT 'Banco Nación',
                ""Cbu"" character varying(40) NOT NULL DEFAULT '',
                ""BankAlias"" character varying(40) NOT NULL DEFAULT '',
                ""Status"" integer NOT NULL DEFAULT 0,
                ""PhotoPath"" text,
                ""Notes"" text,
                ""CreatedAtUtc"" timestamp with time zone NOT NULL
            );

            CREATE TABLE IF NOT EXISTS hr.""PayrollConcepts"" (
                ""Id"" uuid PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""Code"" character varying(30) NOT NULL,
                ""Name"" character varying(160) NOT NULL,
                ""Type"" integer NOT NULL,
                ""CalculationFormula"" character varying(250),
                ""DefaultPercentage"" numeric(8,4) NOT NULL DEFAULT 0,
                ""IsSystemDefault"" boolean NOT NULL DEFAULT false,
                ""PrintOnReceipt"" boolean NOT NULL DEFAULT true,
                ""LsdCodeAfip"" character varying(30)
            );

            CREATE TABLE IF NOT EXISTS hr.""PayrollPeriods"" (
                ""Id"" uuid PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""PeriodMonth"" integer NOT NULL,
                ""PeriodYear"" integer NOT NULL,
                ""PeriodType"" integer NOT NULL DEFAULT 0,
                ""PaymentDateUtc"" timestamp with time zone NOT NULL,
                ""BankDepositDateUtc"" timestamp with time zone,
                ""Status"" integer NOT NULL DEFAULT 0,
                ""Notes"" character varying(500) NOT NULL DEFAULT '',
                ""CreatedAtUtc"" timestamp with time zone NOT NULL
            );

            CREATE TABLE IF NOT EXISTS hr.""PayrollSlips"" (
                ""Id"" uuid PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""PayrollPeriodId"" uuid NOT NULL REFERENCES hr.""PayrollPeriods""(""Id"") ON DELETE CASCADE,
                ""EmployeeId"" uuid NOT NULL REFERENCES hr.""Employees""(""Id"") ON DELETE CASCADE,
                ""ReceiptNumber"" character varying(40) NOT NULL,
                ""TotalGrossRemunerative"" numeric(18,2) NOT NULL DEFAULT 0,
                ""TotalNonRemunerative"" numeric(18,2) NOT NULL DEFAULT 0,
                ""TotalDeductions"" numeric(18,2) NOT NULL DEFAULT 0,
                ""NetPay"" numeric(18,2) NOT NULL DEFAULT 0,
                ""NetPayWords"" character varying(250) NOT NULL DEFAULT '',
                ""SignedByCompanyUtc"" timestamp with time zone,
                ""SignedByEmployeeUtc"" timestamp with time zone,
                ""SignatureHashSha256"" character varying(128),
                ""Status"" character varying(30) NOT NULL DEFAULT 'Issued',
                ""CreatedAtUtc"" timestamp with time zone NOT NULL
            );

            CREATE TABLE IF NOT EXISTS hr.""PayrollSlipLines"" (
                ""Id"" uuid PRIMARY KEY,
                ""PayrollSlipId"" uuid NOT NULL REFERENCES hr.""PayrollSlips""(""Id"") ON DELETE CASCADE,
                ""ConceptCode"" character varying(30) NOT NULL,
                ""ConceptName"" character varying(160) NOT NULL,
                ""Type"" integer NOT NULL,
                ""Quantity"" numeric(10,2) NOT NULL DEFAULT 1,
                ""Unit"" character varying(20) NOT NULL DEFAULT 'Días',
                ""BaseAmount"" numeric(18,2) NOT NULL DEFAULT 0,
                ""Percentage"" numeric(8,4) NOT NULL DEFAULT 0,
                ""RemunerativeAmount"" numeric(18,2) NOT NULL DEFAULT 0,
                ""NonRemunerativeAmount"" numeric(18,2) NOT NULL DEFAULT 0,
                ""DeductionAmount"" numeric(18,2) NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS hr.""TimeTrackings"" (
                ""Id"" uuid PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""EmployeeId"" uuid NOT NULL REFERENCES hr.""Employees""(""Id"") ON DELETE CASCADE,
                ""Date"" timestamp with time zone NOT NULL,
                ""ClockInUtc"" timestamp with time zone,
                ""ClockOutUtc"" timestamp with time zone,
                ""RegularHours"" numeric(6,2) NOT NULL DEFAULT 8,
                ""Overtime50Hours"" numeric(6,2) NOT NULL DEFAULT 0,
                ""Overtime100Hours"" numeric(6,2) NOT NULL DEFAULT 0,
                ""NightHours"" numeric(6,2) NOT NULL DEFAULT 0,
                ""AbsenceReason"" character varying(120),
                ""Notes"" character varying(250),
                ""CreatedAtUtc"" timestamp with time zone NOT NULL
            );

            CREATE TABLE IF NOT EXISTS hr.""EppDeliveries"" (
                ""Id"" uuid PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""EmployeeId"" uuid NOT NULL REFERENCES hr.""Employees""(""Id"") ON DELETE CASCADE,
                ""DeliveryDateUtc"" timestamp with time zone NOT NULL,
                ""ItemName"" character varying(200) NOT NULL,
                ""BrandModel"" character varying(120),
                ""CertificateNumber"" character varying(60),
                ""Quantity"" integer NOT NULL DEFAULT 1,
                ""SignedReceiptProofUrl"" text,
                ""Notes"" character varying(250),
                ""CreatedAtUtc"" timestamp with time zone NOT NULL
            );
        ";

        await Database.ExecuteSqlRawAsync(sql, ct);
    }
}

public static class HumanResourcesModule
{
    public static IServiceCollection AddHumanResourcesModule(this IServiceCollection services, IConfiguration configuration)
    {
        var connection = configuration.GetConnectionString("Database")
            ?? throw new InvalidOperationException("Falta ConnectionStrings:Database.");

        services.AddDbContext<HumanResourcesDbContext>(o =>
            o.UseNpgsql(connection, n => n.MigrationsHistoryTable("__ef_migrations_history", HumanResourcesDbContext.Schema)));

        return services;
    }

    public static IEndpointRouteBuilder MapHumanResourcesModule(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/hr").WithTags("HumanResources");

        // -------------------------------------------------------------
        // EMPLOYEES CRUD
        // -------------------------------------------------------------
        group.MapGet("/employees", async (string? search, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var id = tenant.TenantId.Value;
            var q = db.Employees.AsNoTracking().Where(x => x.TenantId == id);

            if (!string.IsNullOrWhiteSpace(search))
            {
                var s = search.Trim().ToLower();
                q = q.Where(x => x.FirstName.ToLower().Contains(s) || x.LastName.ToLower().Contains(s) || x.FileNumber.ToLower().Contains(s) || x.Cuil.Contains(s));
            }

            var items = await q.OrderBy(x => x.LastName).ThenBy(x => x.FirstName).ToListAsync(ct);
            return Results.Ok(items);
        });

        group.MapGet("/employees/{id:guid}", async (Guid id, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var emp = await db.Employees.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            return emp is not null ? Results.Ok(emp) : Results.NotFound("Empleado no encontrado");
        });

        group.MapPost("/employees", async (Employee body, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            body.Id = Guid.NewGuid();
            body.TenantId = tenantId;
            body.CreatedAtUtc = DateTime.UtcNow;

            db.Employees.Add(body);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/hr/employees/{body.Id}", body);
        });

        group.MapPut("/employees/{id:guid}", async (Guid id, Employee body, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var emp = await db.Employees.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            if (emp is null) return Results.NotFound("Empleado no encontrado");

            emp.FileNumber = body.FileNumber.Trim();
            emp.FirstName = body.FirstName.Trim();
            emp.LastName = body.LastName.Trim();
            emp.DocumentNumber = body.DocumentNumber.Trim();
            emp.Cuil = body.Cuil.Trim();
            emp.BirthDate = body.BirthDate;
            emp.Gender = body.Gender;
            emp.Nationality = body.Nationality;
            emp.CivilStatus = body.CivilStatus;
            emp.Address = body.Address;
            emp.City = body.City;
            emp.Province = body.Province;
            emp.PostalCode = body.PostalCode;
            emp.Phone = body.Phone;
            emp.Email = body.Email;
            emp.EmergencyContactName = body.EmergencyContactName;
            emp.EmergencyContactPhone = body.EmergencyContactPhone;
            emp.HireDate = body.HireDate;
            emp.SeniorityRecognitionDate = body.SeniorityRecognitionDate;
            emp.TerminationDate = body.TerminationDate;
            emp.ContractType = body.ContractType;
            emp.JobTitle = body.JobTitle;
            emp.Department = body.Department;
            emp.CostCenter = body.CostCenter;
            emp.WorkplaceLocation = body.WorkplaceLocation;
            emp.UnionCct = body.UnionCct;
            emp.UnionCategory = body.UnionCategory;
            emp.HealthInsurance = body.HealthInsurance;
            emp.BaseSalary = body.BaseSalary;
            emp.HourlyRate = body.HourlyRate;
            emp.BankName = body.BankName;
            emp.Cbu = body.Cbu;
            emp.BankAlias = body.BankAlias;
            emp.Status = body.Status;
            emp.PhotoPath = body.PhotoPath;
            emp.Notes = body.Notes;

            await db.SaveChangesAsync(ct);
            return Results.Ok(emp);
        });

        group.MapDelete("/employees/{id:guid}", async (Guid id, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var emp = await db.Employees.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            if (emp is null) return Results.NotFound();

            emp.Status = EmployeeStatus.Terminated;
            emp.TerminationDate = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        // -------------------------------------------------------------
        // EPP DELIVERIES
        // -------------------------------------------------------------
        group.MapGet("/employees/{employeeId:guid}/epps", async (Guid employeeId, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var epps = await db.EppDeliveries.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.EmployeeId == employeeId)
                .OrderByDescending(x => x.DeliveryDateUtc)
                .ToListAsync(ct);
            return Results.Ok(epps);
        });

        group.MapPost("/epps", async (EppDelivery body, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            body.Id = Guid.NewGuid();
            body.TenantId = tenantId;
            body.CreatedAtUtc = DateTime.UtcNow;
            if (body.DeliveryDateUtc == default) body.DeliveryDateUtc = DateTime.UtcNow;

            db.EppDeliveries.Add(body);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/hr/epps/{body.Id}", body);
        });

        // -------------------------------------------------------------
        // TIME TRACKING
        // -------------------------------------------------------------
        group.MapGet("/time-tracking", async (Guid? employeeId, DateTime? fromDate, DateTime? toDate, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var q = db.TimeTrackings.AsNoTracking().Where(x => x.TenantId == tenantId);

            if (employeeId.HasValue) q = q.Where(x => x.EmployeeId == employeeId.Value);
            if (fromDate.HasValue) q = q.Where(x => x.Date >= fromDate.Value);
            if (toDate.HasValue) q = q.Where(x => x.Date <= toDate.Value);

            var items = await q.OrderByDescending(x => x.Date).ToListAsync(ct);
            return Results.Ok(items);
        });

        group.MapPost("/time-tracking", async (EmployeeTimeTracking body, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            body.Id = Guid.NewGuid();
            body.TenantId = tenantId;
            body.CreatedAtUtc = DateTime.UtcNow;

            db.TimeTrackings.Add(body);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/hr/time-tracking/{body.Id}", body);
        });

        // -------------------------------------------------------------
        // PAYROLL & LIQUIDACIONES (Multi-Convenio Engine)
        // -------------------------------------------------------------
        group.MapGet("/payroll/periods", async (HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var periods = await db.PayrollPeriods.AsNoTracking()
                .Where(x => x.TenantId == tenantId)
                .OrderByDescending(x => x.PeriodYear)
                .ThenByDescending(x => x.PeriodMonth)
                .ToListAsync(ct);
            return Results.Ok(periods);
        });

        group.MapPost("/payroll/periods", async (PayrollPeriod body, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            body.Id = Guid.NewGuid();
            body.TenantId = tenantId;
            body.CreatedAtUtc = DateTime.UtcNow;
            if (body.PaymentDateUtc == default) body.PaymentDateUtc = DateTime.UtcNow;

            db.PayrollPeriods.Add(body);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/hr/payroll/periods/{body.Id}", body);
        });

        // Universal Calculation Engine for Period
        group.MapPost("/payroll/calculate/{periodId:guid}", async (Guid periodId, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var period = await db.PayrollPeriods.FirstOrDefaultAsync(x => x.Id == periodId && x.TenantId == tenantId, ct);
            if (period is null) return Results.NotFound("Período de liquidación inexistente.");

            // Remove previous slips for this period if any
            var existingSlips = await db.PayrollSlips.Where(x => x.PayrollPeriodId == periodId && x.TenantId == tenantId).ToListAsync(ct);
            db.PayrollSlips.RemoveRange(existingSlips);

            var activeEmployees = await db.Employees.Where(x => x.TenantId == tenantId && x.Status == EmployeeStatus.Active).ToListAsync(ct);

            int receiptCounter = 1;
            var createdSlips = new List<PayrollSlip>();

            foreach (var emp in activeEmployees)
            {
                var basic = emp.BaseSalary > 0 ? emp.BaseSalary : 500000m;
                var yearsSeniority = Math.Max(0, (DateTime.UtcNow - (emp.SeniorityRecognitionDate ?? emp.HireDate)).Days / 365);
                var seniorityAmount = Math.Round(basic * (yearsSeniority * 0.01m), 2); // 1% per year standard
                var presenteeism = Math.Round((basic + seniorityAmount) * (1m / 12m), 2); // 8.33% CCT Comercio / General

                var grossRem = basic + seniorityAmount + presenteeism;
                var nonRem = 0m; // Can be configured with paritarias

                // Deductions of law (SIPA 11%, INSSJyP 3%, Obra Social 3%, Gremio 2%)
                var jubilacion = Math.Round(grossRem * 0.11m, 2);
                var inssjyp = Math.Round(grossRem * 0.03m, 2);
                var obraSocial = Math.Round(grossRem * 0.03m, 2);
                var cuotaSindical = Math.Round((grossRem + nonRem) * 0.02m, 2);
                var totalDeductions = jubilacion + inssjyp + obraSocial + cuotaSindical;

                var netPay = grossRem + nonRem - totalDeductions;

                var slip = new PayrollSlip
                {
                    Id = Guid.NewGuid(),
                    TenantId = tenantId,
                    PayrollPeriodId = periodId,
                    EmployeeId = emp.Id,
                    ReceiptNumber = $"{period.PeriodYear}-{period.PeriodMonth:D2}-{receiptCounter:D4}",
                    TotalGrossRemunerative = grossRem,
                    TotalNonRemunerative = nonRem,
                    TotalDeductions = totalDeductions,
                    NetPay = netPay,
                    NetPayWords = $"Son pesos {netPay:N2}",
                    Status = "Issued",
                    SignedByCompanyUtc = DateTime.UtcNow,
                    SignatureHashSha256 = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{emp.Cuil}-{period.PeriodYear}{period.PeriodMonth}-{netPay}"))),
                    CreatedAtUtc = DateTime.UtcNow,
                    Lines =
                    [
                        new() { Id = Guid.NewGuid(), ConceptCode = "100", ConceptName = "Sueldo Básico", Type = ConceptType.Remunerative, Quantity = 30, Unit = "Días", BaseAmount = basic, RemunerativeAmount = basic },
                        new() { Id = Guid.NewGuid(), ConceptCode = "110", ConceptName = $"Antigüedad ({yearsSeniority} años)", Type = ConceptType.Remunerative, Quantity = yearsSeniority, Unit = "Años", BaseAmount = basic, Percentage = 1, RemunerativeAmount = seniorityAmount },
                        new() { Id = Guid.NewGuid(), ConceptCode = "120", ConceptName = "Presentismo Asistencia Perfecta", Type = ConceptType.Remunerative, Quantity = 1, Unit = "Global", BaseAmount = basic + seniorityAmount, Percentage = 8.33m, RemunerativeAmount = presenteeism },
                        new() { Id = Guid.NewGuid(), ConceptCode = "300", ConceptName = "Jubilación (SIPA Ley 24.241)", Type = ConceptType.Deduction, Percentage = 11, BaseAmount = grossRem, DeductionAmount = jubilacion },
                        new() { Id = Guid.NewGuid(), ConceptCode = "301", ConceptName = "INSSJyP (PAMI Ley 19.032)", Type = ConceptType.Deduction, Percentage = 3, BaseAmount = grossRem, DeductionAmount = inssjyp },
                        new() { Id = Guid.NewGuid(), ConceptCode = "302", ConceptName = $"Obra Social ({emp.HealthInsurance})", Type = ConceptType.Deduction, Percentage = 3, BaseAmount = grossRem, DeductionAmount = obraSocial },
                        new() { Id = Guid.NewGuid(), ConceptCode = "303", ConceptName = "Aporte Sindical / Cuota Gremial", Type = ConceptType.Deduction, Percentage = 2, BaseAmount = grossRem, DeductionAmount = cuotaSindical }
                    ]
                };

                createdSlips.Add(slip);
                receiptCounter++;
            }

            db.PayrollSlips.AddRange(createdSlips);
            period.Status = PayrollPeriodStatus.Closed;
            await db.SaveChangesAsync(ct);

            return Results.Ok(new { periodId, employeesCalculated = createdSlips.Count, totalNetToPay = createdSlips.Sum(x => x.NetPay) });
        });

        group.MapGet("/payroll/slips/{periodId:guid}", async (Guid periodId, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var slips = await db.PayrollSlips.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.PayrollPeriodId == periodId)
                .Join(db.Employees, s => s.EmployeeId, e => e.Id, (s, e) => new
                {
                    s.Id,
                    s.PayrollPeriodId,
                    s.EmployeeId,
                    EmployeeName = $"{e.LastName}, {e.FirstName}",
                    e.FileNumber,
                    e.Cuil,
                    e.JobTitle,
                    e.UnionCct,
                    e.BankName,
                    e.Cbu,
                    s.ReceiptNumber,
                    s.TotalGrossRemunerative,
                    s.TotalNonRemunerative,
                    s.TotalDeductions,
                    s.NetPay,
                    s.Status,
                    s.SignedByCompanyUtc,
                    s.SignedByEmployeeUtc
                })
                .ToListAsync(ct);

            return Results.Ok(slips);
        });

        group.MapGet("/payroll/slips/detail/{slipId:guid}", async (Guid slipId, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var slip = await db.PayrollSlips.Include(x => x.Lines).FirstOrDefaultAsync(x => x.Id == slipId && x.TenantId == tenantId, ct);
            if (slip is null) return Results.NotFound();

            var emp = await db.Employees.AsNoTracking().FirstOrDefaultAsync(x => x.Id == slip.EmployeeId && x.TenantId == tenantId, ct);
            var period = await db.PayrollPeriods.AsNoTracking().FirstOrDefaultAsync(x => x.Id == slip.PayrollPeriodId && x.TenantId == tenantId, ct);

            return Results.Ok(new { slip, employee = emp, period });
        });

        // Sign receipt by Employee
        group.MapPost("/payroll/slips/{slipId:guid}/sign-employee", async (Guid slipId, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var slip = await db.PayrollSlips.FirstOrDefaultAsync(x => x.Id == slipId && x.TenantId == tenantId, ct);
            if (slip is null) return Results.NotFound();

            slip.SignedByEmployeeUtc = DateTime.UtcNow;
            slip.Status = "Signed";
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { message = "Recibo firmado conforme por el empleado.", signedAt = slip.SignedByEmployeeUtc });
        });

        return endpoints;
    }
}
