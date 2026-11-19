using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace LealControl.Modules.Sales.Infrastructure.Persistence.Migrations;

/// <summary>
/// Jurisdicción de las compras ya cargadas: la provincia fiscal del proveedor en el directorio
/// (crm.customers). La migración anterior la buscaba en crm.suppliers, que ya no se usa.
/// </summary>
[DbContext(typeof(SalesDbContext))]
[Migration("20261120130000_PurchaseSupplierProvinceFromDirectory")]
public sealed class PurchaseSupplierProvinceFromDirectory : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DO $$
            BEGIN
                IF to_regclass('crm.customers') IS NOT NULL THEN
                    UPDATE purchases.purchase_invoices i
                        SET "SupplierProvince" = c.fiscal_province
                        FROM crm.customers c
                        WHERE c."Id" = i."SupplierId" AND c."TenantId" = i."TenantId"
                          AND NULLIF(trim(c.fiscal_province), '') IS NOT NULL
                          AND NULLIF(trim(i."SupplierProvince"), '') IS NULL;
                END IF;
            END $$;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
    }
}
