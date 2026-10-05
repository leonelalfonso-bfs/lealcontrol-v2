using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace LealControl.Modules.Sales.Infrastructure.Persistence.Migrations;

[DbContext(typeof(SalesDbContext))]
[Migration("20261002010000_InvoiceFiscalConcept")]
public sealed class InvoiceFiscalConcept : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE sales.invoices
                ADD COLUMN IF NOT EXISTS "FiscalConcept" integer NOT NULL DEFAULT 0;
            ALTER TABLE sales.invoices
                ADD COLUMN IF NOT EXISTS "ServiceFrom" timestamp with time zone;
            ALTER TABLE sales.invoices
                ADD COLUMN IF NOT EXISTS "ServiceTo" timestamp with time zone;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE sales.invoices DROP COLUMN IF EXISTS "ServiceTo";
            ALTER TABLE sales.invoices DROP COLUMN IF EXISTS "ServiceFrom";
            ALTER TABLE sales.invoices DROP COLUMN IF EXISTS "FiscalConcept";
            """);
    }
}
