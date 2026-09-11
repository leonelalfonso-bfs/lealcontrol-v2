using System;
using System.Collections.Generic;
using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Tenancy;

namespace LealControl.Modules.Metrology.Infrastructure;

public sealed class MetrologyEquipment : Entity<Guid>
{
    public TenantId TenantId { get; set; }
    public string Code { get; set; } = string.Empty; // e.g. BAL-CAM-01
    public string Description { get; set; } = string.Empty; // e.g. Balanza Camionera Electromecánica 80t
    public string Brand { get; set; } = string.Empty;
    public string Model { get; set; } = string.Empty;
    public string SerialNumber { get; set; } = string.Empty;
    
    // Cliente y Ubicación
    public Guid? CustomerId { get; set; }
    public string CustomerName { get; set; } = string.Empty;
    public string Location { get; set; } = string.Empty; // e.g. Planta Acopio Silos 1 - Ingreso
    
    // Marco Normativo
    public string ApplicableStandard { get; set; } = "Res25_2025"; // Res25_2025, Res2307_80
    public string ApprovalCode { get; set; } = string.Empty; // General / Legacy approval code
    public string PlatformType { get; set; } = "TruckScale"; // TruckScale, Platform, Hopper, Suspended, Counter

    // Componente 1: Plataforma / Receptor de Carga
    public string PlatformApprovalCode { get; set; } = string.Empty; // Código de Aprobación de Modelo de Plataforma (ej. DNH-1450/84)
    public string PlatformApprovalNumber { get; set; } = string.Empty; // Nº Disposición / Aprobación Plataforma (ej. Disp. DNCI Nº 124/2018)
    public DateTime? PlatformApprovalDate { get; set; } // Fecha de Disposición / Aprobación Plataforma
    public string PlatformDimensions { get; set; } = string.Empty; // ej. 21.00 x 3.00 m
    public int LoadCellsCount { get; set; } = 6; // Apoyos / celdas

    // Componente 2: Indicador Principal (Indicador 1)
    public string Indicator1Brand { get; set; } = string.Empty;
    public string Indicator1Model { get; set; } = string.Empty;
    public string Indicator1SerialNumber { get; set; } = string.Empty;
    public string Indicator1ApprovalCode { get; set; } = string.Empty; // Código de Aprobación de Modelo Indicador 1 (ej. SCT-204/05)
    public string Indicator1ApprovalNumber { get; set; } = string.Empty; // Nº Disposición / Aprobación Indicador 1 (ej. Disp. DNCI Nº 45/2021)
    public DateTime? Indicator1ApprovalDate { get; set; } // Fecha de Disposición / Aprobación Indicador 1
    public string Indicator1Type { get; set; } = "Digital"; // Digital, Analógico, Con Dispositivo Impresor

    // Componente 3: Indicador Secundario (Indicador 2 - Opcional para Balanzas Híbridas / Romana / Repetidor)
    public bool HasSecondaryIndicator { get; set; } = false;
    public string Indicator2Brand { get; set; } = string.Empty;
    public string Indicator2Model { get; set; } = string.Empty;
    public string Indicator2SerialNumber { get; set; } = string.Empty;
    public string Indicator2ApprovalCode { get; set; } = string.Empty; // Código de Aprobación de Modelo Indicador 2
    public string Indicator2ApprovalNumber { get; set; } = string.Empty; // Nº Disposición / Aprobación Indicador 2
    public DateTime? Indicator2ApprovalDate { get; set; } // Fecha de Disposición / Aprobación Indicador 2
    public string Indicator2Type { get; set; } = "Mecánico (Romana/Cuadrante)"; // Mecánico, Digital, Repetidor

    // Parámetros Metrológicos
    public decimal MaxCapacity { get; set; } // e.g. 80000 kg
    // Operational field-test maximum. It never changes the approved metrological Max.
    public decimal MaximumOperationalLoad { get; set; }
    public decimal MinCapacity { get; set; } // e.g. 400 kg
    public decimal DivisionD { get; set; } // e.g. 20 kg
    public decimal VerificationIntervalE { get; set; } // e.g. 20 kg
    public string Unit { get; set; } = "kg"; // kg, g, mg, t
    public string AccuracyClass { get; set; } = "III"; // I, II, III, IIII
    public string IndicationType { get; set; } = "Digital"; // Digital, Analógica, Con Dispositivo Impresor
    public bool HasTare { get; set; } = true;
    
    // Estado y Vigencia
    public string Status { get; set; } = "Active"; // Active, Inactive, Maintenance, OutOfService
    public DateTime? LastCalibrationDate { get; set; }
    public DateTime? NextCalibrationDate { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public MetrologyEquipment() : base(Guid.NewGuid()) { }
}

public sealed class StandardWeight : Entity<Guid>
{
    public TenantId TenantId { get; set; }
    public string Code { get; set; } = string.Empty; // e.g. 04, 1051, 1676, PAT-500-01
    public string NormalizedId { get; set; } = string.Empty; // e.g. 04, 1051, 1676
    public string SerialNumber { get; set; } = string.Empty;
    public string Manufacturer { get; set; } = string.Empty; // e.g. BITAR HNOS. S.H., Sipel S.R.L.
    public string LotName { get; set; } = string.Empty; // e.g. Camion 1, Lote 22x1t Sipel
    public decimal NominalValue { get; set; } // e.g. 1000, 500, 20 kg
    public string Unit { get; set; } = "kg";
    public string AccuracyClass { get; set; } = "M1"; // E2, F1, F2, M1, M2
    public string Material { get; set; } = "Hierro Fundido"; // Hierro Fundido, Acero Inoxidable, Latón
    public decimal? ErrorAsFound { get; set; } // Error Inicial (As Found)
    public decimal? ConventionalMassCorrection { get; set; } = 0; // Error Final (As Left / Ec)
    public decimal? Uncertainty { get; set; } = 0; // Incertidumbre U (k=2)
    public string UnitEc { get; set; } = "g"; // g o kg
    public decimal FactorK { get; set; } = 2.0m;
    public string CertificateNumber { get; set; } = string.Empty; // Certificado de Calibración
    public string TraceabilityLab { get; set; } = "Laboratorio Acreditado";
    public DateTime? CalibrationDate { get; set; }
    public DateTime? ExpirationDate { get; set; }
    public string Status { get; set; } = "Valid"; // Valid, Expired, Inactive
    public string? Notes { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public StandardWeight() : base(Guid.NewGuid()) { }
}

/// <summary>Instrumento auxiliar de medición (termómetro, etc.) — PG14 / PG16.</summary>
public sealed class MetrologyInstrument : Entity<Guid>
{
    public TenantId TenantId { get; set; }
    public string Code { get; set; } = string.Empty; // e.g. EQ 001
    public string Kind { get; set; } = MetrologyInstrumentKinds.Thermometer;
    public string Description { get; set; } = string.Empty;
    public string Brand { get; set; } = string.Empty;
    public string Model { get; set; } = string.Empty;
    public string SerialNumber { get; set; } = string.Empty;
    public string MeasurementRange { get; set; } = string.Empty; // e.g. -20..60 °C
    public string Resolution { get; set; } = string.Empty; // e.g. 0.1 °C
    public string CertificateNumber { get; set; } = string.Empty;
    public string TraceabilityLab { get; set; } = string.Empty;
    public DateTime? CalibrationDate { get; set; }
    public DateTime? ExpirationDate { get; set; }
    public string Status { get; set; } = "Valid"; // Valid, Expired, Inactive
    public string? Notes { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public MetrologyInstrument() : base(Guid.NewGuid()) { }
}

public static class MetrologyInstrumentKinds
{
    public const string Thermometer = "Thermometer";
    public const string Other = "Other";
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
    public string RegulatoryProfile { get; set; } = MetrologyRegulatoryProfiles.Ipna25;
    public string OperationType { get; set; } = MetrologyRegulatoryProfiles.OpPeriodicVerification;
    public string DocumentTitle { get; set; } = "Informe de ensayo metrológico";
    public string RegulatoryStatus { get; set; } = "Vigente";
    public string RegulatoryNotice { get; set; } = string.Empty;
    public string TestPlanVersion { get; set; } = "MET-BASE-1";
    public string ReportStatus { get; set; } = "Issued";
    public DateTime CalibrationDate { get; set; } = DateTime.UtcNow;
    public DateTime? ExpirationDate { get; set; } // 24 meses según Res. 25/2025 o 12 meses según 2307/80
    
    // Condiciones Ambientales
    public decimal TemperatureCelsius { get; set; } = 20.0m;
    public decimal RelativeHumidityPercent { get; set; } = 50.0m;
    public decimal AtmosphericPressureHpa { get; set; } = 1013.25m;
    
    // Verificador / Operador
    public string PerformedBy { get; set; } = string.Empty;
    public string ApprovedBy { get; set; } = string.Empty;
    
    // Dictamen Final
    public string Verdict { get; set; } = "Approved"; // Approved, Rejected, ConditionallyApproved
    public decimal MaxObservedError { get; set; }
    public decimal MaxAllowedError { get; set; }
    public decimal ExpandedUncertaintyK2 { get; set; }

    /// <summary>Temperatura final al cierre del dictamen (°C).</summary>
    public decimal? FinalTemperatureCelsius { get; set; }

    /// <summary>Hora final local del dictamen (HH:mm).</summary>
    public string? FinalTimeLocal { get; set; }
    
    // Ensayos JSON estructurados
    public string VisualInspectionJson { get; set; } = "{}";
    public string RepeatabilityTestJson { get; set; } = "[]";
    public string EccentricityTestJson { get; set; } = "[]";
    public string LinearityTestJson { get; set; } = "[]";
    public string WeightsUsedJson { get; set; } = "[]";
    
    public string? Observations { get; set; }
    public string? SealsPlaced { get; set; } // Precintos colocados

    /// <summary>Snapshot SGC al emitir: PG12/IT0X/PG09 con versión vigente (JSON).</summary>
    public string ProcedureSnapshotJson { get; set; } = "[]";

    /// <summary>Códigos de documentos externos del catálogo Calidad (JSON array).</summary>
    public string ExternalDocumentCodesJson { get; set; } = "[]";

    /// <summary>Instructivo de trabajo vinculado (IT01..IT04).</summary>
    public string InstructionCode { get; set; } = string.Empty;

    /// <summary>Termómetro / instrumento ambiental usado en el ensayo (PG16).</summary>
    public Guid? ThermometerInstrumentId { get; set; }

    /// <summary>PG09 R2: Id del informe emitido que esta enmienda reemplaza.</summary>
    public Guid? SupersedesReportId { get; set; }

    /// <summary>PG09 R2: Motivo de la modificación/enmienda (obligatorio al enmendar).</summary>
    public string? AmendmentReason { get; set; }

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
    string PlatformApprovalCode,
    string PlatformApprovalNumber,
    DateTime? PlatformApprovalDate,
    string PlatformDimensions,
    string Indicator1Brand,
    string Indicator1Model,
    string Indicator1SerialNumber,
    string Indicator1ApprovalCode,
    string Indicator1ApprovalNumber,
    DateTime? Indicator1ApprovalDate,
    string Indicator1Type,
    bool HasSecondaryIndicator,
    string Indicator2Brand,
    string Indicator2Model,
    string Indicator2SerialNumber,
    string Indicator2ApprovalCode,
    string Indicator2ApprovalNumber,
    DateTime? Indicator2ApprovalDate,
    string Indicator2Type,
    decimal MaxCapacity,
    decimal MaximumOperationalLoad,
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
    string? PlatformApprovalCode,
    string? PlatformApprovalNumber,
    DateTime? PlatformApprovalDate,
    string? PlatformDimensions,
    string? Indicator1Brand,
    string? Indicator1Model,
    string? Indicator1SerialNumber,
    string? Indicator1ApprovalCode,
    string? Indicator1ApprovalNumber,
    DateTime? Indicator1ApprovalDate,
    string? Indicator1Type,
    bool HasSecondaryIndicator,
    string? Indicator2Brand,
    string? Indicator2Model,
    string? Indicator2SerialNumber,
    string? Indicator2ApprovalCode,
    string? Indicator2ApprovalNumber,
    DateTime? Indicator2ApprovalDate,
    string? Indicator2Type,
    decimal MaxCapacity,
    decimal? MaximumOperationalLoad,
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
    string NormalizedId,
    string SerialNumber,
    string Manufacturer,
    string LotName,
    decimal NominalValue,
    string Unit,
    string AccuracyClass,
    string Material,
    decimal? ErrorAsFound,
    decimal? ConventionalMassCorrection,
    decimal? Uncertainty,
    string UnitEc,
    decimal FactorK,
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
    string? Manufacturer,
    string? LotName,
    decimal NominalValue,
    string? Unit,
    string? AccuracyClass,
    string? Material,
    decimal? ErrorAsFound,
    decimal? ConventionalMassCorrection,
    decimal? Uncertainty,
    string? UnitEc,
    decimal? FactorK,
    string? CertificateNumber,
    string? TraceabilityLab,
    DateTime? CalibrationDate,
    DateTime? ExpirationDate,
    string? Status,
    string? Notes
);

public record StandardWeightBulkImportItem(
    string Code,
    string? SerialNumber,
    string? Manufacturer,
    string? LotName,
    decimal NominalValue,
    string? Unit,
    string? AccuracyClass,
    string? Material,
    decimal? ErrorAsFound,
    decimal? ConventionalMassCorrection,
    decimal? Uncertainty,
    string? UnitEc,
    decimal? FactorK,
    string? CertificateNumber,
    string? TraceabilityLab,
    DateTime? CalibrationDate,
    DateTime? ExpirationDate,
    string? Status
);

public record StandardWeightBulkImportRequest(
    List<StandardWeightBulkImportItem> Weights
);

public record StandardWeightBulkLotRequest(
    List<Guid> Ids,
    string LotName
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
    DateTime CreatedAtUtc,
    Guid? SupersedesReportId = null,
    string? AmendmentReason = null,
    string? ReportStatus = null,
    decimal? FinalTemperatureCelsius = null,
    string? FinalTimeLocal = null
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
    string? SealsPlaced,
    string? RegulatoryProfile = null,
    string? OperationType = null,
    string? DocumentTitle = null,
    string? RegulatoryStatus = null,
    string? RegulatoryNotice = null,
    string? TestPlanVersion = null,
    string? ReportStatus = null,
    Guid? ThermometerInstrumentId = null,
    Guid? SupersedesReportId = null,
    string? AmendmentReason = null,
    decimal? FinalTemperatureCelsius = null,
    string? FinalTimeLocal = null
);

/// <summary>PG09 R2 — cuerpo de enmienda. Motivo obligatorio; el resto son overrides opcionales del clon.</summary>
public record CalibrationReportAmendDto(
    string AmendmentReason,
    string? Observations = null,
    string? SealsPlaced = null,
    string? Verdict = null,
    decimal? MaxObservedError = null,
    decimal? MaxAllowedError = null,
    decimal? ExpandedUncertaintyK2 = null,
    string? VisualInspectionJson = null,
    string? RepeatabilityTestJson = null,
    string? EccentricityTestJson = null,
    string? LinearityTestJson = null,
    string? WeightsUsedJson = null,
    string? PerformedBy = null,
    decimal? TemperatureCelsius = null,
    decimal? RelativeHumidityPercent = null,
    decimal? AtmosphericPressureHpa = null,
    Guid? ThermometerInstrumentId = null,
    DateTime? CalibrationDate = null,
    DateTime? ExpirationDate = null,
    decimal? FinalTemperatureCelsius = null,
    string? FinalTimeLocal = null
);

/// <summary>Modo de actividad del tenant: Laboratory (solo VPE/VPR) o Repairer (CAL/VPE/VPR/VPO).</summary>
public sealed class MetrologyTenantSettings : Entity<Guid>
{
    public TenantId TenantId { get; set; }
    /// <summary>Laboratory | Repairer</summary>
    public string ActivityMode { get; set; } = "Repairer";

    public MetrologyTenantSettings() : base(Guid.NewGuid()) { }
}

public record MetrologyTenantSettingsDto(string ActivityMode);

public record MetrologyTenantSettingsWriteDto(string ActivityMode);

public record MetrologyInstrumentWriteDto(
    string Code,
    string? Kind = null,
    string? Description = null,
    string? Brand = null,
    string? Model = null,
    string? SerialNumber = null,
    string? MeasurementRange = null,
    string? Resolution = null,
    string? CertificateNumber = null,
    string? TraceabilityLab = null,
    DateTime? CalibrationDate = null,
    DateTime? ExpirationDate = null,
    string? Status = null,
    string? Notes = null
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
    string RuleApplied,
    decimal CalculatedTestLoad,
    decimal SuggestedTestLoad
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
    string ErrorLimitTerm,
    string RepeatabilityTerm,
    List<MetrologyTestPointDto> RecommendedLinearityPoints,
    EccentricityConfigDto EccentricityConfig,
    decimal MinCapacity,
    decimal MaxCapacity,
    decimal VerificationIntervalE,
    int TotalVerificationDivisionsN
);
