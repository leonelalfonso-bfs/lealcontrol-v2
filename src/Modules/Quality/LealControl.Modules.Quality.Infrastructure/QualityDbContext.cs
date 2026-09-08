using LealControl.BuildingBlocks.Tenancy;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

namespace LealControl.Modules.Quality.Infrastructure;

public sealed class QualityDbContext : DbContext
{
    public const string Schema = "quality";

    private readonly ILogger<QualityDbContext> _logger;

    public DbSet<QualityDocument> Documents => Set<QualityDocument>();
    public DbSet<QualityDocumentVersion> DocumentVersions => Set<QualityDocumentVersion>();
    public DbSet<QualityFile> Files => Set<QualityFile>();
    public DbSet<QualityDocumentRelation> DocumentRelations => Set<QualityDocumentRelation>();
    public DbSet<QualityDistributionAck> DistributionAcks => Set<QualityDistributionAck>();
    public DbSet<QualityConfidentialityCommitment> ConfidentialityCommitments => Set<QualityConfidentialityCommitment>();
    public DbSet<QualityIndicator> Indicators => Set<QualityIndicator>();
    public DbSet<QualityIndicatorValue> IndicatorValues => Set<QualityIndicatorValue>();
    public DbSet<QualityInstitutionalNote> InstitutionalNotes => Set<QualityInstitutionalNote>();
    public DbSet<QualityComplaint> Complaints => Set<QualityComplaint>();
    public DbSet<QualityNonConformity> NonConformities => Set<QualityNonConformity>();
    public DbSet<QualityInternalAudit> InternalAudits => Set<QualityInternalAudit>();
    public DbSet<QualityTrainingPlanItem> TrainingPlanItems => Set<QualityTrainingPlanItem>();
    public DbSet<QualityPersonnelAuthorization> PersonnelAuthorizations => Set<QualityPersonnelAuthorization>();
    public DbSet<QualityCompetenceReview> CompetenceReviews => Set<QualityCompetenceReview>();
    public DbSet<QualityRoleAssignment> RoleAssignments => Set<QualityRoleAssignment>();
    public DbSet<QualitySupplierEvaluation> SupplierEvaluations => Set<QualitySupplierEvaluation>();
    public DbSet<QualitySupplierPerformanceReview> SupplierPerformanceReviews => Set<QualitySupplierPerformanceReview>();
    public DbSet<QualityManagementReview> ManagementReviews => Set<QualityManagementReview>();
    public DbSet<QualityAuditEvent> AuditEvents => Set<QualityAuditEvent>();

    public QualityDbContext(DbContextOptions<QualityDbContext> options)
        : this(options, null)
    {
    }

    public QualityDbContext(DbContextOptions<QualityDbContext> options, ILogger<QualityDbContext>? logger)
        : base(options)
    {
        _logger = logger ?? NullLogger<QualityDbContext>.Instance;
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        modelBuilder.HasDefaultSchema(Schema);

        modelBuilder.Entity<QualityDocument>(b =>
        {
            b.ToTable("documents", Schema);
            b.HasKey(x => x.Id);
            b.Property(x => x.Code).HasMaxLength(32).IsRequired();
            b.Property(x => x.DisplayCode).HasMaxLength(120).IsRequired();
            b.Property(x => x.Type).HasMaxLength(32).IsRequired();
            b.Property(x => x.Title).HasMaxLength(240).IsRequired();
            b.Property(x => x.Status).HasMaxLength(32).IsRequired();
            b.Property(x => x.OwnerRole).HasMaxLength(120);
            b.Property(x => x.Iso17025Clauses).HasMaxLength(240);
            b.Property(x => x.RecordKind).HasMaxLength(32);
            b.Property(x => x.LinkedModule).HasMaxLength(64);
            b.Property(x => x.ExternalSource).HasMaxLength(240);
            b.Property(x => x.ExternalUrl).HasMaxLength(500);
            b.Property(x => x.DeactivationReason).HasMaxLength(1000);
            b.Property(x => x.TenantId).HasConversion(v => v.Value, v => new TenantId(v));
            b.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
            b.HasIndex(x => new { x.TenantId, x.ParentId });
            b.HasIndex(x => new { x.TenantId, x.Type });
        });

        modelBuilder.Entity<QualityDocumentVersion>(b =>
        {
            b.ToTable("document_versions", Schema);
            b.HasKey(x => x.Id);
            b.Property(x => x.ChangeSummary).HasMaxLength(2000);
            b.Property(x => x.ElaboratedBy).HasMaxLength(160);
            b.Property(x => x.ReviewedBy).HasMaxLength(160);
            b.Property(x => x.ApprovedBy).HasMaxLength(160);
            b.Property(x => x.Status).HasMaxLength(32).IsRequired();
            b.Property(x => x.TenantId).HasConversion(v => v.Value, v => new TenantId(v));
            b.HasIndex(x => new { x.TenantId, x.DocumentId, x.Version }).IsUnique();
        });

        modelBuilder.Entity<QualityFile>(b =>
        {
            b.ToTable("files", Schema);
            b.HasKey(x => x.Id);
            b.Property(x => x.FileName).HasMaxLength(260).IsRequired();
            b.Property(x => x.ContentType).HasMaxLength(160).IsRequired();
            b.Property(x => x.Sha256).HasMaxLength(64).IsRequired();
            b.Property(x => x.StorageKey).HasMaxLength(500).IsRequired();
            b.Property(x => x.Role).HasMaxLength(32).IsRequired();
            b.Property(x => x.UploadedByName).HasMaxLength(160);
            b.Property(x => x.TenantId).HasConversion(v => v.Value, v => new TenantId(v));
            b.HasIndex(x => new { x.TenantId, x.Sha256 });
        });

        modelBuilder.Entity<QualityDocumentRelation>(b =>
        {
            b.ToTable("document_relations", Schema);
            b.HasKey(x => x.Id);
            b.Property(x => x.RelationType).HasMaxLength(48).IsRequired();
            b.Property(x => x.Notes).HasMaxLength(1000);
            b.Property(x => x.TenantId).HasConversion(v => v.Value, v => new TenantId(v));
            b.HasIndex(x => new { x.TenantId, x.FromDocumentId, x.ToDocumentId, x.RelationType }).IsUnique();
        });

        modelBuilder.Entity<QualityDistributionAck>(b =>
        {
            b.ToTable("distribution_acks", Schema);
            b.HasKey(x => x.Id);
            b.Property(x => x.UserName).HasMaxLength(160);
            b.Property(x => x.UserEmail).HasMaxLength(200);
            b.Property(x => x.TenantId).HasConversion(v => v.Value, v => new TenantId(v));
            b.HasIndex(x => new { x.TenantId, x.DocumentVersionId, x.UserId });
        });

        modelBuilder.Entity<QualityConfidentialityCommitment>(b =>
        {
            b.ToTable("confidentiality_commitments", Schema);
            b.HasKey(x => x.Id);
            b.Property(x => x.Kind).HasMaxLength(32).IsRequired();
            b.Property(x => x.RecordCode).HasMaxLength(32).IsRequired();
            b.Property(x => x.PersonName).HasMaxLength(160).IsRequired();
            b.Property(x => x.PersonEmail).HasMaxLength(200);
            b.Property(x => x.PersonRole).HasMaxLength(120);
            b.Property(x => x.Organization).HasMaxLength(200);
            b.Property(x => x.Notes).HasMaxLength(2000);
            b.Property(x => x.Status).HasMaxLength(32).HasDefaultValue("Active");
            b.Property(x => x.TenantId).HasConversion(v => v.Value, v => new TenantId(v));
            b.HasIndex(x => new { x.TenantId, x.Kind, x.SignedAt });
            b.HasIndex(x => new { x.TenantId, x.RecordCode });
        });

        modelBuilder.Entity<QualityIndicator>(b =>
        {
            b.ToTable("indicators", Schema);
            b.HasKey(x => x.Id);
            b.Property(x => x.RecordCode).HasMaxLength(32).IsRequired();
            b.Property(x => x.Name).HasMaxLength(200).IsRequired();
            b.Property(x => x.Objective).HasMaxLength(1000);
            b.Property(x => x.Formula).HasMaxLength(500);
            b.Property(x => x.TargetValue).HasPrecision(18, 4);
            b.Property(x => x.TargetUnit).HasMaxLength(40);
            b.Property(x => x.Direction).HasMaxLength(32).HasDefaultValue("HigherIsBetter");
            b.Property(x => x.Responsible).HasMaxLength(160);
            b.Property(x => x.Frequency).HasMaxLength(32).HasDefaultValue("Monthly");
            b.Property(x => x.Notes).HasMaxLength(2000);
            b.Property(x => x.Status).HasMaxLength(32).HasDefaultValue("Active");
            b.Property(x => x.TenantId).HasConversion(v => v.Value, v => new TenantId(v));
            b.HasIndex(x => new { x.TenantId, x.Status, x.Name });
            b.HasIndex(x => new { x.TenantId, x.RecordCode });
        });

        modelBuilder.Entity<QualityIndicatorValue>(b =>
        {
            b.ToTable("indicator_values", Schema);
            b.HasKey(x => x.Id);
            b.Property(x => x.Period).HasMaxLength(32).IsRequired();
            b.Property(x => x.Value).HasPrecision(18, 4);
            b.Property(x => x.Notes).HasMaxLength(2000);
            b.Property(x => x.RecordedBy).HasMaxLength(160);
            b.Property(x => x.TenantId).HasConversion(v => v.Value, v => new TenantId(v));
            b.HasIndex(x => new { x.TenantId, x.IndicatorId, x.Period }).IsUnique();
            b.HasIndex(x => new { x.TenantId, x.IndicatorId, x.RecordedAtUtc });
        });

        modelBuilder.Entity<QualityInstitutionalNote>(b =>
        {
            b.ToTable("institutional_notes", Schema);
            b.HasKey(x => x.Id);
            b.Property(x => x.RecordCode).HasMaxLength(32).IsRequired();
            b.Property(x => x.Subject).HasMaxLength(240).IsRequired();
            b.Property(x => x.Body).HasMaxLength(4000);
            b.Property(x => x.IssuedBy).HasMaxLength(160);
            b.Property(x => x.Audience).HasMaxLength(240);
            b.Property(x => x.Notes).HasMaxLength(2000);
            b.Property(x => x.Status).HasMaxLength(32).HasDefaultValue("Active");
            b.Property(x => x.TenantId).HasConversion(v => v.Value, v => new TenantId(v));
            b.HasIndex(x => new { x.TenantId, x.IssuedAt });
            b.HasIndex(x => new { x.TenantId, x.RecordCode, x.Status });
        });

        modelBuilder.Entity<QualityComplaint>(b =>
        {
            b.ToTable("complaints", Schema);
            b.HasKey(x => x.Id);
            b.Property(x => x.RecordCode).HasMaxLength(32).IsRequired();
            b.Property(x => x.Number).HasMaxLength(32).IsRequired();
            b.Property(x => x.Channel).HasMaxLength(40);
            b.Property(x => x.PartyName).HasMaxLength(200).IsRequired();
            b.Property(x => x.PartyContact).HasMaxLength(240);
            b.Property(x => x.Description).HasMaxLength(4000).IsRequired();
            b.Property(x => x.ValidationNotes).HasMaxLength(2000);
            b.Property(x => x.Investigation).HasMaxLength(4000);
            b.Property(x => x.Actions).HasMaxLength(4000);
            b.Property(x => x.Responsible).HasMaxLength(160);
            b.Property(x => x.Notes).HasMaxLength(2000);
            b.Property(x => x.Status).HasMaxLength(40).HasDefaultValue(QualityComplaintStatuses.Open);
            b.Property(x => x.TenantId).HasConversion(v => v.Value, v => new TenantId(v));
            b.HasIndex(x => new { x.TenantId, x.Number }).IsUnique();
            b.HasIndex(x => new { x.TenantId, x.Status, x.ReceivedAt });
            b.HasIndex(x => new { x.TenantId, x.CloseDueAt });
        });

        modelBuilder.Entity<QualityNonConformity>(b =>
        {
            b.ToTable("non_conformities", Schema);
            b.HasKey(x => x.Id);
            b.Property(x => x.RecordCode).HasMaxLength(32).IsRequired();
            b.Property(x => x.Number).HasMaxLength(32).IsRequired();
            b.Property(x => x.Kind).HasMaxLength(40).IsRequired();
            b.Property(x => x.Origin).HasMaxLength(80);
            b.Property(x => x.Description).HasMaxLength(4000).IsRequired();
            b.Property(x => x.ImmediateAction).HasMaxLength(4000);
            b.Property(x => x.RootCauseMethod).HasMaxLength(120);
            b.Property(x => x.RootCause).HasMaxLength(4000);
            b.Property(x => x.CorrectiveAction).HasMaxLength(4000);
            b.Property(x => x.Responsible).HasMaxLength(160);
            b.Property(x => x.EffectivenessCheck).HasMaxLength(4000);
            b.Property(x => x.EffectivenessResult).HasMaxLength(40);
            b.Property(x => x.Status).HasMaxLength(40).HasDefaultValue(QualityNonConformityStatuses.Open);
            b.Property(x => x.Controls).HasMaxLength(4000);
            b.Property(x => x.Notes).HasMaxLength(2000);
            b.Property(x => x.TenantId).HasConversion(v => v.Value, v => new TenantId(v));
            b.HasIndex(x => new { x.TenantId, x.Number }).IsUnique();
            b.HasIndex(x => new { x.TenantId, x.Kind, x.Status });
            b.HasIndex(x => new { x.TenantId, x.DueDate });
        });

        modelBuilder.Entity<QualityInternalAudit>(b =>
        {
            b.ToTable("internal_audits", Schema);
            b.HasKey(x => x.Id);
            b.Property(x => x.RecordCode).HasMaxLength(32).IsRequired();
            b.Property(x => x.Number).HasMaxLength(32).IsRequired();
            b.Property(x => x.Scope).HasMaxLength(2000);
            b.Property(x => x.Clauses).HasMaxLength(500);
            b.Property(x => x.Auditor).HasMaxLength(160);
            b.Property(x => x.Auditee).HasMaxLength(200);
            b.Property(x => x.Objectives).HasMaxLength(2000);
            b.Property(x => x.FindingsSummary).HasMaxLength(4000);
            b.Property(x => x.Conclusions).HasMaxLength(4000);
            b.Property(x => x.Recommendations).HasMaxLength(4000);
            b.Property(x => x.ChecklistNotes).HasMaxLength(4000);
            b.Property(x => x.Status).HasMaxLength(40).HasDefaultValue(QualityInternalAuditStatuses.Planned);
            b.Property(x => x.Notes).HasMaxLength(2000);
            b.Property(x => x.TenantId).HasConversion(v => v.Value, v => new TenantId(v));
            b.HasIndex(x => new { x.TenantId, x.Number }).IsUnique();
            b.HasIndex(x => new { x.TenantId, x.ProgramYear, x.Status });
            b.HasIndex(x => new { x.TenantId, x.PlannedDate });
        });

        modelBuilder.Entity<QualityTrainingPlanItem>(b =>
        {
            b.ToTable("training_plan_items", Schema);
            b.HasKey(x => x.Id);
            b.Property(x => x.RecordCode).HasMaxLength(32).IsRequired();
            b.Property(x => x.Number).HasMaxLength(32).IsRequired();
            b.Property(x => x.Topic).HasMaxLength(500).IsRequired();
            b.Property(x => x.TargetRoles).HasMaxLength(500);
            b.Property(x => x.EffectivenessCheck).HasMaxLength(4000);
            b.Property(x => x.Status).HasMaxLength(40).HasDefaultValue(QualityTrainingStatuses.Planned);
            b.Property(x => x.Notes).HasMaxLength(2000);
            b.Property(x => x.TenantId).HasConversion(v => v.Value, v => new TenantId(v));
            b.HasIndex(x => new { x.TenantId, x.Number }).IsUnique();
            b.HasIndex(x => new { x.TenantId, x.ProgramYear, x.Status });
        });

        modelBuilder.Entity<QualityPersonnelAuthorization>(b =>
        {
            b.ToTable("personnel_authorizations", Schema);
            b.HasKey(x => x.Id);
            b.Property(x => x.RecordCode).HasMaxLength(32).IsRequired();
            b.Property(x => x.Number).HasMaxLength(32).IsRequired();
            b.Property(x => x.PersonName).HasMaxLength(160).IsRequired();
            b.Property(x => x.MethodDocumentCode).HasMaxLength(64).IsRequired();
            b.Property(x => x.MethodTitle).HasMaxLength(240);
            b.Property(x => x.TrainingEvidence).HasMaxLength(4000);
            b.Property(x => x.SupervisedBy).HasMaxLength(160);
            b.Property(x => x.AuthorizedByName).HasMaxLength(160);
            b.Property(x => x.Status).HasMaxLength(40).HasDefaultValue(QualityAuthorizationStatuses.Draft);
            b.Property(x => x.Notes).HasMaxLength(2000);
            b.Property(x => x.TenantId).HasConversion(v => v.Value, v => new TenantId(v));
            b.HasIndex(x => new { x.TenantId, x.Number }).IsUnique();
            b.HasIndex(x => new { x.TenantId, x.UserId, x.MethodDocumentCode, x.Status });
            b.HasIndex(x => new { x.TenantId, x.ValidUntil });
        });

        modelBuilder.Entity<QualityCompetenceReview>(b =>
        {
            b.ToTable("competence_reviews", Schema);
            b.HasKey(x => x.Id);
            b.Property(x => x.RecordCode).HasMaxLength(32).IsRequired();
            b.Property(x => x.Number).HasMaxLength(32).IsRequired();
            b.Property(x => x.PersonName).HasMaxLength(160).IsRequired();
            b.Property(x => x.Evaluator).HasMaxLength(160);
            b.Property(x => x.Conclusions).HasMaxLength(4000);
            b.Property(x => x.Status).HasMaxLength(40).HasDefaultValue(QualityCompetenceStatuses.Draft);
            b.Property(x => x.Notes).HasMaxLength(2000);
            b.Property(x => x.TenantId).HasConversion(v => v.Value, v => new TenantId(v));
            b.HasIndex(x => new { x.TenantId, x.Number }).IsUnique();
            b.HasIndex(x => new { x.TenantId, x.UserId, x.ReviewYear });
        });

        modelBuilder.Entity<QualityRoleAssignment>(b =>
        {
            b.ToTable("role_assignments", Schema);
            b.HasKey(x => x.Id);
            b.Property(x => x.RecordCode).HasMaxLength(32).IsRequired();
            b.Property(x => x.Number).HasMaxLength(32).IsRequired();
            b.Property(x => x.Role).HasMaxLength(160).IsRequired();
            b.Property(x => x.PersonName).HasMaxLength(160).IsRequired();
            b.Property(x => x.SubstituteName).HasMaxLength(160);
            b.Property(x => x.Status).HasMaxLength(40).HasDefaultValue(QualityRoleAssignmentStatuses.Active);
            b.Property(x => x.Notes).HasMaxLength(2000);
            b.Property(x => x.TenantId).HasConversion(v => v.Value, v => new TenantId(v));
            b.HasIndex(x => new { x.TenantId, x.Number }).IsUnique();
            b.HasIndex(x => new { x.TenantId, x.Role, x.Status });
        });

        modelBuilder.Entity<QualitySupplierEvaluation>(b =>
        {
            b.ToTable("supplier_evaluations", Schema);
            b.HasKey(x => x.Id);
            b.Property(x => x.RecordCode).HasMaxLength(32).IsRequired();
            b.Property(x => x.Number).HasMaxLength(32).IsRequired();
            b.Property(x => x.SupplierName).HasMaxLength(240).IsRequired();
            b.Property(x => x.SupplierDocument).HasMaxLength(64);
            b.Property(x => x.ServiceScope).HasMaxLength(1000);
            b.Property(x => x.Score).HasPrecision(8, 2);
            b.Property(x => x.CriteriaNotes).HasMaxLength(4000);
            b.Property(x => x.Strengths).HasMaxLength(2000);
            b.Property(x => x.Weaknesses).HasMaxLength(2000);
            b.Property(x => x.ApprovedBy).HasMaxLength(160);
            b.Property(x => x.Status).HasMaxLength(40).HasDefaultValue(QualitySupplierEvaluationStatuses.Draft);
            b.Property(x => x.Notes).HasMaxLength(2000);
            b.Property(x => x.TenantId).HasConversion(v => v.Value, v => new TenantId(v));
            b.HasIndex(x => new { x.TenantId, x.Number }).IsUnique();
            b.HasIndex(x => new { x.TenantId, x.SupplierId, x.Status });
        });

        modelBuilder.Entity<QualitySupplierPerformanceReview>(b =>
        {
            b.ToTable("supplier_performance_reviews", Schema);
            b.HasKey(x => x.Id);
            b.Property(x => x.RecordCode).HasMaxLength(32).IsRequired();
            b.Property(x => x.Number).HasMaxLength(32).IsRequired();
            b.Property(x => x.SupplierName).HasMaxLength(240).IsRequired();
            b.Property(x => x.Period).HasMaxLength(40);
            b.Property(x => x.Score).HasPrecision(8, 2);
            b.Property(x => x.QualityScore).HasPrecision(8, 2);
            b.Property(x => x.DeliveryScore).HasPrecision(8, 2);
            b.Property(x => x.ServiceScore).HasPrecision(8, 2);
            b.Property(x => x.Comments).HasMaxLength(4000);
            b.Property(x => x.ReviewedBy).HasMaxLength(160);
            b.Property(x => x.Status).HasMaxLength(40).HasDefaultValue(QualitySupplierPerformanceStatuses.Draft);
            b.Property(x => x.Notes).HasMaxLength(2000);
            b.Property(x => x.TenantId).HasConversion(v => v.Value, v => new TenantId(v));
            b.HasIndex(x => new { x.TenantId, x.Number }).IsUnique();
            b.HasIndex(x => new { x.TenantId, x.SupplierId, x.ReviewDate });
        });

        modelBuilder.Entity<QualityManagementReview>(b =>
        {
            b.ToTable("management_reviews", Schema);
            b.HasKey(x => x.Id);
            b.Property(x => x.RecordCode).HasMaxLength(32).IsRequired();
            b.Property(x => x.Number).HasMaxLength(32).IsRequired();
            b.Property(x => x.Attendees).HasMaxLength(2000);
            b.Property(x => x.InputsSnapshotJson).HasColumnType("text");
            b.Property(x => x.InputsNotes).HasMaxLength(4000);
            b.Property(x => x.Decisions).HasMaxLength(4000);
            b.Property(x => x.Actions).HasMaxLength(4000);
            b.Property(x => x.FollowUp).HasMaxLength(4000);
            b.Property(x => x.Status).HasMaxLength(40).HasDefaultValue(QualityManagementReviewStatuses.Draft);
            b.Property(x => x.Notes).HasMaxLength(2000);
            b.Property(x => x.TenantId).HasConversion(v => v.Value, v => new TenantId(v));
            b.HasIndex(x => new { x.TenantId, x.Number }).IsUnique();
            b.HasIndex(x => new { x.TenantId, x.ProgramYear, x.Status });
        });

        modelBuilder.Entity<QualityAuditEvent>(b =>
        {
            b.ToTable("audit_events", Schema);
            b.HasKey(x => x.Id);
            b.Property(x => x.EntityType).HasMaxLength(64).IsRequired();
            b.Property(x => x.EventType).HasMaxLength(64).IsRequired();
            b.Property(x => x.Summary).HasMaxLength(1000).IsRequired();
            b.Property(x => x.BeforeJson).HasColumnType("text");
            b.Property(x => x.AfterJson).HasColumnType("text");
            b.Property(x => x.PerformedByName).HasMaxLength(160);
            b.Property(x => x.TenantId).HasConversion(v => v.Value, v => new TenantId(v));
            b.HasIndex(x => new { x.TenantId, x.EntityType, x.EntityId, x.OccurredAtUtc });
        });

    }

    public async Task EnsureQualityTablesAsync(CancellationToken ct = default)
    {
        var statements = new[]
        {
            @"CREATE SCHEMA IF NOT EXISTS quality;",

            @"CREATE TABLE IF NOT EXISTS quality.documents (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""Code"" character varying(32) NOT NULL,
                ""DisplayCode"" character varying(120) NOT NULL,
                ""Type"" character varying(32) NOT NULL,
                ""Title"" character varying(240) NOT NULL,
                ""ParentId"" uuid,
                ""SortOrder"" integer NOT NULL DEFAULT 0,
                ""Status"" character varying(32) NOT NULL DEFAULT 'Draft',
                ""CurrentVersionId"" uuid,
                ""ReviewPeriodMonths"" integer NOT NULL DEFAULT 24,
                ""NextReviewDate"" timestamp with time zone,
                ""OwnerRole"" character varying(120) NOT NULL DEFAULT 'Responsable de calidad',
                ""Iso17025Clauses"" character varying(240) NOT NULL DEFAULT '',
                ""RecordKind"" character varying(32),
                ""LinkedModule"" character varying(64),
                ""ExternalSource"" character varying(240),
                ""ExternalUrl"" character varying(500),
                ""DeactivationReason"" character varying(1000),
                ""CreatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now(),
                ""UpdatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now()
            );",
            @"CREATE UNIQUE INDEX IF NOT EXISTS ""IX_quality_documents_Tenant_Code"" ON quality.documents (""TenantId"", ""Code"");",
            @"CREATE INDEX IF NOT EXISTS ""IX_quality_documents_Tenant_Parent"" ON quality.documents (""TenantId"", ""ParentId"");",
            @"CREATE INDEX IF NOT EXISTS ""IX_quality_documents_Tenant_Type"" ON quality.documents (""TenantId"", ""Type"");",
            @"ALTER TABLE quality.documents ALTER COLUMN ""DisplayCode"" TYPE character varying(120);",

            @"CREATE TABLE IF NOT EXISTS quality.document_versions (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""DocumentId"" uuid NOT NULL,
                ""Version"" integer NOT NULL DEFAULT 1,
                ""PublishedFileId"" uuid,
                ""SourceFileId"" uuid,
                ""ChangeSummary"" character varying(2000) NOT NULL DEFAULT '',
                ""ElaboratedBy"" character varying(160) NOT NULL DEFAULT '',
                ""ElaboratedAt"" timestamp with time zone,
                ""ReviewedBy"" character varying(160) NOT NULL DEFAULT '',
                ""ReviewedAt"" timestamp with time zone,
                ""ApprovedBy"" character varying(160) NOT NULL DEFAULT '',
                ""ApprovedAt"" timestamp with time zone,
                ""EffectiveFrom"" timestamp with time zone,
                ""EffectiveTo"" timestamp with time zone,
                ""Status"" character varying(32) NOT NULL DEFAULT 'Draft',
                ""CreatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now()
            );",
            @"CREATE UNIQUE INDEX IF NOT EXISTS ""IX_quality_versions_Tenant_Doc_Version"" ON quality.document_versions (""TenantId"", ""DocumentId"", ""Version"");",

            @"CREATE TABLE IF NOT EXISTS quality.files (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""FileName"" character varying(260) NOT NULL,
                ""ContentType"" character varying(160) NOT NULL,
                ""SizeBytes"" bigint NOT NULL DEFAULT 0,
                ""Sha256"" character varying(64) NOT NULL,
                ""StorageKey"" character varying(500) NOT NULL,
                ""Role"" character varying(32) NOT NULL DEFAULT 'Published',
                ""UploadedByUserId"" uuid,
                ""UploadedByName"" character varying(160) NOT NULL DEFAULT '',
                ""UploadedAtUtc"" timestamp with time zone NOT NULL DEFAULT now()
            );",
            @"CREATE INDEX IF NOT EXISTS ""IX_quality_files_Tenant_Sha"" ON quality.files (""TenantId"", ""Sha256"");",

            @"CREATE TABLE IF NOT EXISTS quality.document_relations (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""FromDocumentId"" uuid NOT NULL,
                ""ToDocumentId"" uuid NOT NULL,
                ""RelationType"" character varying(48) NOT NULL,
                ""Notes"" character varying(1000) NOT NULL DEFAULT '',
                ""CreatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now()
            );",
            @"CREATE UNIQUE INDEX IF NOT EXISTS ""IX_quality_relations_unique"" ON quality.document_relations (""TenantId"", ""FromDocumentId"", ""ToDocumentId"", ""RelationType"");",

            @"CREATE TABLE IF NOT EXISTS quality.distribution_acks (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""DocumentVersionId"" uuid NOT NULL,
                ""UserId"" uuid,
                ""UserName"" character varying(160) NOT NULL DEFAULT '',
                ""UserEmail"" character varying(200) NOT NULL DEFAULT '',
                ""AcknowledgedAtUtc"" timestamp with time zone NOT NULL DEFAULT now()
            );",
            @"CREATE INDEX IF NOT EXISTS ""IX_quality_acks_Tenant_Version"" ON quality.distribution_acks (""TenantId"", ""DocumentVersionId"", ""UserId"");",

            @"CREATE TABLE IF NOT EXISTS quality.confidentiality_commitments (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""Kind"" character varying(32) NOT NULL DEFAULT 'Internal',
                ""RecordCode"" character varying(32) NOT NULL DEFAULT 'MC01-R01',
                ""PersonUserId"" uuid,
                ""PersonName"" character varying(160) NOT NULL,
                ""PersonEmail"" character varying(200) NOT NULL DEFAULT '',
                ""PersonRole"" character varying(120) NOT NULL DEFAULT '',
                ""Organization"" character varying(200) NOT NULL DEFAULT '',
                ""SignedAt"" timestamp with time zone NOT NULL DEFAULT now(),
                ""SignedFileId"" uuid,
                ""Notes"" character varying(2000) NOT NULL DEFAULT '',
                ""Status"" character varying(32) NOT NULL DEFAULT 'Active',
                ""CreatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now(),
                ""UpdatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now()
            );",
            @"CREATE INDEX IF NOT EXISTS ""IX_quality_conf_Tenant_Kind_Signed"" ON quality.confidentiality_commitments (""TenantId"", ""Kind"", ""SignedAt"");",
            @"CREATE INDEX IF NOT EXISTS ""IX_quality_conf_Tenant_Record"" ON quality.confidentiality_commitments (""TenantId"", ""RecordCode"");",

            @"CREATE TABLE IF NOT EXISTS quality.indicators (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""RecordCode"" character varying(32) NOT NULL DEFAULT 'MC01-R03',
                ""Name"" character varying(200) NOT NULL,
                ""Objective"" character varying(1000) NOT NULL DEFAULT '',
                ""Formula"" character varying(500) NOT NULL DEFAULT '',
                ""TargetValue"" numeric(18,4),
                ""TargetUnit"" character varying(40) NOT NULL DEFAULT '',
                ""Direction"" character varying(32) NOT NULL DEFAULT 'HigherIsBetter',
                ""Responsible"" character varying(160) NOT NULL DEFAULT '',
                ""Frequency"" character varying(32) NOT NULL DEFAULT 'Monthly',
                ""Notes"" character varying(2000) NOT NULL DEFAULT '',
                ""Status"" character varying(32) NOT NULL DEFAULT 'Active',
                ""CreatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now(),
                ""UpdatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now()
            );",
            @"CREATE INDEX IF NOT EXISTS ""IX_quality_indicators_Tenant_Status_Name"" ON quality.indicators (""TenantId"", ""Status"", ""Name"");",
            @"CREATE INDEX IF NOT EXISTS ""IX_quality_indicators_Tenant_Record"" ON quality.indicators (""TenantId"", ""RecordCode"");",

            @"CREATE TABLE IF NOT EXISTS quality.indicator_values (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""IndicatorId"" uuid NOT NULL,
                ""Period"" character varying(32) NOT NULL,
                ""Value"" numeric(18,4) NOT NULL,
                ""Notes"" character varying(2000) NOT NULL DEFAULT '',
                ""RecordedBy"" character varying(160) NOT NULL DEFAULT '',
                ""RecordedAtUtc"" timestamp with time zone NOT NULL DEFAULT now()
            );",
            @"CREATE UNIQUE INDEX IF NOT EXISTS ""IX_quality_indval_Tenant_Ind_Period"" ON quality.indicator_values (""TenantId"", ""IndicatorId"", ""Period"");",
            @"CREATE INDEX IF NOT EXISTS ""IX_quality_indval_Tenant_Ind_Rec"" ON quality.indicator_values (""TenantId"", ""IndicatorId"", ""RecordedAtUtc"");",

            @"CREATE TABLE IF NOT EXISTS quality.institutional_notes (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""RecordCode"" character varying(32) NOT NULL DEFAULT 'MC01-R05',
                ""Subject"" character varying(240) NOT NULL,
                ""Body"" character varying(4000) NOT NULL DEFAULT '',
                ""IssuedBy"" character varying(160) NOT NULL DEFAULT '',
                ""Audience"" character varying(240) NOT NULL DEFAULT '',
                ""IssuedAt"" timestamp with time zone NOT NULL DEFAULT now(),
                ""FileId"" uuid,
                ""Notes"" character varying(2000) NOT NULL DEFAULT '',
                ""Status"" character varying(32) NOT NULL DEFAULT 'Active',
                ""CreatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now(),
                ""UpdatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now()
            );",
            @"CREATE INDEX IF NOT EXISTS ""IX_quality_instnotes_Tenant_Issued"" ON quality.institutional_notes (""TenantId"", ""IssuedAt"");",
            @"CREATE INDEX IF NOT EXISTS ""IX_quality_instnotes_Tenant_Record_Status"" ON quality.institutional_notes (""TenantId"", ""RecordCode"", ""Status"");",

            @"CREATE TABLE IF NOT EXISTS quality.complaints (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""RecordCode"" character varying(32) NOT NULL DEFAULT 'PG03-R01',
                ""Number"" character varying(32) NOT NULL,
                ""ReceivedAt"" timestamp with time zone NOT NULL DEFAULT now(),
                ""Channel"" character varying(40) NOT NULL DEFAULT '',
                ""PartyName"" character varying(200) NOT NULL,
                ""PartyContact"" character varying(240) NOT NULL DEFAULT '',
                ""Description"" character varying(4000) NOT NULL,
                ""IsValid"" boolean,
                ""ValidatedAt"" timestamp with time zone,
                ""ValidationNotes"" character varying(2000) NOT NULL DEFAULT '',
                ""Investigation"" character varying(4000) NOT NULL DEFAULT '',
                ""Actions"" character varying(4000) NOT NULL DEFAULT '',
                ""Responsible"" character varying(160) NOT NULL DEFAULT '',
                ""CommunicatedAt"" timestamp with time zone,
                ""ClosedAt"" timestamp with time zone,
                ""LinkedNonConformityId"" uuid,
                ""EvidenceFileId"" uuid,
                ""Notes"" character varying(2000) NOT NULL DEFAULT '',
                ""Status"" character varying(40) NOT NULL DEFAULT 'Open',
                ""RegisterDueAt"" timestamp with time zone NOT NULL,
                ""ValidateDueAt"" timestamp with time zone NOT NULL,
                ""InvestigateDueAt"" timestamp with time zone NOT NULL,
                ""CloseDueAt"" timestamp with time zone NOT NULL,
                ""CreatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now(),
                ""UpdatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now()
            );",
            @"CREATE UNIQUE INDEX IF NOT EXISTS ""IX_quality_complaints_Tenant_Number"" ON quality.complaints (""TenantId"", ""Number"");",
            @"CREATE INDEX IF NOT EXISTS ""IX_quality_complaints_Tenant_Status_Received"" ON quality.complaints (""TenantId"", ""Status"", ""ReceivedAt"");",
            @"CREATE INDEX IF NOT EXISTS ""IX_quality_complaints_Tenant_CloseDue"" ON quality.complaints (""TenantId"", ""CloseDueAt"");",

            @"CREATE TABLE IF NOT EXISTS quality.non_conformities (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""RecordCode"" character varying(32) NOT NULL DEFAULT 'PG07-R01',
                ""Number"" character varying(32) NOT NULL,
                ""Kind"" character varying(40) NOT NULL DEFAULT 'NonConformity',
                ""Origin"" character varying(80) NOT NULL DEFAULT '',
                ""DetectedAt"" timestamp with time zone NOT NULL DEFAULT now(),
                ""Description"" character varying(4000) NOT NULL,
                ""ImmediateAction"" character varying(4000) NOT NULL DEFAULT '',
                ""ImpactOnPreviousResults"" boolean NOT NULL DEFAULT false,
                ""CustomerNotified"" boolean NOT NULL DEFAULT false,
                ""RootCauseMethod"" character varying(120) NOT NULL DEFAULT '',
                ""RootCause"" character varying(4000) NOT NULL DEFAULT '',
                ""CorrectiveAction"" character varying(4000) NOT NULL DEFAULT '',
                ""Responsible"" character varying(160) NOT NULL DEFAULT '',
                ""DueDate"" timestamp with time zone,
                ""NewDueDate"" timestamp with time zone,
                ""EffectivenessCheck"" character varying(4000) NOT NULL DEFAULT '',
                ""EffectivenessResult"" character varying(40) NOT NULL DEFAULT '',
                ""ClosedAt"" timestamp with time zone,
                ""Status"" character varying(40) NOT NULL DEFAULT 'Open',
                ""Probability"" integer,
                ""Impact"" integer,
                ""Level"" integer,
                ""Controls"" character varying(4000) NOT NULL DEFAULT '',
                ""ResidualLevel"" integer,
                ""SourceComplaintId"" uuid,
                ""EvidenceFileId"" uuid,
                ""Notes"" character varying(2000) NOT NULL DEFAULT '',
                ""CreatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now(),
                ""UpdatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now()
            );",
            @"CREATE UNIQUE INDEX IF NOT EXISTS ""IX_quality_nc_Tenant_Number"" ON quality.non_conformities (""TenantId"", ""Number"");",
            @"CREATE INDEX IF NOT EXISTS ""IX_quality_nc_Tenant_Kind_Status"" ON quality.non_conformities (""TenantId"", ""Kind"", ""Status"");",
            @"CREATE INDEX IF NOT EXISTS ""IX_quality_nc_Tenant_Due"" ON quality.non_conformities (""TenantId"", ""DueDate"");",

            @"CREATE TABLE IF NOT EXISTS quality.internal_audits (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""RecordCode"" character varying(32) NOT NULL DEFAULT 'PG04-R01',
                ""Number"" character varying(32) NOT NULL,
                ""ProgramYear"" integer NOT NULL,
                ""PlannedDate"" timestamp with time zone NOT NULL DEFAULT now(),
                ""ExecutedDate"" timestamp with time zone,
                ""Scope"" character varying(2000) NOT NULL DEFAULT '',
                ""Clauses"" character varying(500) NOT NULL DEFAULT '',
                ""Auditor"" character varying(160) NOT NULL DEFAULT '',
                ""Auditee"" character varying(200) NOT NULL DEFAULT '',
                ""Objectives"" character varying(2000) NOT NULL DEFAULT '',
                ""FindingsSummary"" character varying(4000) NOT NULL DEFAULT '',
                ""Conclusions"" character varying(4000) NOT NULL DEFAULT '',
                ""Recommendations"" character varying(4000) NOT NULL DEFAULT '',
                ""ChecklistNotes"" character varying(4000) NOT NULL DEFAULT '',
                ""PlanFileId"" uuid,
                ""ReportFileId"" uuid,
                ""ChecklistFileId"" uuid,
                ""Status"" character varying(40) NOT NULL DEFAULT 'Planned',
                ""Notes"" character varying(2000) NOT NULL DEFAULT '',
                ""CreatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now(),
                ""UpdatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now()
            );",
            @"CREATE UNIQUE INDEX IF NOT EXISTS ""IX_quality_audits_Tenant_Number"" ON quality.internal_audits (""TenantId"", ""Number"");",
            @"CREATE INDEX IF NOT EXISTS ""IX_quality_audits_Tenant_Year_Status"" ON quality.internal_audits (""TenantId"", ""ProgramYear"", ""Status"");",
            @"CREATE INDEX IF NOT EXISTS ""IX_quality_audits_Tenant_Planned"" ON quality.internal_audits (""TenantId"", ""PlannedDate"");",

            @"CREATE TABLE IF NOT EXISTS quality.training_plan_items (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""RecordCode"" character varying(32) NOT NULL DEFAULT 'PG06-R01',
                ""Number"" character varying(32) NOT NULL,
                ""ProgramYear"" integer NOT NULL,
                ""Topic"" character varying(500) NOT NULL,
                ""TargetRoles"" character varying(500) NOT NULL DEFAULT '',
                ""PlannedDate"" timestamp with time zone NOT NULL DEFAULT now(),
                ""DoneDate"" timestamp with time zone,
                ""EffectivenessCheck"" character varying(4000) NOT NULL DEFAULT '',
                ""Status"" character varying(40) NOT NULL DEFAULT 'Planned',
                ""Notes"" character varying(2000) NOT NULL DEFAULT '',
                ""CreatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now(),
                ""UpdatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now()
            );",
            @"CREATE UNIQUE INDEX IF NOT EXISTS ""IX_quality_train_Tenant_Number"" ON quality.training_plan_items (""TenantId"", ""Number"");",
            @"CREATE INDEX IF NOT EXISTS ""IX_quality_train_Tenant_Year_Status"" ON quality.training_plan_items (""TenantId"", ""ProgramYear"", ""Status"");",

            @"CREATE TABLE IF NOT EXISTS quality.personnel_authorizations (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""RecordCode"" character varying(32) NOT NULL DEFAULT 'PG06-R02',
                ""Number"" character varying(32) NOT NULL,
                ""UserId"" uuid NOT NULL,
                ""PersonName"" character varying(160) NOT NULL,
                ""MethodDocumentCode"" character varying(64) NOT NULL,
                ""MethodTitle"" character varying(240) NOT NULL DEFAULT '',
                ""TrainingEvidence"" character varying(4000) NOT NULL DEFAULT '',
                ""SupervisedBy"" character varying(160) NOT NULL DEFAULT '',
                ""AuthorizedByUserId"" uuid,
                ""AuthorizedByName"" character varying(160) NOT NULL DEFAULT '',
                ""AuthorizedAt"" timestamp with time zone,
                ""ValidUntil"" timestamp with time zone,
                ""EvidenceFileId"" uuid,
                ""Status"" character varying(40) NOT NULL DEFAULT 'Draft',
                ""Notes"" character varying(2000) NOT NULL DEFAULT '',
                ""CreatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now(),
                ""UpdatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now()
            );",
            @"CREATE UNIQUE INDEX IF NOT EXISTS ""IX_quality_auth_Tenant_Number"" ON quality.personnel_authorizations (""TenantId"", ""Number"");",
            @"CREATE INDEX IF NOT EXISTS ""IX_quality_auth_Tenant_User_Method_Status"" ON quality.personnel_authorizations (""TenantId"", ""UserId"", ""MethodDocumentCode"", ""Status"");",
            @"CREATE INDEX IF NOT EXISTS ""IX_quality_auth_Tenant_ValidUntil"" ON quality.personnel_authorizations (""TenantId"", ""ValidUntil"");",

            @"CREATE TABLE IF NOT EXISTS quality.competence_reviews (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""RecordCode"" character varying(32) NOT NULL DEFAULT 'PG06-R03',
                ""Number"" character varying(32) NOT NULL,
                ""UserId"" uuid NOT NULL,
                ""PersonName"" character varying(160) NOT NULL,
                ""ReviewYear"" integer NOT NULL,
                ""Evaluator"" character varying(160) NOT NULL DEFAULT '',
                ""TechnicalScore"" integer,
                ""PersonalScore"" integer,
                ""Conclusions"" character varying(4000) NOT NULL DEFAULT '',
                ""Status"" character varying(40) NOT NULL DEFAULT 'Draft',
                ""Notes"" character varying(2000) NOT NULL DEFAULT '',
                ""CreatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now(),
                ""UpdatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now()
            );",
            @"CREATE UNIQUE INDEX IF NOT EXISTS ""IX_quality_comp_Tenant_Number"" ON quality.competence_reviews (""TenantId"", ""Number"");",
            @"CREATE INDEX IF NOT EXISTS ""IX_quality_comp_Tenant_User_Year"" ON quality.competence_reviews (""TenantId"", ""UserId"", ""ReviewYear"");",

            @"CREATE TABLE IF NOT EXISTS quality.role_assignments (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""RecordCode"" character varying(32) NOT NULL DEFAULT 'PG06-R04',
                ""Number"" character varying(32) NOT NULL,
                ""Role"" character varying(160) NOT NULL,
                ""UserId"" uuid NOT NULL,
                ""PersonName"" character varying(160) NOT NULL,
                ""SubstituteUserId"" uuid,
                ""SubstituteName"" character varying(160) NOT NULL DEFAULT '',
                ""Since"" timestamp with time zone NOT NULL DEFAULT now(),
                ""Until"" timestamp with time zone,
                ""Status"" character varying(40) NOT NULL DEFAULT 'Active',
                ""Notes"" character varying(2000) NOT NULL DEFAULT '',
                ""CreatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now(),
                ""UpdatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now()
            );",
            @"CREATE UNIQUE INDEX IF NOT EXISTS ""IX_quality_role_Tenant_Number"" ON quality.role_assignments (""TenantId"", ""Number"");",
            @"CREATE INDEX IF NOT EXISTS ""IX_quality_role_Tenant_Role_Status"" ON quality.role_assignments (""TenantId"", ""Role"", ""Status"");",

            @"CREATE TABLE IF NOT EXISTS quality.supplier_evaluations (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""RecordCode"" character varying(32) NOT NULL DEFAULT 'PG05-R01',
                ""Number"" character varying(32) NOT NULL,
                ""SupplierId"" uuid NOT NULL,
                ""SupplierName"" character varying(240) NOT NULL,
                ""SupplierDocument"" character varying(64) NOT NULL DEFAULT '',
                ""ServiceScope"" character varying(1000) NOT NULL DEFAULT '',
                ""EvaluatedAt"" timestamp with time zone NOT NULL DEFAULT now(),
                ""Score"" numeric(8,2),
                ""CriteriaNotes"" character varying(4000) NOT NULL DEFAULT '',
                ""Strengths"" character varying(2000) NOT NULL DEFAULT '',
                ""Weaknesses"" character varying(2000) NOT NULL DEFAULT '',
                ""ApprovedBy"" character varying(160) NOT NULL DEFAULT '',
                ""ApprovedAt"" timestamp with time zone,
                ""ValidUntil"" timestamp with time zone,
                ""EvidenceFileId"" uuid,
                ""Status"" character varying(40) NOT NULL DEFAULT 'Draft',
                ""Notes"" character varying(2000) NOT NULL DEFAULT '',
                ""CreatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now(),
                ""UpdatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now()
            );",
            @"CREATE UNIQUE INDEX IF NOT EXISTS ""IX_quality_suppev_Tenant_Number"" ON quality.supplier_evaluations (""TenantId"", ""Number"");",
            @"CREATE INDEX IF NOT EXISTS ""IX_quality_suppev_Tenant_Supplier_Status"" ON quality.supplier_evaluations (""TenantId"", ""SupplierId"", ""Status"");",

            @"CREATE TABLE IF NOT EXISTS quality.supplier_performance_reviews (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""RecordCode"" character varying(32) NOT NULL DEFAULT 'PG05-R03',
                ""Number"" character varying(32) NOT NULL,
                ""SupplierId"" uuid NOT NULL,
                ""SupplierName"" character varying(240) NOT NULL,
                ""EvaluationId"" uuid,
                ""Period"" character varying(40) NOT NULL DEFAULT '',
                ""ReviewDate"" timestamp with time zone NOT NULL DEFAULT now(),
                ""Score"" numeric(8,2),
                ""QualityScore"" numeric(8,2),
                ""DeliveryScore"" numeric(8,2),
                ""ServiceScore"" numeric(8,2),
                ""Comments"" character varying(4000) NOT NULL DEFAULT '',
                ""ReviewedBy"" character varying(160) NOT NULL DEFAULT '',
                ""EvidenceFileId"" uuid,
                ""Status"" character varying(40) NOT NULL DEFAULT 'Draft',
                ""Notes"" character varying(2000) NOT NULL DEFAULT '',
                ""CreatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now(),
                ""UpdatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now()
            );",
            @"CREATE UNIQUE INDEX IF NOT EXISTS ""IX_quality_suppperf_Tenant_Number"" ON quality.supplier_performance_reviews (""TenantId"", ""Number"");",
            @"CREATE INDEX IF NOT EXISTS ""IX_quality_suppperf_Tenant_Supplier_Date"" ON quality.supplier_performance_reviews (""TenantId"", ""SupplierId"", ""ReviewDate"");",

            @"CREATE TABLE IF NOT EXISTS quality.management_reviews (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""RecordCode"" character varying(32) NOT NULL DEFAULT 'PG08-R01',
                ""Number"" character varying(32) NOT NULL,
                ""ProgramYear"" integer NOT NULL,
                ""ReviewDate"" timestamp with time zone NOT NULL DEFAULT now(),
                ""Attendees"" character varying(2000) NOT NULL DEFAULT '',
                ""InputsSnapshotJson"" text NOT NULL DEFAULT '',
                ""InputsNotes"" character varying(4000) NOT NULL DEFAULT '',
                ""Decisions"" character varying(4000) NOT NULL DEFAULT '',
                ""Actions"" character varying(4000) NOT NULL DEFAULT '',
                ""FollowUp"" character varying(4000) NOT NULL DEFAULT '',
                ""EvidenceFileId"" uuid,
                ""Status"" character varying(40) NOT NULL DEFAULT 'Draft',
                ""Notes"" character varying(2000) NOT NULL DEFAULT '',
                ""CreatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now(),
                ""UpdatedAtUtc"" timestamp with time zone NOT NULL DEFAULT now()
            );",
            @"CREATE UNIQUE INDEX IF NOT EXISTS ""IX_quality_mrev_Tenant_Number"" ON quality.management_reviews (""TenantId"", ""Number"");",
            @"CREATE INDEX IF NOT EXISTS ""IX_quality_mrev_Tenant_Year_Status"" ON quality.management_reviews (""TenantId"", ""ProgramYear"", ""Status"");",

            @"CREATE TABLE IF NOT EXISTS quality.audit_events (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""EntityType"" character varying(64) NOT NULL,
                ""EntityId"" uuid NOT NULL,
                ""EventType"" character varying(64) NOT NULL,
                ""Summary"" character varying(1000) NOT NULL DEFAULT '',
                ""BeforeJson"" text NOT NULL DEFAULT '',
                ""AfterJson"" text NOT NULL DEFAULT '',
                ""PerformedByUserId"" uuid,
                ""PerformedByName"" character varying(160) NOT NULL DEFAULT '',
                ""OccurredAtUtc"" timestamp with time zone NOT NULL DEFAULT now()
            );",
            @"CREATE INDEX IF NOT EXISTS ""IX_quality_audit_Tenant_Entity_Occurred"" ON quality.audit_events (""TenantId"", ""EntityType"", ""EntityId"", ""OccurredAtUtc"");"
        };

        foreach (var sql in statements)
        {
            try
            {
                await Database.ExecuteSqlRawAsync(sql, ct);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error ejecutando DDL de quality: {Sql}", sql[..Math.Min(120, sql.Length)]);
                throw;
            }
        }
    }
}
