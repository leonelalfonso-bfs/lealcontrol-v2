using System;

namespace LealControl.Modules.Fleet.Infrastructure;

// Los valores numéricos se guardan en la base: solo se agregan al final.
public enum VehicleType { Pickup, Van, Truck, Car, Forklift, SemiTrailer, TractorUnit, Trailer, Other }
public enum VehicleStatus { Active, InMaintenance, OutOfService, Sold }
/// <summary>Cómo se mide el uso de la unidad (los semirremolques no miden nada).</summary>
public enum MeterType { Kilometers, Hours, Both, None }
public enum FleetDocType { VtvRto, InsurancePolicy, GreenCard, GncCard, Senasa, Ruta, Other, FireExtinguisher, ForkliftCertification }
public enum MaintenanceType { Preventive, Corrective, Urgent, Inspection }
public enum MaintenanceStatus { Scheduled, InProgress, Completed, Cancelled }

public sealed class Vehicle
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    /// <summary>Patente / dominio. Vacía en unidades sin patente (autoelevadores).</summary>
    public string Plate { get; set; } = "";
    /// <summary>Código interno (por ejemplo "AE-01"). Patente o código: al menos uno.</summary>
    public string? InternalCode { get; set; }
    public string Brand { get; set; } = "";
    public string Model { get; set; } = "";
    public int Year { get; set; } = DateTime.UtcNow.Year;
    public VehicleType Type { get; set; } = VehicleType.Pickup;
    public MeterType MeterType { get; set; } = MeterType.Kilometers;
    public string VinChassis { get; set; } = "";
    public string EngineNumber { get; set; } = "";
    public int CurrentKilometers { get; set; }
    public decimal CurrentEngineHours { get; set; }
    public string FuelType { get; set; } = "Diesel";
    public VehicleStatus Status { get; set; } = VehicleStatus.Active;
    public Guid? AssignedDriverId { get; set; }
    public string? AssignedDriverName { get; set; }
    public string? PhotoPath { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}

/// <summary>Lectura de odómetro u horómetro. El valor actual de la unidad es la última lectura.</summary>
public sealed class VehicleMeterReading
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid VehicleId { get; set; }
    public DateTime ReadAtUtc { get; set; }
    public int? Kilometers { get; set; }
    public decimal? Hours { get; set; }
    /// <summary>Corrección de un error de carga: puede bajar el valor, con motivo.</summary>
    public bool IsCorrection { get; set; }
    public string? Note { get; set; }
    public string? CreatedBy { get; set; }
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
    public string? IssuerCompany { get; set; }
    public DateTime IssueDateUtc { get; set; }
    /// <summary>Fecha civil de vencimiento, guardada a las 12:00 UTC.</summary>
    public DateTime ExpirationDateUtc { get; set; }
    public decimal Cost { get; set; }
    public int AlertDaysBefore { get; set; } = 30;
    public string? FileAttachmentUrl { get; set; }
    /// <summary>False cuando se renovó (hay uno más nuevo del mismo tipo).</summary>
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
    public string LicenseCategory { get; set; } = "B1";
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
    public string Title { get; set; } = "";
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
