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

namespace LealControl.Modules.Fleet.Infrastructure;

public enum VehicleType { Pickup, Van, Truck, Car, Forklift, SemiTrailer }
public enum VehicleStatus { Active, InMaintenance, OutOfService, Sold }
public enum FleetDocType { VtvRto, InsurancePolicy, GreenCard, GncCard, Senasa, Ruta, Other }
public enum MaintenanceType { Preventive, Corrective, Urgent, Inspection }
public enum MaintenanceStatus { Scheduled, InProgress, Completed, Cancelled }

public sealed class Vehicle
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public string Plate { get; set; } = ""; // Patente / Dominio
    public string Brand { get; set; } = ""; // Toyota, Ford, VW, Scania
    public string Model { get; set; } = ""; // Hilux, Ranger, Amarok, 1114
    public int Year { get; set; } = DateTime.UtcNow.Year;
    public VehicleType Type { get; set; } = VehicleType.Pickup;
    public string VinChassis { get; set; } = "";
    public string EngineNumber { get; set; } = "";
    public int CurrentKilometers { get; set; }
    public decimal CurrentEngineHours { get; set; }
    public string FuelType { get; set; } = "Diesel"; // Diesel, Nafta, GNC, Electric
    public VehicleStatus Status { get; set; } = VehicleStatus.Active;
    public Guid? AssignedDriverId { get; set; }
    public string? AssignedDriverName { get; set; }
    public string? PhotoPath { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}

public sealed class VehicleDocument
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid VehicleId { get; set; }
    public FleetDocType DocumentType { get; set; } = FleetDocType.VtvRto;
    public string Title { get; set; } = "";
    public string PolicyOrDocNumber { get; set; } = "";
    public string? IssuerCompany { get; set; } // La Segunda, San Cristóbal, Taller VTV
    public DateTime IssueDateUtc { get; set; }
    public DateTime ExpirationDateUtc { get; set; }
    public decimal Cost { get; set; }
    public int AlertDaysBefore { get; set; } = 30;
    public string? FileAttachmentUrl { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; }
}

public sealed class VehicleDriver
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid? EmployeeId { get; set; }
    public string FullName { get; set; } = "";
    public string DocumentNumber { get; set; } = "";
    public string Phone { get; set; } = "";
    public string Email { get; set; } = "";
    public string LicenseNumber { get; set; } = "";
    public string LicenseCategory { get; set; } = "B1"; // B1, C, E1, E2
    public DateTime LicenseExpirationUtc { get; set; }
    public DateTime? LintiExpirationUtc { get; set; }
    public bool IsActive { get; set; } = true;
    public string? Notes { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}

public sealed class VehicleMaintenance
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid VehicleId { get; set; }
    public MaintenanceType Type { get; set; } = MaintenanceType.Preventive;
    public string Title { get; set; } = ""; // Cambio Aceite y Filtros 10.000 KM
    public string Description { get; set; } = "";
    public int KmAtService { get; set; }
    public DateTime ServiceDateUtc { get; set; }
    public string WorkshopName { get; set; } = "Taller Propio";
    public string? InvoiceReference { get; set; }
    public decimal TotalCost { get; set; }
    public int? NextServiceKm { get; set; }
    public DateTime? NextServiceDateUtc { get; set; }
    public MaintenanceStatus Status { get; set; } = MaintenanceStatus.Completed;
    public DateTime CreatedAtUtc { get; set; }
}

public sealed class VehicleFuelLog
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid VehicleId { get; set; }
    public Guid? DriverId { get; set; }
    public DateTime LogDateUtc { get; set; }
    public int KilometersAtFueling { get; set; }
    public decimal Liters { get; set; }
    public decimal PricePerLiter { get; set; }
    public decimal TotalCost { get; set; }
    public string GasStation { get; set; } = "YPF";
    public string PaymentMethod { get; set; } = "YPF en Ruta";
    public decimal? CalculatedKmPerLiter { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}

public sealed class FleetDbContext(DbContextOptions<FleetDbContext> options) : DbContext(options)
{
    public const string Schema = "fleet";
    public DbSet<Vehicle> Vehicles => Set<Vehicle>();
    public DbSet<VehicleDocument> VehicleDocuments => Set<VehicleDocument>();
    public DbSet<VehicleDriver> VehicleDrivers => Set<VehicleDriver>();
    public DbSet<VehicleMaintenance> VehicleMaintenances => Set<VehicleMaintenance>();
    public DbSet<VehicleFuelLog> VehicleFuelLogs => Set<VehicleFuelLog>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Schema);

        modelBuilder.Entity<Vehicle>(b =>
        {
            b.ToTable("Vehicles");
            b.HasKey(x => x.Id);
            b.Property(x => x.Plate).HasMaxLength(30).IsRequired();
            b.Property(x => x.Brand).HasMaxLength(80).IsRequired();
            b.Property(x => x.Model).HasMaxLength(80).IsRequired();
            b.Property(x => x.PhotoPath).HasColumnType("text");
            b.HasIndex(x => new { x.TenantId, x.Plate }).IsUnique();
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

    public async Task EnsureFleetTablesAsync(CancellationToken ct = default)
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
    }
}

public static class FleetModule
{
    public static IServiceCollection AddFleetModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddTenantDbContext<FleetDbContext>(FleetDbContext.Schema);

        return services;
    }

    public static IEndpointRouteBuilder MapFleetModule(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/fleet").WithTags("Fleet");

        // -------------------------------------------------------------
        // VEHICLES CRUD
        // -------------------------------------------------------------
        group.MapGet("/vehicles", async (string? search, FleetDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var id = tenant.TenantId.Value;
            var q = db.Vehicles.AsNoTracking().Where(x => x.TenantId == id);

            if (!string.IsNullOrWhiteSpace(search))
            {
                var s = search.Trim().ToLower();
                q = q.Where(x => x.Plate.ToLower().Contains(s) || x.Brand.ToLower().Contains(s) || x.Model.ToLower().Contains(s));
            }

            var items = await q.OrderBy(x => x.Plate).ToListAsync(ct);
            return Results.Ok(items);
        });

        group.MapGet("/vehicles/{id:guid}", async (Guid id, FleetDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var v = await db.Vehicles.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            return v is not null ? Results.Ok(v) : Results.NotFound("Vehículo no encontrado");
        });

        group.MapPost("/vehicles", async (Vehicle body, FleetDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            body.Id = Guid.NewGuid();
            body.TenantId = tenantId;
            body.Plate = body.Plate.Trim().ToUpperInvariant();
            body.CreatedAtUtc = DateTime.UtcNow;

            db.Vehicles.Add(body);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/fleet/vehicles/{body.Id}", body);
        });

        group.MapPut("/vehicles/{id:guid}", async (Guid id, Vehicle body, FleetDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var v = await db.Vehicles.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            if (v is null) return Results.NotFound();

            v.Plate = body.Plate.Trim().ToUpperInvariant();
            v.Brand = body.Brand.Trim();
            v.Model = body.Model.Trim();
            v.Year = body.Year;
            v.Type = body.Type;
            v.VinChassis = body.VinChassis.Trim();
            v.EngineNumber = body.EngineNumber.Trim();
            v.CurrentKilometers = body.CurrentKilometers;
            v.CurrentEngineHours = body.CurrentEngineHours;
            v.FuelType = body.FuelType;
            v.Status = body.Status;
            v.AssignedDriverId = body.AssignedDriverId;
            v.AssignedDriverName = body.AssignedDriverName;
            v.PhotoPath = body.PhotoPath;
            v.Notes = body.Notes;

            await db.SaveChangesAsync(ct);
            return Results.Ok(v);
        });

        // -------------------------------------------------------------
        // DOCUMENTS & EXPIRATIONS (VTV, Seguro, Cédula, GNC)
        // -------------------------------------------------------------
        group.MapGet("/vehicles/{vehicleId:guid}/documents", async (Guid vehicleId, FleetDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var docs = await db.VehicleDocuments.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.VehicleId == vehicleId)
                .OrderBy(x => x.ExpirationDateUtc)
                .ToListAsync(ct);
            return Results.Ok(docs);
        });

        group.MapPost("/documents", async (VehicleDocument body, FleetDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            body.Id = Guid.NewGuid();
            body.TenantId = tenantId;
            body.CreatedAtUtc = DateTime.UtcNow;

            db.VehicleDocuments.Add(body);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/fleet/documents/{body.Id}", body);
        });

        group.MapGet("/documents/expiring", async (FleetDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var threshold = DateTime.UtcNow.AddDays(30);

            var expiring = await db.VehicleDocuments.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.IsActive && x.ExpirationDateUtc <= threshold)
                .Join(db.Vehicles, d => d.VehicleId, v => v.Id, (d, v) => new
                {
                    d.Id,
                    d.VehicleId,
                    v.Plate,
                    VehicleName = $"{v.Brand} {v.Model}",
                    d.DocumentType,
                    d.Title,
                    d.PolicyOrDocNumber,
                    d.IssuerCompany,
                    d.ExpirationDateUtc,
                    DaysRemaining = (d.ExpirationDateUtc - DateTime.UtcNow).Days
                })
                .OrderBy(x => x.ExpirationDateUtc)
                .ToListAsync(ct);

            return Results.Ok(expiring);
        });

        // -------------------------------------------------------------
        // DRIVERS (Choferes)
        // -------------------------------------------------------------
        group.MapGet("/drivers", async (FleetDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var drivers = await db.VehicleDrivers.AsNoTracking()
                .Where(x => x.TenantId == tenantId)
                .OrderBy(x => x.FullName)
                .ToListAsync(ct);
            return Results.Ok(drivers);
        });

        group.MapPost("/drivers", async (VehicleDriver body, FleetDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            body.Id = Guid.NewGuid();
            body.TenantId = tenantId;
            body.CreatedAtUtc = DateTime.UtcNow;

            db.VehicleDrivers.Add(body);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/fleet/drivers/{body.Id}", body);
        });

        // -------------------------------------------------------------
        // MAINTENANCE & SERVICES
        // -------------------------------------------------------------
        group.MapGet("/maintenances", async (Guid? vehicleId, FleetDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var q = db.VehicleMaintenances.AsNoTracking().Where(x => x.TenantId == tenantId);
            if (vehicleId.HasValue) q = q.Where(x => x.VehicleId == vehicleId.Value);

            var items = await q.OrderByDescending(x => x.ServiceDateUtc).ToListAsync(ct);
            return Results.Ok(items);
        });

        group.MapPost("/maintenances", async (VehicleMaintenance body, FleetDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            body.Id = Guid.NewGuid();
            body.TenantId = tenantId;
            body.CreatedAtUtc = DateTime.UtcNow;
            if (body.ServiceDateUtc == default) body.ServiceDateUtc = DateTime.UtcNow;

            db.VehicleMaintenances.Add(body);

            // If KM at service is higher than vehicle KM, update vehicle current KM
            var v = await db.Vehicles.FirstOrDefaultAsync(x => x.Id == body.VehicleId && x.TenantId == tenantId, ct);
            if (v is not null && body.KmAtService > v.CurrentKilometers)
            {
                v.CurrentKilometers = body.KmAtService;
            }

            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/fleet/maintenances/{body.Id}", body);
        });

        // -------------------------------------------------------------
        // FUEL LOGS & CONSUMPTION (KM/L)
        // -------------------------------------------------------------
        group.MapGet("/fuel-logs", async (Guid? vehicleId, FleetDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var q = db.VehicleFuelLogs.AsNoTracking().Where(x => x.TenantId == tenantId);
            if (vehicleId.HasValue) q = q.Where(x => x.VehicleId == vehicleId.Value);

            var logs = await q.OrderByDescending(x => x.LogDateUtc).ToListAsync(ct);
            return Results.Ok(logs);
        });

        group.MapPost("/fuel-logs", async (VehicleFuelLog body, FleetDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            body.Id = Guid.NewGuid();
            body.TenantId = tenantId;
            body.CreatedAtUtc = DateTime.UtcNow;
            if (body.LogDateUtc == default) body.LogDateUtc = DateTime.UtcNow;
            if (body.TotalCost <= 0 && body.Liters > 0 && body.PricePerLiter > 0)
            {
                body.TotalCost = Math.Round(body.Liters * body.PricePerLiter, 2);
            }

            var v = await db.Vehicles.FirstOrDefaultAsync(x => x.Id == body.VehicleId && x.TenantId == tenantId, ct);
            if (v is not null)
            {
                if (body.KilometersAtFueling > v.CurrentKilometers && body.Liters > 0)
                {
                    var deltaKm = body.KilometersAtFueling - v.CurrentKilometers;
                    body.CalculatedKmPerLiter = Math.Round((decimal)deltaKm / body.Liters, 2);
                    v.CurrentKilometers = body.KilometersAtFueling;
                }
            }

            db.VehicleFuelLogs.Add(body);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/fleet/fuel-logs/{body.Id}", body);
        });

        return endpoints;
    }
}
