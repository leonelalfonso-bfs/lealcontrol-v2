using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace LealControl.Modules.Sales.Infrastructure.Persistence.Migrations;

[DbContext(typeof(SalesDbContext))]
[Migration("20261001020000_LinkInvoiceItemsToRemito")]
public sealed class LinkInvoiceItemsToRemito : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE sales.invoice_items ADD COLUMN IF NOT EXISTS "RemitoItemId" uuid;
            CREATE INDEX IF NOT EXISTS "IX_invoice_items_RemitoItemId"
                ON sales.invoice_items("RemitoItemId");
            """);
    }
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DROP INDEX IF EXISTS sales."IX_invoice_items_RemitoItemId";
            ALTER TABLE sales.invoice_items DROP COLUMN IF EXISTS "RemitoItemId";
            """);
    }
}
