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
            b.Property(x => x.DisplayCode).HasMaxLength(48).IsRequired();
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
                ""DisplayCode"" character varying(48) NOT NULL,
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
            @"CREATE INDEX IF NOT EXISTS ""IX_quality_acks_Tenant_Version"" ON quality.distribution_acks (""TenantId"", ""DocumentVersionId"", ""UserId"");"
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
