using LealControl.Modules.Sales.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LealControl.Modules.Sales.Infrastructure.Persistence.Migrations
{
    [DbContext(typeof(SalesDbContext))]
    [Migration("20260923233000_AddQuoteLineTechnicalDetail")]
    public class AddQuoteLineTechnicalDetail : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                ALTER TABLE sales.quote_lines ADD COLUMN IF NOT EXISTS "TechnicalDetail" text;
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                ALTER TABLE sales.quote_lines DROP COLUMN IF EXISTS "TechnicalDetail";
                """);
        }
    }
}
