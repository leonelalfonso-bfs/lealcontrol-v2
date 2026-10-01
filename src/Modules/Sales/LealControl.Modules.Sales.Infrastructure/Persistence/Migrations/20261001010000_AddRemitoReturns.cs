using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace LealControl.Modules.Sales.Infrastructure.Persistence.Migrations;

[DbContext(typeof(SalesDbContext))]
[Migration("20261001010000_AddRemitoReturns")]
public sealed class AddRemitoReturns : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
CREATE TABLE IF NOT EXISTS sales.remito_returns (
    "Id" uuid PRIMARY KEY,
    "TenantId" uuid NOT NULL,
    "RemitoId" uuid NOT NULL REFERENCES sales.remitos("Id"),
    "ReturnNumber" character varying(40) NOT NULL,
    "WarehouseId" uuid,
    "WarehouseName" character varying(120) NOT NULL,
    "Reason" character varying(400) NOT NULL,
    "Notes" character varying(1000),
    "ReceivedAtUtc" timestamp with time zone NOT NULL
);
CREATE INDEX IF NOT EXISTS "IX_remito_returns_TenantId_RemitoId"
    ON sales.remito_returns("TenantId", "RemitoId");
CREATE TABLE IF NOT EXISTS sales.remito_return_items (
    "Id" uuid PRIMARY KEY,
    "ReturnId" uuid NOT NULL REFERENCES sales.remito_returns("Id") ON DELETE CASCADE,
    "RemitoItemId" uuid NOT NULL REFERENCES sales.remito_items("Id"),
    "Quantity" numeric(18,4) NOT NULL CHECK ("Quantity" > 0)
);
CREATE INDEX IF NOT EXISTS "IX_remito_return_items_RemitoItemId"
    ON sales.remito_return_items("RemitoItemId");
""");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("DROP TABLE IF EXISTS sales.remito_return_items; DROP TABLE IF EXISTS sales.remito_returns;");
    }
}
