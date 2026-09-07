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
