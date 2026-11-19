using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace LealControl.Modules.Sales.Infrastructure.Persistence.Migrations;

/// <summary>Período de imputación de las compras (Libro IVA Compras y asiento): por defecto, el mes de la factura.</summary>
[DbContext(typeof(SalesDbContext))]
[Migration("20261119120000_PurchaseImputationPeriod")]
public sealed class PurchaseImputationPeriod : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE purchases.purchase_invoices
                ADD COLUMN IF NOT EXISTS "ImputationPeriod" timestamp with time zone;
            UPDATE purchases.purchase_invoices
                SET "ImputationPeriod" = date_trunc('month', "IssueDate" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
                WHERE "ImputationPeriod" IS NULL;
            ALTER TABLE purchases.purchase_invoices ALTER COLUMN "ImputationPeriod" SET NOT NULL;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""ALTER TABLE purchases.purchase_invoices DROP COLUMN IF EXISTS "ImputationPeriod";""");
    }
}
