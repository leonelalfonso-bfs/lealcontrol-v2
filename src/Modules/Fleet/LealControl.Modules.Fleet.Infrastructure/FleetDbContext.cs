using System;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Persistence;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Fleet.Infrastructure;

public sealed class FleetDbContext(DbContextOptions<FleetDbContext> options) : DbContext(options)
{
    public const string Schema = "fleet";
    public DbSet<Vehicle> Vehicles => Set<Vehicle>();
    public DbSet<VehicleDocument> VehicleDocuments => Set<VehicleDocument>();
    public DbSet<VehicleDriver> VehicleDrivers => Set<VehicleDriver>();
    public DbSet<VehicleMaintenance> VehicleMaintenances => Set<VehicleMaintenance>();
    public DbSet<VehicleFuelLog> VehicleFuelLogs => Set<VehicleFuelLog>();
    public DbSet<VehicleMeterReading> VehicleMeterReadings => Set<VehicleMeterReading>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.AddSearchTextFunctions();
        modelBuilder.HasDefaultSchema(Schema);

        modelBuilder.Entity<Vehicle>(b =>
        {
            b.ToTable("Vehicles");
            b.HasKey(x => x.Id);
            b.Property(x => x.Plate).HasMaxLength(30).IsRequired();
            b.Property(x => x.Brand).HasMaxLength(80).IsRequired();
            b.Property(x => x.Model).HasMaxLength(80).IsRequired();
            b.Property(x => x.PhotoPath).HasColumnType("text");
            b.Property(x => x.InternalCode).HasMaxLength(30);
            b.Property(x => x.MeterType).HasDefaultValue(MeterType.Kilometers);
            b.HasIndex(x => new { x.TenantId, x.Plate });
        });

        modelBuilder.Entity<VehicleMeterReading>(b =>
        {
            b.ToTable("VehicleMeterReadings");
            b.HasKey(x => x.Id);
            b.Property(x => x.Hours).HasPrecision(10, 2);
            b.Property(x => x.Note).HasMaxLength(300);
            b.Property(x => x.CreatedBy).HasMaxLength(140);
            b.HasIndex(x => new { x.TenantId, x.VehicleId, x.ReadAtUtc });
            b.HasOne<Vehicle>().WithMany().HasForeignKey(x => x.VehicleId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<VehicleDocument>(b =>
        {
            b.ToTable("VehicleDocuments");
            b.HasKey(x => x.Id);
            b.Property(x => x.Cost).HasPrecision(18, 2);
            b.HasIndex(x => new { x.TenantId, x.VehicleId, x.ExpirationDateUtc });
        });

        modelBuilder.Entity<VehicleDriver>(b =>
        {
            b.ToTable("VehicleDrivers");
            b.HasKey(x => x.Id);
            b.Property(x => x.FullName).HasMaxLength(140).IsRequired();
            b.Property(x => x.LicenseNumber).HasMaxLength(40).IsRequired();
            b.HasIndex(x => new { x.TenantId, x.DocumentNumber });
        });

        modelBuilder.Entity<VehicleMaintenance>(b =>
        {
            b.ToTable("VehicleMaintenances");
            b.HasKey(x => x.Id);
            b.Property(x => x.TotalCost).HasPrecision(18, 2);
            b.HasIndex(x => new { x.TenantId, x.VehicleId, x.ServiceDateUtc });
        });

        modelBuilder.Entity<VehicleFuelLog>(b =>
        {
            b.ToTable("VehicleFuelLogs");
            b.HasKey(x => x.Id);
            b.Property(x => x.Liters).HasPrecision(10, 2);
            b.Property(x => x.PricePerLiter).HasPrecision(18, 2);
            b.Property(x => x.TotalCost).HasPrecision(18, 2);
            b.Property(x => x.CalculatedKmPerLiter).HasPrecision(10, 2);
            b.HasIndex(x => new { x.TenantId, x.VehicleId, x.LogDateUtc });
        });
    }

    public Task EnsureFleetTablesAsync(CancellationToken ct = default) =>
        SchemaInitializationGate.RunOnceAsync(this, "fleet", EnsureFleetTablesCoreAsync);

    private async Task EnsureFleetTablesCoreAsync(CancellationToken ct = default)
    {
        var sql = @"
            CREATE SCHEMA IF NOT EXISTS fleet;

            CREATE TABLE IF NOT EXISTS fleet.""Vehicles"" (
                ""Id"" uuid PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""Plate"" character varying(30) NOT NULL,
                ""Brand"" character varying(80) NOT NULL,
                ""Model"" character varying(80) NOT NULL,
                ""Year"" integer NOT NULL DEFAULT 2026,
                ""Type"" integer NOT NULL DEFAULT 0,
                ""VinChassis"" character varying(60) NOT NULL DEFAULT '',
                ""EngineNumber"" character varying(60) NOT NULL DEFAULT '',
                ""CurrentKilometers"" integer NOT NULL DEFAULT 0,
                ""CurrentEngineHours"" numeric(10,2) NOT NULL DEFAULT 0,
                ""FuelType"" character varying(40) NOT NULL DEFAULT 'Diesel',
                ""Status"" integer NOT NULL DEFAULT 0,
                ""AssignedDriverId"" uuid,
                ""AssignedDriverName"" character varying(140),
                ""PhotoPath"" text,
                ""Notes"" text,
                ""CreatedAtUtc"" timestamp with time zone NOT NULL
            );

            CREATE TABLE IF NOT EXISTS fleet.""VehicleDocuments"" (
                ""Id"" uuid PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""VehicleId"" uuid NOT NULL REFERENCES fleet.""Vehicles""(""Id"") ON DELETE CASCADE,
                ""DocumentType"" integer NOT NULL DEFAULT 0,
                ""Title"" character varying(120) NOT NULL,
                ""PolicyOrDocNumber"" character varying(60) NOT NULL DEFAULT '',
                ""IssuerCompany"" character varying(120),
                ""IssueDateUtc"" timestamp with time zone NOT NULL,
                ""ExpirationDateUtc"" timestamp with time zone NOT NULL,
                ""Cost"" numeric(18,2) NOT NULL DEFAULT 0,
                ""AlertDaysBefore"" integer NOT NULL DEFAULT 30,
                ""FileAttachmentUrl"" text,
                ""IsActive"" boolean NOT NULL DEFAULT true,
                ""CreatedAtUtc"" timestamp with time zone NOT NULL
            );

            CREATE TABLE IF NOT EXISTS fleet.""VehicleDrivers"" (
                ""Id"" uuid PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""EmployeeId"" uuid,
                ""FullName"" character varying(140) NOT NULL,
                ""DocumentNumber"" character varying(40) NOT NULL DEFAULT '',
                ""Phone"" character varying(40) NOT NULL DEFAULT '',
                ""Email"" character varying(120) NOT NULL DEFAULT '',
                ""LicenseNumber"" character varying(40) NOT NULL DEFAULT '',
                ""LicenseCategory"" character varying(20) NOT NULL DEFAULT 'B1',
                ""LicenseExpirationUtc"" timestamp with time zone NOT NULL,
                ""LintiExpirationUtc"" timestamp with time zone,
                ""IsActive"" boolean NOT NULL DEFAULT true,
                ""Notes"" text,
                ""CreatedAtUtc"" timestamp with time zone NOT NULL
            );

            CREATE TABLE IF NOT EXISTS fleet.""VehicleMaintenances"" (
                ""Id"" uuid PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""VehicleId"" uuid NOT NULL REFERENCES fleet.""Vehicles""(""Id"") ON DELETE CASCADE,
                ""Type"" integer NOT NULL DEFAULT 0,
                ""Title"" character varying(160) NOT NULL,
                ""Description"" text NOT NULL DEFAULT '',
                ""KmAtService"" integer NOT NULL DEFAULT 0,
                ""ServiceDateUtc"" timestamp with time zone NOT NULL,
                ""WorkshopName"" character varying(120) NOT NULL DEFAULT 'Taller Propio',
                ""InvoiceReference"" character varying(60),
                ""TotalCost"" numeric(18,2) NOT NULL DEFAULT 0,
                ""NextServiceKm"" integer,
                ""NextServiceDateUtc"" timestamp with time zone,
                ""Status"" integer NOT NULL DEFAULT 2,
                ""CreatedAtUtc"" timestamp with time zone NOT NULL
            );

            CREATE TABLE IF NOT EXISTS fleet.""VehicleFuelLogs"" (
                ""Id"" uuid PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""VehicleId"" uuid NOT NULL REFERENCES fleet.""Vehicles""(""Id"") ON DELETE CASCADE,
                ""DriverId"" uuid,
                ""LogDateUtc"" timestamp with time zone NOT NULL,
                ""KilometersAtFueling"" integer NOT NULL DEFAULT 0,
                ""Liters"" numeric(10,2) NOT NULL DEFAULT 0,
                ""PricePerLiter"" numeric(18,2) NOT NULL DEFAULT 0,
                ""TotalCost"" numeric(18,2) NOT NULL DEFAULT 0,
                ""GasStation"" character varying(80) NOT NULL DEFAULT 'YPF',
                ""PaymentMethod"" character varying(80) NOT NULL DEFAULT 'YPF en Ruta',
                ""CalculatedKmPerLiter"" numeric(10,2),
                ""Notes"" text,
                ""CreatedAtUtc"" timestamp with time zone NOT NULL
            );
        ";

        await Database.ExecuteSqlRawAsync(sql, ct);

        await Database.ExecuteSqlRawAsync(@"
            ALTER TABLE fleet.""Vehicles"" ADD COLUMN IF NOT EXISTS ""InternalCode"" character varying(30);
            ALTER TABLE fleet.""Vehicles"" ADD COLUMN IF NOT EXISTS ""MeterType"" integer NOT NULL DEFAULT 0;
            -- Los autoelevadores se miden por horas (dato cargado antes de existir la columna).
            UPDATE fleet.""Vehicles"" SET ""MeterType"" = 1 WHERE ""Type"" = 4 AND ""MeterType"" = 0 AND ""CurrentKilometers"" = 0;

            CREATE TABLE IF NOT EXISTS fleet.""VehicleMeterReadings"" (
                ""Id"" uuid PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""VehicleId"" uuid NOT NULL REFERENCES fleet.""Vehicles""(""Id"") ON DELETE CASCADE,
                ""ReadAtUtc"" timestamp with time zone NOT NULL,
                ""Kilometers"" integer,
                ""Hours"" numeric(10,2),
                ""IsCorrection"" boolean NOT NULL DEFAULT false,
                ""Note"" character varying(300),
                ""CreatedBy"" character varying(140),
                ""CreatedAtUtc"" timestamp with time zone NOT NULL
            );
            CREATE INDEX IF NOT EXISTS ""IX_VehicleMeterReadings_Vehicle"" ON fleet.""VehicleMeterReadings"" (""TenantId"", ""VehicleId"", ""ReadAtUtc"");
            CREATE INDEX IF NOT EXISTS ""IX_VehicleDocuments_Vehicle"" ON fleet.""VehicleDocuments"" (""TenantId"", ""VehicleId"", ""DocumentType"", ""IsActive"");
        ", ct);

        // Patente y código únicos por empresa. Con datos viejos duplicados el índice no se puede
        // crear: el control igual lo hace la API y no se frena el resto del esquema.
        try
        {
            await Database.ExecuteSqlRawAsync(@"
                CREATE UNIQUE INDEX IF NOT EXISTS ""UX_Vehicles_Plate"" ON fleet.""Vehicles"" (""TenantId"", upper(""Plate"")) WHERE ""Plate"" <> '';
                CREATE UNIQUE INDEX IF NOT EXISTS ""UX_Vehicles_InternalCode"" ON fleet.""Vehicles"" (""TenantId"", upper(""InternalCode"")) WHERE ""InternalCode"" IS NOT NULL;
            ", ct);
        }
        catch (Npgsql.PostgresException ex) when (ex.SqlState == Npgsql.PostgresErrorCodes.UniqueViolation)
        {
        }
    }
}
