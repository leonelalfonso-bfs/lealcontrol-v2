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
    
    // Marco Normativo & Aprobaciones Legales
    public string ApplicableStandard { get; set; } = "Res25_2025"; // Res25_2025, Res2307_80
    public string ApprovalCode { get; set; } = string.Empty; // e.g. RESOL-2025-25-APN-SIYC#MEC o DNH-1450/84
    public string PlatformType { get; set; } = "TruckScale"; // TruckScale, Platform, Hopper, Suspended, Counter

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
        string applicableStandard,
        string approvalCode,
        string platformType,
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
        ApplicableStandard = string.IsNullOrWhiteSpace(applicableStandard) ? "Res25_2025" : applicableStandard;
        ApprovalCode = approvalCode ?? string.Empty;
        PlatformType = string.IsNullOrWhiteSpace(platformType) ? "TruckScale" : platformType;
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
    public string Code { get; set; } = string.Empty; // e.g. PAT-500-01
    public string SerialNumber { get; set; } = string.Empty;
    public decimal NominalValue { get; set; } // e.g. 500 kg
    public string Unit { get; set; } = "kg";
    public string AccuracyClass { get; set; } = "M1"; // E2, F1, F2, M1, M2
    public string Material { get; set; } = "Hierro Fundido"; // Hierro Fundido, Acero Inoxidable, Latón
    public decimal ConventionalMassCorrection { get; set; } = 0; // en gramos o kg
    public decimal Uncertainty { get; set; } = 0; // Incertidumbre U (k=2) en mg o g
    public string CertificateNumber { get; set; } = string.Empty; // Certificado INTI / SAC
    public string TraceabilityLab { get; set; } = "INTI - Metrología Legal";
    public DateTime? CalibrationDate { get; set; }
    public DateTime? ExpirationDate { get; set; }
    public string Status { get; set; } = "Valid"; // Valid, Expired, Inactive
    public string? Notes { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public StandardWeight() : base(Guid.NewGuid()) { }
}

public sealed class CalibrationReport : Entity<Guid>
{
    public TenantId TenantId { get; set; }
    public string CertificateNumber { get; set; } = string.Empty; // e.g. CERT-2025-001
    public Guid EquipmentId { get; set; }
    public string EquipmentCode { get; set; } = string.Empty;
    public string EquipmentDescription { get; set; } = string.Empty;
    public Guid? CustomerId { get; set; }
    public string CustomerName { get; set; } = string.Empty;
    public string Location { get; set; } = string.Empty;
    
    // Normativa & Tipo de Ensayo
    public string StandardApplied { get; set; } = "Res25_2025"; // Res25_2025, Res2307_80
    public string CalibrationType { get; set; } = "InService"; // InitialVerification, InService, PostRepair
    public DateTime CalibrationDate { get; set; } = DateTime.UtcNow;
    public DateTime? ExpirationDate { get; set; } // 24 meses según Res. 25/2025 o 12 meses según 2307/80
    
    // Condiciones Ambientales
    public decimal TemperatureCelsius { get; set; } = 20.0m;
    public decimal RelativeHumidityPercent { get; set; } = 50.0m;
    public decimal AtmosphericPressureHpa { get; set; } = 1013.25m;
    
    // Metrólogo / Operador
    public string PerformedBy { get; set; } = string.Empty;
    public string ApprovedBy { get; set; } = string.Empty;
    
    // Dictamen Final
    public string Verdict { get; set; } = "Approved"; // Approved, Rejected, ConditionallyApproved
    public decimal MaxObservedError { get; set; }
    public decimal MaxAllowedError { get; set; }
    public decimal ExpandedUncertaintyK2 { get; set; }
    
    // Ensayos JSON estructurados
    public string VisualInspectionJson { get; set; } = "{}";
    public string RepeatabilityTestJson { get; set; } = "[]";
    public string EccentricityTestJson { get; set; } = "[]";
    public string LinearityTestJson { get; set; } = "[]";
    public string WeightsUsedJson { get; set; } = "[]";
    
    public string? Observations { get; set; }
    public string? SealsPlaced { get; set; } // Precintos colocados
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public CalibrationReport() : base(Guid.NewGuid()) { }
}

// DTOs
public record MetrologyEquipmentDto(
    Guid Id,
    string Code,
    string Description,
    string Brand,
    string Model,
    string SerialNumber,
    Guid? CustomerId,
    string CustomerName,
    string Location,
    string ApplicableStandard,
    string ApprovalCode,
    string PlatformType,
    decimal MaxCapacity,
    decimal MinCapacity,
    decimal DivisionD,
    decimal VerificationIntervalE,
    string Unit,
    string AccuracyClass,
    string IndicationType,
    int LoadCellsCount,
    bool HasTare,
    string Status,
    DateTime? LastCalibrationDate,
    DateTime? NextCalibrationDate,
    string? Notes,
    DateTime CreatedAtUtc
);

public record MetrologyEquipmentWriteDto(
    string Code,
    string Description,
    string? Brand,
    string? Model,
    string? SerialNumber,
    Guid? CustomerId,
    string? CustomerName,
    string? Location,
    string? ApplicableStandard,
    string? ApprovalCode,
    string? PlatformType,
    decimal MaxCapacity,
    decimal MinCapacity,
    decimal DivisionD,
    decimal VerificationIntervalE,
    string? Unit,
    string? AccuracyClass,
    string? IndicationType,
    int LoadCellsCount,
    bool HasTare,
    string? Notes
);

public record StandardWeightDto(
    Guid Id,
    string Code,
    string SerialNumber,
    decimal NominalValue,
    string Unit,
    string AccuracyClass,
    string Material,
    decimal ConventionalMassCorrection,
    decimal Uncertainty,
    string CertificateNumber,
    string TraceabilityLab,
    DateTime? CalibrationDate,
    DateTime? ExpirationDate,
    string Status,
    string? Notes,
    DateTime CreatedAtUtc
);

public record StandardWeightWriteDto(
    string Code,
    string? SerialNumber,
    decimal NominalValue,
    string? Unit,
    string? AccuracyClass,
    string? Material,
    decimal ConventionalMassCorrection,
    decimal Uncertainty,
    string? CertificateNumber,
    string? TraceabilityLab,
    DateTime? CalibrationDate,
    DateTime? ExpirationDate,
    string? Notes
);

public record CalibrationReportDto(
    Guid Id,
    string CertificateNumber,
    Guid EquipmentId,
    string EquipmentCode,
    string EquipmentDescription,
    Guid? CustomerId,
    string CustomerName,
    string Location,
    string StandardApplied,
    string CalibrationType,
    DateTime CalibrationDate,
    DateTime? ExpirationDate,
    decimal TemperatureCelsius,
    decimal RelativeHumidityPercent,
    decimal AtmosphericPressureHpa,
    string PerformedBy,
    string ApprovedBy,
    string Verdict,
    decimal MaxObservedError,
    decimal MaxAllowedError,
    decimal ExpandedUncertaintyK2,
    string VisualInspectionJson,
    string RepeatabilityTestJson,
    string EccentricityTestJson,
    string LinearityTestJson,
    string WeightsUsedJson,
    string? Observations,
    string? SealsPlaced,
    DateTime CreatedAtUtc
);

public record CalibrationReportWriteDto(
    string? CertificateNumber,
    Guid EquipmentId,
    string StandardApplied,
    string CalibrationType,
    DateTime CalibrationDate,
    DateTime? ExpirationDate,
    decimal TemperatureCelsius,
    decimal RelativeHumidityPercent,
    decimal AtmosphericPressureHpa,
    string PerformedBy,
    string? ApprovedBy,
    string Verdict,
    decimal MaxObservedError,
    decimal MaxAllowedError,
    decimal ExpandedUncertaintyK2,
    string VisualInspectionJson,
    string RepeatabilityTestJson,
    string EccentricityTestJson,
    string LinearityTestJson,
    string WeightsUsedJson,
    string? Observations,
    string? SealsPlaced
);

public record MetrologyTestPointDto(
    decimal NominalLoad,
    decimal ToleranceEmt,
    string RuleDescription
);

public record EccentricityConfigDto(
    decimal TestLoad,
    int PointsCount,
    List<string> Positions,
    string RuleApplied
);

public record MetrologyRulesCalculationRequest(
    decimal MinCapacity,
    decimal MaxCapacity,
    decimal VerificationIntervalE,
    string AccuracyClass,
    int LoadCellsCount,
    decimal Tare,
    string StandardApplied,
    string PlatformType,
    bool IsInService
);

public record MetrologyRulesCalculationResponse(
    string StandardApplied,
    string ErrorLimitTerm, // "emp" o "EMT"
    string RepeatabilityTerm, // "Repetibilidad" o "Fidelidad"
    List<MetrologyTestPointDto> RecommendedLinearityPoints,
    EccentricityConfigDto EccentricityConfig,
    decimal MinCapacity,
    decimal MaxCapacity,
    decimal VerificationIntervalE,
    int TotalVerificationDivisionsN
);
