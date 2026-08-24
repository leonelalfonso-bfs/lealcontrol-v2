using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Tenancy;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Metrology.Infrastructure;

public sealed class MetrologyDbContext : DbContext
{
    public DbSet<MetrologyEquipment> Equipments => Set<MetrologyEquipment>();
    public DbSet<StandardWeight> StandardWeights => Set<StandardWeight>();
    public DbSet<CalibrationReport> CalibrationReports => Set<CalibrationReport>();

    public MetrologyDbContext(DbContextOptions<MetrologyDbContext> options) : base(options)
    {
    }

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
            b.Property(x => x.ApplicableStandard).HasMaxLength(60).HasDefaultValue("Res25_2025");
            b.Property(x => x.ApprovalCode).HasMaxLength(120).HasDefaultValue(string.Empty);
            b.Property(x => x.PlatformType).HasMaxLength(60).HasDefaultValue("TruckScale");

            // Plataforma
            b.Property(x => x.PlatformApprovalCode).HasMaxLength(120).HasDefaultValue(string.Empty);
            b.Property(x => x.PlatformApprovalNumber).HasMaxLength(120).HasDefaultValue(string.Empty);
            b.Property(x => x.PlatformDimensions).HasMaxLength(80).HasDefaultValue(string.Empty);

            // Indicador 1
            b.Property(x => x.Indicator1Brand).HasMaxLength(100).HasDefaultValue(string.Empty);
            b.Property(x => x.Indicator1Model).HasMaxLength(100).HasDefaultValue(string.Empty);
            b.Property(x => x.Indicator1SerialNumber).HasMaxLength(100).HasDefaultValue(string.Empty);
            b.Property(x => x.Indicator1ApprovalCode).HasMaxLength(120).HasDefaultValue(string.Empty);
            b.Property(x => x.Indicator1ApprovalNumber).HasMaxLength(120).HasDefaultValue(string.Empty);
            b.Property(x => x.Indicator1Type).HasMaxLength(60).HasDefaultValue("Digital");

            // Indicador 2
            b.Property(x => x.HasSecondaryIndicator).HasDefaultValue(false);
            b.Property(x => x.Indicator2Brand).HasMaxLength(100).HasDefaultValue(string.Empty);
            b.Property(x => x.Indicator2Model).HasMaxLength(100).HasDefaultValue(string.Empty);
            b.Property(x => x.Indicator2SerialNumber).HasMaxLength(100).HasDefaultValue(string.Empty);
            b.Property(x => x.Indicator2ApprovalCode).HasMaxLength(120).HasDefaultValue(string.Empty);
            b.Property(x => x.Indicator2ApprovalNumber).HasMaxLength(120).HasDefaultValue(string.Empty);
            b.Property(x => x.Indicator2Type).HasMaxLength(60).HasDefaultValue(string.Empty);

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
            b.Property(x => x.CertificateNumber).HasMaxLength(64).IsRequired();
            b.Property(x => x.EquipmentCode).HasMaxLength(32);
            b.Property(x => x.CustomerName).HasMaxLength(160);
            b.Property(x => x.Location).HasMaxLength(200);
            b.Property(x => x.StandardApplied).HasMaxLength(64).HasDefaultValue("Res25_2025");
            b.Property(x => x.CalibrationType).HasMaxLength(32).HasDefaultValue("InService");
            b.Property(x => x.PerformedBy).HasMaxLength(120);
            b.Property(x => x.ApprovedBy).HasMaxLength(120);
            b.Property(x => x.Verdict).HasMaxLength(32).HasDefaultValue("Approved");
            b.Property(x => x.TenantId).HasConversion(v => v.Value, v => new TenantId(v));
            b.HasIndex(x => new { x.TenantId, x.CertificateNumber }).IsUnique();
            b.HasIndex(x => new { x.TenantId, x.EquipmentId });
            b.HasIndex(x => new { x.TenantId, x.CalibrationDate });
        });
    }

    public async Task EnsureMetrologyTablesAsync(CancellationToken ct = default)
    {
        var statements = new[]
        {
            @"CREATE SCHEMA IF NOT EXISTS metrology;",

            @"CREATE TABLE IF NOT EXISTS metrology.equipments (
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
                ""ApplicableStandard"" character varying(60) NOT NULL DEFAULT 'Res25_2025',
                ""ApprovalCode"" character varying(120) NOT NULL DEFAULT '',
                ""PlatformType"" character varying(60) NOT NULL DEFAULT 'TruckScale',
                ""PlatformApprovalCode"" character varying(120) NOT NULL DEFAULT '',
                ""PlatformApprovalNumber"" character varying(120) NOT NULL DEFAULT '',
                ""PlatformApprovalDate"" timestamp with time zone,
                ""PlatformDimensions"" character varying(80) NOT NULL DEFAULT '',
                ""Indicator1Brand"" character varying(100) NOT NULL DEFAULT '',
                ""Indicator1Model"" character varying(100) NOT NULL DEFAULT '',
                ""Indicator1SerialNumber"" character varying(100) NOT NULL DEFAULT '',
                ""Indicator1ApprovalCode"" character varying(120) NOT NULL DEFAULT '',
                ""Indicator1ApprovalNumber"" character varying(120) NOT NULL DEFAULT '',
                ""Indicator1ApprovalDate"" timestamp with time zone,
                ""Indicator1Type"" character varying(60) NOT NULL DEFAULT 'Digital',
                ""HasSecondaryIndicator"" boolean NOT NULL DEFAULT false,
                ""Indicator2Brand"" character varying(100) NOT NULL DEFAULT '',
                ""Indicator2Model"" character varying(100) NOT NULL DEFAULT '',
                ""Indicator2SerialNumber"" character varying(100) NOT NULL DEFAULT '',
                ""Indicator2ApprovalCode"" character varying(120) NOT NULL DEFAULT '',
                ""Indicator2ApprovalNumber"" character varying(120) NOT NULL DEFAULT '',
                ""Indicator2ApprovalDate"" timestamp with time zone,
                ""Indicator2Type"" character varying(60) NOT NULL DEFAULT '',
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
            );",
            @"CREATE UNIQUE INDEX IF NOT EXISTS ""IX_equipments_Tenant_Code"" ON metrology.equipments (""TenantId"", ""Code"");",
            @"CREATE INDEX IF NOT EXISTS ""IX_equipments_Tenant_Customer"" ON metrology.equipments (""TenantId"", ""CustomerId"");",

            @"ALTER TABLE metrology.equipments ADD COLUMN IF NOT EXISTS ""ApplicableStandard"" character varying(60) NOT NULL DEFAULT 'Res25_2025';",
            @"ALTER TABLE metrology.equipments ADD COLUMN IF NOT EXISTS ""ApprovalCode"" character varying(120) NOT NULL DEFAULT '';",
            @"ALTER TABLE metrology.equipments ADD COLUMN IF NOT EXISTS ""PlatformType"" character varying(60) NOT NULL DEFAULT 'TruckScale';",
            @"ALTER TABLE metrology.equipments ADD COLUMN IF NOT EXISTS ""PlatformApprovalCode"" character varying(120) NOT NULL DEFAULT '';",
            @"ALTER TABLE metrology.equipments ADD COLUMN IF NOT EXISTS ""PlatformApprovalNumber"" character varying(120) NOT NULL DEFAULT '';",
            @"ALTER TABLE metrology.equipments ADD COLUMN IF NOT EXISTS ""PlatformApprovalDate"" timestamp with time zone;",
            @"ALTER TABLE metrology.equipments ADD COLUMN IF NOT EXISTS ""PlatformDimensions"" character varying(80) NOT NULL DEFAULT '';",
            @"ALTER TABLE metrology.equipments ADD COLUMN IF NOT EXISTS ""Indicator1Brand"" character varying(100) NOT NULL DEFAULT '';",
            @"ALTER TABLE metrology.equipments ADD COLUMN IF NOT EXISTS ""Indicator1Model"" character varying(100) NOT NULL DEFAULT '';",
            @"ALTER TABLE metrology.equipments ADD COLUMN IF NOT EXISTS ""Indicator1SerialNumber"" character varying(100) NOT NULL DEFAULT '';",
            @"ALTER TABLE metrology.equipments ADD COLUMN IF NOT EXISTS ""Indicator1ApprovalCode"" character varying(120) NOT NULL DEFAULT '';",
            @"ALTER TABLE metrology.equipments ADD COLUMN IF NOT EXISTS ""Indicator1ApprovalNumber"" character varying(120) NOT NULL DEFAULT '';",
            @"ALTER TABLE metrology.equipments ADD COLUMN IF NOT EXISTS ""Indicator1ApprovalDate"" timestamp with time zone;",
            @"ALTER TABLE metrology.equipments ADD COLUMN IF NOT EXISTS ""Indicator1Type"" character varying(60) NOT NULL DEFAULT 'Digital';",
            @"ALTER TABLE metrology.equipments ADD COLUMN IF NOT EXISTS ""HasSecondaryIndicator"" boolean NOT NULL DEFAULT false;",
            @"ALTER TABLE metrology.equipments ADD COLUMN IF NOT EXISTS ""Indicator2Brand"" character varying(100) NOT NULL DEFAULT '';",
            @"ALTER TABLE metrology.equipments ADD COLUMN IF NOT EXISTS ""Indicator2Model"" character varying(100) NOT NULL DEFAULT '';",
            @"ALTER TABLE metrology.equipments ADD COLUMN IF NOT EXISTS ""Indicator2SerialNumber"" character varying(100) NOT NULL DEFAULT '';",
            @"ALTER TABLE metrology.equipments ADD COLUMN IF NOT EXISTS ""Indicator2ApprovalCode"" character varying(120) NOT NULL DEFAULT '';",
            @"ALTER TABLE metrology.equipments ADD COLUMN IF NOT EXISTS ""Indicator2ApprovalNumber"" character varying(120) NOT NULL DEFAULT '';",
            @"ALTER TABLE metrology.equipments ADD COLUMN IF NOT EXISTS ""Indicator2ApprovalDate"" timestamp with time zone;",
            @"ALTER TABLE metrology.equipments ADD COLUMN IF NOT EXISTS ""Indicator2Type"" character varying(60) NOT NULL DEFAULT '';",

            @"CREATE TABLE IF NOT EXISTS metrology.standard_weights (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""Code"" character varying(32) NOT NULL,
                ""NormalizedId"" character varying(64) NOT NULL DEFAULT '',
                ""SerialNumber"" character varying(100),
                ""Manufacturer"" character varying(160) NOT NULL DEFAULT '',
                ""LotName"" character varying(160) NOT NULL DEFAULT '',
                ""NominalValue"" numeric(18,4) NOT NULL DEFAULT 0,
                ""Unit"" character varying(10) NOT NULL DEFAULT 'kg',
                ""AccuracyClass"" character varying(10) NOT NULL DEFAULT 'M1',
                ""Material"" character varying(64) NOT NULL DEFAULT 'Hierro Fundido',
                ""ErrorAsFound"" numeric(18,6),
                ""ConventionalMassCorrection"" numeric(18,6) NOT NULL DEFAULT 0,
                ""Uncertainty"" numeric(18,6) NOT NULL DEFAULT 0,
                ""UnitEc"" character varying(10) NOT NULL DEFAULT 'g',
                ""FactorK"" numeric(6,2) NOT NULL DEFAULT 2.0,
                ""CertificateNumber"" character varying(100),
                ""TraceabilityLab"" character varying(160) NOT NULL DEFAULT 'Laboratorio Acreditado',
                ""CalibrationDate"" timestamp with time zone,
                ""ExpirationDate"" timestamp with time zone,
                ""Status"" character varying(32) NOT NULL DEFAULT 'Valid',
                ""Notes"" text,
                ""CreatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now()
            );",
            @"CREATE UNIQUE INDEX IF NOT EXISTS ""IX_weights_Tenant_Code"" ON metrology.standard_weights (""TenantId"", ""Code"");",

            @"ALTER TABLE metrology.standard_weights ADD COLUMN IF NOT EXISTS ""NormalizedId"" character varying(64) NOT NULL DEFAULT '';",
            @"ALTER TABLE metrology.standard_weights ADD COLUMN IF NOT EXISTS ""Manufacturer"" character varying(160) NOT NULL DEFAULT '';",
            @"ALTER TABLE metrology.standard_weights ADD COLUMN IF NOT EXISTS ""LotName"" character varying(160) NOT NULL DEFAULT '';",
            @"ALTER TABLE metrology.standard_weights ADD COLUMN IF NOT EXISTS ""ErrorAsFound"" numeric(18,6);",
            @"ALTER TABLE metrology.standard_weights ADD COLUMN IF NOT EXISTS ""ConventionalMassCorrection"" numeric(18,6) NOT NULL DEFAULT 0;",
            @"ALTER TABLE metrology.standard_weights ADD COLUMN IF NOT EXISTS ""Uncertainty"" numeric(18,6) NOT NULL DEFAULT 0;",
            @"ALTER TABLE metrology.standard_weights ADD COLUMN IF NOT EXISTS ""UnitEc"" character varying(10) NOT NULL DEFAULT 'g';",
            @"ALTER TABLE metrology.standard_weights ADD COLUMN IF NOT EXISTS ""FactorK"" numeric(6,2) NOT NULL DEFAULT 2.0;",
            @"ALTER TABLE metrology.standard_weights ADD COLUMN IF NOT EXISTS ""Notes"" text;",

            @"CREATE TABLE IF NOT EXISTS metrology.calibration_reports (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""CertificateNumber"" character varying(64) NOT NULL,
                ""EquipmentId"" uuid NOT NULL,
                ""EquipmentCode"" character varying(32) NOT NULL,
                ""EquipmentDescription"" character varying(200) NOT NULL,
                ""CustomerId"" uuid,
                ""CustomerName"" character varying(160),
                ""Location"" character varying(200),
                ""StandardApplied"" character varying(64) NOT NULL DEFAULT 'Res25_2025',
                ""CalibrationType"" character varying(32) NOT NULL DEFAULT 'InService',
                ""CalibrationDate"" timestamp with time zone NOT NULL,
                ""ExpirationDate"" timestamp with time zone,
                ""TemperatureCelsius"" numeric(18,2) NOT NULL DEFAULT 20.0,
                ""RelativeHumidityPercent"" numeric(18,2) NOT NULL DEFAULT 50.0,
                ""AtmosphericPressureHpa"" numeric(18,2) NOT NULL DEFAULT 1013.25,
                ""PerformedBy"" character varying(120) NOT NULL,
                ""ApprovedBy"" character varying(120),
                ""Verdict"" character varying(32) NOT NULL DEFAULT 'Approved',
                ""MaxObservedError"" numeric(18,4) NOT NULL DEFAULT 0,
                ""MaxAllowedError"" numeric(18,4) NOT NULL DEFAULT 0,
                ""ExpandedUncertaintyK2"" numeric(18,4) NOT NULL DEFAULT 0,
                ""VisualInspectionJson"" text NOT NULL DEFAULT '{}',
                ""RepeatabilityTestJson"" text NOT NULL DEFAULT '[]',
                ""EccentricityTestJson"" text NOT NULL DEFAULT '[]',
                ""LinearityTestJson"" text NOT NULL DEFAULT '[]',
                ""WeightsUsedJson"" text NOT NULL DEFAULT '[]',
                ""Observations"" text,
                ""SealsPlaced"" character varying(250),
                ""CreatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now()
            );",
            @"CREATE UNIQUE INDEX IF NOT EXISTS ""IX_reports_Tenant_CertNumber"" ON metrology.calibration_reports (""TenantId"", ""CertificateNumber"");",
            @"CREATE INDEX IF NOT EXISTS ""IX_reports_Tenant_Equipment"" ON metrology.calibration_reports (""TenantId"", ""EquipmentId"");",
            @"CREATE INDEX IF NOT EXISTS ""IX_reports_Tenant_Date"" ON metrology.calibration_reports (""TenantId"", ""CalibrationDate"");"
        };

        foreach (var sql in statements)
        {
            try
            {
                await Database.ExecuteSqlRawAsync(sql, ct);
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[MetrologyDbContext] Notice on executing DDL statement: {ex.Message}");
            }
        }
    }
}
