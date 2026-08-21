using System;
using System.Collections.Generic;
using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Tenancy;

namespace LealControl.Modules.Metrology.Infrastructure;

public sealed class MetrologyEquipment : Entity<Guid>
{
    public TenantId TenantId { get; set; }
    public string Code { get; set; } = string.Empty; // e.g. BAL-001
    public string Description { get; set; } = string.Empty; // e.g. Balanza Camionera Continua
    public string Brand { get; set; } = string.Empty;
    public string Model { get; set; } = string.Empty;
    public string SerialNumber { get; set; } = string.Empty;
    
    // Cliente y Ubicación
    public Guid? CustomerId { get; set; }
    public string CustomerName { get; set; } = string.Empty;
    public string Location { get; set; } = string.Empty; // e.g. Planta Acopio Silos - Ingreso
    
    // Parámetros Metrológicos
    public decimal MaxCapacity { get; set; } // e.g. 80000 kg
    public decimal MinCapacity { get; set; } // e.g. 400 kg
    public decimal DivisionD { get; set; } // e.g. 20 kg
    public decimal VerificationIntervalE { get; set; } // e.g. 20 kg
    public string Unit { get; set; } = "kg"; // kg, g, mg, t
    public string AccuracyClass { get; set; } = "III"; // I, II, III, IIII
    public string IndicationType { get; set; } = "Digital"; // Digital, Analógica, Con Dispositivo Impresor
    public int LoadCellsCount { get; set; } = 6; // 4, 6, 8 apoyos
    public bool HasTare { get; set; } = true;
    
    // Estado y Vigencia
    public string Status { get; set; } = "Active"; // Active, Inactive, Maintenance, OutOfService
    public DateTime? LastCalibrationDate { get; set; }
    public DateTime? NextCalibrationDate { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public MetrologyEquipment() : base(Guid.NewGuid()) { }

    public MetrologyEquipment(
        Guid id,
        TenantId tenantId,
        string code,
        string description,
        string brand,
        string model,
        string serialNumber,
        Guid? customerId,
        string customerName,
        string location,
        decimal maxCapacity,
        decimal minCapacity,
        decimal divisionD,
        decimal verificationIntervalE,
        string unit = "kg",
        string accuracyClass = "III",
        string indicationType = "Digital",
        int loadCellsCount = 6,
        bool hasTare = true) : base(id)
    {
        TenantId = tenantId;
        Code = code;
        Description = description;
        Brand = brand;
        Model = model;
        SerialNumber = serialNumber;
        CustomerId = customerId;
        CustomerName = customerName;
        Location = location;
        MaxCapacity = maxCapacity;
        MinCapacity = minCapacity;
        DivisionD = divisionD;
        VerificationIntervalE = verificationIntervalE;
        Unit = unit;
        AccuracyClass = accuracyClass;
        IndicationType = indicationType;
        LoadCellsCount = loadCellsCount;
        HasTare = hasTare;
        Status = "Active";
        CreatedAtUtc = DateTime.UtcNow;
    }
}

public sealed class StandardWeight : Entity<Guid>
{
    public TenantId TenantId { get; set; }
    public string Code { get; set; } = string.Empty; // e.g. PAT-1000-01
    public string SerialNumber { get; set; } = string.Empty;
    public decimal NominalValue { get; set; } // e.g. 1000
    public string Unit { get; set; } = "kg"; // kg, g, mg
    public string AccuracyClass { get; set; } = "M1"; // E2, F1, F2, M1, M2
    public string Material { get; set; } = "Hierro Fundido"; // Acero Inoxidable, Hierro Fundido, Latón
    public decimal ConventionalMassCorrection { get; set; } // Corrección o error convencional (+0.02 kg)
    public decimal Uncertainty { get; set; } // Incertidumbre de calibración (±0.005 kg)
    
    // Trazabilidad INTI / SAC
    public string CertificateNumber { get; set; } = string.Empty;
    public string TraceabilityLab { get; set; } = "INTI - Metrología Legal";
    public DateTime? CalibrationDate { get; set; }
    public DateTime? ExpirationDate { get; set; }
    public string Status { get; set; } = "Valid"; // Valid, Expired, InCalibration, OutOfService
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public StandardWeight() : base(Guid.NewGuid()) { }

    public StandardWeight(
        Guid id,
        TenantId tenantId,
        string code,
        string serialNumber,
        decimal nominalValue,
        string unit,
        string accuracyClass,
        string material,
        decimal conventionalMassCorrection,
        decimal uncertainty,
        string certificateNumber,
        string traceabilityLab,
        DateTime? calibrationDate,
        DateTime? expirationDate) : base(id)
    {
        TenantId = tenantId;
        Code = code;
        SerialNumber = serialNumber;
        NominalValue = nominalValue;
        Unit = unit;
        AccuracyClass = accuracyClass;
        Material = material;
        ConventionalMassCorrection = conventionalMassCorrection;
        Uncertainty = uncertainty;
        CertificateNumber = certificateNumber;
        TraceabilityLab = traceabilityLab;
        CalibrationDate = calibrationDate;
        ExpirationDate = expirationDate;
        Status = (expirationDate.HasValue && expirationDate.Value < DateTime.UtcNow) ? "Expired" : "Valid";
        CreatedAtUtc = DateTime.UtcNow;
    }
}

public sealed class CalibrationReport : Entity<Guid>
{
    public TenantId TenantId { get; set; }
    public string ReportNumber { get; set; } = string.Empty; // e.g. INF-2026-0001
    public string CertificateType { get; set; } = "Ensayo y Calibración"; // Ensayo Oficial Res 67/2025, Calibración Periódica, Mantenimiento Preventivo
    public string NormativeApplied { get; set; } = "Resolución 67/2025 (OIML R 76-1)";
    
    // Instrumento & Cliente
    public Guid EquipmentId { get; set; }
    public string EquipmentCode { get; set; } = string.Empty;
    public string EquipmentDescription { get; set; } = string.Empty;
    public Guid? CustomerId { get; set; }
    public string CustomerName { get; set; } = string.Empty;
    public string CustomerAddress { get; set; } = string.Empty;
    public string CustomerCuit { get; set; } = string.Empty;
    public string Location { get; set; } = string.Empty;
    
    // Fechas y Metrólogo
    public DateTime CalibrationDate { get; set; } = DateTime.UtcNow;
    public DateTime? NextCalibrationDate { get; set; }
    public string PerformedBy { get; set; } = string.Empty; // Técnico / Metrólogo
    
    // Condiciones Ambientales
    public decimal AmbientTemperature { get; set; } = 20.0m; // ºC
    public decimal AmbientHumidity { get; set; } = 50.0m; // %
    public decimal AtmosphericPressure { get; set; } = 1013.0m; // hPa
    
    // Ensayos Metrológicos (JSON estructurado)
    public bool InitialInspectionPassed { get; set; } = true;
    public string? InspectionNotes { get; set; }
    public string RepeatabilityDataJson { get; set; } = "[]"; // Ensayos de repetibilidad
    public string EccentricityDataJson { get; set; } = "[]"; // Ensayos de excentricidad
    public string LinearityDataJson { get; set; } = "[]"; // Ensayos de exactitud / pesaje
    public string UncertaintyDataJson { get; set; } = "{}"; // Presupuesto de incertidumbre
    public string WeightsUsedJson { get; set; } = "[]"; // Patrones utilizados
    
    // Dictamen Final
    public decimal ExpandedUncertainty { get; set; } // U (k=2)
    public string Result { get; set; } = "Apto"; // Apto, Apto con Observaciones, No Apto
    public string? Observations { get; set; }
    public string Status { get; set; } = "Issued"; // Draft, Issued, Cancelled
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public CalibrationReport() : base(Guid.NewGuid()) { }
}

// Request & DTO Records
public sealed record CreateEquipmentRequest(
    string Code,
    string Description,
    string Brand,
    string Model,
    string SerialNumber,
    Guid? CustomerId,
    string CustomerName,
    string Location,
    decimal MaxCapacity,
    decimal MinCapacity,
    decimal DivisionD,
    decimal VerificationIntervalE,
    string? Unit,
    string? AccuracyClass,
    string? IndicationType,
    int LoadCellsCount,
    bool HasTare,
    string? Notes);

public sealed record UpdateEquipmentRequest(
    string Code,
    string Description,
    string Brand,
    string Model,
    string SerialNumber,
    Guid? CustomerId,
    string CustomerName,
    string Location,
    decimal MaxCapacity,
    decimal MinCapacity,
    decimal DivisionD,
    decimal VerificationIntervalE,
    string? Unit,
    string? AccuracyClass,
    string? IndicationType,
    int LoadCellsCount,
    bool HasTare,
    string Status,
    string? Notes);

public sealed record CreateStandardWeightRequest(
    string Code,
    string SerialNumber,
    decimal NominalValue,
    string? Unit,
    string? AccuracyClass,
    string? Material,
    decimal ConventionalMassCorrection,
    decimal Uncertainty,
    string CertificateNumber,
    string? TraceabilityLab,
    DateTime? CalibrationDate,
    DateTime? ExpirationDate);

public sealed record SaveCalibrationReportRequest(
    string? ReportNumber,
    string? CertificateType,
    string? NormativeApplied,
    Guid EquipmentId,
    Guid? CustomerId,
    string? CustomerName,
    string? CustomerAddress,
    string? CustomerCuit,
    string? Location,
    DateTime CalibrationDate,
    DateTime? NextCalibrationDate,
    string PerformedBy,
    decimal AmbientTemperature,
    decimal AmbientHumidity,
    decimal AtmosphericPressure,
    bool InitialInspectionPassed,
    string? InspectionNotes,
    string RepeatabilityDataJson,
    string EccentricityDataJson,
    string LinearityDataJson,
    string UncertaintyDataJson,
    string WeightsUsedJson,
    decimal ExpandedUncertainty,
    string Result,
    string? Observations,
    string? Status);

public sealed record CalculateMetrologyRulesRequest(
    decimal MaxCapacity,
    decimal MinCapacity,
    decimal DivisionD,
    decimal VerificationIntervalE,
    string AccuracyClass,
    int LoadCellsCount,
    string? Normative);
