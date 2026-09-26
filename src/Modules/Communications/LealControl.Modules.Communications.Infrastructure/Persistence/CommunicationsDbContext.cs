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
    public DbSet<MetaChannelConnection> MetaConnections => Set<MetaChannelConnection>();
    public DbSet<Conversation> Conversations => Set<Conversation>();
    public DbSet<ConversationNote> ConversationNotes => Set<ConversationNote>();
    public DbSet<MessageReplyTemplate> ReplyTemplates => Set<MessageReplyTemplate>();
    public DbSet<StoredMedia> StoredMedia => Set<StoredMedia>();
    public DbSet<WhatsAppConnection> WhatsAppConnections => Set<WhatsAppConnection>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Schema);
        modelBuilder.Entity<WhatsAppConnection>(b => {
            b.ToTable("whatsapp_connections"); b.HasKey(x => x.Id);
            b.Property(x => x.InstanceName).HasMaxLength(120).IsRequired();
            b.Property(x => x.UserName).HasMaxLength(200);
            b.Property(x => x.PhoneNumber).HasMaxLength(50);
            b.Property(x => x.State).HasMaxLength(50).HasDefaultValue("disconnected");
            b.Property(x => x.LastError).HasMaxLength(2000);
            b.HasIndex(x => new { x.TenantId, x.InstanceName }).IsUnique();
            b.HasIndex(x => new { x.TenantId, x.UserId });
        });
        modelBuilder.Entity<MetaChannelConnection>(b => {
            b.ToTable("meta_channel_connections"); b.HasKey(x => x.Id);
            b.Property(x => x.ChannelType).HasMaxLength(50);
            b.Property(x => x.PageId).HasMaxLength(100);
            b.Property(x => x.PageName).HasMaxLength(200);
            b.Property(x => x.InstagramAccountId).HasMaxLength(100);
            b.Property(x => x.InstagramUsername).HasMaxLength(200);
            b.Property(x => x.PageAccessToken).HasColumnType("text");
            b.Property(x => x.VerifyToken).HasMaxLength(100);
            b.Property(x => x.LastError).HasMaxLength(2000);
            b.HasIndex(x => new { x.TenantId, x.ChannelType }).IsUnique();
        });
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
            b.Property(x => x.ChannelType).HasMaxLength(50).HasDefaultValue("email");
            b.HasIndex(x => new { x.TenantId, x.InternetMessageId }).IsUnique();
            b.HasIndex(x => new { x.TenantId, x.ThreadKey });
            b.HasIndex(x => new { x.TenantId, x.ConversationId });
            b.HasMany(x => x.Attachments).WithOne().HasForeignKey(x => x.EmailMessageId).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<Conversation>(b => {
            b.ToTable("conversations"); b.HasKey(x => x.Id);
            b.Property(x => x.ChannelType).HasMaxLength(50).IsRequired();
            b.Property(x => x.ThreadKey).HasMaxLength(120).IsRequired();
            b.Property(x => x.ParticipantId).HasMaxLength(320).IsRequired();
            b.Property(x => x.ParticipantName).HasMaxLength(320).IsRequired();
            b.Property(x => x.ParticipantEmail).HasMaxLength(320);
            b.Property(x => x.ParticipantPhone).HasMaxLength(50);
            b.Property(x => x.LastMessagePreview).HasMaxLength(500);
            b.HasIndex(x => new { x.TenantId, x.ThreadKey }).IsUnique();
            b.HasIndex(x => new { x.TenantId, x.LastMessageAtUtc });
            b.HasIndex(x => new { x.TenantId, x.ChannelType });
            b.Property(x => x.Status).HasMaxLength(20).HasDefaultValue("open");
            b.Property(x => x.AssignedToUserId);
            b.Property(x => x.SuggestionDismissed).HasDefaultValue(false);
            b.Property(x => x.LastIncomingAtUtc);
        });
        modelBuilder.Entity<ConversationNote>(b => {
            b.ToTable("conversation_notes"); b.HasKey(x => x.Id);
            b.Property(x => x.Body).HasMaxLength(4000).IsRequired();
            b.HasIndex(x => new { x.TenantId, x.ConversationId, x.CreatedAtUtc });
            b.HasOne<Conversation>().WithMany().HasForeignKey(x => x.ConversationId).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<MessageReplyTemplate>(b => {
            b.ToTable("message_reply_templates"); b.HasKey(x => x.Id);
            b.Property(x => x.Name).HasMaxLength(120).IsRequired();
            b.Property(x => x.Body).HasColumnType("text").IsRequired();
            b.Property(x => x.ChannelType).HasMaxLength(50);
            b.HasIndex(x => new { x.TenantId, x.Name });
        });
        modelBuilder.Entity<StoredMedia>(b => {
            b.ToTable("stored_media"); b.HasKey(x => x.Id);
            b.Property(x => x.FileName).HasMaxLength(300).IsRequired();
            b.Property(x => x.ContentType).HasMaxLength(150).IsRequired();
            b.Property(x => x.Data).HasColumnType("bytea").IsRequired();
            b.HasIndex(x => new { x.TenantId, x.CreatedAtUtc });
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
                ""RelatedEntityId"" uuid,
                ""ChannelType"" character varying(50) NOT NULL DEFAULT 'email'
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

            CREATE TABLE IF NOT EXISTS communications.meta_channel_connections (
                ""Id"" uuid PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""ChannelType"" character varying(50) NOT NULL,
                ""PageId"" character varying(100),
                ""PageName"" character varying(200),
                ""InstagramAccountId"" character varying(100),
                ""InstagramUsername"" character varying(200),
                ""PageAccessToken"" text,
                ""VerifyToken"" character varying(100) NOT NULL,
                ""IsConnected"" boolean NOT NULL DEFAULT false,
                ""ConnectedAtUtc"" timestamp with time zone,
                ""LastSyncAtUtc"" timestamp with time zone,
                ""LastError"" character varying(2000),
                ""UpdatedAtUtc"" timestamp with time zone NOT NULL
            );

            CREATE UNIQUE INDEX IF NOT EXISTS ""IX_meta_channel_connections_TenantId_ChannelType"" ON communications.meta_channel_connections (""TenantId"", ""ChannelType"");
            CREATE INDEX IF NOT EXISTS ""IX_email_attachments_EmailMessageId"" ON communications.email_attachments (""EmailMessageId"");

            ALTER TABLE communications.email_messages ADD COLUMN IF NOT EXISTS ""ChannelType"" character varying(50) NOT NULL DEFAULT 'email';
            ALTER TABLE communications.meta_channel_connections ADD COLUMN IF NOT EXISTS ""LastSyncAtUtc"" timestamp with time zone;
            ALTER TABLE communications.meta_channel_connections ADD COLUMN IF NOT EXISTS ""LastError"" character varying(2000);

            UPDATE communications.email_messages SET ""ThreadKey"" = REPLACE(""ThreadKey"", 'meta_ig_', 'ig_') WHERE ""ThreadKey"" LIKE 'meta_ig_%';
            UPDATE communications.email_messages SET ""ThreadKey"" = REPLACE(""ThreadKey"", 'meta_fb_', 'fb_') WHERE ""ThreadKey"" LIKE 'meta_fb_%';
            UPDATE communications.email_messages SET ""ChannelType"" = 'whatsapp' WHERE ""ChannelType"" = 'email' AND (""ThreadKey"" LIKE 'wa_%' OR ""InternetMessageId"" LIKE 'wa_%');
            UPDATE communications.email_messages SET ""ChannelType"" = 'instagram' WHERE ""ChannelType"" = 'email' AND (""ThreadKey"" LIKE 'ig_%' OR ""InternetMessageId"" LIKE 'meta_ig_%');
            UPDATE communications.email_messages SET ""ChannelType"" = 'facebook' WHERE ""ChannelType"" = 'email' AND (""ThreadKey"" LIKE 'fb_%' OR ""InternetMessageId"" LIKE 'meta_fb_%');

            CREATE TABLE IF NOT EXISTS communications.conversations (
                ""Id"" uuid PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""ChannelType"" character varying(50) NOT NULL,
                ""ThreadKey"" character varying(120) NOT NULL,
                ""ParticipantId"" character varying(320) NOT NULL,
                ""ParticipantName"" character varying(320) NOT NULL,
                ""ParticipantEmail"" character varying(320),
                ""ParticipantPhone"" character varying(50),
                ""LastMessagePreview"" character varying(500),
                ""LastMessageAtUtc"" timestamp with time zone NOT NULL,
                ""UnreadCount"" integer NOT NULL DEFAULT 0,
                ""RelatedLeadId"" uuid,
                ""RelatedCustomerId"" uuid,
                ""CreatedAtUtc"" timestamp with time zone NOT NULL,
                ""UpdatedAtUtc"" timestamp with time zone NOT NULL
            );

            ALTER TABLE communications.email_messages ADD COLUMN IF NOT EXISTS ""ConversationId"" uuid;

            CREATE UNIQUE INDEX IF NOT EXISTS ""IX_conversations_TenantId_ThreadKey"" ON communications.conversations (""TenantId"", ""ThreadKey"");
            CREATE INDEX IF NOT EXISTS ""IX_conversations_TenantId_LastMessageAtUtc"" ON communications.conversations (""TenantId"", ""LastMessageAtUtc"");
            CREATE INDEX IF NOT EXISTS ""IX_email_messages_TenantId_ConversationId"" ON communications.email_messages (""TenantId"", ""ConversationId"");

            ALTER TABLE communications.conversations ADD COLUMN IF NOT EXISTS ""Status"" character varying(20) NOT NULL DEFAULT 'open';
            ALTER TABLE communications.conversations ADD COLUMN IF NOT EXISTS ""AssignedToUserId"" uuid;
            ALTER TABLE communications.conversations ADD COLUMN IF NOT EXISTS ""SuggestionDismissed"" boolean NOT NULL DEFAULT false;
            ALTER TABLE communications.conversations ADD COLUMN IF NOT EXISTS ""LastIncomingAtUtc"" timestamp with time zone;

            CREATE TABLE IF NOT EXISTS communications.conversation_notes (
                ""Id"" uuid PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""ConversationId"" uuid NOT NULL REFERENCES communications.conversations(""Id"") ON DELETE CASCADE,
                ""AuthorUserId"" uuid NOT NULL,
                ""Body"" character varying(4000) NOT NULL,
                ""CreatedAtUtc"" timestamp with time zone NOT NULL
            );
            CREATE INDEX IF NOT EXISTS ""IX_conversation_notes_TenantId_ConversationId_CreatedAtUtc""
                ON communications.conversation_notes (""TenantId"", ""ConversationId"", ""CreatedAtUtc"");

            CREATE TABLE IF NOT EXISTS communications.message_reply_templates (
                ""Id"" uuid PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""Name"" character varying(120) NOT NULL,
                ""Body"" text NOT NULL,
                ""ChannelType"" character varying(50),
                ""CreatedAtUtc"" timestamp with time zone NOT NULL,
                ""UpdatedAtUtc"" timestamp with time zone NOT NULL
            );

            CREATE TABLE IF NOT EXISTS communications.stored_media (
                ""Id"" uuid PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""FileName"" character varying(300) NOT NULL,
                ""ContentType"" character varying(150) NOT NULL,
                ""Data"" bytea NOT NULL,
                ""CreatedAtUtc"" timestamp with time zone NOT NULL
            );

            CREATE TABLE IF NOT EXISTS communications.whatsapp_connections (
                ""Id"" uuid PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""UserId"" uuid,
                ""UserName"" character varying(200),
                ""InstanceName"" character varying(120) NOT NULL,
                ""PhoneNumber"" character varying(50),
                ""State"" character varying(50) NOT NULL DEFAULT 'disconnected',
                ""IsConnected"" boolean NOT NULL DEFAULT false,
                ""ConnectedAtUtc"" timestamp with time zone,
                ""LastSyncAtUtc"" timestamp with time zone,
                ""LastError"" character varying(2000),
                ""CreatedAtUtc"" timestamp with time zone NOT NULL,
                ""UpdatedAtUtc"" timestamp with time zone NOT NULL
            );

            CREATE UNIQUE INDEX IF NOT EXISTS ""IX_whatsapp_connections_TenantId_InstanceName"" ON communications.whatsapp_connections (""TenantId"", ""InstanceName"");
            CREATE INDEX IF NOT EXISTS ""IX_whatsapp_connections_TenantId_UserId"" ON communications.whatsapp_connections (""TenantId"", ""UserId"");

            UPDATE communications.conversations c
            SET ""LastIncomingAtUtc"" = sub.max_ts
            FROM (
                SELECT ""ConversationId"", MAX(""OccurredAtUtc"") AS max_ts
                FROM communications.email_messages
                WHERE ""Direction"" = 'Incoming' AND ""ConversationId"" IS NOT NULL
                GROUP BY ""ConversationId""
            ) sub
            WHERE c.""Id"" = sub.""ConversationId"" AND c.""LastIncomingAtUtc"" IS NULL;
        ";

        await Database.ExecuteSqlRawAsync(sql, cancellationToken);
    }
}
