using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace LealControl.Modules.Sales.Infrastructure.Persistence.Migrations;

/// <summary>
/// Seguimiento de presupuestos: fecha de envío y marca de la actividad automática del CRM. Los presupuestos que ya
/// estaban enviados toman como fecha de envío la de su última revisión.
/// </summary>
[DbContext(typeof(SalesDbContext))]
[Migration("20261126120000_QuoteFollowUp")]
public sealed class QuoteFollowUp : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE sales.quotes
                ADD COLUMN IF NOT EXISTS "SentAtUtc" timestamp with time zone,
                ADD COLUMN IF NOT EXISTS "FollowUpCreatedAtUtc" timestamp with time zone;
            UPDATE sales.quotes SET "SentAtUtc" = "RevisionDateUtc" WHERE "Status" = 'Sent' AND "SentAtUtc" IS NULL;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""ALTER TABLE sales.quotes DROP COLUMN IF EXISTS "SentAtUtc", DROP COLUMN IF EXISTS "FollowUpCreatedAtUtc";""");
    }
}
