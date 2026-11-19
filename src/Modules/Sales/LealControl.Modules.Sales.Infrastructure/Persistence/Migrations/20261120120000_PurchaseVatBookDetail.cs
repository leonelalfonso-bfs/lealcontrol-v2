using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace LealControl.Modules.Sales.Infrastructure.Persistence.Migrations;

/// <summary>
/// Lo que pide el Libro IVA Compras del estudio: rubros de compra/gasto por línea, jurisdicción del
/// proveedor e impuestos internos, percepción de Ganancias e impuestos municipales separados.
/// La jurisdicción de las facturas ya cargadas sale de la provincia fiscal del proveedor.
/// </summary>
[DbContext(typeof(SalesDbContext))]
[Migration("20261120120000_PurchaseVatBookDetail")]
public sealed class PurchaseVatBookDetail : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            CREATE TABLE IF NOT EXISTS purchases.expense_categories (
                "Id" uuid PRIMARY KEY,
                "TenantId" uuid NOT NULL,
                "Code" text NOT NULL,
                "Name" text NOT NULL,
                "IsActive" boolean NOT NULL DEFAULT true);
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_expense_categories_TenantId_Code"
                ON purchases.expense_categories ("TenantId", "Code");

            ALTER TABLE purchases.purchase_invoice_items ADD COLUMN IF NOT EXISTS "ExpenseCategoryId" uuid;
            ALTER TABLE purchases.purchase_invoices
                ADD COLUMN IF NOT EXISTS "SupplierProvince" text,
                ADD COLUMN IF NOT EXISTS "InternalTaxes" numeric NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS "GananciasPerception" numeric NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS "MunicipalTaxes" numeric NOT NULL DEFAULT 0;

            DO $$
            BEGIN
                IF to_regclass('crm.suppliers') IS NOT NULL THEN
                    UPDATE purchases.purchase_invoices i
                        SET "SupplierProvince" = NULLIF(trim(s."FiscalProvince"), '')
                        FROM crm.suppliers s
                        WHERE s."Id" = i."SupplierId" AND i."SupplierProvince" IS NULL;
                END IF;
            END $$;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE purchases.purchase_invoices
                DROP COLUMN IF EXISTS "SupplierProvince", DROP COLUMN IF EXISTS "InternalTaxes",
                DROP COLUMN IF EXISTS "GananciasPerception", DROP COLUMN IF EXISTS "MunicipalTaxes";
            ALTER TABLE purchases.purchase_invoice_items DROP COLUMN IF EXISTS "ExpenseCategoryId";
            DROP TABLE IF EXISTS purchases.expense_categories;
            """);
    }
}
