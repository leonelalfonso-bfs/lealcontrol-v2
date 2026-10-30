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
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace LealControl.Modules.HumanResources.Infrastructure;

public enum EmployeeStatus { Active, Leave, Terminated }
public enum ContractType { Indefinite, FixedTerm, Eventual, TrialPeriod, Internship }

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

    // Seguridad social (ARCA: Libro de Sueldos Digital y F.931). Códigos de las tablas de SICOSS / Declaración en línea.
    public bool IsUnionMember { get; set; }
    /// <summary>Situación de revista (1 = Activo).</summary>
    public int SocialSecuritySituation { get; set; } = 1;
    /// <summary>Condición (1 = Servicios comunes mayor de 18 años, 2 = Jubilado).</summary>
    public int SocialSecurityCondition { get; set; } = 1;
    /// <summary>Actividad del trabajador; vacía, la del empleador.</summary>
    public int? SocialSecurityActivity { get; set; }
    /// <summary>Modalidad de contratación (8 = A tiempo completo indeterminado).</summary>
    public int ContractModalityCode { get; set; } = 8;
    /// <summary>Código de siniestrado según la Ley de Riesgos del Trabajo (0 = no incapacitado).</summary>
    public int CasualtyCode { get; set; }
    public string? LocalityCode { get; set; }
    /// <summary>Código de la obra social en el RNOS (6 dígitos).</summary>
    public string? HealthInsuranceCode { get; set; }
    public int HealthInsuranceAdherents { get; set; }
    public bool HasSpouse { get; set; }
    public int ChildrenCount { get; set; }
    public bool PartTime { get; set; }
    public decimal? WeeklyHours { get; set; }

    // Convenio colectivo (nota 68, S2). Sin convenio, rige el sueldo pactado del legajo.
    public Guid? AgreementId { get; set; }
    public Guid? AgreementCategoryId { get; set; }
    public string? AgreementZone { get; set; }
    /// <summary>Marcas del empleado que piden las reglas del convenio (por ejemplo, "titulo-a,fallo-caja").</summary>
    public string? AgreementFlags { get; set; }
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
    /// <summary>Enlace externo opcional (Drive, SharePoint…); el documento se sube como archivo.</summary>
    public string? DocumentUrl { get; set; }
    public string? FileStorageKey { get; set; }
    public string? FileName { get; set; }
    public string? FileContentType { get; set; }
    public DateTime CreatedAtUtc { get; set; }
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
    public DbSet<CompanyDocument> CompanyDocuments => Set<CompanyDocument>();
    public DbSet<HrArea> Areas => Set<HrArea>();
    public DbSet<ProcedureManual> ProcedureManuals => Set<ProcedureManual>();
    public DbSet<Payroll.PayrollEmployerSettings> PayrollEmployerSettings => Set<Payroll.PayrollEmployerSettings>();
    public DbSet<Payroll.PayrollLegalParameter> PayrollLegalParameters => Set<Payroll.PayrollLegalParameter>();
    public DbSet<Payroll.CollectiveAgreement> CollectiveAgreements => Set<Payroll.CollectiveAgreement>();
    public DbSet<Payroll.AgreementCategory> AgreementCategories => Set<Payroll.AgreementCategory>();
    public DbSet<Payroll.AgreementScale> AgreementScales => Set<Payroll.AgreementScale>();
    public DbSet<Payroll.AgreementRule> AgreementRules => Set<Payroll.AgreementRule>();
    public DbSet<Payroll.PayrollRun> PayrollRuns => Set<Payroll.PayrollRun>();
    public DbSet<Payroll.PayrollNovelty> PayrollNovelties => Set<Payroll.PayrollNovelty>();
    public DbSet<Payroll.Payslip> Payslips => Set<Payroll.Payslip>();
    public DbSet<Payroll.PayslipLine> PayslipLines => Set<Payroll.PayslipLine>();
    public DbSet<Payroll.VacationLeave> VacationLeaves => Set<Payroll.VacationLeave>();
    public DbSet<Payroll.PayrollConceptMapping> PayrollConceptMappings => Set<Payroll.PayrollConceptMapping>();
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

        modelBuilder.Entity<HrArea>(b =>
        {
            b.ToTable("Areas");
            b.HasKey(x => x.Id);
            b.Property(x => x.Name).HasMaxLength(80).IsRequired();
            b.HasIndex(x => new { x.TenantId, x.Name }).IsUnique();
        });
        modelBuilder.Entity<CompanyDocument>(b =>
        {
            b.ToTable("CompanyDocuments");
            b.HasKey(x => x.Id);
            b.Property(x => x.Category).HasMaxLength(30);
            b.Property(x => x.Title).HasMaxLength(160);
            b.Property(x => x.Number).HasMaxLength(80);
            b.Property(x => x.Issuer).HasMaxLength(160);
            b.Property(x => x.FileStorageKey).HasMaxLength(300);
            b.Property(x => x.FileName).HasMaxLength(200);
            b.Property(x => x.FileContentType).HasMaxLength(100);
            b.HasIndex(x => x.TenantId);
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

        modelBuilder.Entity<Payroll.PayrollEmployerSettings>(b =>
        {
            b.ToTable("PayrollEmployerSettings");
            b.HasKey(x => x.Id);
            b.HasIndex(x => x.TenantId).IsUnique();
            b.Property(x => x.ArtInsurer).HasMaxLength(120);
            b.Property(x => x.ArtContractNumber).HasMaxLength(60);
            b.Property(x => x.FalId).HasMaxLength(60);
            b.Property(x => x.ArtVariablePercent).HasPrecision(9, 4);
            b.Property(x => x.ArtFixedAmount).HasPrecision(18, 2);
            b.Property(x => x.LifeInsurancePremium).HasPrecision(18, 2);
        });

        modelBuilder.Entity<Payroll.PayrollLegalParameter>(b =>
        {
            b.ToTable("PayrollLegalParameters");
            b.HasKey(x => x.Id);
            b.Property(x => x.Key).HasMaxLength(60).IsRequired();
            b.Property(x => x.Norm).HasMaxLength(160).IsRequired();
            b.Property(x => x.Value).HasPrecision(18, 4);
            b.HasIndex(x => new { x.TenantId, x.Key, x.ValidFrom });
        });

        modelBuilder.Entity<Payroll.PayrollRun>(b =>
        {
            b.ToTable("PayrollRuns");
            b.HasKey(x => x.Id);
            b.Property(x => x.Kind).HasMaxLength(20).IsRequired();
            b.Property(x => x.Status).HasMaxLength(20).IsRequired();
            b.Property(x => x.LastDepositPeriod).HasMaxLength(7);
            b.Property(x => x.LastDepositBank).HasMaxLength(120);
            b.Property(x => x.ClosedBy).HasMaxLength(160);
            b.Property(x => x.TerminationCause).HasMaxLength(40);
            b.Property(x => x.AgreedAmount).HasPrecision(18, 2);
            b.Property(x => x.PriorBestSalary).HasPrecision(18, 2);
            b.HasIndex(x => new { x.TenantId, x.Year, x.Month, x.Number }).IsUnique();
        });
        modelBuilder.Entity<Payroll.PayrollConceptMapping>(b =>
        {
            b.ToTable("PayrollConceptMappings");
            b.HasKey(x => x.Id);
            b.Property(x => x.Code).HasMaxLength(10).IsRequired();
            b.Property(x => x.ArcaCode).HasMaxLength(6).IsRequired();
            b.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
        });
        modelBuilder.Entity<Payroll.VacationLeave>(b =>
        {
            b.ToTable("VacationLeaves");
            b.HasKey(x => x.Id);
            b.Property(x => x.Notes).HasMaxLength(300);
            b.Ignore(x => x.EndDate);
            b.HasOne<Employee>().WithMany().HasForeignKey(x => x.EmployeeId).OnDelete(DeleteBehavior.Cascade);
            b.HasIndex(x => new { x.TenantId, x.EmployeeId, x.Year });
        });
        modelBuilder.Entity<Payroll.PayrollNovelty>(b =>
        {
            b.ToTable("PayrollNovelties");
            b.HasKey(x => x.Id);
            b.Property(x => x.Kind).HasMaxLength(40).IsRequired();
            b.Property(x => x.Description).HasMaxLength(200);
            b.Property(x => x.Quantity).HasPrecision(9, 2);
            b.Property(x => x.Amount).HasPrecision(18, 2);
            b.HasOne<Payroll.PayrollRun>().WithMany().HasForeignKey(x => x.RunId).OnDelete(DeleteBehavior.Cascade);
            b.HasIndex(x => new { x.RunId, x.EmployeeId });
        });
        modelBuilder.Entity<Payroll.Payslip>(b =>
        {
            b.ToTable("Payslips");
            b.HasKey(x => x.Id);
            b.Property(x => x.EmployeeName).HasMaxLength(250).IsRequired();
            b.Property(x => x.Cuil).HasMaxLength(30);
            b.Property(x => x.FileNumber).HasMaxLength(40);
            b.Property(x => x.Agreement).HasMaxLength(160);
            b.Property(x => x.Category).HasMaxLength(160);
            b.Property(x => x.Warnings).HasMaxLength(4000);
            b.Property(x => x.ContentHash).HasMaxLength(64);
            foreach (var p in new[] { nameof(Payroll.Payslip.AssignedSalary), nameof(Payroll.Payslip.Remunerative), nameof(Payroll.Payslip.NonRemunerative),
                nameof(Payroll.Payslip.Deductions), nameof(Payroll.Payslip.Net), nameof(Payroll.Payslip.ContributionsBase), nameof(Payroll.Payslip.EmployeeContributionsBase), nameof(Payroll.Payslip.Detraction),
                nameof(Payroll.Payslip.EmployeeSocialSecurity), nameof(Payroll.Payslip.UnionDeductions), nameof(Payroll.Payslip.Advances), nameof(Payroll.Payslip.Garnishments),
                nameof(Payroll.Payslip.OtherDeductions), nameof(Payroll.Payslip.EmployerSocialSecurity), nameof(Payroll.Payslip.Fal), nameof(Payroll.Payslip.EmployerHealth),
                nameof(Payroll.Payslip.Art), nameof(Payroll.Payslip.LifeInsurance), nameof(Payroll.Payslip.AgreementContributions) })
                b.Property(p).HasPrecision(18, 2);
            b.Property(x => x.DaysWorked).HasPrecision(5, 2);
            b.Ignore(x => x.EmployerCost);
            b.HasMany(x => x.Lines).WithOne().HasForeignKey(x => x.PayslipId).OnDelete(DeleteBehavior.Cascade);
            b.HasOne<Payroll.PayrollRun>().WithMany().HasForeignKey(x => x.RunId).OnDelete(DeleteBehavior.Cascade);
            b.HasIndex(x => new { x.RunId, x.EmployeeId }).IsUnique();
        });
        modelBuilder.Entity<Payroll.PayslipLine>(b =>
        {
            b.ToTable("PayslipLines");
            b.HasKey(x => x.Id);
            b.Property(x => x.Code).HasMaxLength(20).IsRequired();
            b.Property(x => x.Name).HasMaxLength(200).IsRequired();
            b.Property(x => x.Kind).HasMaxLength(20).IsRequired();
            b.Property(x => x.Detail).HasMaxLength(300);
            b.Property(x => x.Quantity).HasPrecision(9, 2);
            b.Property(x => x.Amount).HasPrecision(18, 2);
        });

        modelBuilder.Entity<Payroll.CollectiveAgreement>(b =>
        {
            b.ToTable("CollectiveAgreements");
            b.HasKey(x => x.Id);
            b.Property(x => x.Code).HasMaxLength(30).IsRequired();
            b.Property(x => x.Name).HasMaxLength(160).IsRequired();
            b.Property(x => x.Union).HasMaxLength(120);
            b.Property(x => x.Zones).HasMaxLength(120);
            b.Property(x => x.Notes).HasMaxLength(1000);
            b.Property(x => x.SeveranceCap).HasPrecision(18, 2);
            b.Property(x => x.SeveranceCapSource).HasMaxLength(300);
            b.Property(x => x.HourDivisor).HasPrecision(9, 2);
            b.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
        });
        modelBuilder.Entity<Payroll.AgreementCategory>(b =>
        {
            b.ToTable("AgreementCategories");
            b.HasKey(x => x.Id);
            b.Property(x => x.Group).HasMaxLength(120);
            b.Property(x => x.Name).HasMaxLength(160).IsRequired();
            b.HasIndex(x => new { x.AgreementId, x.Name }).IsUnique();
            b.HasOne<Payroll.CollectiveAgreement>().WithMany().HasForeignKey(x => x.AgreementId).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<Payroll.AgreementScale>(b =>
        {
            b.ToTable("AgreementScales");
            b.HasKey(x => x.Id);
            b.Property(x => x.Zone).HasMaxLength(20);
            b.Property(x => x.Source).HasMaxLength(300);
            b.Property(x => x.Basic).HasPrecision(18, 2);
            b.Property(x => x.NonRemunerative).HasPrecision(18, 2);
            b.HasIndex(x => new { x.AgreementId, x.CategoryId, x.Zone, x.ValidFrom }).IsUnique();
            b.HasOne<Payroll.CollectiveAgreement>().WithMany().HasForeignKey(x => x.AgreementId).OnDelete(DeleteBehavior.Cascade);
            b.HasOne<Payroll.AgreementCategory>().WithMany().HasForeignKey(x => x.CategoryId).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<Payroll.AgreementRule>(b =>
        {
            b.ToTable("AgreementRules");
            b.HasKey(x => x.Id);
            b.Property(x => x.Type).HasMaxLength(30).IsRequired();
            b.Property(x => x.Code).HasMaxLength(20).IsRequired();
            b.Property(x => x.Name).HasMaxLength(160).IsRequired();
            b.Property(x => x.Basis).HasMaxLength(40).IsRequired();
            b.Property(x => x.AppliesTo).HasMaxLength(20).IsRequired();
            b.Property(x => x.Zones).HasMaxLength(120);
            b.Property(x => x.Groups).HasMaxLength(500);
            b.Property(x => x.RequiresFlag).HasMaxLength(60);
            b.Property(x => x.Value).HasPrecision(18, 4);
            b.HasIndex(x => new { x.AgreementId, x.Type });
            b.HasOne<Payroll.CollectiveAgreement>().WithMany().HasForeignKey(x => x.AgreementId).OnDelete(DeleteBehavior.Cascade);
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
        await Database.ExecuteSqlRawAsync(@"
            CREATE TABLE IF NOT EXISTS hr.""CompanyDocuments"" (
                ""Id"" uuid PRIMARY KEY, ""TenantId"" uuid NOT NULL, ""Category"" character varying(30) NOT NULL, ""Title"" character varying(160) NOT NULL,
                ""Number"" character varying(80) NOT NULL, ""Issuer"" character varying(160), ""IssueDate"" timestamp with time zone,
                ""ExpirationDate"" timestamp with time zone, ""AlertDaysBefore"" integer NOT NULL DEFAULT 30, ""FileStorageKey"" character varying(300),
                ""FileName"" character varying(200), ""FileContentType"" character varying(100), ""IsActive"" boolean NOT NULL DEFAULT true,
                ""CreatedAtUtc"" timestamp with time zone NOT NULL
            );
            CREATE INDEX IF NOT EXISTS ""IX_CompanyDocuments_Tenant"" ON hr.""CompanyDocuments"" (""TenantId"");
            CREATE TABLE IF NOT EXISTS hr.""Areas"" (
                ""Id"" uuid PRIMARY KEY, ""TenantId"" uuid NOT NULL, ""Name"" character varying(80) NOT NULL, ""SortOrder"" integer NOT NULL DEFAULT 0
            );
            CREATE UNIQUE INDEX IF NOT EXISTS ""IX_Areas_Tenant_Name"" ON hr.""Areas"" (""TenantId"", ""Name"");
            ALTER TABLE hr.""ProcedureManuals"" ADD COLUMN IF NOT EXISTS ""FileStorageKey"" character varying(300);
            ALTER TABLE hr.""ProcedureManuals"" ADD COLUMN IF NOT EXISTS ""FileName"" character varying(200);
            ALTER TABLE hr.""ProcedureManuals"" ADD COLUMN IF NOT EXISTS ""FileContentType"" character varying(100);
            -- La documentación de la empresa estuvo unos días en Flota: se pasa a RRHH (con sus archivos) y se borra la tabla vieja.
            DO $$
            BEGIN
                IF to_regclass('fleet.""CompanyDocuments""') IS NOT NULL THEN
                    INSERT INTO hr.""CompanyDocuments"" (""Id"", ""TenantId"", ""Category"", ""Title"", ""Number"", ""Issuer"", ""IssueDate"", ""ExpirationDate"",
                        ""AlertDaysBefore"", ""FileStorageKey"", ""FileName"", ""FileContentType"", ""IsActive"", ""CreatedAtUtc"")
                    SELECT ""Id"", ""TenantId"", ""Category"",
                        CASE WHEN ""Title"" <> '' THEN ""Title"" ELSE CASE ""Category""
                            WHEN 'Art' THEN 'ART – certificado de cobertura' WHEN 'LifeInsurance' THEN 'Seguro de vida obligatorio'
                            WHEN 'Liability' THEN 'Seguro de responsabilidad civil' WHEN 'WorkProcedure' THEN 'Procedimiento de trabajo'
                            WHEN 'Training' THEN 'Capacitación' WHEN 'SafetyProgram' THEN 'Programa de seguridad / higiene' ELSE 'Otro' END END,
                        ""Number"", ""Issuer"", ""IssueDateUtc"", ""ExpirationDateUtc"", ""AlertDaysBefore"", ""FileStorageKey"", ""FileName"", ""FileContentType"",
                        ""IsActive"", ""CreatedAtUtc""
                    FROM fleet.""CompanyDocuments""
                    ON CONFLICT (""Id"") DO NOTHING;
                    DROP TABLE fleet.""CompanyDocuments"";
                END IF;
            END $$;
            ALTER TABLE hr.""Employees"" ADD COLUMN IF NOT EXISTS ""IsUnionMember"" boolean NOT NULL DEFAULT false;
            ALTER TABLE hr.""Employees"" ADD COLUMN IF NOT EXISTS ""SocialSecuritySituation"" integer NOT NULL DEFAULT 1;
            ALTER TABLE hr.""Employees"" ADD COLUMN IF NOT EXISTS ""SocialSecurityCondition"" integer NOT NULL DEFAULT 1;
            ALTER TABLE hr.""Employees"" ADD COLUMN IF NOT EXISTS ""SocialSecurityActivity"" integer;
            ALTER TABLE hr.""Employees"" ADD COLUMN IF NOT EXISTS ""ContractModalityCode"" integer NOT NULL DEFAULT 8;
            ALTER TABLE hr.""Employees"" ADD COLUMN IF NOT EXISTS ""CasualtyCode"" integer NOT NULL DEFAULT 0;
            ALTER TABLE hr.""Employees"" ADD COLUMN IF NOT EXISTS ""LocalityCode"" character varying(20);
            ALTER TABLE hr.""Employees"" ADD COLUMN IF NOT EXISTS ""HealthInsuranceCode"" character varying(6);
            ALTER TABLE hr.""Employees"" ADD COLUMN IF NOT EXISTS ""HealthInsuranceAdherents"" integer NOT NULL DEFAULT 0;
            ALTER TABLE hr.""Employees"" ADD COLUMN IF NOT EXISTS ""HasSpouse"" boolean NOT NULL DEFAULT false;
            ALTER TABLE hr.""Employees"" ADD COLUMN IF NOT EXISTS ""ChildrenCount"" integer NOT NULL DEFAULT 0;
            ALTER TABLE hr.""Employees"" ADD COLUMN IF NOT EXISTS ""PartTime"" boolean NOT NULL DEFAULT false;
            ALTER TABLE hr.""Employees"" ADD COLUMN IF NOT EXISTS ""WeeklyHours"" numeric(5,2);

            CREATE TABLE IF NOT EXISTS hr.""PayrollEmployerSettings"" (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""IsMiPyme"" boolean NOT NULL DEFAULT true,
                ""IsCommerceOrServices"" boolean NOT NULL DEFAULT true,
                ""ActivityCode"" integer,
                ""ArtInsurer"" character varying(120),
                ""ArtContractNumber"" character varying(60),
                ""ArtVariablePercent"" numeric(9,4) NOT NULL DEFAULT 0,
                ""ArtFixedAmount"" numeric(18,2) NOT NULL DEFAULT 0,
                ""LifeInsurancePremium"" numeric(18,2) NOT NULL DEFAULT 0,
                ""FalId"" character varying(60),
                ""UpdatedAtUtc"" timestamp with time zone NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS ""IX_PayrollEmployerSettings_Tenant"" ON hr.""PayrollEmployerSettings"" (""TenantId"");

            CREATE TABLE IF NOT EXISTS hr.""PayrollLegalParameters"" (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid,
                ""Key"" character varying(60) NOT NULL,
                ""ValidFrom"" timestamp with time zone NOT NULL,
                ""Value"" numeric(18,4) NOT NULL,
                ""Norm"" character varying(160) NOT NULL,
                ""CreatedAtUtc"" timestamp with time zone NOT NULL
            );
            CREATE INDEX IF NOT EXISTS ""IX_PayrollLegalParameters_Key"" ON hr.""PayrollLegalParameters"" (""TenantId"", ""Key"", ""ValidFrom"");

            ALTER TABLE hr.""Employees"" ADD COLUMN IF NOT EXISTS ""AgreementId"" uuid;
            ALTER TABLE hr.""Employees"" ADD COLUMN IF NOT EXISTS ""AgreementCategoryId"" uuid;
            ALTER TABLE hr.""Employees"" ADD COLUMN IF NOT EXISTS ""AgreementZone"" character varying(20);
            ALTER TABLE hr.""Employees"" ADD COLUMN IF NOT EXISTS ""AgreementFlags"" character varying(300);

            CREATE TABLE IF NOT EXISTS hr.""CollectiveAgreements"" (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""Code"" character varying(30) NOT NULL,
                ""Name"" character varying(160) NOT NULL,
                ""Union"" character varying(120) NOT NULL DEFAULT '',
                ""HourDivisor"" numeric(9,2) NOT NULL DEFAULT 200,
                ""Zones"" character varying(120) NOT NULL DEFAULT '',
                ""Notes"" character varying(1000),
                ""CreatedAtUtc"" timestamp with time zone NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS ""IX_CollectiveAgreements_Tenant_Code"" ON hr.""CollectiveAgreements"" (""TenantId"", ""Code"");

            CREATE TABLE IF NOT EXISTS hr.""AgreementCategories"" (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""AgreementId"" uuid NOT NULL REFERENCES hr.""CollectiveAgreements""(""Id"") ON DELETE CASCADE,
                ""Group"" character varying(120) NOT NULL DEFAULT '',
                ""Name"" character varying(160) NOT NULL,
                ""SortOrder"" integer NOT NULL DEFAULT 0
            );
            CREATE UNIQUE INDEX IF NOT EXISTS ""IX_AgreementCategories_Name"" ON hr.""AgreementCategories"" (""AgreementId"", ""Name"");

            CREATE TABLE IF NOT EXISTS hr.""AgreementScales"" (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""AgreementId"" uuid NOT NULL REFERENCES hr.""CollectiveAgreements""(""Id"") ON DELETE CASCADE,
                ""CategoryId"" uuid NOT NULL REFERENCES hr.""AgreementCategories""(""Id"") ON DELETE CASCADE,
                ""Zone"" character varying(20) NOT NULL DEFAULT '',
                ""ValidFrom"" timestamp with time zone NOT NULL,
                ""Basic"" numeric(18,2) NOT NULL,
                ""NonRemunerative"" numeric(18,2) NOT NULL DEFAULT 0,
                ""Source"" character varying(300) NOT NULL DEFAULT ''
            );
            CREATE UNIQUE INDEX IF NOT EXISTS ""IX_AgreementScales_Key"" ON hr.""AgreementScales"" (""AgreementId"", ""CategoryId"", ""Zone"", ""ValidFrom"");

            CREATE TABLE IF NOT EXISTS hr.""AgreementRules"" (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""AgreementId"" uuid NOT NULL REFERENCES hr.""CollectiveAgreements""(""Id"") ON DELETE CASCADE,
                ""Type"" character varying(30) NOT NULL,
                ""Code"" character varying(20) NOT NULL,
                ""Name"" character varying(160) NOT NULL,
                ""Basis"" character varying(40) NOT NULL,
                ""Value"" numeric(18,4) NOT NULL,
                ""Remunerative"" boolean NOT NULL DEFAULT true,
                ""AppliesTo"" character varying(20) NOT NULL DEFAULT 'All',
                ""Zones"" character varying(120) NOT NULL DEFAULT '',
                ""Groups"" character varying(500) NOT NULL DEFAULT '',
                ""RequiresFlag"" character varying(60),
                ""SeniorityFromNextMonth"" boolean NOT NULL DEFAULT false,
                ""ValidFrom"" timestamp with time zone NOT NULL,
                ""ValidTo"" timestamp with time zone
            );
            CREATE INDEX IF NOT EXISTS ""IX_AgreementRules_Agreement"" ON hr.""AgreementRules"" (""AgreementId"", ""Type"");

            -- Liquidación anterior (inventaba sueldos), retirada en la nota 68: sus tablas se borran.
            DROP TABLE IF EXISTS hr.""PayrollSlipLines"";
            DROP TABLE IF EXISTS hr.""PayrollSlips"";
            DROP TABLE IF EXISTS hr.""PayrollPeriods"";
            DROP TABLE IF EXISTS hr.""PayrollConcepts"";

            CREATE TABLE IF NOT EXISTS hr.""PayrollRuns"" (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""Year"" integer NOT NULL,
                ""Month"" integer NOT NULL,
                ""Number"" integer NOT NULL DEFAULT 1,
                ""Kind"" character varying(20) NOT NULL,
                ""PaymentDate"" timestamp with time zone NOT NULL,
                ""Status"" character varying(20) NOT NULL,
                ""LastDepositPeriod"" character varying(7),
                ""LastDepositDate"" timestamp with time zone,
                ""LastDepositBank"" character varying(120),
                ""CalculatedAtUtc"" timestamp with time zone,
                ""ClosedAtUtc"" timestamp with time zone,
                ""ClosedBy"" character varying(160),
                ""CreatedAtUtc"" timestamp with time zone NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS ""IX_PayrollRuns_Period"" ON hr.""PayrollRuns"" (""TenantId"", ""Year"", ""Month"", ""Number"");

            CREATE TABLE IF NOT EXISTS hr.""PayrollNovelties"" (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""RunId"" uuid NOT NULL REFERENCES hr.""PayrollRuns""(""Id"") ON DELETE CASCADE,
                ""EmployeeId"" uuid NOT NULL,
                ""Kind"" character varying(40) NOT NULL,
                ""Quantity"" numeric(9,2) NOT NULL DEFAULT 0,
                ""Amount"" numeric(18,2) NOT NULL DEFAULT 0,
                ""Description"" character varying(200)
            );
            CREATE INDEX IF NOT EXISTS ""IX_PayrollNovelties_Run"" ON hr.""PayrollNovelties"" (""RunId"", ""EmployeeId"");

            CREATE TABLE IF NOT EXISTS hr.""Payslips"" (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""RunId"" uuid NOT NULL REFERENCES hr.""PayrollRuns""(""Id"") ON DELETE CASCADE,
                ""EmployeeId"" uuid NOT NULL,
                ""EmployeeName"" character varying(250) NOT NULL,
                ""Cuil"" character varying(30) NOT NULL DEFAULT '',
                ""FileNumber"" character varying(40) NOT NULL DEFAULT '',
                ""Agreement"" character varying(160) NOT NULL DEFAULT '',
                ""Category"" character varying(160) NOT NULL DEFAULT '',
                ""HireDate"" timestamp with time zone NOT NULL,
                ""AssignedSalary"" numeric(18,2) NOT NULL,
                ""DaysWorked"" numeric(5,2) NOT NULL,
                ""Remunerative"" numeric(18,2) NOT NULL,
                ""NonRemunerative"" numeric(18,2) NOT NULL,
                ""Deductions"" numeric(18,2) NOT NULL,
                ""Net"" numeric(18,2) NOT NULL,
                ""ContributionsBase"" numeric(18,2) NOT NULL,
                ""EmployeeContributionsBase"" numeric(18,2) NOT NULL,
                ""EmployeeSocialSecurity"" numeric(18,2) NOT NULL,
                ""UnionDeductions"" numeric(18,2) NOT NULL,
                ""Advances"" numeric(18,2) NOT NULL,
                ""Garnishments"" numeric(18,2) NOT NULL,
                ""OtherDeductions"" numeric(18,2) NOT NULL,
                ""EmployerSocialSecurity"" numeric(18,2) NOT NULL,
                ""Fal"" numeric(18,2) NOT NULL,
                ""EmployerHealth"" numeric(18,2) NOT NULL,
                ""Art"" numeric(18,2) NOT NULL,
                ""LifeInsurance"" numeric(18,2) NOT NULL,
                ""AgreementContributions"" numeric(18,2) NOT NULL,
                ""Warnings"" character varying(4000),
                ""ContentHash"" character varying(64),
                ""SignedAtUtc"" timestamp with time zone,
                ""CreatedAtUtc"" timestamp with time zone NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS ""IX_Payslips_Run_Employee"" ON hr.""Payslips"" (""RunId"", ""EmployeeId"");

            CREATE TABLE IF NOT EXISTS hr.""PayslipLines"" (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""PayslipId"" uuid NOT NULL REFERENCES hr.""Payslips""(""Id"") ON DELETE CASCADE,
                ""Order"" integer NOT NULL,
                ""Code"" character varying(20) NOT NULL,
                ""Name"" character varying(200) NOT NULL,
                ""Kind"" character varying(20) NOT NULL,
                ""Quantity"" numeric(9,2) NOT NULL DEFAULT 0,
                ""Amount"" numeric(18,2) NOT NULL,
                ""Detail"" character varying(300)
            );

            CREATE TABLE IF NOT EXISTS hr.""VacationLeaves"" (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""EmployeeId"" uuid NOT NULL REFERENCES hr.""Employees""(""Id"") ON DELETE CASCADE,
                ""Year"" integer NOT NULL,
                ""StartDate"" timestamp with time zone NOT NULL,
                ""Days"" integer NOT NULL,
                ""Notes"" character varying(300),
                ""CreatedAtUtc"" timestamp with time zone NOT NULL
            );
            CREATE INDEX IF NOT EXISTS ""IX_VacationLeaves_Employee_Year"" ON hr.""VacationLeaves"" (""TenantId"", ""EmployeeId"", ""Year"");

            ALTER TABLE hr.""Payslips"" ADD COLUMN IF NOT EXISTS ""Detraction"" numeric(18,2) NOT NULL DEFAULT 0;
            ALTER TABLE hr.""CollectiveAgreements"" ADD COLUMN IF NOT EXISTS ""SeveranceCap"" numeric(18,2);
            ALTER TABLE hr.""CollectiveAgreements"" ADD COLUMN IF NOT EXISTS ""SeveranceCapSource"" character varying(300);
            ALTER TABLE hr.""PayrollRuns"" ADD COLUMN IF NOT EXISTS ""EmployeeId"" uuid;
            ALTER TABLE hr.""PayrollRuns"" ADD COLUMN IF NOT EXISTS ""TerminationCause"" character varying(40);
            ALTER TABLE hr.""PayrollRuns"" ADD COLUMN IF NOT EXISTS ""NoticeGiven"" boolean NOT NULL DEFAULT false;
            ALTER TABLE hr.""PayrollRuns"" ADD COLUMN IF NOT EXISTS ""AgreedAmount"" numeric(18,2) NOT NULL DEFAULT 0;
            ALTER TABLE hr.""PayrollRuns"" ADD COLUMN IF NOT EXISTS ""PriorBestSalary"" numeric(18,2) NOT NULL DEFAULT 0;
            CREATE TABLE IF NOT EXISTS hr.""PayrollConceptMappings"" (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""Code"" character varying(10) NOT NULL,
                ""ArcaCode"" character varying(6) NOT NULL,
                ""UpdatedAtUtc"" timestamp with time zone NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS ""IX_PayrollConceptMappings_Code"" ON hr.""PayrollConceptMappings"" (""TenantId"", ""Code"");
        ", ct);
        await Payroll.PayrollLegalSeed.EnsureAsync(this, ct);
    }
}

public static class HumanResourcesModule
{
    public static IServiceCollection AddHumanResourcesModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddTenantDbContext<HumanResourcesDbContext>(HumanResourcesDbContext.Schema);
        services.TryAddSingleton(TimeProvider.System);
        services.AddSingleton<LealControl.BuildingBlocks.Notices.INoticeProvider, CompanyDocumentNotices>();
        services.AddScoped<LealControl.Modules.Accounting.Contracts.Posting.IAccountingDocumentSource, Payroll.PayrollAccountingSource>();

        return services;
    }

    public static IEndpointRouteBuilder MapHumanResourcesModule(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/hr").WithTags("HumanResources");
        group.MapCompanyDocuments();
        group.MapHrAreas();
        group.MapPlantAccessPacket();

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
            if (Payroll.EmployeeRules.Validate(body) is { } invalid) return Results.BadRequest(new { message = invalid });
            body.Id = Guid.NewGuid();
            body.TenantId = tenantId;
            body.CreatedAtUtc = DateTime.UtcNow;
            if (!body.PartTime) body.WeeklyHours = null;
            body.AgreementFlags = Payroll.EmployeeRules.CleanFlags(body.AgreementFlags);
            if (await Payroll.EmployeeRules.ValidateAgreementAsync(db, tenantId, body, ct) is { } badAgreement)
                return Results.BadRequest(new { message = badAgreement });

            db.Employees.Add(body);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/hr/employees/{body.Id}", body);
        });

        group.MapPut("/employees/{id:guid}", async (Guid id, Employee body, HttpContext http, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var emp = await db.Employees.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            if (emp is null) return Results.NotFound("Empleado no encontrado");
            if (Payroll.EmployeeRules.Validate(body) is { } invalid) return Results.BadRequest(new { message = invalid });

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
            emp.IsUnionMember = body.IsUnionMember;
            emp.SocialSecuritySituation = body.SocialSecuritySituation;
            emp.SocialSecurityCondition = body.SocialSecurityCondition;
            emp.SocialSecurityActivity = body.SocialSecurityActivity;
            emp.ContractModalityCode = body.ContractModalityCode;
            emp.CasualtyCode = body.CasualtyCode;
            emp.LocalityCode = string.IsNullOrWhiteSpace(body.LocalityCode) ? null : body.LocalityCode.Trim();
            emp.HealthInsuranceCode = string.IsNullOrWhiteSpace(body.HealthInsuranceCode) ? null : body.HealthInsuranceCode.Trim();
            emp.HealthInsuranceAdherents = body.HealthInsuranceAdherents;
            emp.HasSpouse = body.HasSpouse;
            emp.ChildrenCount = body.ChildrenCount;
            emp.PartTime = body.PartTime;
            emp.WeeklyHours = body.PartTime ? body.WeeklyHours : null;
            emp.AgreementId = body.AgreementId;
            emp.AgreementCategoryId = body.AgreementId is null ? null : body.AgreementCategoryId;
            emp.AgreementZone = body.AgreementId is null ? null : body.AgreementZone;
            emp.AgreementFlags = Payroll.EmployeeRules.CleanFlags(body.AgreementFlags);
            if (await Payroll.EmployeeRules.ValidateAgreementAsync(db, tenantId, emp, ct) is { } badAgreement)
                return Results.BadRequest(new { message = badAgreement });
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
            // El archivo solo se carga por su endpoint.
            (body.FileStorageKey, body.FileName, body.FileContentType) = (null, null, null);

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

        group.MapPost("/manuals/{id:guid}/file", async (Guid id, IFormFile? file, HumanResourcesDbContext db, ITenantContext tenant, LealControl.BuildingBlocks.Storage.IFileStorage storage, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var manual = await db.ProcedureManuals.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            if (manual is null) return Results.NotFound(new { detail = "Manual no encontrado." });
            if (file is null || file.Length == 0) return Results.BadRequest(new { detail = "Elegí un archivo." });
            if (file.Length > 25 * 1024 * 1024) return Results.BadRequest(new { detail = "El archivo supera los 25 MB." });
            var type = file.ContentType?.ToLowerInvariant() ?? "";
            string[] allowed = ["application/pdf", "image/jpeg", "image/png", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
            if (!allowed.Contains(type)) return Results.BadRequest(new { detail = "Solo PDF, Word, JPG o PNG." });
            await using var stream = file.OpenReadStream();
            var stored = await storage.SaveAsync("hr", tenantId, file.FileName, type, stream, ct);
            (manual.FileStorageKey, manual.FileName, manual.FileContentType) = (stored.StorageKey, System.IO.Path.GetFileName(file.FileName), type);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { fileName = manual.FileName });
        }).DisableAntiforgery();

        group.MapGet("/manuals/{id:guid}/file", async (Guid id, HumanResourcesDbContext db, ITenantContext tenant, LealControl.BuildingBlocks.Storage.IFileStorage storage, CancellationToken ct) =>
        {
            var manual = await db.ProcedureManuals.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenant.TenantId.Value, ct);
            if (manual?.FileStorageKey is null) return Results.NotFound(new { detail = "No tiene archivo cargado." });
            var content = await storage.OpenReadAsync(manual.FileStorageKey, ct);
            return content is null ? Results.NotFound(new { detail = "No se encontró el archivo." }) : Results.File(content.Stream, manual.FileContentType ?? content.ContentType, manual.FileName ?? content.FileName);
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

        Payroll.PayrollConfigurationEndpoints.MapPayrollConfigurationEndpoints(group);
        Payroll.AgreementEndpoints.MapAgreementEndpoints(group);
        Payroll.PayrollRunEndpoints.MapPayrollRunEndpoints(group);
        Payroll.VacationEndpoints.MapVacationEndpoints(group);
        Payroll.LsdEndpoints.MapLsdEndpoints(group);

        return endpoints;
    }
}
