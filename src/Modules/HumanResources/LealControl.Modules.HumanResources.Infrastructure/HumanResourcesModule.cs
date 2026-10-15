using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Persistence;
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

public sealed class OrganizationPosition
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public string Title { get; set; } = ""; // Nombre del Puesto
    public string Department { get; set; } = "Operaciones";
    public Guid? ReportsToPositionId { get; set; } // Puesto Superior
    public Guid? AssignedEmployeeId { get; set; } // Empleado Ocupante
    public string Mission { get; set; } = ""; // Misión / Propósito
    public string Responsibilities { get; set; } = ""; // Tareas y responsabilidades clave
    public string RequiredQualifications { get; set; } = ""; // Requisitos y formación
    public string Competencies { get; set; } = ""; // Competencias técnicas y conductuales
    public string Kpis { get; set; } = ""; // Indicadores de desempeño
    public int Level { get; set; } = 3; // 1: Dirección, 2: Gerencia, 3: Jefatura, 4: Operativo
    public DateTime CreatedAtUtc { get; set; }
}

public sealed class EmployeeDocument
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid EmployeeId { get; set; }
    public string DocumentType { get; set; } = "CV"; // CV, DNI, CUIL, AltaTemprana, Preocupacional, PeriodicoArt, CargasFamilia, DomicilioReal, TituloEstudios, DatosBancarios, LicenciaConducir, ReciboLiquidacionFinal, CertificadoArt80, CertificadoAfip57, TelegramaRenunciaDespido, Otro
    public string Category { get; set; } = "Ingreso"; // "Ingreso", "Egreso"
    public string FileName { get; set; } = "";
    public string? FileUrl { get; set; }
    public DateTime? IssueDate { get; set; }
    public DateTime? ExpiryDate { get; set; }
    public string Status { get; set; } = "Presentado"; // "Presentado", "Pendiente", "Vencido"
    public string? Notes { get; set; }
    public DateTime UploadedAtUtc { get; set; }
}

public sealed class ProcedureManual
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public string Code { get; set; } = ""; // Ej: PO-MET-001, IT-TAL-002
    public string Title { get; set; } = "";
    public string Area { get; set; } = "Metrología"; // Metrología, Calidad, Ventas, Logística, Taller, Administración, RRHH
    public string Version { get; set; } = "v1.0";
    public DateTime EffectiveDate { get; set; } = DateTime.UtcNow;
    public string Status { get; set; } = "Vigente"; // Vigente, EnRevisión, Obsoleto
    public string Description { get; set; } = "";
    public string? DocumentUrl { get; set; }
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
    public DbSet<OrganizationPosition> Positions => Set<OrganizationPosition>();
    public DbSet<EmployeeDocument> EmployeeDocuments => Set<EmployeeDocument>();
    public DbSet<ProcedureManual> ProcedureManuals => Set<ProcedureManual>();
    public DbSet<PayrollConcept> PayrollConcepts => Set<PayrollConcept>();
    public DbSet<PayrollPeriod> PayrollPeriods => Set<PayrollPeriod>();
    public DbSet<PayrollSlip> PayrollSlips => Set<PayrollSlip>();
    public DbSet<PayrollSlipLine> PayrollSlipLines => Set<PayrollSlipLine>();
    public DbSet<EmployeeTimeTracking> TimeTrackings => Set<EmployeeTimeTracking>();
    public DbSet<EppDelivery> EppDeliveries => Set<EppDelivery>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.AddSearchTextFunctions();
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

        modelBuilder.Entity<OrganizationPosition>(b =>
        {
            b.ToTable("OrganizationPositions");
            b.HasKey(x => x.Id);
            b.Property(x => x.Title).HasMaxLength(160).IsRequired();
            b.Property(x => x.Department).HasMaxLength(100).IsRequired();
            b.HasIndex(x => new { x.TenantId, x.Department });
        });

        modelBuilder.Entity<EmployeeDocument>(b =>
        {
            b.ToTable("EmployeeDocuments");
            b.HasKey(x => x.Id);
            b.Property(x => x.DocumentType).HasMaxLength(80).IsRequired();
            b.Property(x => x.Category).HasMaxLength(40).IsRequired();
            b.Property(x => x.FileName).HasMaxLength(250).IsRequired();
            b.Property(x => x.FileUrl).HasColumnType("text");
            b.HasIndex(x => new { x.TenantId, x.EmployeeId, x.DocumentType });
        });

        modelBuilder.Entity<ProcedureManual>(b =>
        {
            b.ToTable("ProcedureManuals");
            b.HasKey(x => x.Id);
            b.Property(x => x.Code).HasMaxLength(50).IsRequired();
            b.Property(x => x.Title).HasMaxLength(200).IsRequired();
            b.Property(x => x.Area).HasMaxLength(80).IsRequired();
            b.Property(x => x.Version).HasMaxLength(30).IsRequired();
            b.Property(x => x.DocumentUrl).HasColumnType("text");
            b.HasIndex(x => new { x.TenantId, x.Code });
            b.HasIndex(x => new { x.TenantId, x.Area });
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
            b.Property(x => x.SignedReceiptProofUrl).HasColumnType("text");
            b.HasIndex(x => new { x.TenantId, x.EmployeeId });
        });
    }

    public Task EnsureHrTablesAsync(CancellationToken ct = default) => EnsureHumanResourcesTablesAsync(ct);

    public Task EnsureHumanResourcesTablesAsync(CancellationToken ct = default) =>
        SchemaInitializationGate.RunOnceAsync(this, "hr", EnsureHumanResourcesTablesCoreAsync);

    private async Task EnsureHumanResourcesTablesCoreAsync(CancellationToken ct = default)
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
                ""Address"" character varying(200) NOT NULL DEFAULT '',
                ""City"" character varying(100) NOT NULL DEFAULT 'San Lorenzo',
                ""Province"" character varying(80) NOT NULL DEFAULT 'SantaFe',
                ""PostalCode"" character varying(20) NOT NULL DEFAULT '2200',
                ""Phone"" character varying(50) NOT NULL DEFAULT '',
                ""Email"" character varying(120) NOT NULL DEFAULT '',
                ""EmergencyContactName"" character varying(120),
                ""EmergencyContactPhone"" character varying(50),
                ""HireDate"" timestamp with time zone NOT NULL,
                ""SeniorityRecognitionDate"" timestamp with time zone,
                ""TerminationDate"" timestamp with time zone,
                ""ContractType"" integer NOT NULL DEFAULT 0,
                ""JobTitle"" character varying(100) NOT NULL DEFAULT '',
                ""Department"" character varying(100) NOT NULL DEFAULT 'Técnica',
                ""CostCenter"" character varying(100) NOT NULL DEFAULT 'Operaciones',
                ""WorkplaceLocation"" character varying(120) NOT NULL DEFAULT 'Planta Principal',
                ""UnionCct"" character varying(120) NOT NULL DEFAULT 'Comercio 130/75',
                ""UnionCategory"" character varying(100) NOT NULL DEFAULT 'Administrativo A',
                ""HealthInsurance"" character varying(120) NOT NULL DEFAULT 'OSECAC',
                ""BaseSalary"" numeric(18,2) NOT NULL DEFAULT 0,
                ""HourlyRate"" numeric(18,2) NOT NULL DEFAULT 0,
                ""BankName"" character varying(100) NOT NULL DEFAULT 'Banco Nación',
                ""Cbu"" character varying(30) NOT NULL DEFAULT '',
                ""BankAlias"" character varying(50) NOT NULL DEFAULT '',
                ""Status"" integer NOT NULL DEFAULT 0,
                ""PhotoPath"" text,
                ""Notes"" text,
                ""CreatedAtUtc"" timestamp with time zone NOT NULL
            );

            CREATE TABLE IF NOT EXISTS hr.""OrganizationPositions"" (
                ""Id"" uuid PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""Title"" character varying(160) NOT NULL,
                ""Department"" character varying(100) NOT NULL DEFAULT 'Operaciones',
                ""ReportsToPositionId"" uuid,
                ""AssignedEmployeeId"" uuid,
                ""Mission"" text NOT NULL DEFAULT '',
                ""Responsibilities"" text NOT NULL DEFAULT '',
                ""RequiredQualifications"" text NOT NULL DEFAULT '',
                ""Competencies"" text NOT NULL DEFAULT '',
                ""Kpis"" text NOT NULL DEFAULT '',
                ""Level"" integer NOT NULL DEFAULT 3,
                ""CreatedAtUtc"" timestamp with time zone NOT NULL
            );

            CREATE TABLE IF NOT EXISTS hr.""EmployeeDocuments"" (
                ""Id"" uuid PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""EmployeeId"" uuid NOT NULL,
                ""DocumentType"" character varying(80) NOT NULL,
                ""Category"" character varying(40) NOT NULL DEFAULT 'Ingreso',
                ""FileName"" character varying(250) NOT NULL,
                ""FileUrl"" text,
                ""IssueDate"" timestamp with time zone,
                ""ExpiryDate"" timestamp with time zone,
                ""Status"" character varying(40) NOT NULL DEFAULT 'Presentado',
                ""Notes"" text,
                ""UploadedAtUtc"" timestamp with time zone NOT NULL
            );

            CREATE TABLE IF NOT EXISTS hr.""ProcedureManuals"" (
                ""Id"" uuid PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""Code"" character varying(50) NOT NULL,
                ""Title"" character varying(200) NOT NULL,
                ""Area"" character varying(80) NOT NULL DEFAULT 'Metrología',
                ""Version"" character varying(30) NOT NULL DEFAULT 'v1.0',
                ""EffectiveDate"" timestamp with time zone NOT NULL,
                ""Status"" character varying(40) NOT NULL DEFAULT 'Vigente',
                ""Description"" text NOT NULL DEFAULT '',
                ""DocumentUrl"" text,
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
        services.AddTenantDbContext<HumanResourcesDbContext>(HumanResourcesDbContext.Schema);

        return services;
    }

    public static IEndpointRouteBuilder MapHumanResourcesModule(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/hr").WithTags("HumanResources");

        // -------------------------------------------------------------
        // DASHBOARD SUMMARY
        // -------------------------------------------------------------
        group.MapGet("/dashboard-summary", async (HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var employees = await db.Employees.AsNoTracking().Where(x => x.TenantId == tenantId).ToListAsync(ct);
            var positions = await db.Positions.AsNoTracking().Where(x => x.TenantId == tenantId).ToListAsync(ct);
            var documents = await db.EmployeeDocuments.AsNoTracking().Where(x => x.TenantId == tenantId).ToListAsync(ct);
            var manuals = await db.ProcedureManuals.AsNoTracking().Where(x => x.TenantId == tenantId).ToListAsync(ct);

            var activeCount = employees.Count(x => x.Status == EmployeeStatus.Active);
            var leaveCount = employees.Count(x => x.Status == EmployeeStatus.Leave);
            var terminatedCount = employees.Count(x => x.Status == EmployeeStatus.Terminated);

            var depts = employees.Where(x => x.Status == EmployeeStatus.Active)
                .GroupBy(x => x.Department ?? "Sin Área")
                .Select(g => new { department = g.Key, count = g.Count() })
                .ToList();

            var now = DateTime.UtcNow;
            var expiringDocs = documents.Where(d => d.ExpiryDate.HasValue && d.ExpiryDate.Value <= now.AddDays(30)).ToList();

            return Results.Ok(new
            {
                totalEmployees = employees.Count,
                activeEmployees = activeCount,
                leaveEmployees = leaveCount,
                terminatedEmployees = terminatedCount,
                positionsCount = positions.Count,
                coveredPositions = positions.Count(p => p.AssignedEmployeeId.HasValue),
                manualsCount = manuals.Count,
                expiringDocsCount = expiringDocs.Count,
                departmentDistribution = depts
            });
        });

        // -------------------------------------------------------------
        // EMPLOYEES CRUD
        // -------------------------------------------------------------
        group.MapGet("/employees", async (string? search, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var id = tenant.TenantId.Value;
            var q = db.Employees.AsNoTracking().Where(x => x.TenantId == id);

            if (!string.IsNullOrWhiteSpace(search))
            {
                foreach (var token in SearchText.Parse(search))
                {
                    var text = token.Text;
                    var digits = token.HasDigits ? token.Digits : null;
                    q = q.Where(x => SearchText.Fold(x.FirstName).Contains(text)
                        || SearchText.Fold(x.LastName).Contains(text)
                        || SearchText.Fold(x.FileNumber).Contains(text)
                        || (digits != null && x.Cuil.Replace("-", "").Replace(" ", "").Contains(digits)));
                }
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

        group.MapPost("/employees", async (Employee body, HttpContext http, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            // Quien no ve sueldos no los define: quedan en cero para que los cargue quien sí puede.
            if (http.RequestServices.GetService<LealControl.BuildingBlocks.Security.ISensitiveDataAccess>()?.CanSeeSalaries == false)
            {
                body.BaseSalary = 0;
                body.HourlyRate = 0;
            }
            body.Id = Guid.NewGuid();
            body.TenantId = tenantId;
            body.CreatedAtUtc = DateTime.UtcNow;

            db.Employees.Add(body);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/hr/employees/{body.Id}", body);
        });

        group.MapPut("/employees/{id:guid}", async (Guid id, Employee body, HttpContext http, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
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
            // Quien no ve sueldos no los recibe en pantalla: se conserva el que había.
            var sensitive = http.RequestServices.GetService<LealControl.BuildingBlocks.Security.ISensitiveDataAccess>();
            if (sensitive?.CanSeeSalaries != false)
            {
                emp.BaseSalary = body.BaseSalary;
                emp.HourlyRate = body.HourlyRate;
            }
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
        // ORGANIZATIONAL POSITIONS & JOB DESCRIPTIONS
        // -------------------------------------------------------------
        group.MapGet("/positions", async (HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var positions = await db.Positions.AsNoTracking()
                .Where(x => x.TenantId == tenantId)
                .OrderBy(x => x.Level)
                .ThenBy(x => x.Department)
                .ThenBy(x => x.Title)
                .ToListAsync(ct);
            return Results.Ok(positions);
        });

        group.MapPost("/positions", async (OrganizationPosition body, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            body.Id = Guid.NewGuid();
            body.TenantId = tenantId;
            body.CreatedAtUtc = DateTime.UtcNow;

            db.Positions.Add(body);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/hr/positions/{body.Id}", body);
        });

        group.MapPut("/positions/{id:guid}", async (Guid id, OrganizationPosition body, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var pos = await db.Positions.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            if (pos is null) return Results.NotFound("Puesto no encontrado");

            pos.Title = body.Title.Trim();
            pos.Department = body.Department.Trim();
            pos.ReportsToPositionId = body.ReportsToPositionId;
            pos.AssignedEmployeeId = body.AssignedEmployeeId;
            pos.Mission = body.Mission ?? "";
            pos.Responsibilities = body.Responsibilities ?? "";
            pos.RequiredQualifications = body.RequiredQualifications ?? "";
            pos.Competencies = body.Competencies ?? "";
            pos.Kpis = body.Kpis ?? "";
            pos.Level = body.Level;

            await db.SaveChangesAsync(ct);
            return Results.Ok(pos);
        });

        group.MapDelete("/positions/{id:guid}", async (Guid id, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var pos = await db.Positions.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            if (pos is null) return Results.NotFound();

            db.Positions.Remove(pos);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        // -------------------------------------------------------------
        // EMPLOYEE DIGITAL DOSSIER (LEGAJO DIGITAL DOCUMENTS)
        // -------------------------------------------------------------
        group.MapGet("/employees/{employeeId:guid}/documents", async (Guid employeeId, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var docs = await db.EmployeeDocuments.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.EmployeeId == employeeId)
                .OrderBy(x => x.Category)
                .ThenBy(x => x.DocumentType)
                .ToListAsync(ct);
            return Results.Ok(docs);
        });

        group.MapPost("/employees/{employeeId:guid}/documents", async (Guid employeeId, EmployeeDocument body, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            body.Id = Guid.NewGuid();
            body.TenantId = tenantId;
            body.EmployeeId = employeeId;
            body.UploadedAtUtc = DateTime.UtcNow;

            db.EmployeeDocuments.Add(body);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/hr/documents/{body.Id}", body);
        });

        group.MapPut("/documents/{id:guid}", async (Guid id, EmployeeDocument body, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var doc = await db.EmployeeDocuments.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            if (doc is null) return Results.NotFound("Documento no encontrado");

            doc.DocumentType = body.DocumentType;
            doc.Category = body.Category;
            doc.FileName = body.FileName;
            doc.FileUrl = body.FileUrl;
            doc.IssueDate = body.IssueDate;
            doc.ExpiryDate = body.ExpiryDate;
            doc.Status = body.Status;
            doc.Notes = body.Notes;

            await db.SaveChangesAsync(ct);
            return Results.Ok(doc);
        });

        group.MapDelete("/documents/{id:guid}", async (Guid id, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var doc = await db.EmployeeDocuments.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            if (doc is null) return Results.NotFound();

            db.EmployeeDocuments.Remove(doc);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        // -------------------------------------------------------------
        // PROCEDURE MANUALS & STANDARD OPERATING PROCEDURES (SOP)
        // -------------------------------------------------------------
        group.MapGet("/manuals", async (string? area, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var q = db.ProcedureManuals.AsNoTracking().Where(x => x.TenantId == tenantId);
            if (!string.IsNullOrWhiteSpace(area) && area != "ALL")
            {
                q = q.Where(x => x.Area == area);
            }

            var manuals = await q.OrderBy(x => x.Area).ThenBy(x => x.Code).ToListAsync(ct);
            return Results.Ok(manuals);
        });

        group.MapPost("/manuals", async (ProcedureManual body, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            body.Id = Guid.NewGuid();
            body.TenantId = tenantId;
            body.CreatedAtUtc = DateTime.UtcNow;

            db.ProcedureManuals.Add(body);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/hr/manuals/{body.Id}", body);
        });

        group.MapPut("/manuals/{id:guid}", async (Guid id, ProcedureManual body, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var manual = await db.ProcedureManuals.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            if (manual is null) return Results.NotFound("Manual no encontrado");

            manual.Code = body.Code.Trim();
            manual.Title = body.Title.Trim();
            manual.Area = body.Area.Trim();
            manual.Version = body.Version.Trim();
            manual.EffectiveDate = body.EffectiveDate;
            manual.Status = body.Status.Trim();
            manual.Description = body.Description ?? "";
            manual.DocumentUrl = body.DocumentUrl;

            await db.SaveChangesAsync(ct);
            return Results.Ok(manual);
        });

        group.MapDelete("/manuals/{id:guid}", async (Guid id, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var manual = await db.ProcedureManuals.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            if (manual is null) return Results.NotFound();

            db.ProcedureManuals.Remove(manual);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        // -------------------------------------------------------------
        // EPP DELIVERIES
        // -------------------------------------------------------------
        group.MapGet("/employees/{employeeId:guid}/epp", async (Guid employeeId, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var items = await db.EppDeliveries.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.EmployeeId == employeeId)
                .OrderByDescending(x => x.DeliveryDateUtc)
                .ToListAsync(ct);
            return Results.Ok(items);
        });

        group.MapPost("/employees/{employeeId:guid}/epp", async (Guid employeeId, EppDelivery body, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            body.Id = Guid.NewGuid();
            body.TenantId = tenantId;
            body.EmployeeId = employeeId;
            body.CreatedAtUtc = DateTime.UtcNow;

            db.EppDeliveries.Add(body);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/hr/epp/{body.Id}", body);
        });

        // -------------------------------------------------------------
        // TIME TRACKING & CLOCK-IN
        // -------------------------------------------------------------
        group.MapGet("/time-tracking", async (DateTime? dateFrom, DateTime? dateTo, Guid? employeeId, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var q = db.TimeTrackings.AsNoTracking().Where(x => x.TenantId == tenantId);
            if (dateFrom.HasValue) q = q.Where(x => x.Date >= dateFrom.Value);
            if (dateTo.HasValue) q = q.Where(x => x.Date <= dateTo.Value);
            if (employeeId.HasValue) q = q.Where(x => x.EmployeeId == employeeId.Value);

            var list = await q.OrderByDescending(x => x.Date).ToListAsync(ct);
            return Results.Ok(list);
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

        // La liquidación de sueldos se está rehaciendo (nota 68): el cálculo anterior inventaba sueldos y el
        // Libro de Sueldos Digital no era el de ARCA. Las tablas de períodos, conceptos y recibos se conservan
        // hasta la nueva liquidación (S3).

        return endpoints;
    }
}
