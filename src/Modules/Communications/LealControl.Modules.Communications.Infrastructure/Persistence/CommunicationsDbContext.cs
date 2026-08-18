using System.Threading;
using System.Threading.Tasks;
using LealControl.Modules.Communications.Infrastructure.Domain;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Communications.Infrastructure.Persistence;

public sealed class CommunicationsDbContext(DbContextOptions<CommunicationsDbContext> options) : DbContext(options)
{
    public const string Schema = "communications";
    public DbSet<MailAccount> MailAccounts => Set<MailAccount>();
    public DbSet<EmailMessage> EmailMessages => Set<EmailMessage>();
    public DbSet<EmailAttachment> EmailAttachments => Set<EmailAttachment>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Schema);
        modelBuilder.Entity<MailAccount>(b => {
            b.ToTable("mail_accounts"); b.HasKey(x => x.Id);
            b.Property(x => x.Provider).HasConversion<string>(); b.Property(x => x.AuthMode).HasConversion<string>();
            b.Property(x => x.DisplayName).HasMaxLength(160); b.Property(x => x.EmailAddress).HasMaxLength(320);
            b.Property(x => x.ProtectedSecret).HasColumnType("text"); b.HasIndex(x => new { x.TenantId, x.EmailAddress }).IsUnique();
        });
        modelBuilder.Entity<EmailMessage>(b => {
            b.ToTable("email_messages"); b.HasKey(x => x.Id);
            b.Property(x => x.Direction).HasConversion<string>(); b.Property(x => x.BodyPreview).HasMaxLength(2000);
            b.Property(x => x.BodyHtml).HasColumnType("text");
            b.HasIndex(x => new { x.TenantId, x.InternetMessageId }).IsUnique();
            b.HasIndex(x => new { x.TenantId, x.ThreadKey });
            b.HasMany(x => x.Attachments).WithOne().HasForeignKey(x => x.EmailMessageId).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<EmailAttachment>(b => {
            b.ToTable("email_attachments"); b.HasKey(x => x.Id);
            b.Property(x => x.FileName).HasMaxLength(300).IsRequired();
            b.Property(x => x.ContentType).HasMaxLength(150).IsRequired();
            b.Property(x => x.ContentId).HasMaxLength(200);
            b.Property(x => x.Data).HasColumnType("bytea").IsRequired();
            b.HasIndex(x => new { x.TenantId, x.EmailMessageId });
        });
    }

    public async Task EnsureTablesCreatedAsync(CancellationToken cancellationToken = default)
    {
        var sql = @"
            CREATE SCHEMA IF NOT EXISTS communications;

            CREATE TABLE IF NOT EXISTS communications.mail_accounts (
                ""Id"" uuid PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""Provider"" character varying(50) NOT NULL,
                ""AuthMode"" character varying(50) NOT NULL,
                ""DisplayName"" character varying(160) NOT NULL,
                ""EmailAddress"" character varying(320) NOT NULL,
                ""ImapHost"" character varying(200) NOT NULL,
                ""ImapPort"" integer NOT NULL,
                ""ImapUseSsl"" boolean NOT NULL,
                ""SmtpHost"" character varying(200) NOT NULL,
                ""SmtpPort"" integer NOT NULL,
                ""SmtpUseSsl"" boolean NOT NULL,
                ""Username"" character varying(200) NOT NULL,
                ""ProtectedSecret"" text NOT NULL,
                ""IsActive"" boolean NOT NULL DEFAULT true,
                ""IsDefaultSender"" boolean NOT NULL DEFAULT false,
                ""LastSyncAtUtc"" timestamp with time zone,
                ""LastError"" character varying(1000),
                ""CreatedAtUtc"" timestamp with time zone NOT NULL,
                ""UpdatedAtUtc"" timestamp with time zone NOT NULL
            );

            CREATE TABLE IF NOT EXISTS communications.email_messages (
                ""Id"" uuid PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""MailAccountId"" uuid NOT NULL,
                ""InternetMessageId"" character varying(250) NOT NULL,
                ""InReplyTo"" character varying(250),
                ""ThreadKey"" character varying(100) NOT NULL,
                ""Direction"" character varying(50) NOT NULL,
                ""Subject"" character varying(500) NOT NULL,
                ""FromAddress"" character varying(320) NOT NULL,
                ""ToAddresses"" text NOT NULL,
                ""BodyPreview"" character varying(2000) NOT NULL,
                ""BodyHtml"" text,
                ""OccurredAtUtc"" timestamp with time zone NOT NULL,
                ""RelatedEntityType"" character varying(100),
                ""RelatedEntityId"" uuid
            );

            CREATE TABLE IF NOT EXISTS communications.email_attachments (
                ""Id"" uuid PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""EmailMessageId"" uuid NOT NULL REFERENCES communications.email_messages(""Id"") ON DELETE CASCADE,
                ""FileName"" character varying(300) NOT NULL,
                ""ContentType"" character varying(150) NOT NULL,
                ""SizeBytes"" bigint NOT NULL,
                ""ContentId"" character varying(200),
                ""IsInline"" boolean NOT NULL DEFAULT false,
                ""Data"" bytea NOT NULL
            );

            CREATE INDEX IF NOT EXISTS ""IX_email_attachments_EmailMessageId"" ON communications.email_attachments (""EmailMessageId"");
        ";

        await Database.ExecuteSqlRawAsync(sql, cancellationToken);
    }
}
