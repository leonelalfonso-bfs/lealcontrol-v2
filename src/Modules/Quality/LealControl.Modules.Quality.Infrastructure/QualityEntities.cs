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
