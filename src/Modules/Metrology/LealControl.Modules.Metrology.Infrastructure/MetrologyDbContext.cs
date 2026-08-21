using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Tenancy;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Metrology.Infrastructure;

public sealed class MetrologyDbContext : DbContext
{
    public MetrologyDbContext(DbContextOptions<MetrologyDbContext> options) : base(options)
    {
    }

    public DbSet<MetrologyEquipment> Equipments => Set<MetrologyEquipment>();
    public DbSet<StandardWeight> StandardWeights => Set<StandardWeight>();
    public DbSet<CalibrationReport> CalibrationReports => Set<CalibrationReport>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<MetrologyEquipment>(b =>
        {
            b.ToTable("equipments", "metrology");
            b.HasKey(x => x.Id);
            b.Property(x => x.Code).HasMaxLength(32).IsRequired();
            b.Property(x => x.Description).HasMaxLength(200).IsRequired();
            b.Property(x => x.Brand).HasMaxLength(100);
            b.Property(x => x.Model).HasMaxLength(100);
            b.Property(x => x.SerialNumber).HasMaxLength(100);
            b.Property(x => x.CustomerName).HasMaxLength(160);
            b.Property(x => x.Location).HasMaxLength(200);
            b.Property(x => x.Unit).HasMaxLength(10).HasDefaultValue("kg");
            b.Property(x => x.AccuracyClass).HasMaxLength(10).HasDefaultValue("III");
            b.Property(x => x.IndicationType).HasMaxLength(32).HasDefaultValue("Digital");
            b.Property(x => x.Status).HasMaxLength(32).HasDefaultValue("Active");
            b.Property(x => x.TenantId).HasConversion(v => v.Value, v => new TenantId(v));
            b.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            b.HasIndex(x => new { x.TenantId, x.CustomerId });
        });

        modelBuilder.Entity<StandardWeight>(b =>
        {
            b.ToTable("standard_weights", "metrology");
            b.HasKey(x => x.Id);
            b.Property(x => x.Code).HasMaxLength(32).IsRequired();
            b.Property(x => x.SerialNumber).HasMaxLength(100);
            b.Property(x => x.Unit).HasMaxLength(10).HasDefaultValue("kg");
            b.Property(x => x.AccuracyClass).HasMaxLength(10).HasDefaultValue("M1");
            b.Property(x => x.Material).HasMaxLength(64).HasDefaultValue("Hierro Fundido");
            b.Property(x => x.CertificateNumber).HasMaxLength(100);
            b.Property(x => x.TraceabilityLab).HasMaxLength(160).HasDefaultValue("INTI - Metrología Legal");
            b.Property(x => x.Status).HasMaxLength(32).HasDefaultValue("Valid");
            b.Property(x => x.TenantId).HasConversion(v => v.Value, v => new TenantId(v));
            b.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
        });

        modelBuilder.Entity<CalibrationReport>(b =>
        {
            b.ToTable("calibration_reports", "metrology");
            b.HasKey(x => x.Id);
            b.Property(x => x.ReportNumber).HasMaxLength(32).IsRequired();
            b.Property(x => x.CertificateType).HasMaxLength(64).HasDefaultValue("Ensayo y Calibración");
            b.Property(x => x.NormativeApplied).HasMaxLength(128).HasDefaultValue("Resolución 67/2025 (OIML R 76-1)");
            b.Property(x => x.EquipmentCode).HasMaxLength(32).IsRequired();
            b.Property(x => x.EquipmentDescription).HasMaxLength(200);
            b.Property(x => x.CustomerName).HasMaxLength(160);
            b.Property(x => x.CustomerAddress).HasMaxLength(255);
            b.Property(x => x.CustomerCuit).HasMaxLength(32);
            b.Property(x => x.Location).HasMaxLength(200);
            b.Property(x => x.PerformedBy).HasMaxLength(128);
            b.Property(x => x.Result).HasMaxLength(32).HasDefaultValue("Apto");
            b.Property(x => x.Status).HasMaxLength(32).HasDefaultValue("Issued");
            b.Property(x => x.TenantId).HasConversion(v => v.Value, v => new TenantId(v));
            b.HasIndex(x => new { x.TenantId, x.ReportNumber }).IsUnique();
            b.HasIndex(x => new { x.TenantId, x.EquipmentId });
            b.HasIndex(x => new { x.TenantId, x.CalibrationDate });
        });
    }

    public async Task EnsureMetrologyTablesAsync(CancellationToken ct = default)
    {
        try
        {
            await Database.ExecuteSqlRawAsync(@"
                CREATE SCHEMA IF NOT EXISTS metrology;

                CREATE TABLE IF NOT EXISTS metrology.equipments (
                    ""Id"" uuid NOT NULL PRIMARY KEY,
                    ""TenantId"" uuid NOT NULL,
                    ""Code"" character varying(32) NOT NULL,
                    ""Description"" character varying(200) NOT NULL,
                    ""Brand"" character varying(100),
                    ""Model"" character varying(100),
                    ""SerialNumber"" character varying(100),
                    ""CustomerId"" uuid,
                    ""CustomerName"" character varying(160),
                    ""Location"" character varying(200),
                    ""MaxCapacity"" numeric(18,4) NOT NULL DEFAULT 0,
                    ""MinCapacity"" numeric(18,4) NOT NULL DEFAULT 0,
                    ""DivisionD"" numeric(18,4) NOT NULL DEFAULT 0,
                    ""VerificationIntervalE"" numeric(18,4) NOT NULL DEFAULT 0,
                    ""Unit"" character varying(10) NOT NULL DEFAULT 'kg',
                    ""AccuracyClass"" character varying(10) NOT NULL DEFAULT 'III',
                    ""IndicationType"" character varying(32) NOT NULL DEFAULT 'Digital',
                    ""LoadCellsCount"" integer NOT NULL DEFAULT 6,
                    ""HasTare"" boolean NOT NULL DEFAULT true,
                    ""Status"" character varying(32) NOT NULL DEFAULT 'Active',
                    ""LastCalibrationDate"" timestamp with time zone,
                    ""NextCalibrationDate"" timestamp with time zone,
                    ""Notes"" text,
                    ""CreatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now()
                );
                CREATE UNIQUE INDEX IF NOT EXISTS ""IX_equipments_Tenant_Code"" ON metrology.equipments (""TenantId"", ""Code"");
                CREATE INDEX IF NOT EXISTS ""IX_equipments_Tenant_Customer"" ON metrology.equipments (""TenantId"", ""CustomerId"");

                CREATE TABLE IF NOT EXISTS metrology.standard_weights (
                    ""Id"" uuid NOT NULL PRIMARY KEY,
                    ""TenantId"" uuid NOT NULL,
                    ""Code"" character varying(32) NOT NULL,
                    ""SerialNumber"" character varying(100),
                    ""NominalValue"" numeric(18,4) NOT NULL DEFAULT 0,
                    ""Unit"" character varying(10) NOT NULL DEFAULT 'kg',
                    ""AccuracyClass"" character varying(10) NOT NULL DEFAULT 'M1',
                    ""Material"" character varying(64) NOT NULL DEFAULT 'Hierro Fundido',
                    ""ConventionalMassCorrection"" numeric(18,6) NOT NULL DEFAULT 0,
                    ""Uncertainty"" numeric(18,6) NOT NULL DEFAULT 0,
                    ""CertificateNumber"" character varying(100),
                    ""TraceabilityLab"" character varying(160) NOT NULL DEFAULT 'INTI - Metrología Legal',
                    ""CalibrationDate"" timestamp with time zone,
                    ""ExpirationDate"" timestamp with time zone,
                    ""Status"" character varying(32) NOT NULL DEFAULT 'Valid',
                    ""CreatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now()
                );
                CREATE UNIQUE INDEX IF NOT EXISTS ""IX_weights_Tenant_Code"" ON metrology.standard_weights (""TenantId"", ""Code"");

                CREATE TABLE IF NOT EXISTS metrology.calibration_reports (
                    ""Id"" uuid NOT NULL PRIMARY KEY,
                    ""TenantId"" uuid NOT NULL,
                    ""ReportNumber"" character varying(32) NOT NULL,
                    ""CertificateType"" character varying(64) NOT NULL DEFAULT 'Ensayo y Calibración',
                    ""NormativeApplied"" character varying(128) NOT NULL DEFAULT 'Resolución 67/2025 (OIML R 76-1)',
                    ""EquipmentId"" uuid NOT NULL,
                    ""EquipmentCode"" character varying(32) NOT NULL,
                    ""EquipmentDescription"" character varying(200),
                    ""CustomerId"" uuid,
                    ""CustomerName"" character varying(160),
                    ""CustomerAddress"" character varying(255),
                    ""CustomerCuit"" character varying(32),
                    ""Location"" character varying(200),
                    ""CalibrationDate"" timestamp with time zone NOT NULL,
                    ""NextCalibrationDate"" timestamp with time zone,
                    ""PerformedBy"" character varying(128),
                    ""AmbientTemperature"" numeric(18,2) NOT NULL DEFAULT 20,
                    ""AmbientHumidity"" numeric(18,2) NOT NULL DEFAULT 50,
                    ""AtmosphericPressure"" numeric(18,2) NOT NULL DEFAULT 1013,
                    ""InitialInspectionPassed"" boolean NOT NULL DEFAULT true,
                    ""InspectionNotes"" text,
                    ""RepeatabilityDataJson"" text NOT NULL DEFAULT '[]',
                    ""EccentricityDataJson"" text NOT NULL DEFAULT '[]',
                    ""LinearityDataJson"" text NOT NULL DEFAULT '[]',
                    ""UncertaintyDataJson"" text NOT NULL DEFAULT '{}',
                    ""WeightsUsedJson"" text NOT NULL DEFAULT '[]',
                    ""ExpandedUncertainty"" numeric(18,6) NOT NULL DEFAULT 0,
                    ""Result"" character varying(32) NOT NULL DEFAULT 'Apto',
                    ""Observations"" text,
                    ""Status"" character varying(32) NOT NULL DEFAULT 'Issued',
                    ""CreatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now()
                );
                CREATE UNIQUE INDEX IF NOT EXISTS ""IX_reports_Tenant_Number"" ON metrology.calibration_reports (""TenantId"", ""ReportNumber"");
                CREATE INDEX IF NOT EXISTS ""IX_reports_Tenant_Date"" ON metrology.calibration_reports (""TenantId"", ""CalibrationDate"");
            ", ct);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[MetrologyDbContext] Error en EnsureMetrologyTablesAsync: {ex.Message}");
        }
    }

    public async Task SeedDefaultMetrologyDataAsync(TenantId tenantId, CancellationToken ct = default)
    {
        var hasWeights = await StandardWeights.AnyAsync(w => w.TenantId == tenantId, ct);
        if (!hasWeights)
        {
            var defaultWeights = new List<StandardWeight>
            {
                new(Guid.NewGuid(), tenantId, "P-1000-01", "INTI-2024-001", 1000, "kg", "M1", "Hierro Fundido", 0.000m, 0.020m, "INTI-SAC-2024-9981", "INTI Centro de Metrología", DateTime.UtcNow.AddMonths(-3), DateTime.UtcNow.AddMonths(9)),
                new(Guid.NewGuid(), tenantId, "P-1000-02", "INTI-2024-002", 1000, "kg", "M1", "Hierro Fundido", 0.005m, 0.020m, "INTI-SAC-2024-9982", "INTI Centro de Metrología", DateTime.UtcNow.AddMonths(-3), DateTime.UtcNow.AddMonths(9)),
                new(Guid.NewGuid(), tenantId, "P-500-01", "INTI-2024-003", 500, "kg", "M1", "Hierro Fundido", -0.002m, 0.010m, "INTI-SAC-2024-9983", "INTI Centro de Metrología", DateTime.UtcNow.AddMonths(-3), DateTime.UtcNow.AddMonths(9)),
                new(Guid.NewGuid(), tenantId, "P-500-02", "INTI-2024-004", 500, "kg", "M1", "Hierro Fundido", 0.001m, 0.010m, "INTI-SAC-2024-9984", "INTI Centro de Metrología", DateTime.UtcNow.AddMonths(-3), DateTime.UtcNow.AddMonths(9)),
                new(Guid.NewGuid(), tenantId, "JGO-F1-01", "SAC-2024-110", 1, "kg", "F1", "Acero Inoxidable", 0.00002m, 0.0001m, "SAC-LAB-2024-4412", "Laboratorio Acreditado SAC", DateTime.UtcNow.AddMonths(-5), DateTime.UtcNow.AddMonths(7)),
                new(Guid.NewGuid(), tenantId, "JGO-M1-FRAC", "INTI-2024-880", 20, "kg", "M1", "Hierro / Latón", 0.0001m, 0.001m, "INTI-SAC-2024-1102", "INTI Centro de Metrología", DateTime.UtcNow.AddMonths(-2), DateTime.UtcNow.AddMonths(10))
            };

            StandardWeights.AddRange(defaultWeights);
        }

        var hasEquipments = await Equipments.AnyAsync(e => e.TenantId == tenantId, ct);
        if (!hasEquipments)
        {
            var defaultEquipments = new List<MetrologyEquipment>
            {
                new(Guid.NewGuid(), tenantId, "BAL-CAM-01", "Balanza Camionera Electrónica de 80t", "Systel / Toledo", "TruckMaster 80T", "SN-2024-88912", null, "Acopio Cereales Los Molinos S.A.", "Planta 1 - Entrada Principal", 80000, 400, 20, 20, "kg", "III", "Digital", 6, true),
                new(Guid.NewGuid(), tenantId, "BAL-IND-02", "Balanza de Plataforma Industrial 3000 kg", "Kretz", "Plat 3000", "KRZ-99124", null, "Frigorífico Regional S.R.L.", "Sector Desposte y Empaque", 3000, 20, 1, 1, "kg", "III", "Digital", 4, true),
                new(Guid.NewGuid(), tenantId, "BAL-LAB-03", "Balanza de Precisión Analítica 220g", "Ohaus", "Explorer Pro", "OH-882194", null, "Laboratorio Agropecuario Central", "Sector Ensayos Físico-Químicos", 0.220m, 0.001m, 0.0001m, 0.001m, "g", "I", "Digital", 1, true)
            };

            Equipments.AddRange(defaultEquipments);
        }

        await SaveChangesAsync(ct);
    }
}
