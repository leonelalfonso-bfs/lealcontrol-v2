using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace LealControl.Modules.Sales.Infrastructure.Persistence.Migrations;

[DbContext(typeof(SalesDbContext))]
[Migration("20261001230000_FiscalAuthorizationAttempts")]
public sealed class FiscalAuthorizationAttempts : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            CREATE TABLE IF NOT EXISTS sales.fiscal_authorization_attempts (
                "Id" uuid PRIMARY KEY,
                "TenantId" uuid NOT NULL,
                "InvoiceId" uuid NOT NULL REFERENCES sales.invoices("Id"),
                "PointOfSale" integer NOT NULL CHECK ("PointOfSale" > 0),
                "VoucherType" integer NOT NULL CHECK ("VoucherType" > 0),
                "VoucherNumber" bigint NOT NULL CHECK ("VoucherNumber" > 0),
                "IssuerCuit" character varying(11) NOT NULL,
                "Production" boolean NOT NULL,
                "RequestHash" character varying(64) NOT NULL,
                "RecipientDocument" character varying(32) NOT NULL,
                "Total" numeric(18,2) NOT NULL CHECK ("Total" > 0),
                "Status" character varying(20) NOT NULL CHECK ("Status" IN ('Pending','Unknown','Confirmed','Rejected')),
                "CreatedAtUtc" timestamp with time zone NOT NULL,
                "ResolvedAtUtc" timestamp with time zone,
                "Cae" character varying(14),
                "CaeDueDate" timestamp with time zone
            );
            ALTER TABLE sales.fiscal_authorization_attempts
                ADD COLUMN IF NOT EXISTS "IssuerCuit" character varying(11) NOT NULL DEFAULT '';
            ALTER TABLE sales.fiscal_authorization_attempts
                ADD COLUMN IF NOT EXISTS "Production" boolean NOT NULL DEFAULT false;
            CREATE UNIQUE INDEX IF NOT EXISTS "UX_fiscal_attempt_invoice"
                ON sales.fiscal_authorization_attempts ("TenantId", "InvoiceId");
            CREATE UNIQUE INDEX IF NOT EXISTS "UX_fiscal_attempt_number"
                ON sales.fiscal_authorization_attempts ("TenantId", "PointOfSale", "VoucherType", "VoucherNumber");
            CREATE UNIQUE INDEX IF NOT EXISTS "UX_invoice_authorized_number"
                ON sales.invoices ("TenantId", "PointOfSale", "InvoiceType", "InvoiceNumber")
                WHERE "Status" = 'Authorized';
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DROP INDEX IF EXISTS sales."UX_invoice_authorized_number";
            DROP TABLE IF EXISTS sales.fiscal_authorization_attempts;
            """);
    }
}
