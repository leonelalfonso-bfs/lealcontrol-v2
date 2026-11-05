using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace LealControl.Modules.Sales.Infrastructure.Persistence.Migrations;

[DbContext(typeof(SalesDbContext))]
[Migration("20261105120000_QuoteRevisions")]
public sealed class QuoteRevisions : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE sales.quotes
                ADD COLUMN IF NOT EXISTS "RevisionDateUtc" timestamp with time zone;
            UPDATE sales.quotes
                SET "RevisionDateUtc" = CASE WHEN "Revision" > 1 THEN "UpdatedAtUtc" ELSE "CreatedAtUtc" END
                WHERE "RevisionDateUtc" IS NULL;
            ALTER TABLE sales.quotes ALTER COLUMN "RevisionDateUtc" SET NOT NULL;
            CREATE TABLE IF NOT EXISTS sales.quote_revisions (
                "Id" uuid PRIMARY KEY,
                "TenantId" uuid NOT NULL,
                "QuoteId" uuid NOT NULL REFERENCES sales.quotes ("Id") ON DELETE CASCADE,
                "Revision" integer NOT NULL,
                "RevisionDateUtc" timestamp with time zone NOT NULL,
                "Total" numeric(18,2) NOT NULL,
                "Currency" varchar(20) NOT NULL,
                "SnapshotJson" jsonb NOT NULL,
                "ReplacedAtUtc" timestamp with time zone NOT NULL,
                CONSTRAINT "UX_quote_revisions_QuoteId_Revision" UNIQUE ("QuoteId", "Revision")
            );
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DROP TABLE IF EXISTS sales.quote_revisions;
            ALTER TABLE sales.quotes DROP COLUMN IF EXISTS "RevisionDateUtc";
            """);
    }
}
