using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Tenancy;

namespace LealControl.Modules.Quality.Infrastructure;

public static class QualityDocumentTypes
{
    public const string Manual = "Manual";
    public const string Procedure = "Procedure";
    public const string Instruction = "Instruction";
    public const string RecordTemplate = "RecordTemplate";
    public const string External = "External";
}

public static class QualityDocumentStatuses
{
    public const string Draft = "Draft";
    public const string InReview = "InReview";
    public const string Approved = "Approved";
    public const string Current = "Current";
    public const string Obsolete = "Obsolete";
    public const string Archived = "Archived";
}

public static class QualityRecordKinds
{
    public const string Generated = "Generated";
    public const string Linked = "Linked";
    public const string Structured = "Structured";
    public const string Attachment = "Attachment";
}

public static class QualityFileRoles
{
    public const string Published = "Published";
    public const string Source = "Source";
}

public static class QualityRelationTypes
{
    public const string Deroga = "Deroga";
    public const string EsDerogadaPor = "EsDerogadaPor";
    public const string Modifica = "Modifica";
    public const string EsModificadaPor = "EsModificadaPor";
    public const string Complementa = "Complementa";
    public const string Referencia = "Referencia";
}

public sealed class QualityDocument : Entity<Guid>
{
    public QualityDocument() : base(Guid.NewGuid())
    {
    }

    public QualityDocument(Guid id) : base(id)
    {
    }

    public TenantId TenantId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string DisplayCode { get; set; } = string.Empty;
    public string Type { get; set; } = QualityDocumentTypes.Procedure;
    public string Title { get; set; } = string.Empty;
    public Guid? ParentId { get; set; }
    public int SortOrder { get; set; }
    public string Status { get; set; } = QualityDocumentStatuses.Draft;
    public Guid? CurrentVersionId { get; set; }
    public int ReviewPeriodMonths { get; set; } = 24;
    public DateTime? NextReviewDate { get; set; }
    public string OwnerRole { get; set; } = "Responsable de calidad";
    public string Iso17025Clauses { get; set; } = string.Empty;
    public string? RecordKind { get; set; }
    public string? LinkedModule { get; set; }
    public string? ExternalSource { get; set; }
    public string? ExternalUrl { get; set; }
    public string? DeactivationReason { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class QualityDocumentVersion : Entity<Guid>
{
    public QualityDocumentVersion() : base(Guid.NewGuid())
    {
    }

    public QualityDocumentVersion(Guid id) : base(id)
    {
    }

    public TenantId TenantId { get; set; }
    public Guid DocumentId { get; set; }
    public int Version { get; set; } = 1;
    public Guid? PublishedFileId { get; set; }
    public Guid? SourceFileId { get; set; }
    public string ChangeSummary { get; set; } = string.Empty;
    public string ElaboratedBy { get; set; } = string.Empty;
    public DateTime? ElaboratedAt { get; set; }
    public string ReviewedBy { get; set; } = string.Empty;
    public DateTime? ReviewedAt { get; set; }
    public string ApprovedBy { get; set; } = string.Empty;
    public DateTime? ApprovedAt { get; set; }
    public DateTime? EffectiveFrom { get; set; }
    public DateTime? EffectiveTo { get; set; }
    public string Status { get; set; } = QualityDocumentStatuses.Draft;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class QualityFile : Entity<Guid>
{
    public QualityFile() : base(Guid.NewGuid())
    {
    }

    public QualityFile(Guid id) : base(id)
    {
    }

    public TenantId TenantId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = "application/octet-stream";
    public long SizeBytes { get; set; }
    public string Sha256 { get; set; } = string.Empty;
    public string StorageKey { get; set; } = string.Empty;
    public string Role { get; set; } = QualityFileRoles.Published;
    public Guid? UploadedByUserId { get; set; }
    public string UploadedByName { get; set; } = string.Empty;
    public DateTime UploadedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class QualityDocumentRelation : Entity<Guid>
{
    public QualityDocumentRelation() : base(Guid.NewGuid())
    {
    }

    public QualityDocumentRelation(Guid id) : base(id)
    {
    }

    public TenantId TenantId { get; set; }
    public Guid FromDocumentId { get; set; }
    public Guid ToDocumentId { get; set; }
    public string RelationType { get; set; } = QualityRelationTypes.Referencia;
    public string Notes { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class QualityDistributionAck : Entity<Guid>
{
    public QualityDistributionAck() : base(Guid.NewGuid())
    {
    }

    public QualityDistributionAck(Guid id) : base(id)
    {
    }

    public TenantId TenantId { get; set; }
    public Guid DocumentVersionId { get; set; }
    public Guid? UserId { get; set; }
    public string UserName { get; set; } = string.Empty;
    public string UserEmail { get; set; } = string.Empty;
    public DateTime AcknowledgedAtUtc { get; set; } = DateTime.UtcNow;
}

public static class QualityConfidentialityKinds
{
    public const string Internal = "Internal"; // MC01-R01
    public const string External = "External"; // MC01-R02
}

/// <summary>Instancias firmadas de MC01-R01 / MC01-R02.</summary>
public sealed class QualityConfidentialityCommitment : Entity<Guid>
{
    public QualityConfidentialityCommitment() : base(Guid.NewGuid())
    {
    }

    public QualityConfidentialityCommitment(Guid id) : base(id)
    {
    }

    public TenantId TenantId { get; set; }
    /// <summary>Internal = MC01-R01, External = MC01-R02.</summary>
    public string Kind { get; set; } = QualityConfidentialityKinds.Internal;
    public string RecordCode { get; set; } = "MC01-R01";
    public Guid? PersonUserId { get; set; }
    public string PersonName { get; set; } = string.Empty;
    public string PersonEmail { get; set; } = string.Empty;
    public string PersonRole { get; set; } = string.Empty;
    public string Organization { get; set; } = string.Empty; // útil para externos
    public DateTime SignedAt { get; set; } = DateTime.UtcNow;
    public Guid? SignedFileId { get; set; }
    public string Notes { get; set; } = string.Empty;
    public string Status { get; set; } = "Active"; // Active, Superseded, Cancelled
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed record CreateConfidentialityCommitmentRequest(
    string PersonName,
    DateTime? SignedAt = null,
    Guid? PersonUserId = null,
    string? PersonEmail = null,
    string? PersonRole = null,
    string? Organization = null,
    Guid? SignedFileId = null,
    string? Notes = null);

/// <summary>Definición de indicador SGC (MC01-R03).</summary>
public sealed class QualityIndicator : Entity<Guid>
{
    public QualityIndicator() : base(Guid.NewGuid())
    {
    }

    public QualityIndicator(Guid id) : base(id)
    {
    }

    public TenantId TenantId { get; set; }
    public string RecordCode { get; set; } = "MC01-R03";
    public string Name { get; set; } = string.Empty;
    public string Objective { get; set; } = string.Empty;
    public string Formula { get; set; } = string.Empty;
    public decimal? TargetValue { get; set; }
    public string TargetUnit { get; set; } = string.Empty;
    /// <summary>HigherIsBetter | LowerIsBetter | Exact</summary>
    public string Direction { get; set; } = "HigherIsBetter";
    public string Responsible { get; set; } = string.Empty;
    public string Frequency { get; set; } = "Monthly"; // Monthly | Quarterly | Yearly
    public string Notes { get; set; } = string.Empty;
    public string Status { get; set; } = "Active"; // Active | Inactive
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

/// <summary>Valor medido de un indicador en un período (MC01-R03).</summary>
public sealed class QualityIndicatorValue : Entity<Guid>
{
    public QualityIndicatorValue() : base(Guid.NewGuid())
    {
    }

    public QualityIndicatorValue(Guid id) : base(id)
    {
    }

    public TenantId TenantId { get; set; }
    public Guid IndicatorId { get; set; }
    /// <summary>Etiqueta de período, ej. 2026-01, 2026-Q1, 2026.</summary>
    public string Period { get; set; } = string.Empty;
    public decimal Value { get; set; }
    public string Notes { get; set; } = string.Empty;
    public string RecordedBy { get; set; } = string.Empty;
    public DateTime RecordedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed record CreateQualityIndicatorRequest(
    string Name,
    string? Objective = null,
    string? Formula = null,
    decimal? TargetValue = null,
    string? TargetUnit = null,
    string? Direction = null,
    string? Responsible = null,
    string? Frequency = null,
    string? Notes = null);

public sealed record UpdateQualityIndicatorRequest(
    string? Name = null,
    string? Objective = null,
    string? Formula = null,
    decimal? TargetValue = null,
    string? TargetUnit = null,
    string? Direction = null,
    string? Responsible = null,
    string? Frequency = null,
    string? Notes = null,
    string? Status = null);

public sealed record CreateQualityIndicatorValueRequest(
    string Period,
    decimal Value,
    string? Notes = null,
    string? RecordedBy = null);

/// <summary>Instancias de notas institucionales (MC01-R05).</summary>
public sealed class QualityInstitutionalNote : Entity<Guid>
{
    public QualityInstitutionalNote() : base(Guid.NewGuid())
    {
    }

    public QualityInstitutionalNote(Guid id) : base(id)
    {
    }

    public TenantId TenantId { get; set; }
    public string RecordCode { get; set; } = "MC01-R05";
    public string Subject { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;
    public string IssuedBy { get; set; } = string.Empty;
    public string Audience { get; set; } = string.Empty;
    public DateTime IssuedAt { get; set; } = DateTime.UtcNow;
    public Guid? FileId { get; set; }
    public string Notes { get; set; } = string.Empty;
    public string Status { get; set; } = "Active"; // Active, Superseded, Cancelled
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed record CreateInstitutionalNoteRequest(
    string Subject,
    DateTime? IssuedAt = null,
    string? Body = null,
    string? IssuedBy = null,
    string? Audience = null,
    Guid? FileId = null,
    string? Notes = null);

/// <summary>Instancias de informe de validación del método (PG11-R01).</summary>
public sealed class QualityMethodValidation : Entity<Guid>
{
    public QualityMethodValidation() : base(Guid.NewGuid())
    {
    }

    public QualityMethodValidation(Guid id) : base(id)
    {
    }

    public TenantId TenantId { get; set; }
    public string RecordCode { get; set; } = "PG11-R01";
    /// <summary>Código IT / método, ej. IT01, IT02.</summary>
    public string MethodCode { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Summary { get; set; } = string.Empty;
    public string ValidatedBy { get; set; } = string.Empty;
    public DateTime ValidatedAt { get; set; } = DateTime.UtcNow;
    /// <summary>Valid | Conditional | NotValid</summary>
    public string Result { get; set; } = "Valid";
    public Guid? FileId { get; set; }
    public string Notes { get; set; } = string.Empty;
    public string Status { get; set; } = "Active"; // Active, Superseded, Cancelled
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed record CreateMethodValidationRequest(
    string MethodCode,
    string Title,
    DateTime? ValidatedAt = null,
    string? Summary = null,
    string? ValidatedBy = null,
    string? Result = null,
    Guid? FileId = null,
    string? Notes = null);

/// <summary>Estados del workflow PG03-R01 (quejas).</summary>
public static class QualityComplaintStatuses
{
    public const string Open = "Open";                         // registrada
    public const string UnderValidation = "UnderValidation";   // en validación
    public const string Invalid = "Invalid";                   // no procede (cerrada)
    public const string Investigating = "Investigating";
    public const string PendingCommunication = "PendingCommunication";
    public const string Closed = "Closed";
    public const string Cancelled = "Cancelled";
}

/// <summary>Instancia operativa de queja PG03-R01 (Structured — se genera en el sistema).</summary>
public sealed class QualityComplaint : Entity<Guid>
{
    public QualityComplaint() : base(Guid.NewGuid())
    {
    }

    public QualityComplaint(Guid id) : base(id)
    {
    }

    public TenantId TenantId { get; set; }
    public string RecordCode { get; set; } = "PG03-R01";
    /// <summary>Número legible, ej. QJ-2026-0007.</summary>
    public string Number { get; set; } = string.Empty;
    public DateTime ReceivedAt { get; set; } = DateTime.UtcNow;
    public string Channel { get; set; } = string.Empty; // Email, Phone, InPerson, Web, Other
    public string PartyName { get; set; } = string.Empty;
    public string PartyContact { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public bool? IsValid { get; set; }
    public DateTime? ValidatedAt { get; set; }
    public string ValidationNotes { get; set; } = string.Empty;
    public string Investigation { get; set; } = string.Empty;
    public string Actions { get; set; } = string.Empty;
    public string Responsible { get; set; } = string.Empty;
    public DateTime? CommunicatedAt { get; set; }
    public DateTime? ClosedAt { get; set; }
    public Guid? LinkedNonConformityId { get; set; }
    public Guid? EvidenceFileId { get; set; }
    public string Notes { get; set; } = string.Empty;
    public string Status { get; set; } = QualityComplaintStatuses.Open;

    // SLA (calculados al crear; PG03: 1 / 2 / 5 / 2 días)
    public DateTime RegisterDueAt { get; set; }
    public DateTime ValidateDueAt { get; set; }
    public DateTime InvestigateDueAt { get; set; }
    public DateTime CloseDueAt { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed record CreateComplaintRequest(
    string PartyName,
    string Description,
    DateTime? ReceivedAt = null,
    string? Channel = null,
    string? PartyContact = null,
    string? Responsible = null,
    Guid? EvidenceFileId = null,
    string? Notes = null);

public sealed record UpdateComplaintRequest(
    string? Channel = null,
    string? PartyName = null,
    string? PartyContact = null,
    string? Description = null,
    bool? IsValid = null,
    DateTime? ValidatedAt = null,
    string? ValidationNotes = null,
    string? Investigation = null,
    string? Actions = null,
    string? Responsible = null,
    DateTime? CommunicatedAt = null,
    DateTime? ClosedAt = null,
    Guid? LinkedNonConformityId = null,
    Guid? EvidenceFileId = null,
    string? Notes = null,
    string? Status = null);

/// <summary>Tipos de PG07-R1.</summary>
public static class QualityNonConformityKinds
{
    public const string NonConformity = "NonConformity";       // NC
    public const string NonConformingWork = "NonConformingWork"; // TNC
    public const string Risk = "Risk";                           // R
    public const string Opportunity = "Opportunity";             // OM
}

public static class QualityNonConformityStatuses
{
    public const string Open = "Open";
    public const string InAnalysis = "InAnalysis";
    public const string ActionPending = "ActionPending";
    public const string EffectivenessCheck = "EffectivenessCheck";
    public const string Closed = "Closed";
    public const string Cancelled = "Cancelled";
}

/// <summary>Instancia operativa PG07-R1 (NC / TNC / Riesgo / OM).</summary>
public sealed class QualityNonConformity : Entity<Guid>
{
    public QualityNonConformity() : base(Guid.NewGuid())
    {
    }

    public QualityNonConformity(Guid id) : base(id)
    {
    }

    public TenantId TenantId { get; set; }
    public string RecordCode { get; set; } = "PG07-R01";
    public string Number { get; set; } = string.Empty;
    public string Kind { get; set; } = QualityNonConformityKinds.NonConformity;
    public string Origin { get; set; } = string.Empty; // Complaint, Audit, Internal, Customer, Other
    public DateTime DetectedAt { get; set; } = DateTime.UtcNow;
    public string Description { get; set; } = string.Empty;
    public string ImmediateAction { get; set; } = string.Empty;
    public bool ImpactOnPreviousResults { get; set; }
    public bool CustomerNotified { get; set; }
    public string RootCauseMethod { get; set; } = string.Empty;
    public string RootCause { get; set; } = string.Empty;
    public string CorrectiveAction { get; set; } = string.Empty;
    public string Responsible { get; set; } = string.Empty;
    public DateTime? DueDate { get; set; }
    public DateTime? NewDueDate { get; set; }
    public string EffectivenessCheck { get; set; } = string.Empty;
    public string EffectivenessResult { get; set; } = string.Empty; // Effective | NotEffective | Pending
    public DateTime? ClosedAt { get; set; }
    public string Status { get; set; } = QualityNonConformityStatuses.Open;

    // Riesgo (Kind = Risk)
    public int? Probability { get; set; } // 1-5
    public int? Impact { get; set; } // 1-5
    public int? Level { get; set; } // probability * impact
    public string Controls { get; set; } = string.Empty;
    public int? ResidualLevel { get; set; }

    public Guid? SourceComplaintId { get; set; }
    public Guid? EvidenceFileId { get; set; }
    public string Notes { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed record CreateNonConformityRequest(
    string Kind,
    string Description,
    DateTime? DetectedAt = null,
    string? Origin = null,
    string? ImmediateAction = null,
    bool? ImpactOnPreviousResults = null,
    bool? CustomerNotified = null,
    string? Responsible = null,
    DateTime? DueDate = null,
    int? Probability = null,
    int? Impact = null,
    string? Controls = null,
    Guid? SourceComplaintId = null,
    Guid? EvidenceFileId = null,
    string? Notes = null);

public sealed record UpdateNonConformityRequest(
    string? Kind = null,
    string? Origin = null,
    DateTime? DetectedAt = null,
    string? Description = null,
    string? ImmediateAction = null,
    bool? ImpactOnPreviousResults = null,
    bool? CustomerNotified = null,
    string? RootCauseMethod = null,
    string? RootCause = null,
    string? CorrectiveAction = null,
    string? Responsible = null,
    DateTime? DueDate = null,
    DateTime? NewDueDate = null,
    string? EffectivenessCheck = null,
    string? EffectivenessResult = null,
    DateTime? ClosedAt = null,
    string? Status = null,
    int? Probability = null,
    int? Impact = null,
    string? Controls = null,
    int? ResidualLevel = null,
    Guid? EvidenceFileId = null,
    string? Notes = null);

public static class QualityInternalAuditStatuses
{
    public const string Planned = "Planned";
    public const string InProgress = "InProgress";
    public const string Reported = "Reported";
    public const string Closed = "Closed";
    public const string Cancelled = "Cancelled";
}

/// <summary>Instancia operativa de auditoría interna (PG04-R01..R04 unificados).</summary>
public sealed class QualityInternalAudit : Entity<Guid>
{
    public QualityInternalAudit() : base(Guid.NewGuid())
    {
    }

    public QualityInternalAudit(Guid id) : base(id)
    {
    }

    public TenantId TenantId { get; set; }
    public string RecordCode { get; set; } = "PG04-R01";
    public string Number { get; set; } = string.Empty; // AUD-2026-0001
    public int ProgramYear { get; set; }
    public DateTime PlannedDate { get; set; } = DateTime.UtcNow;
    public DateTime? ExecutedDate { get; set; }
    public string Scope { get; set; } = string.Empty;
    public string Clauses { get; set; } = string.Empty;
    public string Auditor { get; set; } = string.Empty;
    public string Auditee { get; set; } = string.Empty;
    public string Objectives { get; set; } = string.Empty;
    public string FindingsSummary { get; set; } = string.Empty;
    public string Conclusions { get; set; } = string.Empty;
    public string Recommendations { get; set; } = string.Empty;
    public string ChecklistNotes { get; set; } = string.Empty;
    public Guid? PlanFileId { get; set; }
    public Guid? ReportFileId { get; set; }
    public Guid? ChecklistFileId { get; set; }
    public string Status { get; set; } = QualityInternalAuditStatuses.Planned;
    public string Notes { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed record CreateInternalAuditRequest(
    int ProgramYear,
    DateTime? PlannedDate = null,
    string? Scope = null,
    string? Clauses = null,
    string? Auditor = null,
    string? Auditee = null,
    string? Objectives = null,
    string? Notes = null);

public sealed record UpdateInternalAuditRequest(
    int? ProgramYear = null,
    DateTime? PlannedDate = null,
    DateTime? ExecutedDate = null,
    string? Scope = null,
    string? Clauses = null,
    string? Auditor = null,
    string? Auditee = null,
    string? Objectives = null,
    string? FindingsSummary = null,
    string? Conclusions = null,
    string? Recommendations = null,
    string? ChecklistNotes = null,
    Guid? PlanFileId = null,
    Guid? ReportFileId = null,
    Guid? ChecklistFileId = null,
    string? Status = null,
    string? Notes = null);

// ─── PG06 Personal ───────────────────────────────────────────────────────────

public static class QualityTrainingStatuses
{
    public const string Planned = "Planned";
    public const string Done = "Done";
    public const string Cancelled = "Cancelled";
}

public sealed class QualityTrainingPlanItem : Entity<Guid>
{
    public QualityTrainingPlanItem() : base(Guid.NewGuid()) { }
    public QualityTrainingPlanItem(Guid id) : base(id) { }

    public TenantId TenantId { get; set; }
    public string RecordCode { get; set; } = "PG06-R01";
    public string Number { get; set; } = string.Empty;
    public int ProgramYear { get; set; }
    public string Topic { get; set; } = string.Empty;
    public string TargetRoles { get; set; } = string.Empty;
    public DateTime PlannedDate { get; set; } = DateTime.UtcNow;
    public DateTime? DoneDate { get; set; }
    public string EffectivenessCheck { get; set; } = string.Empty;
    public string Status { get; set; } = QualityTrainingStatuses.Planned;
    public string Notes { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed record CreateTrainingPlanItemRequest(
    int ProgramYear,
    string Topic,
    DateTime? PlannedDate = null,
    string? TargetRoles = null,
    string? Notes = null);

public sealed record UpdateTrainingPlanItemRequest(
    int? ProgramYear = null,
    string? Topic = null,
    string? TargetRoles = null,
    DateTime? PlannedDate = null,
    DateTime? DoneDate = null,
    string? EffectivenessCheck = null,
    string? Status = null,
    string? Notes = null);

public static class QualityAuthorizationStatuses
{
    public const string Draft = "Draft";
    public const string Authorized = "Authorized";
    public const string Suspended = "Suspended";
    public const string Expired = "Expired";
    public const string Cancelled = "Cancelled";
}

/// <summary>PG06-R02 — autorización por método/IT; firma exclusiva del Director Técnico.</summary>
public sealed class QualityPersonnelAuthorization : Entity<Guid>
{
    public QualityPersonnelAuthorization() : base(Guid.NewGuid()) { }
    public QualityPersonnelAuthorization(Guid id) : base(id) { }

    public TenantId TenantId { get; set; }
    public string RecordCode { get; set; } = "PG06-R02";
    public string Number { get; set; } = string.Empty;
    public Guid UserId { get; set; }
    public string PersonName { get; set; } = string.Empty;
    public string MethodDocumentCode { get; set; } = string.Empty; // IT-01, IT 02…
    public string MethodTitle { get; set; } = string.Empty;
    public string TrainingEvidence { get; set; } = string.Empty;
    public string SupervisedBy { get; set; } = string.Empty;
    public Guid? AuthorizedByUserId { get; set; }
    public string AuthorizedByName { get; set; } = string.Empty;
    public DateTime? AuthorizedAt { get; set; }
    public DateTime? ValidUntil { get; set; }
    public Guid? EvidenceFileId { get; set; }
    public string Status { get; set; } = QualityAuthorizationStatuses.Draft;
    public string Notes { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed record CreatePersonnelAuthorizationRequest(
    Guid UserId,
    string PersonName,
    string MethodDocumentCode,
    string? MethodTitle = null,
    string? TrainingEvidence = null,
    string? SupervisedBy = null,
    DateTime? ValidUntil = null,
    Guid? EvidenceFileId = null,
    string? Notes = null);

public sealed record UpdatePersonnelAuthorizationRequest(
    string? PersonName = null,
    string? MethodDocumentCode = null,
    string? MethodTitle = null,
    string? TrainingEvidence = null,
    string? SupervisedBy = null,
    DateTime? ValidUntil = null,
    Guid? EvidenceFileId = null,
    string? Status = null,
    string? Notes = null);

public sealed record AuthorizePersonnelRequest(
    DateTime? AuthorizedAt = null,
    DateTime? ValidUntil = null,
    string? Notes = null);

public static class QualityCompetenceStatuses
{
    public const string Draft = "Draft";
    public const string Completed = "Completed";
    public const string Cancelled = "Cancelled";
}

public sealed class QualityCompetenceReview : Entity<Guid>
{
    public QualityCompetenceReview() : base(Guid.NewGuid()) { }
    public QualityCompetenceReview(Guid id) : base(id) { }

    public TenantId TenantId { get; set; }
    public string RecordCode { get; set; } = "PG06-R03";
    public string Number { get; set; } = string.Empty;
    public Guid UserId { get; set; }
    public string PersonName { get; set; } = string.Empty;
    public int ReviewYear { get; set; }
    public string Evaluator { get; set; } = string.Empty;
    public int? TechnicalScore { get; set; } // 1-5
    public int? PersonalScore { get; set; } // 1-5
    public string Conclusions { get; set; } = string.Empty;
    public string Status { get; set; } = QualityCompetenceStatuses.Draft;
    public string Notes { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed record CreateCompetenceReviewRequest(
    Guid UserId,
    string PersonName,
    int ReviewYear,
    string? Evaluator = null,
    int? TechnicalScore = null,
    int? PersonalScore = null,
    string? Conclusions = null,
    string? Notes = null);

public sealed record UpdateCompetenceReviewRequest(
    string? PersonName = null,
    int? ReviewYear = null,
    string? Evaluator = null,
    int? TechnicalScore = null,
    int? PersonalScore = null,
    string? Conclusions = null,
    string? Status = null,
    string? Notes = null);

public static class QualityRoleAssignmentStatuses
{
    public const string Active = "Active";
    public const string Ended = "Ended";
    public const string Cancelled = "Cancelled";
}

public sealed class QualityRoleAssignment : Entity<Guid>
{
    public QualityRoleAssignment() : base(Guid.NewGuid()) { }
    public QualityRoleAssignment(Guid id) : base(id) { }

    public TenantId TenantId { get; set; }
    public string RecordCode { get; set; } = "PG06-R04";
    public string Number { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public Guid UserId { get; set; }
    public string PersonName { get; set; } = string.Empty;
    public Guid? SubstituteUserId { get; set; }
    public string SubstituteName { get; set; } = string.Empty;
    public DateTime Since { get; set; } = DateTime.UtcNow;
    public DateTime? Until { get; set; }
    public string Status { get; set; } = QualityRoleAssignmentStatuses.Active;
    public string Notes { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed record CreateRoleAssignmentRequest(
    string Role,
    Guid UserId,
    string PersonName,
    DateTime? Since = null,
    Guid? SubstituteUserId = null,
    string? SubstituteName = null,
    string? Notes = null);

public sealed record UpdateRoleAssignmentRequest(
    string? Role = null,
    string? PersonName = null,
    Guid? SubstituteUserId = null,
    string? SubstituteName = null,
    DateTime? Since = null,
    DateTime? Until = null,
    string? Status = null,
    string? Notes = null);

// ─── PG05 Proveedores ────────────────────────────────────────────────────────

public static class QualitySupplierEvaluationStatuses
{
    public const string Draft = "Draft";
    public const string Approved = "Approved";
    public const string Rejected = "Rejected";
    public const string Suspended = "Suspended";
    public const string Cancelled = "Cancelled";
}

/// <summary>PG05-R01 — evaluación inicial de proveedor (Directorio).</summary>
public sealed class QualitySupplierEvaluation : Entity<Guid>
{
    public QualitySupplierEvaluation() : base(Guid.NewGuid()) { }
    public QualitySupplierEvaluation(Guid id) : base(id) { }

    public TenantId TenantId { get; set; }
    public string RecordCode { get; set; } = "PG05-R01";
    public string Number { get; set; } = string.Empty; // EVA-2026-0001
    public Guid SupplierId { get; set; }
    public string SupplierName { get; set; } = string.Empty;
    public string SupplierDocument { get; set; } = string.Empty;
    public string ServiceScope { get; set; } = string.Empty;
    public DateTime EvaluatedAt { get; set; } = DateTime.UtcNow;
    public decimal? Score { get; set; } // 0-100
    public string CriteriaNotes { get; set; } = string.Empty;
    public string Strengths { get; set; } = string.Empty;
    public string Weaknesses { get; set; } = string.Empty;
    public string ApprovedBy { get; set; } = string.Empty;
    public DateTime? ApprovedAt { get; set; }
    public DateTime? ValidUntil { get; set; }
    public Guid? EvidenceFileId { get; set; }
    public string Status { get; set; } = QualitySupplierEvaluationStatuses.Draft;
    public string Notes { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed record CreateSupplierEvaluationRequest(
    Guid SupplierId,
    string SupplierName,
    DateTime? EvaluatedAt = null,
    string? SupplierDocument = null,
    string? ServiceScope = null,
    decimal? Score = null,
    string? CriteriaNotes = null,
    string? Strengths = null,
    string? Weaknesses = null,
    DateTime? ValidUntil = null,
    Guid? EvidenceFileId = null,
    string? Notes = null);

public sealed record UpdateSupplierEvaluationRequest(
    string? SupplierName = null,
    string? SupplierDocument = null,
    string? ServiceScope = null,
    DateTime? EvaluatedAt = null,
    decimal? Score = null,
    string? CriteriaNotes = null,
    string? Strengths = null,
    string? Weaknesses = null,
    string? ApprovedBy = null,
    DateTime? ApprovedAt = null,
    DateTime? ValidUntil = null,
    Guid? EvidenceFileId = null,
    string? Status = null,
    string? Notes = null);

public static class QualitySupplierPerformanceStatuses
{
    public const string Draft = "Draft";
    public const string Completed = "Completed";
    public const string Cancelled = "Cancelled";
}

/// <summary>PG05-R03 — evaluación de desempeño de proveedor habilitado.</summary>
public sealed class QualitySupplierPerformanceReview : Entity<Guid>
{
    public QualitySupplierPerformanceReview() : base(Guid.NewGuid()) { }
    public QualitySupplierPerformanceReview(Guid id) : base(id) { }

    public TenantId TenantId { get; set; }
    public string RecordCode { get; set; } = "PG05-R03";
    public string Number { get; set; } = string.Empty; // DES-2026-0001
    public Guid SupplierId { get; set; }
    public string SupplierName { get; set; } = string.Empty;
    public Guid? EvaluationId { get; set; }
    public string Period { get; set; } = string.Empty; // 2026-Q1 / 2026
    public DateTime ReviewDate { get; set; } = DateTime.UtcNow;
    public decimal? Score { get; set; }
    public decimal? QualityScore { get; set; }
    public decimal? DeliveryScore { get; set; }
    public decimal? ServiceScore { get; set; }
    public string Comments { get; set; } = string.Empty;
    public string ReviewedBy { get; set; } = string.Empty;
    public Guid? EvidenceFileId { get; set; }
    public string Status { get; set; } = QualitySupplierPerformanceStatuses.Draft;
    public string Notes { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed record CreateSupplierPerformanceRequest(
    Guid SupplierId,
    string SupplierName,
    string? Period = null,
    DateTime? ReviewDate = null,
    Guid? EvaluationId = null,
    decimal? Score = null,
    decimal? QualityScore = null,
    decimal? DeliveryScore = null,
    decimal? ServiceScore = null,
    string? Comments = null,
    string? ReviewedBy = null,
    Guid? EvidenceFileId = null,
    string? Notes = null);

public sealed record UpdateSupplierPerformanceRequest(
    string? SupplierName = null,
    string? Period = null,
    DateTime? ReviewDate = null,
    Guid? EvaluationId = null,
    decimal? Score = null,
    decimal? QualityScore = null,
    decimal? DeliveryScore = null,
    decimal? ServiceScore = null,
    string? Comments = null,
    string? ReviewedBy = null,
    Guid? EvidenceFileId = null,
    string? Status = null,
    string? Notes = null);

// ─── PG08 Revisión por la dirección ──────────────────────────────────────────

public static class QualityManagementReviewStatuses
{
    public const string Draft = "Draft";
    public const string Completed = "Completed";
    public const string Cancelled = "Cancelled";
}

/// <summary>PG08-R01 — informe de revisión por la dirección (inputs auto del SGC).</summary>
public sealed class QualityManagementReview : Entity<Guid>
{
    public QualityManagementReview() : base(Guid.NewGuid()) { }
    public QualityManagementReview(Guid id) : base(id) { }

    public TenantId TenantId { get; set; }
    public string RecordCode { get; set; } = "PG08-R01";
    public string Number { get; set; } = string.Empty; // REV-2026-0001
    public int ProgramYear { get; set; }
    public DateTime ReviewDate { get; set; } = DateTime.UtcNow;
    public string Attendees { get; set; } = string.Empty;
    public string InputsSnapshotJson { get; set; } = string.Empty;
    public string InputsNotes { get; set; } = string.Empty;
    public string Decisions { get; set; } = string.Empty;
    public string Actions { get; set; } = string.Empty;
    public string FollowUp { get; set; } = string.Empty;
    public Guid? EvidenceFileId { get; set; }
    public string Status { get; set; } = QualityManagementReviewStatuses.Draft;
    public string Notes { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed record CreateManagementReviewRequest(
    int ProgramYear,
    DateTime? ReviewDate = null,
    string? Attendees = null,
    string? InputsNotes = null,
    string? Decisions = null,
    string? Actions = null,
    string? FollowUp = null,
    Guid? EvidenceFileId = null,
    string? Notes = null);

public sealed record UpdateManagementReviewRequest(
    int? ProgramYear = null,
    DateTime? ReviewDate = null,
    string? Attendees = null,
    string? InputsNotes = null,
    string? Decisions = null,
    string? Actions = null,
    string? FollowUp = null,
    Guid? EvidenceFileId = null,
    string? Status = null,
    string? Notes = null);

// ─── PG09-R3 Encuesta de satisfacción ────────────────────────────────────────

public static class QualitySatisfactionSurveyStatuses
{
    public const string Draft = "Draft";
    public const string Received = "Received";
    public const string Cancelled = "Cancelled";
}

/// <summary>PG09-R3 — encuesta de satisfacción (opcionalmente ligada a informe de ensayo).</summary>
public sealed class QualitySatisfactionSurvey : Entity<Guid>
{
    public QualitySatisfactionSurvey() : base(Guid.NewGuid()) { }
    public QualitySatisfactionSurvey(Guid id) : base(id) { }

    public TenantId TenantId { get; set; }
    public string RecordCode { get; set; } = "PG09-R03";
    public string Number { get; set; } = string.Empty; // ENC-2026-0001
    public Guid? CalibrationReportId { get; set; }
    public string CertificateNumber { get; set; } = string.Empty;
    public Guid? CustomerId { get; set; }
    public string CustomerName { get; set; } = string.Empty;
    public DateTime SurveyDate { get; set; } = DateTime.UtcNow;
    public string Channel { get; set; } = "Other"; // Email, Phone, InPerson, Other
    /// <summary>Puntualidad 1-5.</summary>
    public int? ScorePunctuality { get; set; }
    /// <summary>Calidad técnica 1-5.</summary>
    public int? ScoreQuality { get; set; }
    /// <summary>Comunicación / trato 1-5.</summary>
    public int? ScoreCommunication { get; set; }
    /// <summary>Satisfacción general 1-5.</summary>
    public int? ScoreOverall { get; set; }
    public string Comments { get; set; } = string.Empty;
    public string AnswersJson { get; set; } = string.Empty; // extras libres
    public Guid? EvidenceFileId { get; set; }
    public string Status { get; set; } = QualitySatisfactionSurveyStatuses.Draft;
    public string Notes { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed record CreateSatisfactionSurveyRequest(
    string CustomerName,
    DateTime? SurveyDate = null,
    Guid? CalibrationReportId = null,
    string? CertificateNumber = null,
    Guid? CustomerId = null,
    string? Channel = null,
    int? ScorePunctuality = null,
    int? ScoreQuality = null,
    int? ScoreCommunication = null,
    int? ScoreOverall = null,
    string? Comments = null,
    string? AnswersJson = null,
    Guid? EvidenceFileId = null,
    string? Notes = null);

public sealed record UpdateSatisfactionSurveyRequest(
    string? CustomerName = null,
    DateTime? SurveyDate = null,
    Guid? CalibrationReportId = null,
    string? CertificateNumber = null,
    Guid? CustomerId = null,
    string? Channel = null,
    int? ScorePunctuality = null,
    int? ScoreQuality = null,
    int? ScoreCommunication = null,
    int? ScoreOverall = null,
    string? Comments = null,
    string? AnswersJson = null,
    Guid? EvidenceFileId = null,
    string? Status = null,
    string? Notes = null);

// ─── PG14 Equipamiento auxiliar + R5/R6 ───────────────────────────────────────

public static class QualityEquipmentKinds
{
    public const string Truck = "Truck";
    public const string Trailer = "Trailer";
    public const string Forklift = "Forklift";
    public const string Other = "Other";
}

public static class QualityEquipmentStatuses
{
    public const string Active = "Active";
    public const string OutOfService = "OutOfService";
    public const string Retired = "Retired";
}

/// <summary>Equipos auxiliares de Calidad (camión/acoplado/autoelevador) — no miden.</summary>
public sealed class QualityEquipment : Entity<Guid>
{
    public QualityEquipment() : base(Guid.NewGuid()) { }
    public QualityEquipment(Guid id) : base(id) { }

    public TenantId TenantId { get; set; }
    public string Code { get; set; } = string.Empty; // EQ 001
    public string Kind { get; set; } = QualityEquipmentKinds.Other;
    public string Description { get; set; } = string.Empty;
    public string Brand { get; set; } = string.Empty;
    public string Model { get; set; } = string.Empty;
    public string SerialNumber { get; set; } = string.Empty;
    public string Plate { get; set; } = string.Empty;
    public Guid? ParentEquipmentId { get; set; } // forklift → truck
    public Guid? FleetVehicleId { get; set; } // optional Flota link
    public string Location { get; set; } = string.Empty;
    public string Status { get; set; } = QualityEquipmentStatuses.Active;
    public string Notes { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed record CreateQualityEquipmentRequest(
    string Kind,
    string? Code = null,
    string? Description = null,
    string? Brand = null,
    string? Model = null,
    string? SerialNumber = null,
    string? Plate = null,
    Guid? ParentEquipmentId = null,
    Guid? FleetVehicleId = null,
    string? Location = null,
    string? Notes = null);

public sealed record UpdateQualityEquipmentRequest(
    string? Kind = null,
    string? Description = null,
    string? Brand = null,
    string? Model = null,
    string? SerialNumber = null,
    string? Plate = null,
    Guid? ParentEquipmentId = null,
    Guid? FleetVehicleId = null,
    string? Location = null,
    string? Status = null,
    string? Notes = null);

public static class QualityIntermediateCheckStatuses
{
    public const string Draft = "Draft";
    public const string Completed = "Completed";
    public const string Cancelled = "Cancelled";
}

public static class QualityIntermediateCheckResults
{
    public const string Pass = "Pass";
    public const string Fail = "Fail";
    public const string Conditional = "Conditional";
}

/// <summary>PG14-R5 — verificación intermedia (típic. pesa 1000 kg).</summary>
public sealed class QualityIntermediateCheck : Entity<Guid>
{
    public QualityIntermediateCheck() : base(Guid.NewGuid()) { }
    public QualityIntermediateCheck(Guid id) : base(id) { }

    public TenantId TenantId { get; set; }
    public string RecordCode { get; set; } = "PG14-R05";
    public string Number { get; set; } = string.Empty; // VIC-2026-0001
    public DateTime CheckDate { get; set; } = DateTime.UtcNow;
    public string WeightUsed { get; set; } = "1000 kg";
    public string Instrument { get; set; } = string.Empty; // balanza / equipo verificado
    public Guid? EquipmentId { get; set; } // optional QualityEquipment
    public string Readings { get; set; } = string.Empty;
    public string Result { get; set; } = string.Empty; // Pass|Fail|Conditional
    public string Responsible { get; set; } = string.Empty;
    public Guid? EvidenceFileId { get; set; }
    public string Status { get; set; } = QualityIntermediateCheckStatuses.Draft;
    public string Notes { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed record CreateIntermediateCheckRequest(
    DateTime? CheckDate = null,
    string? WeightUsed = null,
    string? Instrument = null,
    Guid? EquipmentId = null,
    string? Readings = null,
    string? Result = null,
    string? Responsible = null,
    Guid? EvidenceFileId = null,
    string? Notes = null);

public sealed record UpdateIntermediateCheckRequest(
    DateTime? CheckDate = null,
    string? WeightUsed = null,
    string? Instrument = null,
    Guid? EquipmentId = null,
    string? Readings = null,
    string? Result = null,
    string? Responsible = null,
    Guid? EvidenceFileId = null,
    string? Status = null,
    string? Notes = null);

public static class QualityMaintenanceFrequencies
{
    public const string Monthly = "Monthly";
    public const string Quarterly = "Quarterly";
    public const string Semiannual = "Semiannual";
    public const string Annual = "Annual";
}

public static class QualityMaintenanceStatuses
{
    public const string Active = "Active";
    public const string Done = "Done";
    public const string Cancelled = "Cancelled";
}

/// <summary>PG14-R6 — ítem de programa de mantenimiento preventivo.</summary>
public sealed class QualityMaintenancePlanItem : Entity<Guid>
{
    public QualityMaintenancePlanItem() : base(Guid.NewGuid()) { }
    public QualityMaintenancePlanItem(Guid id) : base(id) { }

    public TenantId TenantId { get; set; }
    public string RecordCode { get; set; } = "PG14-R06";
    public string Number { get; set; } = string.Empty; // MP-2026-0001
    public Guid EquipmentId { get; set; }
    public string EquipmentCode { get; set; } = string.Empty;
    public string EquipmentDescription { get; set; } = string.Empty;
    public string Activity { get; set; } = string.Empty;
    public string Frequency { get; set; } = QualityMaintenanceFrequencies.Monthly;
    public DateTime? NextDue { get; set; }
    public DateTime? LastDone { get; set; }
    public string Responsible { get; set; } = string.Empty;
    public string Status { get; set; } = QualityMaintenanceStatuses.Active;
    public string Notes { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed record CreateMaintenancePlanItemRequest(
    Guid EquipmentId,
    string Activity,
    string? Frequency = null,
    DateTime? NextDue = null,
    string? Responsible = null,
    string? Notes = null);

public sealed record UpdateMaintenancePlanItemRequest(
    string? Activity = null,
    string? Frequency = null,
    DateTime? NextDue = null,
    DateTime? LastDone = null,
    string? Responsible = null,
    string? Status = null,
    string? Notes = null);

// ─── PG14-R1 Hoja de vida ────────────────────────────────────────────────────

public static class QualityEquipmentLogAssetSources
{
    public const string StandardWeight = "StandardWeight";
    public const string Instrument = "Instrument";
    public const string QualityEquipment = "QualityEquipment";
}

public static class QualityEquipmentLogKinds
{
    public const string Calibration = "C";
    public const string Verification = "V";
    public const string PreventiveMaintenance = "MP";
    public const string CorrectiveMaintenance = "MC";
    public const string Decommission = "Baja";
}

public static class QualityEquipmentLogVerdicts
{
    public const string Fit = "Apto";
    public const string Unfit = "NoApto";
    public const string Conditional = "Condicional";
}

public static class QualityEquipmentLogStatuses
{
    public const string Active = "Active";
    public const string Cancelled = "Cancelled";
}

/// <summary>PG14-R1 — evento de hoja de vida (pesa / instrumento / auxiliar).</summary>
public sealed class QualityEquipmentLogEntry : Entity<Guid>
{
    public QualityEquipmentLogEntry() : base(Guid.NewGuid()) { }
    public QualityEquipmentLogEntry(Guid id) : base(id) { }

    public TenantId TenantId { get; set; }
    public string RecordCode { get; set; } = "PG14-R01";
    public string Number { get; set; } = string.Empty; // HV-2026-0001
    public string AssetSource { get; set; } = QualityEquipmentLogAssetSources.StandardWeight;
    public Guid AssetId { get; set; }
    public string AssetCode { get; set; } = string.Empty;
    public string AssetDescription { get; set; } = string.Empty;
    public DateTime EventDate { get; set; } = DateTime.UtcNow;
    public string Kind { get; set; } = QualityEquipmentLogKinds.Calibration; // C|V|MP|MC|Baja
    public string Description { get; set; } = string.Empty;
    public string CertificateNumber { get; set; } = string.Empty;
    public string Verdict { get; set; } = string.Empty; // Apto|NoApto|Condicional
    public bool ApprovedByTechnicalDirector { get; set; }
    public string Responsible { get; set; } = string.Empty;
    public Guid? EvidenceFileId { get; set; }
    public string Status { get; set; } = QualityEquipmentLogStatuses.Active;
    public string Notes { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed record CreateEquipmentLogEntryRequest(
    string AssetSource,
    Guid AssetId,
    string Kind,
    DateTime? EventDate = null,
    string? AssetCode = null,
    string? AssetDescription = null,
    string? Description = null,
    string? CertificateNumber = null,
    string? Verdict = null,
    bool? ApprovedByTechnicalDirector = null,
    string? Responsible = null,
    Guid? EvidenceFileId = null,
    string? Notes = null);

public sealed record UpdateEquipmentLogEntryRequest(
    DateTime? EventDate = null,
    string? Kind = null,
    string? Description = null,
    string? CertificateNumber = null,
    string? Verdict = null,
    bool? ApprovedByTechnicalDirector = null,
    string? Responsible = null,
    Guid? EvidenceFileId = null,
    string? Status = null,
    string? Notes = null);
